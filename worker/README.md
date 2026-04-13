# tlh-feed — multiplayer feed worker

Cloudflare Worker that backs The Long Haul's network panel: activity feed, porter census, and lost-cargo registry.

## prerequisites

- A Cloudflare account (free tier is fine — no credit card needed).
- Node.js installed locally.
- `wrangler` CLI: `npm install -g wrangler`

## first-time deploy

From this `worker/` directory:

```bash
# 1. Log in to Cloudflare (opens browser).
wrangler login

# 2. Create the KV namespace that backs the feed.
wrangler kv namespace create FEED
```

> Note: older wrangler docs use `wrangler kv:namespace create FEED` (with a colon). Recent wrangler versions use a space. If one syntax errors with "Unknown arguments", try the other.

The second command will print something like:

```
🌀 Creating namespace with title "tlh-feed-FEED"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
[[kv_namespaces]]
binding = "FEED"
id = "abc123def456..."
```

Copy the `id` value and paste it into `wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

```bash
# 3. Deploy.
wrangler deploy
```

Wrangler will print the live URL, something like:

```
Published tlh-feed
  https://tlh-feed.your-subdomain.workers.dev
```

That's the URL to give Claude — it'll be hardcoded into `the-long-haul.js` so the game knows where to fetch the feed from.

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
| GET  | `/feed?since=<ms>` | — | `{ events, census, serverTime }` |
| POST | `/lost` | `{ porterId, label, size, scrip }` | `{ ok: true }` |
| GET  | `/lost/:porterId` | — | `{ porterId, list }` |
| GET  | `/` | — | service info |

Allowed event types: `delivery`, `milestone`, `discovery`, `lost_drop`, `lost_recovered`, `trust_unlock`.

## limits & guarantees

- **Rate limit**: 5 events per porter per 60 seconds. Excess events are *silently dropped* — `/activity` still returns `ok: true`. The client never sees rate limit errors.
- **Feed cap**: last 200 events globally. Older events fall off.
- **Census**: porters seen in last 24 hours. Auto-prunes on read.
- **Lost registry**: last 20 lost-pkg drops per porter, FIFO.
- **CORS**: open. No auth.

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
