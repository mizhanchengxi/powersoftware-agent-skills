// publish.mjs — upload the spec's local assets, inject their objectNames, then submit.
//   node publish.mjs --spec ../templates/product.license.example.json
//   node publish.mjs --spec ....json --dry-run     (upload + assemble only, no submit)
//   node publish.mjs --spec ....json --form PLUGIN (override the software form / 软件形态)
// Software form resolution order: --form  >  spec.product.baseInfo.productForm  >  auto-detect
// from the current working directory. If none yields a value, the script STOPS and tells the
// agent to ask the user which form to publish (see the resolution block below).
// The spec separates `assets` (local file paths) from `product` (the payload). Media MUST be
// uploaded first: the payload stores the returned objectName (a relative URI), never a local path.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { parseArgs, loadConfig, api, uploadFile, ok, fail } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig();
if (typeof args.spec !== 'string') fail('usage: node publish.mjs --spec path/to/product.json [--dry-run]');

const specPath = resolve(args.spec);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const baseDir = dirname(specPath);
const assets = spec.assets || {};
const product = spec.product || {};
const baseInfo = product.baseInfo || fail('spec.product.baseInfo is required');
const introduce = product.introduce || (product.introduce = {});
const at = (p) => resolve(baseDir, p); // resolve asset path relative to the spec file

// ---- Resolve software form (形态): --form > spec > auto-detect(cwd) > ask the user -------
const PRODUCT_FORMS = ['CLIENT_SOFTWARE', 'SERVER_SOFTWARE', 'ONLY_PROMOTION', 'DIGITAL_GOOD', 'PLUGIN'];
// This skill publishes LICENSE products; the platform only allows licenses on these two forms.
const LICENSE_FORMS = ['CLIENT_SOFTWARE', 'PLUGIN'];

const readdirSafe = (d) => { try { return readdirSync(d); } catch { return []; } };

/**
 * Best-effort software-form detection from a project directory. Deliberately conservative:
 * returns null when there is no strong signal, so the caller prompts the user instead of guessing.
 */
function detectProductForm(dir) {
  const has = (p) => existsSync(join(dir, p));
  const read = (p) => { try { return readFileSync(join(dir, p), 'utf8'); } catch { return ''; } };
  // Browser extension (MV2/MV3) -> PLUGIN
  if (/"manifest_version"\s*:\s*[23]/.test(read('manifest.json'))) return 'PLUGIN';
  // Desktop client frameworks / installer tooling -> CLIENT_SOFTWARE
  const pkg = read('package.json');
  if (/"(electron|electron-builder|@tauri-apps[\\/]api|@tauri-apps[\\/]cli)"\s*:/.test(pkg)) return 'CLIENT_SOFTWARE';
  if (has('src-tauri') || has('electron-builder.yml') || has('electron-builder.json5') || has('electron-builder.json')) return 'CLIENT_SOFTWARE';
  if (readdirSafe(dir).some((f) => /\.(nsi|nsh)$/i.test(f))) return 'CLIENT_SOFTWARE';
  return null;
}

const cliForm = typeof args.form === 'string' && args.form ? args.form : null;
let form = cliForm || baseInfo.productForm || null;
let formSource = cliForm ? '--form' : (baseInfo.productForm ? 'spec' : null);
if (!form) {
  const detected = detectProductForm(process.cwd());
  if (detected) { form = detected; formSource = 'auto-detect'; }
}
if (!form) {
  fail(
    'cannot determine the software form (productForm / 软件形态).\n' +
    `  Not passed via --form, not set in spec.product.baseInfo.productForm, and no clear signal in the working directory (${process.cwd()}).\n` +
    '  → ASK THE USER which form this product is, then re-run with: --form <VALUE>\n' +
    `  Valid values: ${PRODUCT_FORMS.join(' | ')}\n` +
    `  NOTE: this skill publishes LICENSE products — the platform only allows ${LICENSE_FORMS.join(' | ')}.`
  );
}
if (!PRODUCT_FORMS.includes(form)) {
  fail(`invalid productForm '${form}'. Valid: ${PRODUCT_FORMS.join(' | ')}. If unsure, ask the user.`);
}
const isLicense = baseInfo.licenseEnabled === true || baseInfo.salesModel === 'TRIAL_FIRST'
  || (Array.isArray(baseInfo.licenseEditions) && baseInfo.licenseEditions.length > 0);
