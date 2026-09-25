#!/usr/bin/env node
/**
 * fetch-sdk.mjs — download the PowerSoftware License SDK source (latest) into a target project.
 * Zero dependencies (Node 18+, built-in fetch).
 *
 * Primary source is the Gitee mirror (gitee.com/<repo>/raw/<ref>/<path>), which is reachable
 * from mainland China; if Gitee fails it falls back to api.github.com (git trees + blob/contents,
 * NOT raw.githubusercontent.com). NOTE: the Gitee path fetches files by the fixed MANIFEST list
 * below, so a newly-added SDK file must be added to MANIFEST too; only the GitHub fallback
 * auto-discovers files via the recursive tree API. No git, no tar/unzip, Windows-safe.
 *
 * Usage (run from the target project root, or pass --dest):
 *   node fetch-sdk.mjs --lang node                 # -> ./vendor/powersoftware-license-sdk/node/src/index.js
 *   node fetch-sdk.mjs --lang python --dest ./src  # -> ./src/powersoftware-license-sdk/python/...
 *   node fetch-sdk.mjs --lang java,python
 *   node fetch-sdk.mjs --lang all --ref <branch|tag|sha>
 *
 * The SDK repo is the single source of truth:
 *   https://github.com/powersoftware-app/powersoftware-license-sdk
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = 'powersoftware-app/powersoftware-license-sdk';
const API = `https://api.github.com/repos/${REPO}`;
const HDRS = { 'User-Agent': 'ps-license-fetch-sdk' };
// Gitee mirror (same owner/repo name) — used when api.github.com is unreachable,
// e.g. mainland China. Gitee's raw file endpoint returns the file body via a plain HTTPS GET.
const GITEE = `https://gitee.com/${REPO}`;

// Repo prefixes holding the SDK sources per language (main sources only, tests excluded).
const LANG_PREFIXES = {
  node: ['node/src/'],
  python: ['python/ps_license_sdk/'],
  java: ['java/src/main/java/com/powersoftware/sdk/'],
};
// Fallback manifest if the trees listing comes back empty (network hiccup on the list call).
const MANIFEST = [
  'node/src/index.js',
  'python/ps_license_sdk/__init__.py',
  'python/ps_license_sdk/client.py',
  'python/ps_license_sdk/machine.py',
  'java/src/main/java/com/powersoftware/sdk/LicenseClient.java',
  'java/src/main/java/com/powersoftware/sdk/MachineCode.java',
  'java/src/main/java/com/powersoftware/sdk/Json.java',
];
const ALLOW_EXT = ['.js', '.py', '.java'];

function parseArgs(argv) {
  const args = { lang: ['node'], dest: './vendor', ref: 'main' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang' || a === '-l') args.lang = String(argv[++i] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    else if (a === '--dest' || a === '-d') args.dest = argv[++i];
    else if (a === '--ref' || a === '-r') args.ref = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.lang.includes('all')) args.lang = Object.keys(LANG_PREFIXES);
  const bad = args.lang.filter(l => !LANG_PREFIXES[l]);
  if (bad.length) throw new Error(`unknown --lang value(s): ${bad.join(',')} (allowed: ${Object.keys(LANG_PREFIXES).join('/')}/all)`);
  return args;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchWithRetry(url, headers = HDRS, tries = 5) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 403 || resp.status === 429) {
        throw new Error(`HTTP ${resp.status} — GitHub API rate limit (60 req/h per IP); wait or pin --ref <sha>`);
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (/HTTP 4\d\d/.test(err.message)) throw err; // don't retry hard 4xx
      const detail = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
      if (i < tries - 1) { console.log(`   retry ${i + 1}/${tries - 1} after transient error${detail}`); await sleep(600 * (i + 1)); }
    }
  }
  throw lastErr;
}

/** Recursive tree listing -> [{path, sha}]. One API call. --ref may be branch/tag/sha. */
async function listFiles(ref, prefixes) {
  const resp = await fetchWithRetry(`${API}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    { ...HDRS, Accept: 'application/vnd.github+json' });
  if (!resp.ok) throw new Error(`trees listing -> HTTP ${resp.status}`);
  const tree = await resp.json();
  return (tree.tree || [])
    .filter(e => e.type === 'blob'
      && prefixes.some(p => e.path.startsWith(p))
      && !e.path.includes('__pycache__')
      && ALLOW_EXT.includes(path.extname(e.path)))
    .map(e => ({ path: e.path, sha: e.sha }));
}

/** Blob content by sha via api.github.com (Accept: raw => plain text body). */
async function fetchBlobBySha(sha) {
  const resp = await fetchWithRetry(`${API}/git/blobs/${sha}`, { ...HDRS, Accept: 'application/vnd.github.raw' });
  if (!resp.ok) throw new Error(`blob ${sha} -> HTTP ${resp.status}`);
  return resp.text();
}

/** Fallback: fetch a file by path+ref via the contents API (no sha needed). */
async function fetchByPath(ref, filePath) {
  const resp = await fetchWithRetry(
    `${API}/contents/${filePath}?ref=${encodeURIComponent(ref)}`,
    { ...HDRS, Accept: 'application/vnd.github.raw' });
  if (!resp.ok) throw new Error(`contents ${filePath} -> HTTP ${resp.status}`);
  return resp.text();
}

function write(abs, text) {
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, 'utf8');
  return abs;
}

/**
 * Fetch one file from the Gitee raw endpoint, trying candidate refs (gitee mirrors often use
 * `master` instead of `main`). Returns { text, ref } on the first ref that yields a real body;
 * throws if none work. A missing file on Gitee returns a non-200 or an HTML page, both rejected.
 */
async function fetchGiteeByPath(refCandidates, filePath) {
  for (const ref of refCandidates) {
    const url = `${GITEE}/raw/${encodeURIComponent(ref)}/${filePath}`;
    let resp;
    try {
      resp = await fetchWithRetry(url, { 'User-Agent': HDRS['User-Agent'] }, 3);
    } catch { continue; }
    if (!resp.ok) continue;
    const text = await resp.text();
    // Reject empty bodies and Gitee HTML error pages (a real .js/.py/.java source never starts with '<').
    if (text && text.trim() && !/^\s*</.test(text)) return { text, ref };
  }
  throw new Error(`gitee raw ${filePath} not fetchable from any of [${refCandidates.join(', ')}]`);
}

/** Download requested langs' SDK files from GitHub API. Returns file count written. */
async function fetchFromGithub(args, prefixes, destRoot) {
  console.log(`-> listing SDK files from github.com/${REPO} (ref: ${args.ref})`);
  let files = await listFiles(args.ref, prefixes).catch(err => {
    console.log(`   tree listing failed (${err.message}); falling back to manifest`);
    return null;
  });
  let count = 0;
  if (files && files.length) {
    for (const f of files) {
      const text = await fetchBlobBySha(f.sha);
      const abs = write(path.join(destRoot, f.path), text);
      console.log(`   downloaded ${f.path} -> ${abs}`);
      count++;
    }
  } else {
    // Manifest fallback (contents API by path). Filter to requested languages.
    const wanted = MANIFEST.filter(p => prefixes.some(pref => p.startsWith(pref)));
    for (const p of wanted) {
      const text = await fetchByPath(args.ref, p);
      const abs = write(path.join(destRoot, p), text);
      console.log(`   downloaded ${p} -> ${abs}`);
      count++;
    }
  }
  return count;
}

/** Download requested langs' SDK files from the Gitee mirror (by manifest path). Returns count. */
async function fetchFromGitee(args, prefixes, destRoot) {
  console.log(`-> listing SDK files from Gitee mirror gitee.com/${REPO} (primary)`);
  const wanted = MANIFEST.filter(p => prefixes.some(pref => p.startsWith(pref)));
  const refCandidates = [...new Set([args.ref, 'main', 'master'].filter(Boolean))];
  let count = 0;
  for (const p of wanted) {
    const { text, ref } = await fetchGiteeByPath(refCandidates, p);
    const abs = write(path.join(destRoot, p), text);
    console.log(`   downloaded ${p} (ref ${ref}) -> ${abs}`);
    count++;
  }
  return count;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node fetch-sdk.mjs --lang node|python|java|all[,lang] [--dest DIR] [--ref main|BRANCH|SHA]');
    return;
  }
  const prefixes = args.lang.flatMap(l => LANG_PREFIXES[l]);
  const destRoot = path.resolve(args.dest, 'powersoftware-license-sdk');

  // Gitee first (reachable from mainland China); on failure or zero files, fall back to GitHub.
  let count = 0;
  try {
    count = await fetchFromGitee(args, prefixes, destRoot);
  } catch (err) {
    console.log(`   Gitee failed (${err.message})`);
  }
  if (!count) {
    try {
      count = await fetchFromGithub(args, prefixes, destRoot);
    } catch (err) {
      console.log(`   GitHub failed (${err.message})`);
    }
  }

  if (!count) throw new Error(`no SDK files fetched for lang(s) ${args.lang.join(',')} at ref ${args.ref}`);
  console.log(`OK ${count} file(s) -> ${destRoot}`);
  console.log('Next: place/copy into your project per SKILL.md Step 2, then run smoke.mjs.');
}

main().catch(err => {
  const cause = err.cause ? ` [cause: ${err.cause.code || err.cause.message || err.cause}]` : '';
  console.error(`FAIL ${err.message}${cause}`);
  console.error('hint: tried Gitee then GitHub. GitHub API unauthenticated limit is 60 req/h per IP; if rate-limited, wait or pin --ref <commit-sha>.');
  process.exit(1);
});
