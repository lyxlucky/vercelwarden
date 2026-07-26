import { decode, encode } from "@msgpack/msgpack";
import type { NormalizedNotificationEvent } from "@/lib/server/notifications/types";

export const SIGNALR_RECORD_SEPARATOR = "\u001e";
export const BITWARDEN_RECEIVE_MESSAGE_TARGET = "ReceiveMessage";
export const BITWARDEN_SYNC_VAULT_NOTIFICATION_TYPE = 5;

export type SignalRHubProtocol = "json" | "messagepack";

export interface SignalRHandshake {
  protocol: SignalRHubProtocol;
  version: 1;
}

function textFrame(value: unknown): string {
  return `${JSON.stringify(value)}${SIGNALR_RECORD_SEPARATOR}`;
}

export function parseSignalRHandshake(value: string): SignalRHandshake {
  const boundary = value.indexOf(SIGNALR_RECORD_SEPARATOR);
  if (boundary < 0) throw new Error("SignalR handshake record separator is missing.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value.slice(0, boundary));
  } catch {
    throw new Error("SignalR handshake is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("SignalR handshake is invalid.");
  const handshake = parsed as Partial<SignalRHandshake>;
  if ((handshake.protocol !== "json" && handshake.protocol !== "messagepack") || handshake.version !== 1) {
    throw new Error("SignalR Hub Protocol is unsupported.");
  }
  return handshake as SignalRHandshake;
}

export function signalRHandshakeResponse(error?: string): string {
  return textFrame(error ? { error } : {});
}

function lengthPrefix(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) throw new Error("SignalR binary frame length is invalid.");
  const bytes: number[] = [];
  let remaining = length;
  do {
    let current = remaining & 0x7f;
    remaining = Math.floor(remaining / 128);
    if (remaining > 0) current |= 0x80;
    bytes.push(current);
  } while (remaining > 0 && bytes.length < 5);
  if (remaining > 0) throw new Error("SignalR binary frame is too large.");
  return Uint8Array.from(bytes);
}

export function frameMessagePackHubMessage(message: unknown): Uint8Array {
  const payload = encode(message);
  const prefix = lengthPrefix(payload.byteLength);
  const framed = new Uint8Array(prefix.byteLength + payload.byteLength);
  framed.set(prefix, 0);
  framed.set(payload, prefix.byteLength);
  return framed;
}

export function parseMessagePackHubMessages(bytes: Uint8Array): unknown[] {
  const messages: unknown[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    let size = 0;
    let shift = 0;
    let prefixBytes = 0;
    let complete = false;
    while (offset + prefixBytes < bytes.byteLength && prefixBytes < 5) {
      const current = bytes[offset + prefixBytes]!;
      size |= (current & 0x7f) << shift;
      prefixBytes += 1;
      if ((current & 0x80) === 0) {
        complete = true;
        break;
      }
      shift += 7;
    }
    if (!complete) throw new Error("SignalR binary length prefix is incomplete.");
    const start = offset + prefixBytes;
    const end = start + size;
    if (end > bytes.byteLength) throw new Error("SignalR binary payload is incomplete.");
    messages.push(decode(bytes.subarray(start, end)));
    offset = end;
  }
  return messages;
}

export function parseJsonHubMessages(value: string): unknown[] {
  const messages: unknown[] = [];
  for (const record of value.split(SIGNALR_RECORD_SEPARATOR)) {
    if (!record) continue;
    messages.push(JSON.parse(record));
  }
  return messages;
}

export function bitwardenVaultNotification(event: NormalizedNotificationEvent) {
  return {
    ContextId: event.actingDeviceIdentifier ?? null,
    Type: BITWARDEN_SYNC_VAULT_NOTIFICATION_TYPE,
    Payload: {
      UserId: event.userUuid,
      Date: event.revisionDate,
    },
  } as const;
}

export function encodeBitwardenInvocation(
  protocol: SignalRHubProtocol,
  event: NormalizedNotificationEvent
): string | Uint8Array {
  const notification = bitwardenVaultNotification(event);
  if (protocol === "json") {
    return textFrame({
      type: 1,
      target: BITWARDEN_RECEIVE_MESSAGE_TARGET,
      arguments: [notification],
    });
  }
  return frameMessagePackHubMessage([
    1,
    {},
    null,
    BITWARDEN_RECEIVE_MESSAGE_TARGET,
    [notification],
    [],
  ]);
}

export function encodeSignalRPing(protocol: SignalRHubProtocol): string | Uint8Array {
  return protocol === "json" ? textFrame({ type: 6 }) : frameMessagePackHubMessage([6]);
}

export function encodeSignalRClose(
  protocol: SignalRHubProtocol,
  error?: string,
  allowReconnect = true
): string | Uint8Array {
  if (protocol === "json") {
    return textFrame({ type: 7, ...(error ? { error } : {}), allowReconnect });
  }
  return frameMessagePackHubMessage([7, error ?? null, allowReconnect]);
}

export function signalRHubMessageType(message: unknown): number | null {
  if (Array.isArray(message) && typeof message[0] === "number") return message[0];
  if (message && typeof message === "object" && typeof (message as { type?: unknown }).type === "number") {
    return (message as { type: number }).type;
  }
  return null;
}

