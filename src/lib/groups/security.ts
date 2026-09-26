import "server-only";

import crypto from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateGroupCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

export function normalizeGroupCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashGroupPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyGroupPassword(password: string, stored: string) {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function accessSecret() {
  const secret = process.env.GROUP_ACCESS_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("GROUP_ACCESS_SECRET is not configured");
  return secret;
}

export function groupAccessCookieName(code: string) {
  return `ft_group_${code}`;
}

/** Tied to the current password hash, so changing the password revokes old cookies. */
export function groupAccessToken(code: string, passwordHash: string) {
  return crypto.createHmac("sha256", accessSecret()).update(`${code}:${passwordHash}`).digest("hex");
}

export function isValidGroupAccessToken(code: string, passwordHash: string, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(groupAccessToken(code, passwordHash));
  const actual = Buffer.from(token);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}