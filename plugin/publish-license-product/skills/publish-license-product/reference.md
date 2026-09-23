# Reference — PowerSoftware publish-license-product

Raw contracts used by the scripts. Everything is JSON unless noted. Auth = the `SESSION_ID`
cookie set by `/user/login`. Base path prefix: `{baseUrl}` already includes `/frontApi`
(e.g. `https://www.powersoftware.cn/frontApi`).

## Response envelope

```jsonc
{ "success": true, "requestId": "...", "content": ... }        // ok
{ "success": false, "code": "...", "message": "..." }          // biz warn / validation failed
```

Read `success` first; on failure surface `message` (it is an i18n-resolved, human-readable string).

## Endpoints

### Auth

| Purpose | Method & path | Body |
|---|---|---|
| Send register/login code | `POST /user/verificationCode` | `{ email, businessType }` (prod non-CN also needs `turnstileToken`) |
| Register | `POST /user/register` | `{ username, password, rePassword, verificationCode, invitationCode? }` |
| Login | `POST /user/login` | `{ username, password, loginWay: "PASSWORD" }` → sets `SESSION_ID` cookie; `content.developer: boolean` |

`businessType` for the pre-login code = `FRONTEND_USER_REGISTER` (or `FRONTEND_USER_LOGIN`).
Password: 6–20 chars, needs a letter and a digit. Username is the email.

### Partner onboarding (all require login)

| Purpose | Method & path | Body |
|---|---|---|
| Send onboarding code | `POST /activity/invitation/verificationCode` | `{ businessType: "FRONTEND_UPDATE_DEVELOPER_INFO" }` |
| Become-country list (get `countryId`) | `GET /developer/become/country/list` | — |
| Submit application | `POST /developer/save` | see profile fields below |

`/developer/save` fields: `name`(2–500), `countryId`(number), `organizationalType`
(`PERSONAL`/`ENTERPRISE`/`INDIVIDUAL_BUSINESS`), `phone`, `publicEmail`(email), `currency`(3 letters),
`agreeProtocol:true`, `verificationCode`(6), and payment account by country: `alipayAccount`
required when country is `CN`, otherwise `paypalAccount` required. `introduce`/`githubUrl` optional.

Result: application is `PENDING`; `DEVELOPER` role is **not** granted until an operator approves
**and you log in again**. CN country also gates `PERSONAL` (`supportCasual`) and forces
`phonePrefix` from the country record.

### File upload (all require login)

Sequence per file:

1. `POST /file/upload/checkFileExists` `{ businessType, fileSuffix, md5 }`
   → `content: { isExists, objectName }`. If `isExists`, reuse `objectName`, stop.
2. `POST /file/upload/getPreSignedUrl` `{ businessType, fileSuffix, md5, fileSize }`
   → `content: { objectName, signedUrl, viewUrl }`.