if (isLicense && !LICENSE_FORMS.includes(form)) {
  fail(`a LICENSE product (licenseEnabled / TRIAL_FIRST) must be ${LICENSE_FORMS.join(' or ')} — got '${form}'. Ask the user to correct the form, then re-run with --form CLIENT_SOFTWARE (or PLUGIN).`);
}
baseInfo.productForm = form; // back-fill so the payload carries the resolved form
ok(`productForm = ${form} (source: ${formSource}).`);

// ---- Phase 4: upload assets, collect objectNames ------------------------------

if (assets.coverImage) {
  baseInfo.coverImage = await uploadFile(cfg, at(assets.coverImage), 'product_cover_picture');
} else if (!baseInfo.coverImage) {
  fail('spec.assets.coverImage (or a pre-uploaded baseInfo.coverImage objectName) is required');
}

if (Array.isArray(assets.detailImages)) {
  const names = [];
  for (const img of assets.detailImages) names.push(await uploadFile(cfg, at(img), 'product_detail_picture'));
  introduce.images = names; // validator requires 3–20 images
  if (names.length < 3) fail(`introduce.images needs 3–20 detail images, got ${names.length}`);
}

// Installer / source package -------------------------------------------------
// `form` was resolved (and back-filled into baseInfo) before any upload, above.
async function injectExecutable(localPath) {
  const objectName = await uploadFile(cfg, at(localPath), 'product_file');
  return { name: basename(localPath), url: objectName };
}
if (form === 'SERVER_SOFTWARE' || form === 'DIGITAL_GOOD') {
  if (assets.sourceCodeFile) baseInfo.sourceCodeFile = await injectExecutable(assets.sourceCodeFile);
} else if (form === 'CLIENT_SOFTWARE' || form === 'PLUGIN') {
  // Allow either a pre-built clientSoftware tree with local `file` markers, or a single installer.
  if (Array.isArray(baseInfo.clientSoftware)) {
    for (const sys of baseInfo.clientSoftware) {
      for (const pkg of sys.softwarePackages || []) {
        if (pkg.executableFile && pkg.executableFile.file) {
          const ef = await injectExecutable(pkg.executableFile.file);
          pkg.executableFile = { name: ef.name, url: ef.url };
        }
      }
    }
  } else if (assets.installer) {
    const meta = spec.installerMeta || {};
    const ef = await injectExecutable(assets.installer);
    baseInfo.clientSoftware = [{
      system: meta.system || 'Windows',
      softwarePackages: [{ platform: meta.platform || 'EXE', executableFile: ef }],
    }];
  }
}

const hasExecutable = (baseInfo.clientSoftware || []).some((s) =>
  (s.softwarePackages || []).some((p) => p.executableFile && p.executableFile.url));
if ((form === 'CLIENT_SOFTWARE' || form === 'PLUGIN') && !hasExecutable) {
  fail('CLIENT_SOFTWARE/PLUGIN needs at least one installer: set spec.assets.installer or a clientSoftware[].executableFile.file');
}

ok('assets uploaded & payload assembled.');

if (args['dry-run']) {
  console.log(JSON.stringify(product, null, 2));
  process.exit(0);
}

// ---- Phase 5: submit --------------------------------------------------------
const resp = await api(cfg, '/product/submit', { body: product, auth: true });
if (resp.success !== true) fail(`product/submit rejected: ${resp.message || resp.code || JSON.stringify(resp)}`);
ok(`product submitted for review, productId=${resp.content?.productId}. Status -> PENDING_RELEASE (platform review).`);
