/* ==============================================
   THE LONG HAUL — multiplayer feed worker
   v0.0.7.1 (quota-aware)
   ==============================================
   Endpoints:
     POST /activity     append event, rate-limited per porter
     GET  /feed?since=  recent events + census count
     POST /lost         register a lost-pkg drop
     GET  /lost/:porterId  fetch a porter's lost-pkg registry

   KV bindings (configured in wrangler.toml):
     FEED  — feed state (events, census, lost registries)

   Storage keys:
     feed:recent             JSON array, last 200 events, all porters
     census:active           JSON object { porterId: lastSeenMs, ... }
     lost:{porterId}         JSON array, last 20 lost-pkg drops by this porter
     rate:{porterId}         counter string, 60s TTL, decremented client-side via expiry

   Design notes:
     - Schema is generic: events are { type, porterId, timestamp, data }.
       New game systems just add new type strings; worker doesn't need updates.
     - Rate limit is silent (returns ok:true even when dropped) — client
       never sees the limit, never logs an error.
     - Feed cap of 200 events keeps payload small (~30KB max). Older events
       fall off the front.
     - Census auto-prunes porters not seen in 24h on every read.
     - CORS: open. No auth needed.

   Quota handling (v0.0.7.1):
     Cloudflare KV free tier has a 1000 puts/day cap. When exceeded, KV.put()
     throws an Error containing "limit exceeded". The catch-all at the bottom
     classifies these as 429 Too Many Requests (Retry-After until UTC
     midnight) instead of 500. The game-side fetch already swallows errors
     silently, but the right status lets future client logic back off
     gracefully and lets us add a "feed throttled" UI signal in a later
     patch (see TLH-HANDOFF.md bug list).
*/

// ============================================================
// CONFIG
// ============================================================
const FEED_CAP        = 200;          // max events kept in feed:recent
const RATE_WINDOW_S   = 60;           // rate limit window (seconds)
const RATE_MAX        = 5;            // max events per window per porter
const CENSUS_TTL_MS   = 24 * 60 * 60 * 1000;  // 24 hours
const LOST_CAP        = 20;           // max lost-pkg drops kept per porter

const ALLOWED_TYPES = new Set([
  'delivery',
  'milestone',
  'discovery',
  'lost_drop',
  'lost_recovered',
  'trust_unlock',
]);

const PORTER_ID_RE = /^PTR-[0-9A-F]{4,8}(-[0-9A-F]{4})?$/i;

// ============================================================
// CORS
// ============================================================
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}

function errorResponse(msg, status = 400, extraHeaders = {}) {
  return jsonResponse({ error: msg }, status, extraHeaders);
}

// Seconds until next 00:00 UTC — used for Retry-After on quota 429s.
function secondsUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return Math.max(60, Math.floor((next - now) / 1000));
}

// True if the thrown error looks like a Cloudflare KV daily-quota exhaustion.
// KV.put throws Error with message containing "limit exceeded" in this case;
// match defensively in case the wording shifts.
function isKvQuotaError(err) {
  if (!err || !err.message) return false;
  const m = err.message.toLowerCase();
  return m.includes('limit exceeded') || m.includes('kv put') && m.includes('daily');
}

// ============================================================
// VALIDATION
// ============================================================
function validPorterId(id) {
  return typeof id === 'string' && PORTER_ID_RE.test(id);
}

function validEvent(body) {
  if (!body || typeof body !== 'object') return false;
  if (!validPorterId(body.porterId)) return false;
  if (typeof body.type !== 'string' || !ALLOWED_TYPES.has(body.type)) return false;
  if (body.data !== undefined && (typeof body.data !== 'object' || body.data === null)) return false;
  return true;
}

// ============================================================
// RATE LIMITING
// ============================================================
async function checkRate(env, porterId) {
  const key = `rate:${porterId}`;
  const raw = await env.FEED.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= RATE_MAX) return false;
  // Increment + reset TTL on every event in window
  await env.FEED.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_S });
  return true;
}

// ============================================================
// FEED OPS
// ============================================================
async function appendEvent(env, event) {
  const raw = await env.FEED.get('feed:recent');
  const feed = raw ? JSON.parse(raw) : [];
  feed.push(event);
  // Trim to cap, keeping newest
  if (feed.length > FEED_CAP) feed.splice(0, feed.length - FEED_CAP);
  await env.FEED.put('feed:recent', JSON.stringify(feed));
}

async function readFeed(env, sinceTs) {
  const raw = await env.FEED.get('feed:recent');
  const feed = raw ? JSON.parse(raw) : [];
  if (sinceTs && Number.isFinite(sinceTs)) {
    return feed.filter(e => e.timestamp > sinceTs);
  }
  return feed;
}

// ============================================================
// CENSUS
// ============================================================
async function bumpCensus(env, porterId) {
  const raw = await env.FEED.get('census:active');
  const census = raw ? JSON.parse(raw) : {};
  census[porterId] = Date.now();
  await env.FEED.put('census:active', JSON.stringify(census));
}

