---
name: publish-license-product
description: Publish a license-enabled software product end-to-end on the PowerSoftware platform (powersoftware.app / powersoftware.cn). Use when repeatedly listing/uploading license products, onboarding a partner account, or automating the product-publish flow. Covers user registration, partner application (with a mandatory human approval gate), cover/detail image + installer upload, and product submission.
---

# Publish a License Product (PowerSoftware)

Playbook to repeatedly publish **license-enabled** software products on PowerSoftware. The
platform's upload page has two prerequisites that this skill encodes:

1. **The account must be registered AND approved as a partner** (`DEVELOPER` role) — and the
   approval is a **manual review by platform operators**, which the agent must NOT try to bypass.
2. **Images/installer must be uploaded first**; the product payload only stores the returned
   `objectName` (a relative URI). You cannot save a product without its cover image.

All endpoints live under `{baseUrl}/frontApi` and are authenticated by the `SESSION_ID` cookie.
Ready-made dependency-free Node scripts (Node 18+) are in [`scripts/`](scripts/). Field-by-field
payload rules, enums and error codes are in [reference.md](reference.md).

## Prerequisites / config

- Node.js 18+.
- Copy [`scripts/config.example.json`](scripts/config.example.json) → `scripts/config.local.json`
  and set `baseUrl`, `email`, `password`.
  - Use the **CN site** `https://www.powersoftware.cn/frontApi` for scripted flows: login/register
    there skip Cloudflare Turnstile. The overseas prod site requires a human `turnstileToken`
    on register/login, which cannot be scripted headlessly.
- `config.local.json`, `.ps-session.json` and `assets/` are git-ignored — never commit them.

Run all commands from the `scripts/` directory.

## Workflow — track these phases

Copy this checklist and mark progress. **Phase 2 is a hard stop.**

```
- [ ] Phase 0: Check whether a partner account already exists (skip 1–3 if so)
- [ ] Phase 1: Register a user
- [ ] Phase 2: Apply as partner  ⛔ then WAIT for manual operator approval
- [ ] Phase 3: Re-login to acquire the DEVELOPER role
- [ ] Phase 4: Upload assets (cover + 3–20 detail images + installer) → collect objectNames
- [ ] Phase 5: Submit the product for review
```

### Phase 0 — Do you already have a partner account?

If yes, just `node login.mjs` and go to Phase 3's role check. Registration and partner
onboarding are one-time per email; do not repeat them.

### Phase 1 — Register a user

```bash
node register.mjs --send-code      # emails a 6-digit code (FRONTEND_USER_REGISTER)
node register.mjs --code 123456    # completes registration
node login.mjs                     # stores the SESSION_ID cookie
```

Password rules: 6–20 chars, must contain both a letter and a digit.

### Phase 2 — Apply as partner (⛔ human gate)

```bash
node apply-partner.mjs --send-code                                   # emails a code (FRONTEND_UPDATE_DEVELOPER_INFO)
node apply-partner.mjs --code 123456 --profile ../templates/partner.example.json
```

This submits an onboarding application in `PENDING` state and notifies operators via DingTalk.

**⛔ STOP HERE — this is a mandatory manual review that must not be automated.** Tell the user:

> Partner application submitted. An operator must approve it at the admin console
> (`https://admin.powersoftware.app`). When you tell me it's approved, I'll continue.

The `DEVELOPER` role is granted **only at login time** when the developer `auditStatus === PASS`.
Submitting `/developer/save` alone does **not** grant publish rights. Additional account rules:
CN country requires `alipayAccount`; every other country requires `paypalAccount`. `currency`
is a 3-letter code.

### Phase 3 — Re-login to acquire the DEVELOPER role

After the user confirms approval:

```bash
node login.mjs
```

`login.mjs` prints `developer: true|false`. Proceed only when it is `true`; otherwise the
approval hasn't landed yet — wait and re-login.

### Phase 4 → 5 — Upload assets, then submit (ordering is mandatory)

The product references media by `objectName`; nothing can be saved before upload succeeds.
`publish.mjs` handles the whole order for you: it uploads every local asset in the spec,
injects the returned `objectName`s into the payload, then submits.

```bash
node publish.mjs --spec ../templates/product.license.example.json
```

What it does under the hood (see [reference.md](reference.md) for the raw endpoints):

1. For each asset (cover, each detail image, installer): `checkFileExists` (md5 dedup) →
   if new, `getPreSignedUrl` → HTTP `PUT` bytes → keep the returned `objectName`.
   - `businessType` MUST be the enum value: `product_cover_picture`, `product_detail_picture`,
     `product_file` (never a bare word like `FILE`).
   - Images: png/jpg/jpeg/gif/webp, ≤ 10 MB. Installer: exe/msi/zip/… ≤ 100 MB.
2. Assemble payload: cover → `baseInfo.coverImage`; detail images → `introduce.images`
   (needs 3–20); installer → `baseInfo.clientSoftware[].softwarePackages[].executableFile` (or
   `sourceCodeFile` for server/digital-good).
3. `POST /product/submit`.

### License-product rules the payload must satisfy

A **license** product is `productForm: CLIENT_SOFTWARE` (or `PLUGIN`) with `licenseEnabled: true`.
When `salesModel: TRIAL_FIRST` (try-before-buy):

- `licenseEnabled = true`, `licensePlatformPayment = true`, `trialDays` in 1–365,
  `receivePayment.productPrice = 0` (or omitted),
- `licenseEditions` has ≥ 1 row; with platform payment, prices must be **strictly ascending**;
  `(code + billingPeriod)` combos must be unique,
- `softwareVersion` must be `x.y.z`,
- at least one executable package must exist.

For `PAY_FIRST` buyout, `receivePayment.productPrice ≥ 1` (no ¥0 buyout).

On success the product enters `PENDING_RELEASE` (platform review) — that is expected; publishing
to the storefront is a further operator action, not part of this skill.

## Common failures

| Message | Cause / fix |
|---------|-------------|
| `need_developer_role` | Not logged in as an approved partner → finish Phase 2, then re-login (Phase 3). |
| `coverImage.require` | Cover `objectName` missing — Phase 4 upload didn't complete. |
| `images.size` | `introduce.images` must hold 3–20 images. |
| `licenseEditions.periodDuplicate` | Two editions share the same `code`+`billingPeriod`. |
| `licenseEditions.priceAscending` | Platform-payment edition prices not strictly increasing. |
| `productPrice.required` / `trialFirstZero` | Price vs `salesModel` mismatch (see rules above). |
| suffix / size rejected | Wrong `businessType`, non-whitelisted file type, or oversize file. |

## Resources

- [reference.md](reference.md) — full endpoint list, enum values, payload schema, error codes.
- [scripts/](scripts/) — `register.mjs`, `login.mjs`, `apply-partner.mjs`, `publish.mjs`, `lib.mjs`.
- [templates/partner.example.json](templates/partner.example.json) — partner onboarding profile.
- [templates/product.license.example.json](templates/product.license.example.json) — license product spec.
