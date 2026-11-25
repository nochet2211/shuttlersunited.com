# shuttlersunited.com

Badminton club site for Shuttlers United — player profiles, tournament records,
court booking, WhatsApp OTP login, and monthly dues via Razorpay.

**Stack:** Astro 7 (SSR on Cloudflare Workers) · Tailwind v4 · Cloudflare D1 + R2 · Razorpay · Gupshup (WhatsApp)

---

## Running it locally

```bash
npm install
cp .env.example .env          # then fill in the secret (see below)

npm run db:migrate            # once — creates the tables in a local D1
npm run db:import             # once — loads the club's data from pb_data/ (see below)
npm run dev                   # Astro on :4321, with local D1 and R2
```

Local D1 and R2 live in `.wrangler/state/`. To look at the data:
`npx wrangler d1 execute shuttlersunited --local --command "SELECT name FROM members"`.

### Secrets

Generate the one required secret with `openssl rand -base64 48`:

| Variable | Notes |
|---|---|
| `AUTH_COOKIE_SECRET` | Signs session cookies. Rotating it logs everyone out. |

Gupshup and Razorpay variables are optional. Leave them blank and:

- **OTPs print to the server log** instead of sending on WhatsApp. In local dev
  they also appear on the login page, so the whole auth flow is testable with no
  accounts set up. In production they are only in the Worker's logs
  (`npx wrangler tail`) — showing them on the page would let anyone sign in as
  any number.
- **Online payments are disabled**, but admins can still record cash and UPI
  payments by hand.

### First admin

Everyone signs up as a `member`. Sign up, then promote yourself once (drop
`--remote` for the local database):

```bash
npx wrangler d1 execute shuttlersunited --remote \
  --command "UPDATE members SET role = 'admin' WHERE phone = '+919876543210'"
```

After that you can grant admin to others from `/admin/members`.

---

## How the pieces fit

### Auth — WhatsApp OTP, no passwords

Members type a mobile number and a 6-digit code. There is no password anywhere
in the UI.

The session is a signed cookie: the member's id and an expiry, HMAC-signed with
`AUTH_COOKIE_SECRET` and held `httpOnly`. Every request loads the member from
the database, so deactivating a member takes effect immediately rather than
whenever their cookie happens to expire.

OTP codes are stored only as salted SHA-256 hashes, expire after 10 minutes,
allow 5 attempts, and are rate-limited to 5 per hour with a 60-second resend
cooldown.

### Authorization — in the server, nowhere else

The browser never talks to the database. D1 is reachable only through the
Worker's binding, so there are no per-row API rules to lean on: **Astro actions**
(`src/actions/`) and the read helpers (`src/lib/queries.ts`) carry their own
ownership and visibility checks.

The rule that matters most: **only server code writes to `payments`.** There is
no action that lets a member touch a ledger row except through the Razorpay
flow — a member marking their own dues paid is the threat model. Members can
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

- [ ] **Legal pages.** `/terms`, `/privacy`, `/refunds` and `/contact` name
      the club, Dimapur and admin@shuttlersunited.com. Razorpay checks these
      during merchant onboarding and may ask for the registered entity name,
      a postal address and a phone number, which they do not yet carry.
- [ ] **Gupshup**: register a WhatsApp Business sender, get an OTP template
      approved, and set the four `GUPSHUP_*` variables.
- [ ] **Razorpay**: complete KYC, then set `RAZORPAY_KEY_ID` / `_KEY_SECRET`.
- [ ] **Razorpay webhook**: point it at
      `https://shuttlersunited.com/api/webhooks/razorpay`, subscribe to
      `payment.captured`, `payment.failed` and `refund.processed`, and set
      `RAZORPAY_WEBHOOK_SECRET` to match.
- [ ] D1 keeps 30 days of point-in-time recovery (`wrangler d1 time-travel`).
      For anything older, export on a schedule:
      `npx wrangler d1 export shuttlersunited --remote --output backup.sql`.

## Deploying

One Worker, **`shuttlersunited`**, on the Workers **free plan**:

- **D1** (`DB`) holds the data. Schema in `migrations/`.
- **R2** (`FILES`, bucket `shuttlersunited-files`) holds uploads — avatars,
  post covers and attachments — served same-origin by `src/pages/files/[...path].ts`.
- **Images** (`IMAGES`) makes the thumbnails (`?thumb=200x200`), cached at the
  edge after the first request. The free tier covers 5,000 unique
  transformations a month; past that, the original is served instead.

Free-plan limits worth knowing: 10 ms of CPU per request (pages measure
6–20 ms; short bursts over are tolerated, sustained ones fail), 100,000 requests
a day, and D1's 5 GB / 5 million reads a day.

One-time setup:

```bash
npx wrangler login
npm run db:migrate:remote           # create the tables
npm run db:import:remote            # load pb_data/ (the club's data) into D1 and R2
npx wrangler secret put AUTH_COOKIE_SECRET
# …and the GUPSHUP_* / RAZORPAY_* ones once those accounts are live
```

Then:

```bash
npm run preview               # build, then run the real Worker locally (workerd) on :8787
npm run deploy                # build and deploy
```

A schema change is a new file in `migrations/`, applied with
`npm run db:migrate` and `npm run db:migrate:remote` before deploying.

`scripts/import-pocketbase.mjs` is the one-time move off PocketBase. It empties
each table before loading it, so re-running it against production **replaces
live data** with whatever is in `pb_data/`.

For CI, connect the repo in the dashboard (Workers → Create → Import a
repository) with build command `npm run build` and deploy command
`npx wrangler deploy`.

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
Drafts are invisible everywhere except `/admin/news` — every public query
filters on `status = 'published'`.

## Layout

```
migrations/                   D1 schema
scripts/import-pocketbase.mjs  One-time import of pb_data/ into D1 and R2
src/
  actions/       auth · profile · bookings · payments · admin · news
  components/    ui/ primitives · site/ chrome · news/ feed · tournament/ draw
  layouts/       Layout (public) · AppLayout (dashboard + admin)
  lib/           db · files · auth · otp · razorpay · queries · news · format · types
  middleware.ts  Session resolution and route guards
  pages/
    index.astro  The newsroom — the home page IS the news feed
    api/webhooks/razorpay.ts
    admin/  dashboard/  players/  tournaments/  join/  news/
  styles/global.css   DESIGN.md tokens as Tailwind v4 theme variables
```

Design tokens come from `DESIGN.md` — a near-black ink on a near-white canvas,
1px hairlines instead of shadows, and one mesh gradient reserved for the hero.
