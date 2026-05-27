import { SignJWT, jwtVerify } from "jose";

// Reuses JWT_SECRET via lazy getter to avoid module-load-time env reads.
// Registration tokens are independent of the main bearer-token issuer/audience.
let _secret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  _secret = new TextEncoder().encode(s);
  return _secret;
}

export async function signRegistrationToken(claims: {
  email: string;
  name: string;
}): Promise<string> {
  return new SignJWT({ ...claims, purpose: "registration" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecret());
}

export async function verifyRegistrationToken(
  token: string
): Promise<{ email: string; name: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.purpose !== "registration") return null;
    return {
      email: payload.email as string,
      name: (payload.name as string) || "",
    };
  } catch {
    return null;
  }
}
