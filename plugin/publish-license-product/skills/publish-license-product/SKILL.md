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
- [ ] Phase 3.5: Determine the software form (productForm) — detect from the project, else ASK THE USER
- [ ] Phase 4: Upload assets (cover + 3–20 detail images + installer) → collect objectNames
- [ ] Phase 5: Submit the product for review
- [ ] Phase 6: Surface the productUniqueCode and apply it to the workspace's license integration
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

### Phase 3.5 — Determine the software form (productForm)

`productForm` drives which fields are valid and which asset the installer maps to, so resolve it
**before** uploading. `publish.mjs` resolves it in this order and back-fills the payload:

1. `--form <VALUE>` on the command line (explicit override, wins).
2. `spec.product.baseInfo.productForm` if the spec already sets it.
3. **Auto-detect from the current working directory** — the software being published. Signals:
   a `manifest.json` with `manifest_version` → `PLUGIN`; Electron/Tauri/`electron-builder`/NSIS
   markers → `CLIENT_SOFTWARE`.

Valid values: `CLIENT_SOFTWARE · SERVER_SOFTWARE · ONLY_PROMOTION · DIGITAL_GOOD · PLUGIN`.
This skill publishes **license** products, which the platform restricts to `CLIENT_SOFTWARE` or
`PLUGIN`.

**If none of the three yields a value** (e.g. there is no analysable project directory, or its
signals are absent/ambiguous), do **NOT** guess. `publish.mjs` stops with a prompt — relay it to
the user and ask them to choose, then re-run with the chosen `--form`. Ask in the user's own
terms, e.g.:

> 这个软件是什么形态？(1) 桌面/客户端软件 CLIENT_SOFTWARE  (2) 浏览器插件 PLUGIN
> —— 授权产品目前只支持这两种。告诉我选哪个。

(For a non-license product the same prompt lists all five forms.) Only after the user answers,
re-run `node publish.mjs --spec … --form <their choice>`.

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
3. **Reuse the existing `productId` (avoid duplicates).** `/product/submit` creates a NEW product
   when the payload has no `productId`, and EDITS when it does. If this product was published
   before, its `productId` was recorded in `ps-product.json`; `publish.mjs` reads it back and puts
   it into the payload so re-publishing UPDATES the same product instead of inserting a duplicate.
   Resolution order: `--product-id <id>` > `--new` (force create) > `spec.product.productId` >
   `ps-product.json` (auto, only when `productName` matches). The edit branch requires a higher
   `softwareVersion` than what is live — bump `baseInfo.softwareVersion` for a new release.
4. `POST /product/submit`.

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

### Phase 6 — Surface the `productUniqueCode` and apply it to the workspace

A successful `POST /product/submit` returns `{ productId, productUniqueCode }`. The
**`productUniqueCode` (产品唯一编码)** is the stable, never-changing identifier a client uses to
talk to the license system — it is exactly the value the SDK is initialised with
(`new LicenseClient({ productUniqueCode })`) and the argument `integrate-license`'s `smoke.mjs
--product <code>` expects. It is **not** a secret (it is shown on the product page).

`publish.mjs` already (a) prints it in a clear "发布成功" block and (b) records it to
`ps-product.json` in the current working directory (the project being published). Override the
target with `--emit <path>` or suppress the file with `--no-emit`. Then, as the agent, do this:

1. **Always relay the code to the user** — state the `productUniqueCode` explicitly in your reply
   (not just "published successfully").
2. **Apply it to the workspace's license integration, if one exists.** Detect a license hookup in
   the current project — e.g. a `LicenseClient(...)` construction, a `productUniqueCode` literal
   or placeholder (such as `PRO-2026-001`), an env var like `PS_PRODUCT_UNIQUE_CODE`, or a
   `ps-product.json`. If found, write the **real** returned `productUniqueCode` into that single
   source of truth (replace the placeholder), so the client points at the just-published product.
   Keep it consistent everywhere it appears; never ship it as if it were secret.
3. **If there is no workspace, or the project has no license integration, only display it.** Do
   not invent a config file or edit unrelated code. Hand the user the code and, when they want to
   wire it up, point them to the [`integrate-license`](../integrate-license/SKILL.md) skill.

If the response did **not** include `productUniqueCode` (an older deployed backend that predates
this field), `publish.mjs` says so — in that case still finish the publish, tell the user the code
was not returned, and where to read it (developer console → product page).

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
| `cannot determine the software form` | No `--form`, no `baseInfo.productForm`, and nothing analysable in the cwd → **ask the user** which form, then re-run with `--form <VALUE>`. |
| `LICENSE product ... must be CLIENT_SOFTWARE or PLUGIN` | A license/TRIAL_FIRST product was given a non-client form → confirm the real form with the user (usually CLIENT_SOFTWARE) and re-run. |

## Resources

- [reference.md](reference.md) — full endpoint list, enum values, payload schema, error codes.
- [scripts/](scripts/) — `register.mjs`, `login.mjs`, `apply-partner.mjs`, `publish.mjs`, `lib.mjs`.
- [templates/partner.example.json](templates/partner.example.json) — partner onboarding profile.
- [templates/product.license.example.json](templates/product.license.example.json) — license product spec.
