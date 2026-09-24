---
name: integrate-license
description: Integrate PowerSoftware (powersoftware.app / powersoftware.cn) license codes into a client software product — machine-code binding, trial claim, activation, edition gating, purchase-page redirect, in-app issuance/upgrade (HMAC), and update checking — using the official zero-dependency powersoftware-license-sdk (Node.js / Python / Java). Use when adding license or paywall verification to a desktop/CLI product, when the user mentions 授权 / 授权码 / 激活 / 试用 / 幂栈 / licenseCode / activationToken / claimTrial / verifyCached, or is wiring the product published via the publish-license-product skill.
---

# Integrate PowerSoftware License (client software)

Teaches the agent to wire a **client software product** into the PowerSoftware license system
correctly in one pass. The SDK is a *library* (source-copy, zero dependency, three languages);
this skill is the *knowledge* — which scenario applies, which calls go where, and the rules that
are easy to get wrong. SDK source is fetched at runtime from its authoritative repo (see Step 2);
**never copy SDK code from this skill — there is none here on purpose.**

Companion skill: [`publish-license-product`](../publish-license-product/SKILL.md) publishes the
product first and yields the `productUniqueCode` used here.

## Step 0 — Pick the scenario (decide this before writing any code)

| | **Scenario A — platform full funnel (TRIAL_FIRST)** | **Scenario B — orders off-platform** |
|---|---|---|
| Who charges | PowerSoftware (Alipay / PayPal) | The developer's own payment |
| Who issues codes | Platform automatically after payment | Your **server** calls the API (HMAC-signed) |
| Needs `apiSecret`? | ❌ No | ✅ Yes — server-side **only** |
| Needs your own server? | ❌ No, pure client | ✅ Yes |
| Trial (`claimTrial`) | ✅ Supported | ❌ None |
| Platform purchase page | ✅ SDK one-liner redirect | ❌ Developer handles UX |

- Indie dev / small team without a backend → **A**.
- Already has own payment, just wants platform issuance + verification → **B**.

Ask the user which one if their product setup doesn't make it obvious.

## Prerequisites

- A published license product on the platform → `productUniqueCode` (visible on the publish
  page, not a secret). Scenario A additionally needs `salesModel: TRIAL_FIRST` with trial days
  and editions configured.
- Scenario B only: `licenseApiSecret` from the developer console.
- Node.js 18+ on the machine running the scripts below (for `fetch-sdk.mjs` / `smoke.mjs`).

## Step 1 — Hard rules (violating any of these = failed integration)

1. **`apiSecret` never ships to the client.** It exists only in Scenario B server code. A client
   build containing it is a leak, not a bug to fix later.
2. **`machineCode` comes only from the SDK function.** It persists locally
   (`~/.powersoftware/.machine-id`) and is cross-language consistent — never hand-roll or cache
   a transformed version.
3. **The edition ladder must include `TRIAL: 99`.** Trial licenses are full-feature; omitting
   TRIAL from the level map silently reduces a trial user to BASIC features. Classic trap.
4. **Persist only `licenseCode` + `activationToken` + last verify result** (plain JSON file /
   OS keychain). Never persist a decryptable full license payload.
5. **Monthly trial-count resets follow the server's `trialPeriodKey`** — judging by the local
   clock lets users refresh the quota by changing system time.
6. **HMAC is applied by the SDK** (`generateForSoftware` / `upgradeForSoftware`). Do not
   self-sign.
7. **`checkUpdate` must fail silently** — network errors can never block the app.
8. **Honor `licenseUpgradeMode`**: `SAME_CODE` → code never changes; `NEW_CODE` → overwrite the
   stored code with the new one returned after upgrade/renewal.

## Step 2 — Fetch the SDK into the project

```bash
node scripts/fetch-sdk.mjs --lang node            # or: python | java | all
node scripts/fetch-sdk.mjs --lang python --dest ./vendor
```

Zero dependencies (built-in `fetch`, Node 18+). Downloads the SDK source files of the requested
language(s) straight from the GitHub **API** (`api.github.com` trees + blob, with a contents-API
manifest fallback — deliberately **not** `raw.githubusercontent.com`, which is unreliable on some
networks). From `github.com/powersoftware-app/powersoftware-license-sdk` (default `main`, pin a
tag/sha with `--ref`), preserving repo layout, e.g. into `./vendor/powersoftware-license-sdk/`:

