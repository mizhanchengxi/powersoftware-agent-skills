// apply-partner.mjs — partner onboarding (requires a prior `node login.mjs`).
//   node apply-partner.mjs --send-code
//   node apply-partner.mjs --code 123456 --profile ../templates/partner.example.json
// ⛔ After submitting, an OPERATOR must manually approve the application. Then re-run
//    `node login.mjs` to obtain the DEVELOPER role before publishing any product.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, loadConfig, api, unwrap, ok, fail } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig();

if (args['send-code']) {
  unwrap(await api(cfg, '/activity/invitation/verificationCode', {
    body: { businessType: 'FRONTEND_UPDATE_DEVELOPER_INFO' }, auth: true,
  }), 'send developer verificationCode');
  ok(`onboarding code emailed to ${cfg.email}. Re-run: node apply-partner.mjs --code 123456 --profile ../templates/partner.example.json`);
  process.exit(0);
}

if (!args.code || typeof args.profile !== 'string') {
  fail('usage: node apply-partner.mjs --code 123456 --profile ../templates/partner.example.json');
}

const profile = JSON.parse(readFileSync(resolve(args.profile), 'utf8'));
const body = { ...profile, verificationCode: String(args.code), agreeProtocol: true };
if (!body.name || !body.countryId || !body.organizationalType || !body.phone || !body.publicEmail || !body.currency) {
  fail('profile must include: name, countryId, organizationalType, phone, publicEmail, currency (+ alipayAccount for CN, else paypalAccount).');
}

unwrap(await api(cfg, '/developer/save', { body, auth: true }), 'developer/save');
ok('partner application submitted (status = PENDING).');
console.log('\n⛔ HUMAN GATE: ask an operator to approve it at https://admin.powersoftware.app .');
console.log('   After approval, run `node login.mjs` (developer must become true), then `node publish.mjs ...`.\n');
