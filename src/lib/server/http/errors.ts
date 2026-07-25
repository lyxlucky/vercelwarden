import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { z } from "zod";

export type ValidationErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly validationErrors: ValidationErrors = {}
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function zodErrors(error: z.ZodError): ValidationErrors {
  const fields: ValidationErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "body";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 1024 * 1024): Promise<T> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "Content-Type must be application/json.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body exceeds the allowed size.");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body exceeds the allowed size.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body is not valid JSON.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(400, "validation_error", "Request validation failed.", zodErrors(result.error));
  }
  return result.data;
}

export async function parseFormData(request: Request, maxBytes = 1024 * 1024): Promise<FormData> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data") && !contentType.startsWith("application/x-www-form-urlencoded")) {
    throw new ApiError(415, "unsupported_media_type", "A form content type is required.");
  }
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiError(413, "payload_too_large", "Request body exceeds the allowed size.");
  }
  return request.formData();
}

export function apiErrorResponse(error: unknown, requestId: string = randomUUID()) {
  const normalized = error instanceof ApiError
    ? error
    : new ApiError(500, "internal_error", "The request could not be completed.");
  return NextResponse.json(
    {
      object: "error",
      code: normalized.code,
      message: normalized.message,
      validationErrors: normalized.validationErrors,
      requestId,
    },
    {
      status: normalized.status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Request-Id": requestId,
      },
    }
  );
}

export function withApiHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
