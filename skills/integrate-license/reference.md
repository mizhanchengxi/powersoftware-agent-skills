# integrate-license — Reference

Quick-lookup extracted from the authoritative guides in
[`powersoftware-license-sdk/docs`](https://github.com/powersoftware-app/powersoftware-license-sdk/tree/main/docs)
(`客户端软件授权接入指南_v3`, `授权SDK规范_v3`, `授权接口文档_v3` — all bilingual).
All endpoints are `POST {baseUrl}/frontApi/...`, JSON in/out, response envelope
`{ success, content, tip }`; the SDK throws on `success !== true` with `errorCode` taken from
`content.errorCode` (Node: `err.errorCode`, Python: `e.error_code`).

Defaults: Node `baseUrl = https://www.powersoftware.app/frontApi`; purchase page base
`https://www.powersoftware.app`. Machine-code persistence dir: `~/.powersoftware`
(override with env `PS_LICENSE_HOME`).

## SDK surface (identical across node / python / java)

| Method | Endpoint | A | B | Notes |
|---|---|:-:|:-:|---|
| `machineCode()` / `machine_code()` | — | ✅ | ✅ | `M` + 32-char base64url; 5-level source fallback, persisted UUID first |
| `claimTrial(mc)` | `/license/trial/claim` | ✅ | — | TRIAL_FIRST products only; once per machine (per product) |
| `activate(code, mc)` | `/license/activate` | ✅ | ✅ | → `{ activationToken, licenseUpgradeMode, trialExpiryTime, trialCount… }` |
| `verify(code, mc, token)` | `/license/verify` | ✅ | ✅ | → `{ valid, edition, expiryTime, … }` |
| `verifyCached(code, mc, token)` | same | ✅ | ✅ | 60s **in-process** cache; reset on app restart |
| `deactivate(code, mc)` | `/license/deactivate` | ✅ | ✅ | Unbind machine; needs logged-in context (personal-center scenario) |
| `purchaseUrl(mc, {base})` | — (URL builder) | ✅ | — | `/product/license/purchase?productUniqueCode=&machineCode=` |
| `checkUpdate(currentVersion)` | `/product/updateCheck` | ✅ | ✅ | → `{ hasUpdate, latestVersion }`; lenient: unknown/off-shelf product → `hasUpdate:false` |
| `generateForSoftware({machineCode, edition, expiryDays, clientOrderId})` | `/license/software/generate` | — | ✅ | HMAC-signed; **server only**; `clientOrderId` = idempotency key |
| `upgradeForSoftware({licenseCode, machineCode, edition, billingPeriod?, clientOrderId})` | `/license/software/upgrade` | — | ✅ | HMAC-signed; renewal extends from `max(now, oldExpiry)` |

`expiryDays`: 0 = permanent. `billingPeriod`: `PERMANENT` | `MONTHLY`(30d) | `YEARLY`(365d),
optional on upgrade when one edition has several periods; default = edition config's first row.

## Successful-verify response fields to honor

| Field | Meaning | Client action |
|---|---|---|
| `valid` | bool | gate the feature |
| `edition` | user's edition code | compare against required (level map **must include `TRIAL: 99`**) |
| `expiryTime` | ISO/epoch expiry, `null` = permanent | show renewal hint |
| `licenseUpgradeMode` | `SAME_CODE` / `NEW_CODE` | SAME: never ask user to re-enter code; NEW: overwrite stored code after upgrade |
| `trialExpiryTime` | original trial expiry, non-null after trial→purchase | optional grace: keep higher features until this instant (see below) |
| `trialCount` | per-edition trial-call quota, `null` if unset | platform does NOT track spend — decrement locally |
| `trialCountPeriod` | `TOTAL` / `MONTHLY` | MONTHLY: store usage as `{periodKey, used}` |
| `trialPeriodKey` | server month key e.g. `"2026-09"` | local `periodKey` ≠ server key → reset `used` to 0. **Never use the local clock.** |

### Edition gating (the TRIAL trap)

```python
EDITION_LEVEL = {"BASIC": 0, "PRO": 1, "ULTIMATE": 2, "TRIAL": 99}
def edition_sufficient(user, required):
    return EDITION_LEVEL.get(user, 0) >= EDITION_LEVEL.get(required, 0)
```

Edition codes are developer-defined on the publish page; the ladder above is the default trio.
Custom codes → use the product's actual codes in the map.

### trialExpiryTime grace (trial → lower-tier purchase)

Trial is all-features. After buying a lower tier, high-tier features would lock instantly
("paid but lost features"). Soften it: while `now < trialExpiryTime`, still allow the feature;
after that, lock + prompt paid upgrade (`NEW_CODE` products: use the new code).

### Credential storage shape (developer implements persistence; SDK does not)

```json
{
  "licenseCode": "XXXXXXXXXXXX",
  "activationToken": "YYYYYYYYYYYY",
  "lastVerify": { "valid": true, "edition": "ULTIMATE", "expiryTime": 1735689600000,
                  "trialExpiryTime": 1735000000000, "cachedAt": 1735689600000 }
}
```

Only these three things. No full decryptable license payload on disk.

## Error codes → UX

| `errorCode` | Meaning | Suggested UX |
|---|---|---|
| `codeNotFound` | code doesn't exist | re-check input |
| `revoked` | revoked | contact support |
| `expired` | expired | purchase / renew page |
| `machineLimit` | machine bind slots full | guide to personal-center unbind |
| `tooManyAttempts` | rate-limited | retry later |
| `trialNotEnabled` | product not TRIAL_FIRST | fix platform config |
| `trialAlreadyPurchased` | bought before → trial blocked | activate/verify the existing code |
| `NETWORK_ERROR` | network/timeout | offline grace or retry prompt |

## Purchase site: `.app` vs `.cn`

| | `powersoftware.app` | `powersoftware.cn` |
|---|---|---|
| Payment | Alipay + PayPal | Alipay only |
| Currency/locale | by IP / Accept-Language | fixed CN / zh-CN |
| Audience | overseas | mainland China |

SDK default is `.app` — no auto-detection. Options: system language starts with `zh` → `.cn`;
or a user setting; or hardcode `.cn` for China-only products. Pass the same host as `base` for
`purchaseUrl` and (if pointing the API at CN) `baseUrl = https://www.powersoftware.cn/frontApi`.

## Scenario B architecture (orders off-platform)

```
client ──pay (own channel)──▶ your server ──generateForSoftware(mc, edition, clientOrderId)──▶ platform
       ◀──licenseCode───────        ◀──licenseCode──────────────────────────────────────────────┘
client: activate(code, mc) → store token → verifyCached on feature use   (client never sees apiSecret)
```

- `clientOrderId` must be your stable order ID — retries with the same ID never double-issue.
- Upgrade/renewal in-app = `upgradeForSoftware`; period editions extend from `max(now, oldExpiry)`
  (no lost days on early renewal; expired → from now).
- Platform sends expiry-reminder emails (≤7 days) for period licenses; client needs no logic.

## checkUpdate etiquette

- Call at startup, async; then at most every ≥ 6 h (server caches aggressively).
- `hasUpdate:true` → toast with `latestVersion`, link to product detail page.
- Any exception → swallow and continue; never block startup.

## Browser extension deltas

- Fingerprint: no disk/exec → plugin-side stable ID + quota in `chrome.storage.local`
  (`{periodKey, used}` still applies); see `docs/浏览器插件授权接入指南_v3.md` and
  `node/src/webextension.js`.
- Editions default to `trialCount = 20` per edition for plugin products.
