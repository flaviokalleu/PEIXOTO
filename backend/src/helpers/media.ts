import path from "path";
import fs from "fs";
import crypto from "crypto";

/**
 * Ensures the public folder for a given company exists and returns its absolute path.
 */
export function ensureCompanyMediaDir(companyId: number): string {
  const folder = path.resolve(__dirname, "..", "..", "public", `company${companyId}`);
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    try { fs.chmodSync(folder, 0o777); } catch (e) { /* ignore on windows */ }
  }
  return folder;
}

/**
 * Generate a safe filename preserving (optional) original extension.
 */
export function generateSafeFilename(originalName: string | undefined, mimetype: string): string {
  const time = Date.now();
  const rand = crypto.randomBytes(6).toString("hex");
  let ext = "";
  if (originalName && originalName.includes('.')) {
    ext = originalName.split('.').pop();
  } else if (mimetype && mimetype.includes('/')) {
    ext = mimetype.split('/')[1].split(';')[0];
  }
  if (!ext) ext = 'bin';
  return `${time}_${rand}.${ext}`;
}

/**
 * Normalizes a provided buffer write (base64 vs binary) depending on content.
 */
export function writeMediaFile(absPath: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    // Cast buffer to any to satisfy ambient fs typings differences
    fs.writeFile(absPath, data as any, err => err ? reject(err) : resolve());
  });
}
