import "server-only";

import {
  experimental_upgradeWebSocket,
  type UpgradeWebSocketOptions,
  type WebSocket,
} from "@vercel/functions";

export type WebSocketUpgradeFunction = (
  handler: (socket: WebSocket) => void | Promise<void>,
  options?: UpgradeWebSocketOptions
) => Promise<Response>;

export async function upgradeNotificationWebSocket(
  handler: (socket: WebSocket) => void | Promise<void>,
  upgrade: WebSocketUpgradeFunction = experimental_upgradeWebSocket
): Promise<Response> {
  return upgrade(handler, { maxPayload: 256 * 1024 });
}

