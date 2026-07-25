import { authenticateRequest } from "@/lib/server/authorization/authorize";
import { apiErrorResponse } from "@/lib/server/http/errors";
import { subscribeNotifications, type NotificationEvent } from "@/lib/server/notifications/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function encodeEvent(event: NotificationEvent): Uint8Array {
  return encoder.encode(`id: ${event.eventId}\nevent: revision\ndata: ${JSON.stringify(event)}\n\n`);
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const lastEventId = request.headers.get("last-event-id");
    const parsed = Number(lastEventId ?? 0);
    const lastSequence = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    let unsubscribe: () => void = () => undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": connected\n\n"));
        unsubscribe = subscribeNotifications(auth.user.uuid, (event) => controller.enqueue(encodeEvent(event)), lastSequence);
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
          } catch {
            unsubscribe();
            if (heartbeat) clearInterval(heartbeat);
          }
        }, 15_000);
        request.signal.addEventListener("abort", () => {
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          try { controller.close(); } catch { /* already closed */ }
        }, { once: true });
      },
      cancel() {
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
