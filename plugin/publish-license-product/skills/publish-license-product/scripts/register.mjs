// register.mjs — two-step email-code registration.
//   node register.mjs --send-code
//   node register.mjs --code 123456
import { parseArgs, loadConfig, api, unwrap, ok, fail } from './lib.mjs';

const args = parseArgs();
const cfg = loadConfig();
if (!cfg.email || !cfg.password) fail('set email & password in config.local.json (or PS_EMAIL / PS_PASSWORD).');

if (args['send-code']) {
  unwrap(await api(cfg, '/user/verificationCode', {
    body: { email: cfg.email, businessType: 'FRONTEND_USER_REGISTER' },
  }), 'send verificationCode');
  ok(`verification code emailed to ${cfg.email}. Re-run: node register.mjs --code 123456`);
  process.exit(0);
}

if (!args.code) fail('usage: node register.mjs --send-code   |   node register.mjs --code 123456');
unwrap(await api(cfg, '/user/register', {
  body: {
    username: cfg.email,
    password: cfg.password,
    rePassword: cfg.password,
    verificationCode: String(args.code),
  },
}), 'register');
ok(`registered ${cfg.email}. Next: node login.mjs`);
