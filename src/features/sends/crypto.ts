const SEND_KEY_SALT = new TextEncoder().encode("bitwarden-send");
const SEND_KEY_PURPOSE = new TextEncoder().encode("send");

function owned(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export async function deriveSendContentKey(sendKeyMaterial: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (sendKeyMaterial.length === 0) throw new Error("A Bitwarden Send key cannot be empty.");
  if (sendKeyMaterial.length >= 64) return owned(sendKeyMaterial.subarray(0, 64));

  const key = await crypto.subtle.importKey("raw", owned(sendKeyMaterial), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: SEND_KEY_SALT,
    info: SEND_KEY_PURPOSE,
  }, key, 512));
}
