#!/usr/bin/env node
/**
 * smoke.mjs — post-integration smoke check for the PowerSoftware license flow (Node SDK).
 * Zero dependencies (Node 18+). Runs the checks that need NO real license and create NOTHING:
 *
 *   1. machineCode() twice -> stable, format `M` + 32 chars
 *   2. purchaseUrl() -> valid URL carrying productUniqueCode + machineCode (both site bases)
 *   3. checkUpdate() -> real HTTPS round-trip to the platform API
 *      (unknown product => { hasUpdate:false } by design; proves connectivity, mints nothing)
 *   4. verify() with a bogus code => structured platform error (errorCode present, e.g.
 *      PARAM_VALIDATE_FAILED / codeNotFound), proving the error envelope + SDK throw path works
 *   5. [optional --trial] claimTrial() end-to-end (creates a real trial on TRIAL_FIRST products,
 *      once per machine — pass a throwaway product or accept the consumption)
 *
 * Usage (from the target project root):
 *   node smoke.mjs --product PRO-2026-001
 *   node smoke.mjs --product X --sdk ./vendor/powersoftware-license-sdk/node/src/index.js
 *   node smoke.mjs --product X --base https://www.powersoftware.cn/frontApi --trial
 *
 * Exit 0 = all executed checks passed. Non-`--trial` checks are always safe to run.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PURCHASE_BASES = ['https://www.powersoftware.app', 'https://www.powersoftware.cn'];

function parseArgs(argv) {
  const args = {
    product: 'SMOKE-TEST-0000',
    sdk: './vendor/powersoftware-license-sdk/node/src/index.js',
    base: undefined,
    version: '0.0.0',
    trial: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--product' || a === '-p') args.product = argv[++i];
    else if (a === '--sdk' || a === '-s') args.sdk = argv[++i];
    else if (a === '--base' || a === '-b') args.base = argv[++i];
    else if (a === '--version') args.version = argv[++i];
    else if (a === '--trial') args.trial = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

let failed = 0;
async function check(name, fn) {
  try {
    const note = await fn();
    console.log(`PASS  ${name}${note ? `  (${note})` : ''}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}  -> ${err.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('usage: node smoke.mjs --product <productUniqueCode> [--sdk PATH] [--base URL] [--version X.Y.Z] [--trial]');
    return;
  }
  const sdkPath = path.resolve(args.sdk);
  console.log(`-> importing SDK: ${sdkPath}`);
  const { LicenseClient, machineCode } = await import(pathToFileURL(sdkPath).href);

  const client = args.base
    ? new LicenseClient({ baseUrl: args.base, productUniqueCode: args.product })
    : new LicenseClient({ productUniqueCode: args.product });

  let mc;
  await check('machineCode stable & formatted', async () => {
    const a = machineCode();
    const b = machineCode();
    if (a !== b) throw new Error(`two calls differ: ${a} vs ${b}`);
    if (!/^M[A-Za-z0-9_-]{32}$/.test(a)) throw new Error(`unexpected format: ${a}`);
    mc = a;
    return a;
  });
  if (!mc) {
    console.error('FAIL machine code unavailable, aborting network checks');
    process.exit(1);
  }

  await check('purchaseUrl well-formed (both sites)', async () => {
    for (const base of PURCHASE_BASES) {
      const u = new URL(client.purchaseUrl(mc, { base }));
      const same = u.searchParams.get('productUniqueCode') === args.product
        && u.searchParams.get('machineCode') === mc;
      if (!same) throw new Error(`query params missing in ${u}`);
    }
    return client.purchaseUrl(mc);
  });

  await check('API connectivity via checkUpdate', async () => {
    const r = await client.checkUpdate(args.version);
    if (typeof r?.hasUpdate !== 'boolean') throw new Error(`unexpected response: ${JSON.stringify(r)}`);
    return `hasUpdate=${r.hasUpdate} latestVersion=${r.latestVersion ?? 'null'}`;
  });

  await check('error envelope via verify(bogus code)', async () => {
    try {
      await client.verify('SMOKE00000000', mc, 'bogus-token');
      throw new Error('expected rejection but call succeeded');
    } catch (err) {
      if (!err.errorCode) throw new Error(`error has no errorCode (malformed envelope): ${err.message}`);
      return `errorCode=${err.errorCode}`;
    }
  });

  if (args.trial) {
    await check('claimTrial end-to-end (--trial, creates a real trial)', async () => {
      const r = await client.claimTrial(mc);
      if (!r?.licenseCode || !r?.activationToken) throw new Error(`missing fields: ${JSON.stringify(r)}`);
      return `licenseCode=${r.licenseCode} edition=${r.edition}`;
    });
  } else {
    console.log('SKIP  claimTrial (pass --trial to run end-to-end trial claim; consumes the once-per-machine trial)');
  }

  if (failed) {
    console.error(`\nFAIL ${failed} check(s) failed — fix SDK import / network / product config before app integration.`);
    process.exit(1);
  }
  console.log('\nOK all checks passed — platform connectivity and SDK wiring are good.');
}

main().catch(err => {
  console.error(`FAIL ${err.message}`);
  process.exit(1);
});
