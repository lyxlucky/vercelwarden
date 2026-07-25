import { timingSafeEqual } from "node:crypto";

function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || pw.length < 8) {
    throw new Error("ADMIN_PASSWORD must be set and at least 8 characters");
  }
  return pw;
}

export function checkAdminAuth(request: Pick<Request, "headers">): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const sep = decoded.indexOf(":");
  if (sep < 0) return false;
  const password = decoded.slice(sep + 1);

  const expected = getAdminPassword();
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
