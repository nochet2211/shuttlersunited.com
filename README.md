# shuttlersunited.com

Badminton club site for Shuttlers United — player profiles, tournament records,
court booking, WhatsApp OTP login, and monthly dues via Razorpay.

**Stack:** Astro 7 (SSR, Node adapter) · Tailwind v4 · PocketBase · Razorpay · Gupshup (WhatsApp)

---

## Running it locally

```bash
npm install
cp .env.example .env          # then fill in the secrets (see below)

npm run pb                    # terminal 1 — PocketBase on :8090
npm run pb:setup -- --seed    # once — creates collections, rules and demo data
npm run dev                   # terminal 2 — Astro on :4321
```

The PocketBase admin UI is at <http://127.0.0.1:8090/_/>.

### Secrets

Generate the two required ones with `openssl rand -base64 48`:

| Variable | Notes |
|---|---|
| `AUTH_COOKIE_SECRET` | Signs session cookies. Rotating it logs everyone out. |
| `MEMBER_PASSWORD_SECRET` | Derives each member's PocketBase password. **Long-lived** — rotating it locks every member out until passwords are re-derived. |

Gupshup and Razorpay variables are optional. Leave them blank and:

- **OTPs print to the server log** instead of sending on WhatsApp, and also appear
  on the login page, so the whole auth flow is testable with no accounts set up.
- **Online payments are disabled**, but admins can still record cash and UPI
  payments by hand.

### First admin

Everyone signs up as a `member`. Promote yourself once, from the PocketBase
admin UI (`members` → your record → `role: admin`), and after that you can
grant admin to others from `/admin/members`.

---

## How the pieces fit

### Auth — WhatsApp OTP, no passwords

Members type a mobile number and a 6-digit code. There is no password anywhere
in the UI.

Under the hood PocketBase still needs a password to issue a refreshable auth
token and to make its per-record API rules meaningful. So each member's password
is **derived** — `HMAC(MEMBER_PASSWORD_SECRET, memberId)` — never stored in
plaintext, never shown, recomputed on demand. PocketBase only holds its bcrypt
hash. See `src/lib/member-password.ts`.

The session itself is the PocketBase auth token, HMAC-signed and held in an
`httpOnly` cookie. Every request re-validates it against PocketBase, so
deactivating a member takes effect immediately rather than whenever their token
happens to expire.

OTP codes are stored only as salted SHA-256 hashes, expire after 10 minutes,
allow 5 attempts, and are rate-limited to 5 per hour with a 60-second resend
cooldown.

### Authorization — two layers

1. **PocketBase API rules** (`scripts/setup-pocketbase.mjs`) are the backstop for
   anything hitting PocketBase directly.
2. **Astro actions** (`src/actions/`) do the real work using the superuser
   client, and therefore carry their own ownership checks.

The rule that matters most: **`payments` has `createRule`, `updateRule` and
`deleteRule` all set to `null`.** Nothing outside the server can write to the
ledger — a member marking their own dues paid is the threat model. Members can
only *read* their own rows.

Each action's Zod `input` schema doubles as a field allow-list. `profile.update`
has no `role`, `status`, `phone` or `slug` field, so no amount of extra form data
can escalate a member's own privileges.

### Payments — reconcilable by design

1. `payments.createOrder` writes a `created` ledger row **first**, then creates a
   Razorpay order whose `receipt` is that row's id. A payment can never arrive
   with nowhere to record it.
2. The order's `notes` carry `payment_id`, `member_id`, `member_name`,
   `member_phone`, `period` and `plan`. These become columns in the Razorpay
   dashboard export, so a settlement report reconciles against `/admin/payments`
   line by line.
3. The browser's success callback (`payments.confirm`) verifies the handler
   signature and updates the row immediately — but it is only a convenience.
4. **`/api/webhooks/razorpay` is the source of truth.** It fires even when the
   member closes the tab mid-payment, verifies the HMAC against the raw body,
   is idempotent on replay, and flags amount mismatches rather than trusting
   either side.

Offline (cash/UPI) payments recorded by admins deliberately leave
`razorpay_order_id` empty, so they can never be mistaken for gateway
settlements during reconciliation.

Amounts are **always in paise**. Rupees exist only for display.

---

## Before going live

- [ ] **Fill in the legal pages.** `/terms`, `/privacy`, `/refunds` and
      `/contact` are written but every `[bracketed]` placeholder needs the club's
      real entity name, address and contact. Razorpay checks these during
      merchant onboarding and will reject an account without them.
- [ ] **Gupshup**: register a WhatsApp Business sender, get an OTP template
      approved, and set the four `GUPSHUP_*` variables.
- [ ] **Razorpay**: complete KYC, then set `RAZORPAY_KEY_ID` / `_KEY_SECRET`.
- [ ] **Razorpay webhook**: point it at
      `https://shuttlersunited.com/api/webhooks/razorpay`, subscribe to
      `payment.captured`, `payment.failed` and `refund.processed`, and set
      `RAZORPAY_WEBHOOK_SECRET` to match.
- [ ] Set strong `POCKETBASE_ADMIN_PASSWORD` and fresh secrets in production.
- [ ] Back up `pb_data/` on a schedule — it is the entire database.

## Deploying

PocketBase needs persistent disk, so both processes want to live on one small
VPS (Hetzner/DigitalOcean, ~₹500/month):

```bash
npm run build
npm start                     # Astro on :4321
./pocketbase serve --http=127.0.0.1:8090
```

Put Caddy or nginx in front for TLS, proxying `/` to Astro. Keep PocketBase
bound to `127.0.0.1` — the app talks to it locally and it needs no public port.
Run both under systemd so they restart on boot.

---

## The newsroom

The home page is a news feed, not a marketing hero: an ongoing or upcoming
fixture strip at the top, a lead story, then the feed with a rail of fixtures,
recent results and club numbers. `/news` redirects to `/` — they are the same
page — and `/news/<slug>` is an individual story.

Stories live in the `posts` collection and are written from `/admin/news`.
Categories are `club`, `tournament`, `result`, `governing-body`, `facility` and
`notice`; `?category=` on the home page filters the feed.

`governing-body` is the one that carries circulars from BAI, the state
association and the sports bodies. Those are somebody else's notice, so fill in
**Source** and **Source link** — the story page then credits and links the
original instead of presenting it as club copy.

Bodies are plain text, deliberately: a blank line starts a paragraph, `## ` is a
subheading and `- ` a bullet. No markdown dependency and no raw HTML, so nothing
an editor types can inject markup into the page (`renderPostBody` in
`src/lib/news.ts`).

Only one story can be pinned as the top story; pinning one clears the last.
Drafts are invisible everywhere except `/admin/news` — the collection's read
rule is `status = "published"`, and the query helpers repeat that filter because
they read through the superuser client.

## Layout

```
scripts/setup-pocketbase.mjs   Schema, API rules and seed data (idempotent)
src/
  actions/       auth · profile · bookings · payments · admin · news
  components/    ui/ primitives · site/ chrome · news/ feed · tournament/ draw
  layouts/       Layout (public) · AppLayout (dashboard + admin)
  lib/           pocketbase · auth · otp · razorpay · queries · news · format · types
  middleware.ts  Session resolution and route guards
  pages/
    index.astro  The newsroom — the home page IS the news feed
    api/webhooks/razorpay.ts
    admin/  dashboard/  players/  tournaments/  join/  news/
  styles/global.css   DESIGN.md tokens as Tailwind v4 theme variables
```

Design tokens come from `DESIGN.md` — a near-black ink on a near-white canvas,
1px hairlines instead of shadows, and one mesh gradient reserved for the hero.
