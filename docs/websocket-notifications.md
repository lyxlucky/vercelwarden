# WebSocket notification implementation notes

The implementation targets Next.js 16.2 Route Handlers and Vercel Functions' experimental WebSocket upgrade API.

## Runtime constraints

- The hub route runs in the Node.js runtime; the Edge runtime is not used.
- `experimental_upgradeWebSocket` comes from `@vercel/functions` and requires the direct `ws` dependency.
- The upgrade callback must stay pending until the socket closes so the Function remains active.
- Vercel WebSockets require Fluid Compute. New Vercel projects normally enable it by default, but production enablement is still explicit through `VERCEL_WEBSOCKET_ENABLED=true`.
- WebSocket connections consume Function active time and are bounded by the configured Function duration. This project uses a statically analyzable `maxDuration` of 300 seconds and relies on Bitwarden's reconnect behavior.
- Local WebSocket upgrade testing uses Vercel CLI 54.14.2 or newer with `vc dev`; `next dev` does not provide the Vercel upgrade context.
- Route Handlers are dynamic when they read the incoming request. The hub additionally calls `connection()` before upgrading to remain compatible with Cache Components.

## Bitwarden wire contract

Current official Bitwarden clients connect directly to `<notifications URL>/hub`, skip SignalR negotiation, force the WebSocket transport, authenticate with the `access_token` query parameter, and select the MessagePack Hub Protocol. The server therefore supports direct upgrade as the primary compatibility path while also exposing `/notifications/hub/negotiate` for generic SignalR clients.

The initial server notification invokes `ReceiveMessage` with a `SyncVault` notification (`Type: 5`). Clients perform a full synchronization when this notification arrives and also perform catch-up synchronization after each successful reconnect.

## Operational model

Polling remains the default. SSE and the 45-second revision poll remain available as convergence fallbacks. Production WebSocket mode requires a Redis-compatible endpoint that supports long-lived Pub/Sub connections; HTTP-only Redis APIs are insufficient.

Official references:

- <https://vercel.com/docs/functions/websockets>
- <https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#experimental_upgradewebsocket>
- <https://github.com/bitwarden/clients/blob/main/libs/common/src/platform/server-notifications/internal/signalr-connection.service.ts>
