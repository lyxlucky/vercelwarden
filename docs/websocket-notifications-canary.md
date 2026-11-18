# WebSocket notifications canary checklist

Use this checklist in a Vercel Preview environment before enabling production traffic.

## Prerequisites

- Fluid Compute enabled for the Vercel project.
- `NOTIFICATIONS_MODE=websocket`.
- `VERCEL_WEBSOCKET_ENABLED=true`.
- A TLS Redis URL with TCP Pub/Sub support in `NOTIFICATIONS_REDIS_URL`.
- Two Bitwarden clients signed into the same test account.

## Validation

1. Confirm `/api/config` reports `requestedMode: websocket`, `mode: websocket`, and `transports.websocket: true`.
2. With an administrator bearer token, confirm `/api/admin/notifications/health` reports runtime and broker readiness without returning credentials.
3. Open the browser network inspector or Vercel logs and confirm a `wss://<preview>/notifications/hub?access_token=...` connection completes the MessagePack handshake.
4. Create or update an item on client A and verify client B receives a `ReceiveMessage` notification and synchronizes without waiting for the 45-second poll.
5. Confirm client A ignores its own notification through `ContextId` while its durable revision remains current.
6. Hold the connection beyond the 300-second Function duration and verify the client reconnects and performs catch-up synchronization.
7. Temporarily block Redis or provide an invalid Preview-only Redis URL. Confirm mutations still succeed, health becomes degraded, logs contain no credentials, and polling repairs state.
8. Restore Redis, confirm reconnection, and inspect connection/delivery/broker-failure counters.
9. Roll back Preview to `NOTIFICATIONS_MODE=poll`, redeploy, and verify normal sync without any database migration or data change.

## Local evidence recorded by the automated suite

- SignalR 10.0 JSON and MessagePack parsers accept the emitted `ReceiveMessage`/`SyncVault` frames.
- Independent notification bus instances distribute events through the shared Pub/Sub contract.
- Function lifecycle termination emits an allow-reconnect close frame.
- A missed stream event is repaired by the existing 45-second revision poll.
- Tokens, connection identifiers, Redis URLs, cookies, and authorization values are redacted from notification diagnostics.