3. HTTP **`PUT`** the raw bytes to `signedUrl` (no `/frontApi` prefix — it's an object-store URL).
   Header `Content-Type` = the file's MIME. The value stored in the product is `objectName`.

`businessType` (from `UploadFileBusinessTypeEnum`) — use the enum string, never a bare word:

| businessType value | used for | constraints |
|---|---|---|
| `product_cover_picture` | cover image | png/jpg/jpeg/gif/webp, ≤ 10 MB |
| `product_detail_picture` | detail/gallery images | png/jpg/jpeg/gif/webp, ≤ 10 MB |
| `product_file` | installer / source zip | exe/msi/dmg/pkg/zip/rar/7z/deb/rpm/apk/appimage/tar/gz, ≤ 100 MB |
| `front_user_avatar` | profile picture | image types, ≤ 10 MB |

`md5` = lowercase hex MD5 of the file (content-addressed dedup). `fileSuffix` = extension without
leading dot, lowercase. Per-user upload-count caps apply (`FILE.process.upload_limit`).
Product images/files are protected from manual `deleteFile`.

### Submit product (requires `DEVELOPER` role)

`POST /product/submit` — body validated by `PRODUCT_SUBMIT_VALIDATOR`. Top level:

```jsonc
{
  "productId": 123,           // omit/null = create; set = edit (needs greater softwareVersion)
  "submitMode": "submit",     // "draft" saves a draft (no review/DingTalk), "submit" (default) files for review
  "baseInfo":    { ... },
  "introduce":   { ... },
  "receivePayment": { ... }
}
```

**Response `content`** (create and edit alike):

```jsonc
{ "productId": 123, "productUniqueCode": "P…-…" }
```

`productUniqueCode` (产品唯一编码) is generated at creation and never changes — it is the client
license identifier (`new LicenseClient({ productUniqueCode })`). Surface it after publish and apply
it to the workspace's license integration (see SKILL.md Phase 6); it is not a secret.

## Enums (exact string values)

- `productForm`: `CLIENT_SOFTWARE` · `SERVER_SOFTWARE` · `ONLY_PROMOTION` · `DIGITAL_GOOD` · `PLUGIN`
  - Resolution in `publish.mjs`: `--form` > `spec.baseInfo.productForm` > auto-detect from the
    cwd (`manifest.json`+`manifest_version`→`PLUGIN`; Electron/Tauri/`electron-builder`/NSIS→`CLIENT_SOFTWARE`).
    If still unknown it **stops and asks the user** — never guesses. License products must be `CLIENT_SOFTWARE`/`PLUGIN`.
- `salesModel`: `PAY_FIRST` · `TRIAL_FIRST`
- `licenseEditions[].billingPeriod`: `PERMANENT` · `MONTHLY` · `YEARLY`
- `licenseEditions[].trialCountPeriod`: `TOTAL` · `MONTHLY`
- `receivePayment.currency`: `CNY` · `USD` (others limited to these two in the validator)
- `organizationalType`: `PERSONAL` · `INDIVIDUAL_BUSINESS` · `ENTERPRISE`
- `loginWay`: `PASSWORD` · `VERIFICATION_CODE`

## baseInfo fields

| Field | Rule |
|---|---|
| `productName`, `secondName` | 3–100 chars |
| `summary` | 5–2000 chars |
| `sourceStation`, `demoStation`, `shopLink`, `sourceCodeGitUrl` | valid URL if present |
| `productForm` | required enum |
| `softwareVersion` | `^\d+\.\d+\.\d+$` (required for client/server/digital-good/plugin) |
| `coverImage` | **required** — a `product_cover_picture` objectName |
| `salesModel` | `PAY_FIRST`/`TRIAL_FIRST` |
| `trialDays` | 1–365, required when `TRIAL_FIRST` |
| `licenseEnabled`, `licensePlatformPayment`, `licenseAllowDeveloperIssue` | booleans |
| `licenseDefaultMaxMachines` | 1–100 |
| `licenseEditions[]` | `{ code, name, sort?, currency?, productPrice?, billingPeriod?, trialCount?, trialCountPeriod?, description? }` |
| `clientSoftware[]` | `[{ system, softwarePackages:[{ platform, executableFile:{name,url} }] }]` — required for CLIENT_SOFTWARE/PLUGIN |
| `sourceCodeFile` | `{name,url}` — required for SERVER_SOFTWARE / DIGITAL_GOOD |
| `industryIds`, `occupationIds`, `tagIds` | number arrays |

## introduce fields

`images` (**3–20** objectNames), `functions`(5–10000), `targetUserGroup`(5–10000),
`usageScenarios`, `painPoints`, `prerequisite`, `successfulCases`, `afterSales`,
`askedQuestions` (each 5–10000 if present), `video`/`zhVideo` (URL), `implementation` (≤ 50000).

## receivePayment fields

`currency`, `productPrice`, `productIncome`, `deployPrice`, `deployIncome`.
- `TRIAL_FIRST`: `productPrice` must be `0`/null.
- `PAY_FIRST` on client/server/digital-good/plugin: `productPrice ≥ 1`.
- `SERVER_SOFTWARE`: `deployPrice` ≤ `productPrice × 2`.
- `DIGITAL_GOOD`: no deploy fields allowed; `digitalGoodsTypeId` + `softwareVersion` + file required.

## Cross-field validation (superRefine) — the ones that bite

- `TRIAL_FIRST` requires `licenseEnabled=true` AND `licensePlatformPayment=true` AND `trialDays`
  AND ≥1 `licenseEdition`, and only for `CLIENT_SOFTWARE`/`PLUGIN`.
- `licensePlatformPayment=true`: present edition prices must be strictly ascending in array order.
- Edition `(code, billingPeriod?)` must be unique (billingPeriod defaults `PERMANENT`).
- CLIENT_SOFTWARE/PLUGIN: at least one `executableFile.url` across all packages.

## i18n error keys → meaning

| Key | Meaning |
|---|---|
| `PRODUCT.process.need_developer_role` | session lacks `DEVELOPER` — approve partner + re-login |
| `PRODUCT.validate.coverImage.require` | missing cover |
| `PRODUCT.validate.images.size` | `introduce.images` not in 3–20 |
| `PRODUCT.validate.licenseEditions.required` | no editions while `TRIAL_FIRST` |
| `PRODUCT.validate.licenseEditions.periodDuplicate` | duplicate code+period |
| `PRODUCT.validate.licenseEditions.priceAscending` | platform-payment prices not ascending |
| `PRODUCT.validate.productPrice.required` | price < 1 for PAY_FIRST |
| `PRODUCT.validate.productPrice.trialFirstZero` | price ≠ 0 for TRIAL_FIRST |
| `PRODUCT.validate.softwareVersion.format` | version not `x.y.z` |
| `FILE.process.suffix_not_allowed` / `file_size_exceed` / `upload_limit` | upload rejected |
| `DEVELOPER.validate.alipayAccount.required` / `paypalAccount.required` | payout account per country |
| `USER.process.verificationCode_captcha_required` | prod non-CN needs a Turnstile token — use the CN site |