async function readCensus(env) {
  const raw = await env.FEED.get('census:active');
  if (!raw) return 0;
  const census = JSON.parse(raw);
  const cutoff = Date.now() - CENSUS_TTL_MS;
  let active = 0;
  let mutated = false;
  for (const id in census) {
    if (census[id] < cutoff) {
      delete census[id];
      mutated = true;
    } else {
      active++;
    }
  }
  // Persist pruned census occasionally (avoids constant writes)
  if (mutated && Math.random() < 0.1) {
    await env.FEED.put('census:active', JSON.stringify(census));
  }
  return active;
}

// ============================================================
// LOST PACKAGE REGISTRY
// ============================================================
async function registerLostPkg(env, porterId, pkg) {
  const key = `lost:${porterId}`;
  const raw = await env.FEED.get(key);
  const list = raw ? JSON.parse(raw) : [];
  list.push({
    label:     String(pkg.label || '').slice(0, 32),
    size:      ['s', 'm', 'l'].includes(pkg.size) ? pkg.size : 's',
    scrip:     Math.max(1, Math.min(99, parseInt(pkg.scrip, 10) || 1)),
    timestamp: Date.now(),
  });
  // Trim to cap, FIFO
  if (list.length > LOST_CAP) list.splice(0, list.length - LOST_CAP);
  await env.FEED.put(key, JSON.stringify(list));
}

async function readLostRegistry(env, porterId) {
  const raw = await env.FEED.get(`lost:${porterId}`);
  return raw ? JSON.parse(raw) : [];
}

// ============================================================
// REQUEST HANDLER
// ============================================================
export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      // ---------- POST /activity ----------
      if (request.method === 'POST' && path === '/activity') {
        let body;
        try { body = await request.json(); }
        catch (e) { return errorResponse('invalid_json', 400); }

        if (!validEvent(body)) return errorResponse('invalid_event', 400);

        const allowed = await checkRate(env, body.porterId);
        if (!allowed) {
          // Silent drop — bump census so they still count as online
          await bumpCensus(env, body.porterId);
          return jsonResponse({ ok: true });
        }

        const event = {
          type:      body.type,
          porterId:  body.porterId,
          timestamp: Date.now(),
          data:      body.data || {},
        };
        await appendEvent(env, event);
        await bumpCensus(env, body.porterId);
        return jsonResponse({ ok: true, timestamp: event.timestamp });
      }

      // ---------- GET /feed ----------
      if (request.method === 'GET' && path === '/feed') {
        const sinceParam = url.searchParams.get('since');
        const since = sinceParam ? parseInt(sinceParam, 10) : 0;
        const events = await readFeed(env, since);
        const census = await readCensus(env);
        return jsonResponse({ events, census, serverTime: Date.now() });
      }

      // ---------- POST /lost ----------
      if (request.method === 'POST' && path === '/lost') {
        let body;
        try { body = await request.json(); }
        catch (e) { return errorResponse('invalid_json', 400); }

        if (!validPorterId(body && body.porterId)) return errorResponse('invalid_porter_id', 400);
        if (!body.label) return errorResponse('missing_label', 400);

        const allowed = await checkRate(env, body.porterId);
        if (!allowed) return jsonResponse({ ok: true }); // silent drop

        await registerLostPkg(env, body.porterId, body);
        await bumpCensus(env, body.porterId);
        return jsonResponse({ ok: true });
      }

      // ---------- GET /lost/:porterId ----------
      if (request.method === 'GET' && path.startsWith('/lost/')) {
        const porterId = path.slice('/lost/'.length).toUpperCase();
        if (!validPorterId(porterId)) return errorResponse('invalid_porter_id', 400);
        const list = await readLostRegistry(env, porterId);
        return jsonResponse({ porterId, list });
      }

      // ---------- GET / ----------
      if (request.method === 'GET' && path === '/') {
        return jsonResponse({
          name:    'tlh-feed',
          version: '0.0.7.1',
          endpoints: [
            'POST /activity',
            'GET  /feed?since=<timestamp>',
            'POST /lost',
            'GET  /lost/:porterId',
          ],
        });
      }

      return errorResponse('not_found', 404);
    } catch (err) {
      // KV daily-quota exhaustion → 429 with Retry-After until UTC midnight.
      // Lets a future client back off gracefully instead of treating it as
      // a generic crash. Falls through to 500 for any other unhandled error.
      if (isKvQuotaError(err)) {
        const retryAfter = secondsUntilUtcMidnight();
        return errorResponse(
          'quota_exhausted: KV daily put limit reached, retry after UTC midnight',
          429,
          { 'Retry-After': String(retryAfter) }
        );
      }
      return errorResponse('server_error: ' + (err && err.message ? err.message : 'unknown'), 500);
    }
  },
};
