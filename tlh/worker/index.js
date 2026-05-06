/* ==============================================
   THE LONG HAUL — multiplayer feed worker
   v0.0.9.6.10.24 (boundary fixes)
   ==============================================
   Endpoints:
     POST /activity        append event, rate-limited per porter
     GET  /feed?since=     recent events + census breakdown
     POST /lost            register a lost-pkg drop
     GET  /lost/:porterId  fetch a porter's lost-pkg registry

   KV bindings (configured in wrangler.toml):
     FEED  — feed state (events, lost registries)

   Storage keys:
     feed:recent        JSON array, last 200 events, all porters (7d TTL, refreshed on write)
     lost:{porterId}    JSON array, last 20 lost-pkg drops by this porter (21d TTL = FLOOR + DEAD_WEEK_GRACE)
     rate:{porterId}    marker, 60s TTL, signals "porter has open rate window"

   v0.0.9.6.10.24 boundary fixes — wire-protocol drift cleanup:
     - ALLOWED_TYPES: added gear_placement, trample_milestone, toss.
       Clients have been broadcasting these since v0.0.9.6 commits 5/7
       (peer-placed ladders/anchors and peer paving milestones); the
       worker silently 400'd them, so receivers (gear.js, trail.js)
       never saw peer activity.
     - /lost POST now reads body.pkg.{label,size,scrip} to match the
       nested shape clients send (matches /activity's body.data style).
     - /lost/:porterId GET response key renamed list → lost so client
       fetchLostFromPeer can find the array.
     - /feed reads feed:recent once instead of twice (events + census
       were each doing their own KV get).
     - Envelope size guard: requests >8 KB rejected with 413 before
       request.json() can consume them.

   v0.0.9.6.10.23 sustainability pass — write-amp diet:
     - census:active KV key retired; census now derived from feed:recent on read.
     - Rate marker writes once per window (first event opens it; subsequent
       in-window events allowed without writing). KV has no atomic increment,
       so per-event counting required per-event writes — exactly the leak we
       were patching. The 5-per-window cap is now soft + client-enforced; the
       worker stops being a hard rate limiter, but the global daily quota
       still backstops genuine flood traffic via the 429 path below.
     - All KV puts now carry expirationTtl for storage hygiene.
     - Event data payload guarded at 512 bytes max.

   Design notes:
     - Schema is generic: events are { type, porterId, timestamp, data }.
       New game systems just add new type strings; worker doesn't need updates.
     - Feed cap of 200 events keeps payload small (~30KB max). Older events
       fall off the front.
     - CORS: open. No auth needed.

   Quota handling (v0.0.7.1, retained):
     Cloudflare KV free tier has a 1000 puts/day cap. When exceeded, KV.put()
     throws an Error containing "limit exceeded". The catch-all at the bottom
     classifies these as 429 Too Many Requests (Retry-After until UTC
     midnight) instead of 500. The client uses this to enter a forced-silent
     UI state (see multiplayer.js).
*/

// ============================================================
// CONFIG
// ============================================================
const FEED_CAP        = 200;          // max events kept in feed:recent
const RATE_WINDOW_S   = 60;           // rate limit window (seconds)
const CENSUS_TTL_MS   = 24 * 60 * 60 * 1000;       // 24h "active today" window
const WEEK_TTL_MS     = 7  * 24 * 60 * 60 * 1000;  // 7d "this week" window
const LOST_CAP        = 20;           // max lost-pkg drops kept per porter
const FEED_TTL_S      = 7  * 24 * 60 * 60;   // 7d — feed:recent storage hygiene
const LOST_TTL_S      = 21 * 24 * 60 * 60;   // 21d — FLOOR(14) + DEAD_WEEK_GRACE(7)
const MAX_DATA_BYTES  = 512;          // event.data JSON byte cap
const MAX_BODY_BYTES  = 8 * 1024;     // envelope cap (Content-Length)

