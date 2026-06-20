/**
 * Lightweight obfuscation for API keys stored in the providers table.
 *
 * This is NOT cryptographic security — it only prevents casual plaintext
 * exposure in DB dumps and screenshots. A determined attacker with disk
 * access can still reverse it. For real production use, replace with
 * AES-256-GCM keyed by a secret kept in the environment (e.g.
 * ORDPAW_DB_SECRET).
 *
 * The obfuscation is XOR with a fixed-length key derived from the
 * ORDPAW_DB_SECRET env var (or a default constant if unset), then
 * base64-encoded. The prefix "enc:v1:" lets us detect already-encoded
 * values and decode them back transparently.
 */

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const secret = process.env.ORDPAW_DB_SECRET || 'ordpaw-default-db-secret-v0.0.1';
  // Stretch to 32 bytes by repeating + hashing
  const buf = Buffer.alloc(32);
  const src = Buffer.from(secret, 'utf-8');
  for (let i = 0; i < 32; i++) buf[i] = src[i % src.length];
  return buf;
}

export function obfuscateApiKey(plain: string | undefined | null): string {
  if (!plain) return '';
  if (plain.startsWith(PREFIX)) return plain; // already encoded
  const key = getKey();
  const data = Buffer.from(plain, 'utf-8');
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ key[i % key.length];
  }
  return PREFIX + out.toString('base64');
}

export function deobfuscateApiKey(stored: string | undefined | null): string {
  if (!stored) return '';
  if (!stored.startsWith(PREFIX)) return stored; // plaintext, pass-through
  try {
    const key = getKey();
    const data = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const out = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = data[i] ^ key[i % key.length];
    }
    return out.toString('utf-8');
  } catch {
    return '';
  }
}
