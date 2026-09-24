// publish.mjs — upload the spec's local assets, inject their objectNames, then submit.
//   node publish.mjs --spec ../templates/product.license.example.json
//   node publish.mjs --spec ....json --dry-run     (upload + assemble only, no submit)
//   node publish.mjs --spec ....json --form PLUGIN (override the software form / 软件形态)
//   node publish.mjs --spec ....json --product-id 123  (edit this product explicitly)
//   node publish.mjs --spec ....json --new             (force CREATE a new product)
// Duplicate guard: re-publishing the SAME product must carry its productId so /product/submit
// EDITS instead of inserting a duplicate. The id is auto-read from `ps-product.json` (matched by
// productName) unless overridden by --product-id / --new / spec.product.productId. See below.
// Software form resolution order: --form  >  spec.product.baseInfo.productForm  >  auto-detect
// from the current working directory. If none yields a value, the script STOPS and tells the
// agent to ask the user which form to publish (see the resolution block below).
// The spec separates `assets` (local file paths) from `product` (the payload). Media MUST be
// uploaded first: the payload stores the returned objectName (a relative URI), never a local path.
import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
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

// ---- Reuse an existing productId so re-publishing EDITS instead of creating a duplicate ----
// `/product/submit` treats a payload WITHOUT productId as "create new" and WITH productId as
// "edit". If this product was published before, Phase 6 recorded its identity (incl. productId)
// in `ps-product.json`. Re-publishing the SAME product MUST carry that productId, otherwise every
// run inserts a brand-new product. Resolution order (highest priority first):
//   --product-id <id>                 edit this explicit id
//   --new                             force CREATE, ignore any recorded id
//   spec.product.productId            already present in the spec file
//   ps-product.json (workspace)       auto-reuse, but ONLY when productName matches
{
  const pjPath = typeof args['product-json'] === 'string'
    ? resolve(args['product-json'])
    : join(process.cwd(), 'ps-product.json');
  let recorded = null;
  if (existsSync(pjPath)) { try { recorded = JSON.parse(readFileSync(pjPath, 'utf8')); } catch { recorded = null; } }
  const sameName = !!recorded
    && String(recorded.productName ?? '').trim() === String(baseInfo.productName ?? '').trim();

  let id = null;
  let idSource = null;
  if (args.new) {
    idSource = '--new (force create)';
  } else if (typeof args['product-id'] === 'string') {
    id = Number(args['product-id']); idSource = '--product-id';
  } else if (product.productId !== undefined && product.productId !== null) {
    id = Number(product.productId); idSource = 'spec.product.productId';
  } else if (sameName && recorded.productId != null) {
    id = Number(recorded.productId); idSource = basename(pjPath);
  }

  if (Number.isFinite(id) && id > 0) {
    product.productId = id; // triggers the EDIT branch — no duplicate created
    ok(`editing EXISTING product productId=${id} (source: ${idSource}) — will NOT create a duplicate.`);
    console.log('   ⚠ 编辑分支要求 softwareVersion 高于线上版本；若版本未提升，后端会拒绝（请提升 spec.baseInfo.softwareVersion）。');
  } else {
    delete product.productId; // ensure the CREATE branch
    if (args.new) ok('--new set: creating a NEW product (any recorded id ignored).');
    else if (recorded && !sameName) console.log(`   ℹ 工作空间已有 ${basename(pjPath)}（productName=${recorded.productName ?? '?'}），但产品名不同 — 视为新产品，将新建。若其实是同一产品，请核对 productName 或用 --product-id 指定。`);
    else ok('no prior productId found — this will CREATE a new product.');
  }
}

if (args['dry-run']) {
  console.log(JSON.stringify(product, null, 2));
  process.exit(0);
}

// ---- Phase 5: submit --------------------------------------------------------
const resp = await api(cfg, '/product/submit', { body: product, auth: true });
if (resp.success !== true) fail(`product/submit rejected: ${resp.message || resp.code || JSON.stringify(resp)}`);

const productId = resp.content?.productId;
const productUniqueCode = resp.content?.productUniqueCode;
ok(`product submitted for review, productId=${productId}. Status -> PENDING_RELEASE (platform review).`);

// ---- Phase 6: surface the 产品唯一编码 (productUniqueCode) ------------------
// The submit response now carries productUniqueCode — the stable, never-changing identifier the
// client license SDK is initialised with: new LicenseClient({ productUniqueCode }). It is NOT a
// secret (visible on the product page). Echo it and record it in the workspace so the license
// integration (see the integrate-license skill) can pick it up. Older deployed backends may not
// return it yet — degrade gracefully rather than fail the publish.
console.log('\n================= 发布成功 / Published =================');
console.log(`  产品名称 productName     : ${baseInfo.productName ?? '(n/a)'}`);
console.log(`  软件版本 softwareVersion  : ${baseInfo.softwareVersion ?? '(n/a)'}`);
console.log(`  商品ID   productId        : ${productId ?? '(n/a)'}`);
if (productUniqueCode) {
  console.log(`  产品唯一编码 productUniqueCode: ${productUniqueCode}   ← 授权接入用这个`);
} else {
  console.log('  产品唯一编码 productUniqueCode: (接口未返回 — 部署版本可能尚未支持；请到开发者后台产品页查看，并更新 ps-frontend-service)');
}
console.log('======================================================\n');

// Record the identity in the current workspace (the project being published) so the license
// integration can read it. Override the target with --emit <path>; suppress entirely with --no-emit.
if (productUniqueCode && !args['no-emit']) {
  const outPath = typeof args.emit === 'string' ? resolve(args.emit) : join(process.cwd(), 'ps-product.json');
  const record = {
    productUniqueCode,
    productId: productId ?? null,
    productName: baseInfo.productName ?? null,
    productForm: form,
    softwareVersion: baseInfo.softwareVersion ?? null,
    licenseEnabled: isLicense,
    updatedAt: new Date().toISOString(),
  };
  try {
    writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
    ok(`wrote product identity -> ${outPath}`);
  } catch (e) {
    console.error(`⚠ could not write ${outPath}: ${e.message}（上方展示不受影响 / display above is unaffected）`);
  }
  console.log(
    '下一步 / Next: 把 productUniqueCode 应用到当前工作空间的授权接入处（integrate-license）：\n' +
    `  new LicenseClient({ productUniqueCode: '${productUniqueCode}' })\n` +
    '  若当前工作空间未接入授权、或没有对应的授权位置，则只需把上面的编码提供给用户。'
  );
}