const ALLOWED_TYPES = new Set([
  'delivery',
  'milestone',
  'discovery',
  'lost_drop',
  'lost_recovered',
  'trust_unlock',
  'gear_placement',     // peer-placed ladder/anchor (v0.0.9.6 commit 5)
  'trample_milestone',  // peer paving threshold crossing (v0.0.9.6 commit 7)
  'toss',               // pkg dropped onto trail
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
  if (body.data !== undefined) {
    if (typeof body.data !== 'object' || body.data === null) return false;
    if (JSON.stringify(body.data).length > MAX_DATA_BYTES) return false;
  }
  return true;
}

// ============================================================
// RATE LIMITING — open-window marker, no per-event count
// ============================================================
// First event in a 60s window writes a marker key with TTL. Subsequent events
// while the marker exists skip the write entirely. KV can't atomically
// increment, so per-event counting would mean per-event writes — the exact
// leak this patch is closing. The 5-per-window cap that used to live here is
// now client-side (see multiplayer.js throttling); the global daily-quota
// 429 below covers any pathological flood that gets past the client.
async function checkRate(env, porterId) {
  const key = `rate:${porterId}`;
  const existing = await env.FEED.get(key);
  if (existing) return true; // window already open, allow without writing
  await env.FEED.put(key, '1', { expirationTtl: RATE_WINDOW_S });
  return true; // first event opens the window
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
  await env.FEED.put('feed:recent', JSON.stringify(feed), { expirationTtl: FEED_TTL_S });
}

async function readFeed(env) {
  const raw = await env.FEED.get('feed:recent');
  return raw ? JSON.parse(raw) : [];
}

function filterFeedSince(feed, sinceTs) {
  if (sinceTs && Number.isFinite(sinceTs)) {
    return feed.filter(e => e.timestamp > sinceTs);
  }
  return feed;
}

// ============================================================
// CENSUS — derived from feed:recent (no dedicated key, no writes)
// ============================================================
// Walks the feed once and buckets unique porterIds by recency. "total" is
// the unique-porter count within FEED_CAP events; a true all-time count
// would need a separate counter (out of scope here — see porter-profiles
// follow-up in TLH-HANDOFF.md).
//
// v0.0.9.6.10.24: takes the parsed feed array (not env) so /feed can read
// feed:recent once and pass the result to both events + census.
function deriveCensusBreakdown(feed) {
  const now    = Date.now();
  const today  = new Set();
  const week   = new Set();
  const total  = new Set();
  for (const e of feed) {
    if (!e || !e.porterId || typeof e.timestamp !== 'number') continue;
    total.add(e.porterId);
    if (now - e.timestamp <= WEEK_TTL_MS)   week.add(e.porterId);
    if (now - e.timestamp <= CENSUS_TTL_MS) today.add(e.porterId);
  }
  return { today: today.size, week: week.size, total: total.size };
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
  await env.FEED.put(key, JSON.stringify(list), { expirationTtl: LOST_TTL_S });
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

    // v0.0.9.6.10.24 — envelope size guard. Real events are ≤1 KB; cap at
    // 8 KB so a misbehaving client can't push request.json() toward the
    // 128 MB memory limit. Content-Length is browser-set on normal POSTs;
    // if absent (chunked or odd client), fall through and let the parser
    // backstop.
    const lenHeader = request.headers.get('Content-Length');
    if (lenHeader) {
      const len = parseInt(lenHeader, 10);
      if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
        return errorResponse('payload_too_large', 413);
      }
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
        if (!allowed) return jsonResponse({ ok: true }); // silent drop (currently unreachable; see checkRate)

        const event = {
          type:      body.type,
          porterId:  body.porterId,
          timestamp: Date.now(),
          data:      body.data || {},
        };
        await appendEvent(env, event);
        return jsonResponse({ ok: true, timestamp: event.timestamp });
      }

      // ---------- GET /feed ----------
      if (request.method === 'GET' && path === '/feed') {
        const sinceParam = url.searchParams.get('since');
        const since = sinceParam ? parseInt(sinceParam, 10) : 0;
        // v0.0.9.6.10.24 — single read; events + census share the parse.
        const feed      = await readFeed(env);
        const breakdown = deriveCensusBreakdown(feed);
        return jsonResponse({
          events:          filterFeedSince(feed, since),
          census:          breakdown.today,  // back-compat: legacy clients read a number
          censusBreakdown: breakdown,        // { today, week, total } for network panel
          serverTime:      Date.now(),
        });
      }

      // ---------- POST /lost ----------
      // v0.0.9.6.10.24 — body shape is { porterId, pkg: {label,size,scrip} }
      // matching what multiplayer.js postLostDrop sends and the /activity
      // body.data convention.
      if (request.method === 'POST' && path === '/lost') {
        let body;
        try { body = await request.json(); }
        catch (e) { return errorResponse('invalid_json', 400); }

        if (!validPorterId(body && body.porterId)) return errorResponse('invalid_porter_id', 400);
        const pkg = body && body.pkg;
        if (!pkg || !pkg.label) return errorResponse('missing_label', 400);

        const allowed = await checkRate(env, body.porterId);
        if (!allowed) return jsonResponse({ ok: true });

        await registerLostPkg(env, body.porterId, pkg);
        return jsonResponse({ ok: true });
      }

      // ---------- GET /lost/:porterId ----------
      // v0.0.9.6.10.24 — response key is `lost` (was `list`) so client
      // fetchLostFromPeer's `data.lost` access actually finds the array.
      if (request.method === 'GET' && path.startsWith('/lost/')) {
        const porterId = path.slice('/lost/'.length).toUpperCase();
        if (!validPorterId(porterId)) return errorResponse('invalid_porter_id', 400);
        const lost = await readLostRegistry(env, porterId);
        return jsonResponse({ porterId, lost });
      }

      // ---------- GET / ----------
      if (request.method === 'GET' && path === '/') {
        return jsonResponse({
          name:    'tlh-feed',
          version: '0.0.9.6.10.24',
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
      // Client uses this to enter forced-silent mode (see multiplayer.js).
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
