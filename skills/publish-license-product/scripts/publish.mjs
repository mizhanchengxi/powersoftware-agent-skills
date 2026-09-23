// publish.mjs — upload the spec's local assets, inject their objectNames, then submit.
//   node publish.mjs --spec ../templates/product.license.example.json
//   node publish.mjs --spec ....json --dry-run     (upload + assemble only, no submit)
// The spec separates `assets` (local file paths) from `product` (the payload). Media MUST be
// uploaded first: the payload stores the returned objectName (a relative URI), never a local path.
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
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
const form = baseInfo.productForm;
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
