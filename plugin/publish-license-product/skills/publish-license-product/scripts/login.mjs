// login.mjs — password login; stores the SESSION_ID cookie; reports the DEVELOPER role.
// Run again after the partner application is approved to pick up the DEVELOPER role.
//   node login.mjs
import { parseArgs, loadConfig, api, unwrap, ok, fail } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig();
const email = args.email || cfg.email;
const password = args.password || cfg.password;
if (!email || !password) fail('set email & password in config.local.json (or --email/--password).');

const content = unwrap(await api(cfg, '/user/login', {
  body: { username: email, password, loginWay: 'PASSWORD' },
}), 'login');

ok(`logged in as ${email}. SESSION_ID stored.`);
console.log(`developer: ${content?.developer ? 'true  (publish rights OK)' : 'false (partner not approved yet — apply, wait for review, then re-login)'}`);
