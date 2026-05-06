# tlh-feed — multiplayer feed worker

Cloudflare Worker that backs The Long Haul's network panel: activity feed, porter census, and lost-cargo registry.

Live at **https://coiledlamb.tlh-feed.workers.dev**.

## prerequisites

- A Cloudflare account (free tier is fine — no credit card needed).
- Node.js installed locally.
- `wrangler` CLI: `npm install -g wrangler`

## deploy (existing account)

The committed `wrangler.toml` already points at the live worker (`name = "coiledlamb"`) and the production KV namespace id. Routine deploys just need:

```bash
cd tlh/worker
wrangler login        # one-time, opens browser
wrangler deploy       # ships index.js to the live worker
```

Confirm with `curl https://coiledlamb.tlh-feed.workers.dev/` — the `version` field should match the new code.

## first-time deploy on a different account

If you're forking this onto your own Cloudflare account, you'll need to create a fresh KV namespace and update `wrangler.toml`:

```bash
# 1. Log in.
wrangler login

# 2. Create the KV namespace.
wrangler kv namespace create FEED
```

> Note: older wrangler docs use `wrangler kv:namespace create FEED` (with a colon). Recent wrangler versions use a space. If one syntax errors with "Unknown arguments", try the other.

The second command will print:

```
🌀 Creating namespace with title "<your-worker>-FEED"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "FEED"
id = "abc123def456..."
```

In `wrangler.toml`, replace the existing `id` with that new value, and (if you want a different worker name) change `name = "coiledlamb"`. Then:

```bash
wrangler deploy
```

Wrangler will print the live URL:

```
Deployed <name>
  https://<name>.<your-subdomain>.workers.dev
```

Update `tlh/js/constants.js` `FEED_URL` to that URL so the game points at your worker instead of the live one.

## verify it works

```bash
# Should return JSON with name, version, endpoints.
curl https://tlh-feed.your-subdomain.workers.dev/

# Should return { events: [], census: 0, serverTime: ... }
curl https://tlh-feed.your-subdomain.workers.dev/feed

# Post a test event.
curl -X POST https://tlh-feed.your-subdomain.workers.dev/activity \
  -H "Content-Type: application/json" \
  -d '{"porterId":"PTR-TEST-0001","type":"delivery","data":{"destLabel":"depot a","scrip":12}}'

# Read it back.
curl https://tlh-feed.your-subdomain.workers.dev/feed
```

## updating the worker later

After any code change to `index.js`:

```bash
wrangler deploy
```

That's it. Changes go live in seconds.

## endpoints

| method | path | body | returns |
|---|---|---|---|
| POST | `/activity` | `{ porterId, type, data }` | `{ ok: true, timestamp }` |
| GET  | `/feed?since=<ms>` | — | `{ events, census, censusBreakdown, serverTime }` |
| POST | `/lost` | `{ porterId, pkg: { label, size, scrip } }` | `{ ok: true }` |
| GET  | `/lost/:porterId` | — | `{ porterId, lost }` |
| GET  | `/` | — | service info |

Allowed event types: `delivery`, `milestone`, `discovery`, `lost_drop`, `lost_recovered`, `trust_unlock`, `gear_placement`, `trample_milestone`, `toss`.

## limits & guarantees

- **Rate limit**: client-enforced. The client throttles itself at `POST_MIN_INTERVAL_MS = 5000` (see [tlh/js/constants.js](../js/constants.js)). The worker tracks a 60s per-porter window via a marker key for write-amp control, but doesn't hard-reject — the global Cloudflare KV daily quota is the real backstop, surfaced to the client as 429.
- **Feed cap**: last 200 events globally. Older events fall off.
- **Census**: today / week / all-time porter counts derived from the feed on each read. No dedicated counter key.
- **Lost registry**: last 20 lost-pkg drops per porter, FIFO.
- **Body size**: requests over 8 KB are rejected with 413.
- **CORS**: open. No auth.

## graceful degradation (don't break this)

When the worker hits its KV daily-write quota, it returns 429 with a `Retry-After` header pointing at UTC midnight. The client (`handleThrottle` in [tlh/js/multiplayer.js](../js/multiplayer.js)) interprets this as "go silent until then": the network toggle dims, broadcasts pause, and polling continues at a slower cadence so the throttle clearing is detected. The game stays fully playable solo; multiplayer just goes quiet until the quota resets. The 429 → forced-silent contract is intentional — don't change it without coordinating with the client side.

## free tier coverage

Cloudflare Workers free tier as of 2026:
- 100,000 requests/day
- 1,000 KV writes/day
- 100,000 KV reads/day
- 1 GB KV storage

For TLH at ~hundreds of active porters polling every 60s plus posting events:
- ~150,000 reads/day at peak (`GET /feed` is the hot path)
- ~5,000 writes/day at peak

We'll fit comfortably under reads but will want to watch writes if traffic ever scales. If we ever push the write quota, the activity log can move to a single batched key with periodic flush. Not a concern at current scale.

## debugging

Live logs from a running worker:

```bash
wrangler tail
```

Inspect KV directly (newer syntax uses spaces, older uses colons — try both if one errors):

```bash
wrangler kv key list --binding=FEED
wrangler kv key get "feed:recent" --binding=FEED
```

Wipe everything (use only if you want to nuke state):

```bash
wrangler kv key delete "feed:recent" --binding=FEED
wrangler kv key delete "census:active" --binding=FEED
```
