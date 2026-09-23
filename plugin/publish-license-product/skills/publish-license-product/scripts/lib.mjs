// lib.mjs — shared helpers for the publish-license-product scripts (Node 18+, no deps).
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, extname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SESSION_FILE = join(__dirname, '.ps-session.json');
const CONFIG_FILE = join(__dirname, 'config.local.json');

/** Minimal `--key value` / `--flag` arg parser. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

/** Load config from env first, then config.local.json. */
export function loadConfig() {
  let file = {};
  if (existsSync(CONFIG_FILE)) {
    try { file = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')); }
    catch (e) { fail(`config.local.json is not valid JSON: ${e.message}`); }
  }
  const cfg = {
    baseUrl: process.env.PS_BASE_URL || file.baseUrl || 'https://www.powersoftware.cn/frontApi',
    email: process.env.PS_EMAIL || file.email,
    password: process.env.PS_PASSWORD || file.password,
    language: process.env.PS_LANGUAGE || file.language || 'zh-CN',
  };
  return cfg;
}

function readSession() {
  if (!existsSync(SESSION_FILE)) return {};
  try { return JSON.parse(readFileSync(SESSION_FILE, 'utf8')); } catch { return {}; }
}
function writeSession(s) {
  writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2), 'utf8');
}
export function hasSession() {
  const s = readSession();
  return Boolean(s.sessionId);
}

function extractSetCookie(res) {
  // Node 18.14+ / 20: getSetCookie(); fallback: single set-cookie header.
  if (typeof res.headers.getSetCookie === 'function') {
    const arr = res.headers.getSetCookie() || [];
    const hit = arr.find((c) => c.startsWith('SESSION_ID='));
    return hit || arr[0] || null;
  }
  return res.headers.get('set-cookie');
}

/**
 * Call a /frontApi endpoint. `path` is relative, e.g. '/user/login'.
 * auth=true attaches the stored SESSION_ID cookie. Response set-cookie is persisted.
 */
export async function api(cfg, path, { method = 'POST', body, auth = false, headers = {} } = {}) {
  const url = cfg.baseUrl.replace(/\/$/, '') + path;
  const h = { 'Content-Type': 'application/json', Accept: 'application/json', ...headers };
  if (cfg.language) h['Accept-Language'] = cfg.language;
  const s = readSession();
  if (auth) {
    if (!s.sessionId) fail('not logged in — run `node login.mjs` first.');
    h['Cookie'] = `SESSION_ID=${s.sessionId}`;
  }
  const res = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const sc = extractSetCookie(res);
  if (sc) {
    const m = /SESSION_ID=([^;]+)/.exec(sc);
    if (m) { const cur = readSession(); cur.sessionId = m[1]; writeSession(cur); }
  }
  let json;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : {}; } catch { fail(`${path} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`); }
  if (!res.ok && json.success !== false) fail(`${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

/** Assert success or print the server message and exit. */
export function unwrap(resp, what) {
  if (!resp || resp.success !== true) {
    fail(`${what} failed: ${resp?.message || resp?.code || JSON.stringify(resp)}`);
  }
  return resp.content;
}

export function fail(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}
export function ok(msg) { console.log('✔ ' + msg); }

export function md5File(path) {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  exe: 'application/octet-stream', msi: 'application/octet-stream', zip: 'application/zip',
  dmg: 'application/octet-stream', apk: 'application/vnd.android.package-archive',
};
function mimeOf(suffix) { return MIME[suffix] || 'application/octet-stream'; }

/**
 * Upload one local file and return the stored `objectName` (the URI used in the product).
 * businessType MUST be an UploadFileBusinessTypeEnum value, e.g. 'product_cover_picture'.
 */
export async function uploadFile(cfg, localPath, businessType) {
  const abs = resolve(localPath);
  if (!existsSync(abs)) fail(`asset not found: ${localPath}`);
  const size = statSync(abs).size;
  const suffix = extname(abs).replace(/^\./, '').toLowerCase();
  const md5 = md5File(abs);
  const fileSuffix = suffix;

  const check = unwrap(await api(cfg, '/file/upload/checkFileExists', {
    body: { businessType, fileSuffix, md5 }, auth: true,
  }), 'checkFileExists');
  if (check?.isExists) { ok(`reuse existing ${businessType} ${basename(abs)} -> ${check.objectName}`); return check.objectName; }

  const sign = unwrap(await api(cfg, '/file/upload/getPreSignedUrl', {
    body: { businessType, fileSuffix, md5, fileSize: size }, auth: true,
  }), 'getPreSignedUrl');

  const bytes = readFileSync(abs);
  const put = await fetch(sign.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeOf(suffix), 'Cache-Control': 'public, max-age=31536000' },
    body: bytes,
  });
  if (!put.ok) fail(`PUT to signedUrl failed (HTTP ${put.status}) for ${localPath}`);
  ok(`uploaded ${businessType} ${basename(abs)} (${size}B) -> ${sign.objectName}`);
  return sign.objectName;
}
