// Client documents (decision #31). Synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claimedType, codeHash, crc32, documentFileName, isToken, makeZip, newLink, sha256, sniffType } from "./documents.ts";

test("a new link: 43-character token, 6-digit code, only hashes to store", () => {
  const l = newLink();
  assert.ok(isToken(l.token));
  assert.match(l.code, /^\d{6}$/);
  assert.equal(l.tokenHash, sha256(l.token));
  assert.equal(l.codeHash, codeHash(l.token, l.code));
  assert.notEqual(newLink().token, l.token);
  assert.equal(isToken("../../etc"), false);
});

test("file types come from the first bytes, not the name", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const text = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
  assert.equal(sniffType(text("%PDF-1.7 rest")), "application/pdf");
  assert.equal(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0)), "image/jpeg");
  assert.equal(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), "image/png");
  assert.equal(sniffType(new Uint8Array([0, 0, 0, 24, ...text("ftypheic")])), "image/heic");
  assert.equal(sniffType(text("MZ executable")), null);
  assert.equal(sniffType(text("<html>")), null);
});

test("the claimed type falls back to the file name (phones send HEIC with no type)", () => {
  assert.equal(claimedType("IMG_0001.HEIC", ""), "image/heic");
  assert.equal(claimedType("scan.pdf", "application/pdf"), "application/pdf");
  assert.equal(claimedType("notes.docx", ""), null);
});

test("download names come from the checklist item, never the client's file name", () => {
  assert.equal(documentFileName("Passport copy", 2, "application/pdf"), "Passport copy (2).pdf");
  assert.equal(documentFileName("Letter / employer: <draft>", 1, "image/png"), "Letter employer draft (1).png");
});

test("ZIP: correct CRC, headers and file count", () => {
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  const zip = makeZip([
    { name: "a.txt", data: new TextEncoder().encode("hello"), date: new Date(2026, 10, 11, 9, 30) },
    { name: "b.txt", data: new Uint8Array(0), date: new Date(2026, 10, 11, 9, 30) },
  ]);
  const view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  const end = zip.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  assert.equal(view.getUint16(end + 10, true), 2);
  const centralAt = view.getUint32(end + 16, true);
  assert.equal(view.getUint32(centralAt, true), 0x02014b50);
});
