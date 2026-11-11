// Client document collection (Increment 2; decision #31). Server-side helpers:
// upload links and codes, file type checks, file names, and ZIP files.
// Unit tests: documents.test.ts. Never import this from a client component.

import { createHash, randomBytes, randomInt } from "node:crypto";

/** The private storage bucket. Only the server reaches it (service role). */
export const BUCKET = "client-documents";
export const MAX_BYTES = 25 * 1024 * 1024;

export const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
};

/** The current time (UTC), e.g. to tell whether a link has expired. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** The code is tied to its link, so a code alone is worth nothing. */
export function codeHash(token: string, code: string): string {
  return sha256(`${token}:${code}`);
}

/** A new upload link token (256 bits) and 6-digit code. Only their hashes are stored. */
export function newLink() {
  const token = randomBytes(32).toString("base64url");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { token, code, tokenHash: sha256(token), codeHash: codeHash(token, code) };
}

export function newSession() {
  const session = randomBytes(32).toString("base64url");
  return { session, sessionHash: sha256(session) };
}

export function isToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** The real type from the first bytes of a file, or null when it is not an allowed type. */
export function sniffType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (ascii(4, 8) === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"].includes(ascii(8, 12))) return "image/heic";
  return null;
}

/** The type a browser claims, or the one its file name suggests (phones often send HEIC with no type). */
export function claimedType(name: string, type: string): string | null {
  if (type in EXTENSIONS) return type;
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heic" }[ext] ?? null;
}

/** A download name from the checklist item, never the client's own file name. */
export function documentFileName(label: string, n: number, mime: string): string {
  const base = label.replace(/[^A-Za-z0-9 ._-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Document";
  return `${base} (${n}).${EXTENSIONS[mime] ?? "bin"}`;
}

// ---------------------------------------------------------------------------
// ZIP (stored, no compression: PDFs and photos are already compressed)
// ---------------------------------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files: { name: string; data: Uint8Array; date: Date }[]): Uint8Array {
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const crc = crc32(f.data);
    const d = f.date;
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    const date = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true);
    head.setUint16(4, 20, true);
    head.setUint16(6, 0x0800, true); // UTF-8 names
    head.setUint16(10, time, true);
    head.setUint16(12, date, true);
    head.setUint32(14, crc, true);
    head.setUint32(18, f.data.length, true);
    head.setUint32(22, f.data.length, true);
    head.setUint16(26, name.length, true);
    local.push(new Uint8Array(head.buffer), name, f.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, f.data.length, true);
    entry.setUint32(24, f.data.length, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...local, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
