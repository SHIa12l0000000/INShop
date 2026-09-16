# INShop

**Everything you need. One smart shop.**

An original navy-and-gold marketplace with a responsive storefront, database-backed APIs, customer workflows and a protected administrator workspace. This release is a working development foundation and demonstration catalog, **not a finished production implementation of the entire marketplace specification**.

## What works

- Catalog browsing, category pages, search, brand/price/rating/stock filters, sorting and pagination.
- Product galleries, comparison, guest cart persistence, quantity controls, guest wishlists and first-visit authentication dismissal.
- Supabase server-side authentication integration: email registration/verification, password login/reset, Google OAuth, authenticator enrollment and verification. Requires an external Supabase project and HTTPS configuration.
- Database-backed customer carts, explicit guest-cart merge, wishlists, addresses, orders, reviews, questions, notifications and support requests.
- Server-priced order creation, atomic stock decrement with database constraints, coupon validation, cancellation and return requests. Sample products cannot be purchased.
- Razorpay order initiation and HMAC-verified captured-payment webhook. Payment confirmation is never accepted from the browser. Requires a merchant account and sandbox validation before use.
- Server-side admin role and MFA enforcement, product editing, inventory, order transitions, customer administration, moderation, coupons, banner/content records, settings and audit logging.
- A separate `/admin/demo` read-only dashboard with clearly labeled synthetic figures. It grants no administrator permissions.
- INR formatting, Indian address validation, light/dark/system themes, mobile bottom navigation, loading/error/empty states, metadata, sitemap, PWA manifest and a nonsensitive offline fallback.

## Stack and structure

React 19, TypeScript, Tailwind CSS 4, Next.js route conventions through **Vinext (beta)**, Cloudflare Workers, managed **D1 relational SQLite**, Drizzle schema/migrations, Supabase Auth and Razorpay. This deployment uses D1 rather than PostgreSQL/Prisma; a PostgreSQL migration would require replacing the database adapter and testing transaction semantics. Vinext is not the stable Next.js production runtime requested in the original specification.

`app/` contains routes and APIs; `components/` contains reusable storefront/account/admin components; `lib/` contains authentication, authorization, commerce, data access and validation; `db/` and `drizzle/` hold the schema and migration; `tests/` holds unit, API and browser tests; `public/` holds original branding, manifest and offline assets.

## Local setup

Use Node.js 22.13 or newer (Node 24 recommended) and Git. Install the locked dependencies:

```sh
npm ci
cp .env.example .env.local
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_slimy_madame_web.sql
npm run dev
```

On Windows, use `Copy-Item .env.example .env.local` instead of `cp` if needed. The preview uses `http://localhost:5173`. Database migrations must run before catalog/API requests. Local Wrangler state is ignored by Git. Guest browsing requires no external accounts. For authentication development, use an HTTPS origin and set `APP_URL` to it; plain HTTP localhost intentionally leaves authentication disabled.

The Sites execution helpers choose a portable runtime automatically. When reopening with the Sites plugin, run its `scripts/configure-execution-profile.mjs` before building. The app relies on the `DB` Worker binding; it does not run as a plain Node server or deploy to Vercel without adaptation.

## Environment variables

Copy only placeholders from `.env.example`. Never commit real values.

| Variable                  | Purpose                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `APP_URL`                 | Exact HTTPS application origin, no trailing slash                |
| `SUPABASE_URL`            | Supabase project URL                                             |
| `SUPABASE_ANON_KEY`       | Supabase publishable/anonymous key; no service-role key required |
| `RAZORPAY_KEY_ID`         | Gateway key ID                                                   |
| `RAZORPAY_KEY_SECRET`     | Server-only gateway secret                                       |
| `RAZORPAY_WEBHOOK_SECRET` | Separate webhook signing secret                                  |
| `COMMERCE_ENABLED`        | Default `false`; do not enable before launch checks              |

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the template are setup reminders: configure them in Supabase's Google provider settings, not in frontend code. Hosted runtime values are managed through Sites environment settings. A secret committed to a repository must be rotated, not merely deleted.

## Authentication and Google setup

1. Create a Supabase project; enable email/password authentication and email confirmation. Configure a production SMTP provider, password policy, auth rate limits and session lifetime.
2. Set the Supabase site URL to `APP_URL`. Allow the exact `APP_URL/auth/callback` redirect. Avoid production wildcard redirects.
3. Create a Google OAuth web client. Set Google's authorized callback to the URL supplied by Supabase. Enable Google in Supabase with that client ID and secret.
4. Configure the application Supabase URL/key and HTTPS origin. Test registration, confirmation, reset, Google consent, logout and expiry with real test accounts.

Google passwords never enter INShop. Supabase stores password hashes and provider identities. Public registration always creates a customer; application roles come from the protected D1 user record. Phone OTP and device-management UI are not implemented in this release.

