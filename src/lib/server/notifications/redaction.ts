const SENSITIVE_KEY = /(access[_-]?token|authorization|cookie|connection[_-]?token|password|secret|redis|broker)/iu;

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_KEY.test(key) || key === "id") url.searchParams.set(key, "[REDACTED]");
    }
    if (url.username) url.username = "[REDACTED]";
    if (url.password) url.password = "[REDACTED]";
    return url.toString();
  } catch {
    return SENSITIVE_KEY.test(value) ? "[REDACTED]" : value;
  }
}

export function redactNotificationMetadata(
  value: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const redacted: Record<string, string | number | boolean | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      redacted[key] = "[REDACTED]";
    } else if (entry === null || ["string", "number", "boolean"].includes(typeof entry)) {
      redacted[key] = typeof entry === "string" && /^\w+:\/\//u.test(entry)
        ? redactUrl(entry)
        : entry as string | number | boolean | null;
    }
  }
  return redacted;
}

