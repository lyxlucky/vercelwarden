"use client";

import jsQR from "jsqr";

export interface ParsedTotp {
  secret: string;
  issuer: string;
  accountName: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: 5 | 6 | 7 | 8;
  period: number;
  encoder: "standard" | "steam";
  uri: string;
}

const BASE32 = /^[A-Z2-7]+=*$/;

function normalizeSecret(value: string) {
  const secret = value.replace(/[\s-]+/g, "").toUpperCase().replace(/=+$/, "");
  if (secret.length < 8 || !BASE32.test(secret)) throw new Error("TOTP 密钥不是有效的 Base32 内容。");
  return secret;
}

export function parseTotpInput(input: string): ParsedTotp {
  const value = input.trim();
  if (!value) throw new Error("请输入 TOTP 密钥或 otpauth URI。");
  if (!value.toLowerCase().startsWith("otpauth://")) {
    const secret = normalizeSecret(value);
    return {
      secret,
      issuer: "",
      accountName: "",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      encoder: "standard",
      uri: `otpauth://totp/Vercelwarden?secret=${encodeURIComponent(secret)}`,
    };
  }

  let uri: URL;
  try { uri = new URL(value); } catch { throw new Error("otpauth URI 无效。"); }
  const kind = uri.hostname.toLowerCase();
  if (kind !== "totp" && kind !== "steam") throw new Error("仅支持基于时间的 TOTP 或 Steam 验证码。");
  const secret = normalizeSecret(uri.searchParams.get("secret") ?? "");
  const algorithmValue = (uri.searchParams.get("algorithm") ?? "SHA1").replace("-", "").toUpperCase();
  if (algorithmValue !== "SHA1" && algorithmValue !== "SHA256" && algorithmValue !== "SHA512") throw new Error("不支持该 TOTP 哈希算法。");
  const steam = kind === "steam" || uri.searchParams.get("encoder")?.toLowerCase() === "steam";
  const digitsValue = steam ? 5 : Number(uri.searchParams.get("digits") ?? 6);
  if (![5, 6, 7, 8].includes(digitsValue)) throw new Error("TOTP 位数必须为 6、7、8，Steam 为 5 位。");
  const period = Number(uri.searchParams.get("period") ?? 30);
  if (!Number.isInteger(period) || period < 5 || period > 300) throw new Error("TOTP 周期必须介于 5 到 300 秒。");
  const label = decodeURIComponent(uri.pathname.replace(/^\//, ""));
  const separator = label.indexOf(":");
  const labelIssuer = separator >= 0 ? label.slice(0, separator) : "";
  const accountName = separator >= 0 ? label.slice(separator + 1) : label;
  return {
    secret,
    issuer: uri.searchParams.get("issuer") ?? labelIssuer,
    accountName,
    algorithm: algorithmValue,
    digits: digitsValue as ParsedTotp["digits"],
    period,
    encoder: steam ? "steam" : "standard",
    uri: value,
  };
}

function base32Bytes(secret: string): Uint8Array<ArrayBuffer> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of normalizeSecret(secret)) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2);
  return bytes;
}

export async function generateTotpCode(config: ParsedTotp, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / config.period);
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(4, counter, false);
  const secret = base32Bytes(config.secret);
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: config.algorithm.replace("SHA", "SHA-") }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = digest[digest.length - 1]! & 15;
  let binary = ((digest[offset]! & 127) << 24) | ((digest[offset + 1]! & 255) << 16) | ((digest[offset + 2]! & 255) << 8) | (digest[offset + 3]! & 255);
  if (config.encoder === "steam") {
    const alphabet = "23456789BCDFGHJKMNPQRTVWXY";
    let code = "";
    for (let index = 0; index < 5; index += 1) {
      code += alphabet[binary % alphabet.length];
      binary = Math.floor(binary / alphabet.length);
    }
    return code;
  }
  return String(binary % (10 ** config.digits)).padStart(config.digits, "0");
}

export async function decodeTotpQrImage(file: Blob): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("二维码图片不能超过 10 MB。");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096) throw new Error("二维码图片尺寸过大。");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法读取二维码图片。");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const result = jsQR(image.data, image.width, image.height);
    if (!result?.data) throw new Error("图片中没有可识别的二维码。");
    parseTotpInput(result.data);
    return result.data;
  } finally {
    bitmap.close();
  }
}

export function remainingTotpSeconds(period: number, timestamp = Date.now()) {
  return period - (Math.floor(timestamp / 1000) % period);
}