## Administrator provisioning

There is no public administrator registration or seeded administrator password.

1. Register and verify the intended operator through the configured auth provider.
2. Sign in once so the D1 customer record is created. Enroll and verify an authenticator at `/account/security`.
3. A trusted database operator generates a narrowly scoped promotion migration using `node scripts/prepare-admin.mjs SUPABASE_USER_UUID verified-email@example.com`. Inspect the generated SQL in `work/admin-promotion.sql`, then apply it through the trusted database console. The migration only updates an existing active user with both the matching UUID and email; it does not create a password.
4. Sign in at `/admin/login` and complete the authenticator challenge. Admin APIs require both the database admin role and Supabase `aal2`.

Recovery and deprovisioning are trusted operator procedures. Remove the database role and revoke provider sessions. Verify the current provider settings and access controls before inviting staff.

## Payments and inventory

Create a Razorpay merchant account and start with test credentials. Configure `APP_URL/api/payments/webhook` for `payment.captured`, using the same separate webhook secret configured on the server. Verify signatures against the exact request body. The handler compares gateway order ID, INR currency, captured status and amount with the stored order and deduplicates event IDs.

Orders use server-owned prices in integer paise; a D1 atomic batch and nonnegative-stock constraint protect inventory. Sample catalog rows have `demo: true` and cannot be ordered. Replace samples with real authorized inventory before enabling commerce. COD also requires the store's `codEnabled` setting.

**Do not enable live payments yet:** automated reservation expiry, abandoned-payment reconciliation, refund execution/retries, shipping integration, configurable GST calculations and the complete payment failure lifecycle remain unfinished. Manually reconcile pending orders during development. A late capture for a cancelled order returns a reconciliation error instead of silently marking it paid. Test duplicate/concurrent webhook deliveries and actual payment scenarios in a merchant sandbox before launch.

## Schema, migrations and seed data

The initial migration includes users, products, stock logs, customer data, orders, payments-related records, returns/refunds, moderation, support, content, settings, audit events, seller-ready records and price history. Run `npm run db:generate` after schema edits and review generated SQL before applying it. Back up production data before migrations.

The catalog initializes once on the first database-backed request, using 81 sample products, 14 categories and 59 brands from `lib/catalog.json`, plus a coupon, banner and safe store settings. The seed is idempotent. Run `npm run seed:prepare` to regenerate sample data from DummyJSON (network required). Duplicate product titles have unique URLs. No production credentials, real customer accounts or fabricated purchased orders are seeded. Demonstration charts are isolated from real operational reports.

Product imagery and descriptions are from [DummyJSON sample data](https://dummyjson.com/docs/products), for demonstration. Replace these with your own licensed catalog before commercial use. Original INShop SVG logos and PNG app icons are in `public/brand`.

## Verification

```sh
npm run typecheck
npm run test:unit
# Keep the local application running for these:
npm run test:api
npm run test:e2e
npm run build
npm audit
```

Install a Playwright browser once with `npx playwright install chromium`. `TEST_BASE_URL` can target an isolated test instance for API tests. Do not run tests that assume demo settings against a real merchant store. Tests cover price calculations, validation, policy helpers, SQL stock rollback, event uniqueness, unauthenticated API protection, origin checks and guest UI flows. They do not substitute for configured-provider end-to-end authentication, cross-account access and real payment tests.

## Deployment

The existing Site is recorded in `.openai/hosting.json`. Reuse it rather than registering a second Site. Build with the Sites plugin helper, commit and push the exact source using short-lived source credentials, package the build with the plugin's packaging helper, save that revision and deploy through Sites. The deployment package includes generated migrations. Confirm migration/deployment status before sharing the returned URL. If local execution is blocked, Sites supports a remote-build fallback after source push.

New Sites are private by default. Publishing does not make the store open to all visitors automatically. Use the site's access settings when you are ready to share it. Configure HTTPS environment values after the actual hosting origin is known. Keep commerce disabled while reviewing the preview.

## Remaining launch work

This code does **not** yet fulfill every item in the original specification. Major remaining work includes full variant-specific inventory, product/media uploads, SMS OTP, device/session management, courier APIs, seller workflows/payouts, payment reconciliation and automated refunds, full homepage section scheduling, advanced search/recommendations, review media/helpfulness/reporting, multi-currency/GST invoices, notification delivery, memberships, bulk import, detailed conversion analytics and production observability/backups. Some admin areas expose read-only records or generic content editors rather than full workflows.

Review every configured auth/payment flow, authenticated cross-user isolation, mobile/keyboard accessibility, performance under realistic load and rollback procedures. Replace legal review placeholders with counsel-approved policies. Obtain a security review and finish the workflows above before describing the system as a production marketplace.
