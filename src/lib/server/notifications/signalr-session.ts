import "server-only";

import type { RawData } from "ws";
import {
  encodeBitwardenInvocation,
  encodeSignalRClose,
  encodeSignalRPing,
  parseJsonHubMessages,
  parseMessagePackHubMessages,
  parseSignalRHandshake,
  signalRHandshakeResponse,
  signalRHubMessageType,
  type SignalRHubProtocol,
} from "@/lib/server/notifications/signalr-protocol";
import { subscribeNotificationEvents } from "@/lib/server/notifications/service";
import type {
  NormalizedNotificationEvent,
  NotificationUnsubscribe,
} from "@/lib/server/notifications/types";
import {
  notificationSessionClosed,
  notificationSessionOpened,
  recordNotificationMetric,
} from "@/lib/server/notifications/observability";

const SOCKET_OPEN = 1;
const DEFAULT_MAX_PAYLOAD = 256 * 1024;
const DEFAULT_MAX_BUFFERED_AMOUNT = 512 * 1024;

export interface NotificationWebSocket {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string | Uint8Array, callback?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): unknown;
  on(event: "close", listener: (code: number, reason: Buffer) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  off(event: "message", listener: (data: RawData, isBinary: boolean) => void): unknown;
  off(event: "close", listener: (code: number, reason: Buffer) => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
}

export interface SignalRSessionOptions {
  socket: NotificationWebSocket;
  userUuid: string;
  deviceIdentifier?: string;
  subscribe?: typeof subscribeNotificationEvents;
  handshakeTimeoutMs?: number;
  keepAliveMs?: number;
  lifecycleMs?: number;
  maxPayloadBytes?: number;
  maxBufferedAmount?: number;
}

function rawBytes(data: RawData): Uint8Array {
  if (typeof data === "string") return new TextEncoder().encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) {
    const total = data.reduce((sum, entry) => sum + entry.byteLength, 0);
    const combined = new Uint8Array(total);
    let offset = 0;
    for (const entry of data) {
      combined.set(entry, offset);
      offset += entry.byteLength;
    }
    return combined;
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function rawText(data: RawData): string {
  return typeof data === "string" ? data : new TextDecoder().decode(rawBytes(data));
}

export async function runSignalRSession(options: SignalRSessionOptions): Promise<void> {
  const subscribe = options.subscribe ?? subscribeNotificationEvents;
  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
  const keepAliveMs = options.keepAliveMs ?? 15_000;
  const lifecycleMs = options.lifecycleMs ?? 295_000;
  const maxPayloadBytes = options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD;
  const maxBufferedAmount = options.maxBufferedAmount ?? DEFAULT_MAX_BUFFERED_AMOUNT;
  let protocol: SignalRHubProtocol | null = null;
  let lastSequence = 0;
  let unsubscribe: NotificationUnsubscribe = () => undefined;
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  let lifecycle: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let opened = false;
  let processing = Promise.resolve();

  const send = (data: string | Uint8Array): boolean => {
    if (options.socket.readyState !== SOCKET_OPEN) return false;
    if (options.socket.bufferedAmount > maxBufferedAmount) {
      recordNotificationMetric("queue_overflow", { userUuid: options.userUuid }, "warn");
      options.socket.close(1013, "Notification client is too slow");
      return false;
    }
    options.socket.send(data, (error) => {
      if (error) recordNotificationMetric("protocol_failure", { detail: error.name }, "warn");
    });
    return true;
  };

  const cleanup = async (code: number, reason: string) => {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    if (lifecycle) clearTimeout(lifecycle);
    clearTimeout(handshakeTimeout);
    await unsubscribe();
    options.socket.off("message", onMessage);
    options.socket.off("close", onClose);
    options.socket.off("error", onError);
    if (opened) notificationSessionClosed({ code, reason, userUuid: options.userUuid });
  };

  const closeWithProtocolError = (detail: string) => {
    recordNotificationMetric("protocol_failure", { detail, userUuid: options.userUuid }, "warn");
    if (protocol) send(encodeSignalRClose(protocol, detail, false));
    options.socket.close(1002, "SignalR protocol error");
  };

  const deliver = async (event: NormalizedNotificationEvent) => {
    if (!protocol || event.sequence <= lastSequence) return;
    lastSequence = event.sequence;
    if (send(encodeBitwardenInvocation(protocol, event))) {
      const latency = Math.max(0, Date.now() - Date.parse(event.publishedAt));
      recordNotificationMetric("delivery", { latencyMs: latency, type: event.type });
    }
  };

  const handleMessage = async (data: RawData, isBinary: boolean) => {
    const bytes = rawBytes(data);
    if (bytes.byteLength > maxPayloadBytes) {
      options.socket.close(1009, "Notification frame is too large");
      return;
    }
    if (!protocol) {
      if (isBinary) throw new Error("SignalR handshake must be text.");
      const handshake = parseSignalRHandshake(rawText(data));
      protocol = handshake.protocol;
      clearTimeout(handshakeTimeout);
      send(signalRHandshakeResponse());
      const nextUnsubscribe = await subscribe(options.userUuid, deliver, lastSequence);
      if (closed) {
        await nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
      opened = true;
      notificationSessionOpened({ protocol, userUuid: options.userUuid });
      keepAlive = setInterval(() => {
        if (protocol) send(encodeSignalRPing(protocol));
      }, keepAliveMs);
      lifecycle = setTimeout(() => {
        if (protocol) send(encodeSignalRClose(protocol, undefined, true));
        options.socket.close(1001, "Function lifecycle complete");
      }, lifecycleMs);
      return;
    }

    const messages = protocol === "messagepack"
      ? parseMessagePackHubMessages(bytes)
      : parseJsonHubMessages(rawText(data));
    if (protocol === "messagepack" && !isBinary) {
      throw new Error("MessagePack Hub Protocol requires binary frames.");
    }
    if (protocol === "json" && isBinary) {
      throw new Error("JSON Hub Protocol requires text frames.");
    }
    for (const message of messages) {
      if (signalRHubMessageType(message) === 7) {
        options.socket.close(1000, "SignalR client closed");
        return;
      }
    }
  };

  const onMessage = (data: RawData, isBinary: boolean) => {
    processing = processing
      .then(() => handleMessage(data, isBinary))
      .catch((error) => closeWithProtocolError(error instanceof Error ? error.message : "Invalid SignalR message"));
  };
  const onClose = (code: number, reason: Buffer) => {
    void cleanup(code, reason.toString("utf8").slice(0, 120));
  };
  const onError = (error: Error) => {
    recordNotificationMetric("protocol_failure", { detail: error.name }, "warn");
  };
  const handshakeTimeout = setTimeout(() => closeWithProtocolError("SignalR handshake timed out."), handshakeTimeoutMs);

  options.socket.on("message", onMessage);
  options.socket.on("close", onClose);
  options.socket.on("error", onError);

  await new Promise<void>((resolve) => {
    const finish = () => resolve();
    options.socket.on("close", finish);
  });
  await processing.catch(() => undefined);
  await cleanup(1000, "closed");
}