```text
node/src/index.js                                   # single file: machineCode / sign / LicenseClient
python/ps_license_sdk/{__init__,client,machine}.py
java/src/main/java/com/powersoftware/sdk/{LicenseClient,MachineCode,Json}.java
```

Placement per language:
- **Node**: keep as-is (ESM; rename to `.mjs` if the consuming project is CJS); TS projects just
  import the `.js` (add a local `d.ts` or `@ts-ignore` if `checkJs` complains).
- **Python**: the `ps_license_sdk/` dir goes onto `sys.path` next to the app code.
- **Java**: keep the package path or re-declare `package` to the project's own (README of SDK repo).

## Step 3 — Write the integration (Scenario A flow)

Target call order in the client:

```text
first launch ──→ claimTrial(mc) ──→ save {licenseCode, activationToken}
paid feature ──→ verifyCached(code, mc, token)   # 60s in-process cache
                  valid & edition sufficient → run feature
                  invalid/expired → show hint + open purchaseUrl(mc) in browser
user buys, pastes code ──→ activate(code, mc) ──→ overwrite saved token
```

Minimal Node example (Python/Java are isomorphic — same method names in snake_case/camelCase):

```js
import { LicenseClient, machineCode } from './vendor/powersoftware-license-sdk/node/src/index.js';

const client = new LicenseClient({ productUniqueCode: 'PRO-2026-001' });  // apiSecret NOT needed in A
const mc = machineCode();

const t = await client.claimTrial(mc);                       // first run only
await client.verifyCached(t.licenseCode, mc, t.activationToken); // → { valid, edition, expiryTime, trialExpiryTime }
const url = client.purchaseUrl(mc);                          // unauthorised → purchase page
```

Feature gating and edition comparison, credential-storage shape, `trialExpiryTime` grace
period, billing-period/renewal semantics, error-code UX: see [reference.md](reference.md).
Scenario B server-side issuance (`generateForSoftware` with `clientOrderId` idempotency) is also
covered there.

## Step 4 — Smoke test before declaring done

```bash
node scripts/smoke.mjs --product PRO-2026-001
node scripts/smoke.mjs --base https://www.powersoftware.cn/frontApi   # CN site
```

Verifies: machine-code stability + format, `purchaseUrl` well-formedness, a real API round-trip
via `checkUpdate` (unknown code → `hasUpdate:false` by design — a valid connectivity probe that
mints nothing), and a correctly-shaped error from `/license/verify`. **Exit 0 = environment is
wired.** Then test the product-specific path with a real trial product (trial claim is once per
machine — use a fresh `PS_LICENSE_HOME` to re-test).

## Step 5 — Integration checklist

```
- [ ] Scenario chosen with the user (A vs B); product is published, productUniqueCode known
- [ ] SDK fetched via fetch-sdk.mjs (not hand-copied), placed per language notes
- [ ] init: apiSecret empty (A) / server-only (B)
- [ ] claimTrial → first launch, persist licenseCode+activationToken
- [ ] verifyCached → every paid-feature entry point, with edition gate incl. TRIAL:99
- [ ] activate → user-pasted code path, overwrites token
- [ ] purchaseUrl → purchase-page redirect, .app/.cn site decision implemented
- [ ] LicenseError → errorCode UX mapping (expired→buy, machineLimit→unbind, revoked→support…)
- [ ] local credential store implemented
- [ ] checkUpdate wired asynchronously, failures silent (optional)
- [ ] (B) server issue endpoint with clientOrderId idempotency (optional)
- [ ] node scripts/smoke.mjs exits 0
```

## Browser-extension products

Different runtime (no disk / no exec for machine fingerprinting, quota stored in
`chrome.storage.local`). Follow the dedicated guide in the SDK repo instead:
`docs/浏览器插件授权接入指南_v3.md` (+ `node/src/webextension.js`). The scenario logic, edition
gating and error UX rules from this skill still apply.

## Resources

- [reference.md](reference.md) — endpoints, response fields, error codes, storage shape, gating
  snippets, Scenario B design.
- [scripts/fetch-sdk.mjs](scripts/fetch-sdk.mjs) — pulls latest SDK source from GitHub (executed,
  not read).
- [scripts/smoke.mjs](scripts/smoke.mjs) — integration smoke check (executed).
- Authoritative upstream docs (bilingual): SDK repo `powersoftware-license-sdk` →
  `客户端软件授权接入指南_v3`, `授权SDK规范_v3`, `授权接口文档_v3`. When this summary and the
  guide disagree, the guide wins — and report the drift.
