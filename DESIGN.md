---
version: alpha
name: Stripe-Inspired-design-analysis
description: "A rich, premium system inspired by Stripe's design language — deep navy ink (#0a2540), electric indigo primary (#533afd), warm white and cream canvases (#ffffff, #f6f9fc), atmospheric gradient-mesh hero sections, and secondary chromatic accents (ruby #ea2261, magenta #f96bee). The system pairs Sohne-style sans-serif (Inter substitute) at thin (300) weights with negative letter-spacing for editorial-density display headlines. Buttons are pill-shaped on primary CTAs; cards live on near-white surfaces with subtle depth through soft shadows. The whole canvas reads as confident, modern, and premium."

colors:
  primary: "#533afd"
  on-primary: "#ffffff"
  primary-deep: "#4434d4"
  primary-soft: "#665efd"
  primary-bg-subdued: "#ede9fe"
  brand-dark-900: "#1c1e54"
  ink: "#0a2540"
  ink-secondary: "#425466"
  ink-mute: "#64748d"
  ink-faint: "#6b7c93"
  canvas: "#ffffff"
  canvas-soft: "#f6f9fc"
  canvas-cream: "#f5e9d4"
  surface-lifted: "#edf2f7"
  hairline: "#c4cdd5"
  hairline-soft: "#e3e8ee"
  inverse-canvas: "#0a0e1a"
  inverse-surface-1: "#111827"
  inverse-surface-2: "#1a2236"
  inverse-ink: "#f1f5f9"
  ruby: "#ea2261"
  magenta: "#f96bee"
  lemon: "#9b6829"
  semantic-success: "#0e7c3a"
  semantic-warning: "#b45309"
  semantic-error: "#dc2626"
  semantic-overlay: "#000000"

typography:
  display-xxl:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 56px
    fontWeight: 300
    lineHeight: 1.03
    letterSpacing: -1.4px
  display-xl:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 48px
    fontWeight: 300
    lineHeight: 1.15
    letterSpacing: -0.96px
  display-lg:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 32px
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: -0.64px
  display-md:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 26px
    fontWeight: 300
    lineHeight: 1.12
    letterSpacing: -0.26px
  heading-lg:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 22px
    fontWeight: 300
    lineHeight: 1.1
    letterSpacing: -0.22px
  heading-md:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 20px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: -0.2px
  heading-sm:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: 0
  body-lg:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: 0
  body-md:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 15px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: 0
  body-tabular:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: -0.42px
    fontFeature: tnum
  button-md:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: 0
  button-sm:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.0
    letterSpacing: 0
  caption:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.39px
    fontFeature: tnum
  micro:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 11px
    fontWeight: 300
    lineHeight: 1.4
    letterSpacing: 0
  eyebrow:
    fontFamily: "sohne-var, Inter, 'SF Pro Display', system-ui, -apple-system, sans-serif"
    fontSize: 10px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: 0.1px
    textTransform: uppercase

rounded:
  xs: 4px
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  huge: 64px

components:
  button-primary-pill:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  button-primary-pill-pressed:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  button-on-dark:
    backgroundColor: "{colors.brand-dark-900}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 8px 12px
  card-feature-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-pricing:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-pricing-featured:
    backgroundColor: "{colors.brand-dark-900}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  card-cream-band:
    backgroundColor: "{colors.canvas-cream}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: 32px
  pill-tag-soft:
    backgroundColor: "{colors.primary-bg-subdued}"
    textColor: "{colors.primary-deep}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: 4px 8px
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.xs}"
    padding: 16px 24px
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-mute}"
    typography: "{typography.caption}"
    rounded: "{rounded.xs}"
    padding: 64px 24px
---

## Overview

Stripe's design language is defined by richness: a gradient mesh of pastel cream, sherbet orange, lavender, electric indigo, and ruby pink occupies the hero canvas. Below it, the marketing pages run on warm white (`{colors.canvas}` #ffffff) and cream-tinted soft surfaces (`{colors.canvas-soft}` #f6f9fc), with deep navy ink (`{colors.ink}` #0a2540) for high-contrast, readable type.

The single strongest chromatic accent is **electric indigo** (`{colors.primary}` #533afd) — used on the primary CTA pill, focus rings, and link emphasis. A deeper press state (`{colors.primary-deep}` #4434d4) and a softer hover variant (`{colors.primary-soft}` #665efd) extend the same hue. Secondary chromatic energy comes from ruby (#ea2261) and magenta (#f96bee) in the gradient mesh and occasional highlight treatments — never as UI chrome.

Display type runs in Sohne (Inter substitute) at weight 300 with negative letter-spacing scaling from -1.4px at 56px down to 0 at body. The lightweight display type creates editorial density; body text at 300 reads as refined and premium.

Cards sit on white surfaces with subtle box-shadows rather than hairline borders alone. The depth model uses **soft shadows** for cards and panels, plus **surface lifts** for hover and active states — a richer visual vocabulary than the flat-ladder-only approach.

**Key Characteristics:**
- **Warm-white canvas** — `{colors.canvas}` (#ffffff) with `{colors.canvas-soft}` (#f6f9fc) for lifted sections.
- **Electric indigo accent** (`{colors.primary}` #533afd) — pill-shaped CTAs, focus, links. Ruby and magenta in gradients only.
- **Deep navy ink** (`{colors.ink}` #0a2540) — reads as richer than pure black or gray.
- Surface ladder + soft shadows carry hierarchy, not hairline borders alone.
- Display tracking pulls negative (-1.4px at 56px); body holds at 0.
- Primary CTAs use `{rounded.pill}` 9999px; secondary buttons use `{rounded.pill}` also. The brand vocabulary is pills.
- Gradient mesh on hero sections: cream, orange, lavender, indigo, ruby.

## Colors

### Brand & Accent
- **Electric Indigo** ({colors.primary}): The signature accent — primary CTA pill, brand mark, link emphasis.
- **Indigo Deep** ({colors.primary-deep}): Pressed state of the primary CTA.
- **Indigo Soft** ({colors.primary-soft}): Hovered/focus variant.
- **Subdued Indigo** ({colors.primary-bg-subdued}): Soft badge backgrounds.
- **Brand Navy** ({colors.brand-dark-900}): Deep dark navy — featured pricing card, dark-on-dark CTA.

### Gradient Mesh (Decorative)
- **Ruby** ({colors.ruby}): #ea2261 — gradient mesh accent, never on UI chrome.
- **Magenta** ({colors.magenta}): #f96bee — gradient mesh accent.
- **Lemon** ({colors.lemon}): #9b6829 — warm golden tone in gradient mesh.

### Surface
- **Canvas** ({colors.canvas}): Default page background — clean warm white #ffffff.
- **Canvas Soft** ({colors.canvas-soft}): One step above canvas — feature cards, pricing panels.
- **Canvas Cream** ({colors.canvas-cream}): Warm cream band for section variety.
- **Surface Lifted** ({colors.surface-lifted}): Active/hover lift — slightly cooler.
- **Hairline Soft** ({colors.hairline-soft}): Card borders and section dividers.
- **Hairline** ({colors.hairline}): Input borders and tab outlines.
- **Inverse Canvas** ({colors.inverse-canvas}): Deep navy — dashboard dark mode base.
- **Inverse Surface 1** ({colors.inverse-surface-1}): Card surface in dark mode.
- **Inverse Surface 2** ({colors.inverse-surface-2}): Lifted card in dark mode.

### Text
- **Ink** ({colors.ink}): Headlines and emphasized body — deep navy #0a2540.
- **Ink Secondary** ({colors.ink-secondary}): Body text at #425466.
- **Ink Mute** ({colors.ink-mute}): Tertiary text at #64748d.
- **Ink Faint** ({colors.ink-faint}): De-emphasised labels at #6b7c93.

### Semantic
- **Success Green** ({colors.semantic-success}): Status pills, form validation.
- **Warning Amber** ({colors.semantic-warning}): Caution indicators.
- **Error Red** ({colors.semantic-error}): Errors and destructive actions.
- **Overlay** ({colors.semantic-overlay}): Black scrim for modals.

## Typography

### Font Family

- **Sohne / Inter** — Stripe's proprietary Sohne is approximated by Inter at weights 300/400/500. Carries all type roles from display to body.
- **Mono** — JetBrains Mono or Geist Mono at weight 400 for code, identifiers, and tabular data.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xxl}` | 56px | 300 | 1.03 | -1.4px | Hero headline |
| `{typography.display-xl}` | 48px | 300 | 1.15 | -0.96px | Section opener headlines |
| `{typography.display-lg}` | 32px | 300 | 1.1 | -0.64px | Sub-section headlines |
| `{typography.display-md}` | 26px | 300 | 1.12 | -0.26px | Card section titles |
| `{typography.heading-lg}` | 22px | 300 | 1.1 | -0.22px | Pricing tier titles |
| `{typography.heading-md}` | 20px | 300 | 1.4 | -0.2px | Feature card titles |
| `{typography.heading-sm}` | 18px | 300 | 1.4 | 0 | Sub-headings |
| `{typography.body-lg}` | 16px | 300 | 1.4 | 0 | Lead body paragraphs |
| `{typography.body-md}` | 15px | 300 | 1.4 | 0 | Default body |
| `{typography.body-tabular}` | 14px | 300 | 1.4 | -0.42px | Tabular data |
| `{typography.button-md}` | 16px | 400 | 1.0 | 0 | Primary button labels |
| `{typography.button-sm}` | 14px | 400 | 1.0 | 0 | Small button labels |
| `{typography.caption}` | 13px | 400 | 1.4 | -0.39px | Captions, meta, status |
| `{typography.micro}` | 11px | 300 | 1.4 | 0 | Micro labels |
| `{typography.eyebrow}` | 10px | 400 | 1.15 | 0.1px | Uppercase eyebrow taxonomy |

### Principles

- **Weight 300 dominates display and body.** Only buttons (400) and captions (400) step up.
- **Negative tracking on display** (-1.4px at 56px ≈ 2.5% of size).
- **Eyebrow is uppercase** with slight positive tracking — Stripe uses micro-caps as taxonomy markers.
- **Mono only in code, identifiers, and tabular data contexts.**

### Note on Font Substitutes

Stripe's Sohne is not publicly available. **Inter** at weight 300/400/500 is the closest free substitute; its optical sizing and x-height match well. For mono, **JetBrains Mono** or **Geist Mono** closely approximates the feel.

## Layout

### Spacing System

- **Tokens**: `{spacing.xxs}` 2px · `{spacing.xs}` 4px · `{spacing.sm}` 8px · `{spacing.md}` 12px · `{spacing.lg}` 16px · `{spacing.xl}` 24px · `{spacing.xxl}` 32px · `{spacing.huge}` 64px.
- Card interior padding: `{spacing.xxl}` 32px on feature/pricing cards.
- Button padding: 8px vertical · 16px horizontal — Stripe's pill button spec.
- Form input padding: 8px vertical · 12px horizontal.

### Grid & Container

- Max content width sits around 1280px.
- Card grids are 3-up at desktop, 2-up at tablet, 1-up at mobile.
- Content panels span full content width.

### Whitespace Philosophy

Stripe uses generous whitespace on warm-white canvases. Sections separate by canvas-tone shifts (white → cream → soft blue-gray) and by horizontal card grids. The gradient mesh hero is the visual anchor; below it, the rhythm is clean, airy, and punctuated by card shadows.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow | Default for body type, hero text, footer |
| 1 (card) | Subtle box-shadow on white | Feature cards, pricing cards |
| 2 (lifted) | `{colors.canvas-soft}` background + stronger shadow | Featured pricing, hovered cards |
| 3 (featured) | `{colors.brand-dark-900}` background (navy) | Featured pricing card, dark CTA |
| 4 (focus ring) | 2px `{colors.primary-soft}` outline | Focused input, focused button |

Stripe uses soft box-shadows on cards — richer visual depth than hairline-only systems.

### Decorative Depth

- **Gradient mesh** on hero sections: atmospheric, multi-color, occupies the top third.
- **Cream bands** for section variety: `{colors.canvas-cream}` (#f5e9d4).
- **Pill-shaped CTAs** with shadow on hover for micro-depth.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 4px | Small chips, inline tags |
| `{rounded.sm}` | 6px | Form inputs |
| `{rounded.md}` | 8px | Secondary buttons, cards in some contexts |
| `{rounded.lg}` | 12px | Feature cards, pricing cards |
| `{rounded.xl}` | 16px | Full-width content panels |
| `{rounded.pill}` | 9999px | Primary CTAs, tab toggles, status pills, avatars |

## Components

### Buttons

**`button-primary-pill`** — Electric indigo pill CTA. The default primary CTA.
- Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button-md}`, pill radius, padding 8px 16px.
- Pressed state shifts to `{colors.primary-deep}`.

**`button-secondary`** — White pill with indigo text.
- Background `{colors.canvas}`, text `{colors.primary}`, type `{typography.button-md}`, pill radius, padding 8px 16px. 1px `{colors.hairline}` border.

**`button-on-dark`** — Dark navy pill for dark sections.
- Background `{colors.brand-dark-900}`, text `{colors.on-primary}`.

### Cards & Containers

**`card-feature-light`** — Feature highlight on white canvas.
- Background `{colors.canvas}`, subtle shadow, rounded `{rounded.lg}`, padding 32px.

**`card-pricing`** — Standard pricing tier.
- Background `{colors.canvas}`, rounded `{rounded.lg}`, padding 32px.

**`card-pricing-featured`** — Featured tier — navy fill.
- Background `{colors.brand-dark-900}`, text `{colors.on-primary}`.

**`card-cream-band`** — Warm cream section.
- Background `{colors.canvas-cream}`.

### Inputs & Forms

**`text-input`** — Form fields with soft radius and hairline borders.
- Background `{colors.canvas}`, text `{colors.ink}`, rounded `{rounded.sm}`, padding 8px 12px.
- Focused state: 2px `{colors.primary-soft}` outline.

### Navigation

**`nav-bar`** — Clean white bar with deep navy text.
- Background `{colors.canvas}`, text `{colors.ink}`.

### Footer

**`footer`** — Light footer with muted text.
- Background `{colors.canvas}`, text `{colors.ink-mute}`.

## Do's and Don'ts

### Do

- Use `{colors.primary}` electric indigo for: primary CTA pill, focus ring, link emphasis, brand mark.
- Use soft box-shadows on cards for depth — richer than hairline-only.
- Use the gradient mesh on hero sections for visual richness.
- Pair display weight 300 with button weight 400.
- Apply negative letter-spacing on display.
- Use `{rounded.pill}` for primary CTAs.
- Vary sections with canvas-tone shifts: white → cream → soft blue-gray.

### Don't

- Don't use indigo as a section background fill.
- Don't put ruby/magenta on UI chrome — gradient mesh only.
- Don't skip the soft shadow on cards (they need depth).
- Don't use weight 700+ for display type.
- Don't use `#000000` pure black for text — use the deep navy ink.

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Desktop-XL | 1440px | Default desktop layout |
| Desktop | 1280px | Card grid 3-up maintained |
| Tablet | 1024px | Card grid 3-up → 2-up |
| Mobile-Lg | 768px | Pricing comparison becomes accordion; nav hamburger |
| Mobile | 480px | Single-column; display-xxl scales 56px → ~32px |

### Touch Targets

- CTAs hold ≥40px tap height across viewports.
- Tab pills hold ≥36px tap height; touch viewports grow to ≥44px.
- Form inputs hold ≥44px tap target on touch.

## Iteration Guide

1. Focus on ONE component at a time and reference it by its `components:` token name.
2. When introducing a section, decide which canvas tone it lives on (white / cream / soft).
3. Default body to `{typography.body-md}` at weight 300.
4. Add new variants as separate component entries.
5. Treat indigo as the primary accent: CTA, focus, link emphasis, brand mark.

## Known Gaps

- Stripe's Sohne typeface is proprietary; Inter at 300-500 is the recommended substitute.
- The gradient mesh is procedural — implementation requires a canvas or CSS gradient recreation.
- Stripe's dashboard surfaces use a separate dark-app shell specification not fully captured here.

---

# Shuttlers United — Adaptation

Everything above is the Stripe-inspired design system. This section is the delta:
what this project changes, adds, or deliberately leaves behind, and why. Where
the two disagree, **this section wins**.

The brief: *rich, premium, and inviting — not monotone or minimalistic.* Stripe
already delivers most of that — electric indigo, warm canvases, gradient energy,
editorial-weight typography, card shadows. The deviations below fill the gaps a
sports community needs.

## Token mapping

DESIGN.md uses Stripe-inspired names. The implementation in `src/styles/global.css`
uses `--su-*` names exposed to Tailwind through `@theme inline`. The map:

| Stripe token | Project token | Tailwind utility |
|---|---|---|
| `{colors.canvas}` | `--su-canvas` | `bg-canvas` |
| `{colors.canvas-soft}` | `--su-soft` | `bg-soft` |
| `{colors.surface-lifted}` | `--su-lift` | `bg-lift` |
| `{colors.canvas}` (cards) | `--su-elevated` | `bg-elevated` |
| `{colors.hairline-soft}` | `--su-hairline-soft` | `border-hairline-soft` |
| `{colors.hairline}` | `--su-hairline` | `border-hairline` |
| `{colors.ink}` | `--su-ink` | `text-ink` |
| `{colors.ink-secondary}` | `--su-body` | `text-body` |
| `{colors.ink-mute}` | `--su-mute` | `text-mute` |
| `{colors.ink-faint}` | `--su-faint` | `text-faint` |
| `{colors.primary}` | `--su-primary` | `bg-primary` |
| `{colors.primary-deep}` | `--su-link` (dark) | `text-link` |
| `{colors.inverse-canvas}` / `{colors.inverse-ink}` | `--su-ink-button` / `--su-on-ink` | `bg-ink` / `text-on-ink` |

## Deviation 1 — a light theme as the default

Stripe's marketing is light-first. This site follows that: **light is the default**.
The toggle writes `su-theme` to `localStorage` and an inline script in
`Layout.astro` applies the `.dark` class before first paint. The dark palette
uses deep navy tones (#0a0e1a, #111827, #1a2236) — warmer and more inviting
than the previous near-black Linear surfaces.

## Deviation 2 — the display ladder sits at 500-600, not 300

Stripe runs display type at weight 300. That reads as premium at the 56px hero
size it was designed for, and as anaemic everywhere else — and this system
consumes its display roles mostly at 22-32px: card titles, rail headings, stat
values. At those sizes 300 is simply thin, and thin is the look this project is
explicitly trying to leave behind.

The ladder now runs `hero-display` and `display-lg` at 500, `heading-lg` and
`heading-md` at 600, and the two subtitle roles at 400. Negative tracking is
unchanged — that is what carries the editorial density, and it survives the
weight change intact. Body stays 400; buttons and captions stay 400-500.

## Deviation 3 — pill radius on primary CTAs

Stripe uses pill-shaped CTAs (`{rounded.pill}` 9999px). This system follows that
for primary and secondary buttons. Status badges, tab toggles, and avatars also
use pill radius. Cards use `{rounded.lg}` (12px).

## Deviation 4 — a product-state palette

Like the previous system, this app needs `success` / `warning` / `error` and
`gold` / `silver` / `bronze` for dashboards and tournament placings. These are
**product-surface tokens** that may appear in dashboards, admin tables, badges
and form validation, and must not appear on marketing pages.

## Deviation 5 — card depth through shadows

Stripe uses soft box-shadows on cards. This system includes subtle card shadows
in the `card` and `panel` utilities, unlike the previous hairline-only approach.
This gives cards a slight visual lift that reads as more premium and less flat.

## Deviation 6 — an editorial category palette

Stripe is a payments company: its palette is one indigo plus semantic state, and
it has no notion of taxonomy colour. This site's home page is a newsroom, and a
feed that renders six kinds of post as six identical grey badges gives a reader
nothing to scan.

So there is a second chromatic ladder, `cat-*`, with one hue per post category:

| Category | Hue | Token family |
|---|---|---|
| Tournament | indigo | `--su-cat-tournament-*` |
| Result | green | `--su-cat-result-*` |
| Governing body | amber | `--su-cat-governing-body-*` |
| Club | magenta | `--su-cat-club-*` |
| Facility | cyan | `--su-cat-facility-*` |
| Notice | ruby | `--su-cat-notice-*` |

Each hue ships three values: a full-strength `--su-cat-{name}` for spines, dots
and rules; a `-tint` fill; and an `-on-tint` label that clears AA on that fill.
Both themes define all three — dark lifts the hues toward their brighter end and
turns the tints into deep washes.

**This ladder is not the product-state palette and the two must not be
confused.** State colour (`success` / `warning` / `error`) means *settled,
overdue, failed* and stays in dashboards, admin tables and form validation.
Category colour means *what kind of thing this is* and is safe — expected, even
— on public pages. Deviation 4's restriction still holds for state colour; it
never applied to taxonomy, because taxonomy did not exist until now.

The mapping lives in `src/lib/news.ts` (`categoryVars`, `CATEGORY_BADGE`,
`CATEGORY_DOT`) rather than in each component, and the badge classes are written
out in full because Tailwind scans source statically and cannot resolve a class
name assembled from a template literal.

## Deviation 7 — the gradient mesh, actually implemented

The mesh is the most distinctive thing in the Stripe system and the section
above describes it at length, but it existed nowhere in the code: a count of
`bg-gradient` / `from-` / `via-` across all components returned zero. The page
was 150 neutral surface-and-border classes against 37 chromatic ones, twenty of
which were `text-link` on body-sized text. That, not the palette, is why the
site read as monotone.

Two utilities now carry it:

- `mesh` — five radial stops rather than a linear ramp, so the colour pools in
  soft lobes instead of banding. `isolate` so it cannot escape a rounded parent.
- `mesh-fade` — the same surface, masked to transparent at the bottom edge so a
  hero hands off to the canvas without a seam. This is the one the home page
  masthead uses.

The stops are held as raw `--su-mesh-1..5` tokens so both utilities compose them
and dark can restate the same five-stop shape at navy-adjacent luminance — the
hero glows rather than glares.

Chromatic surfaces that go with it: `card-feature` (the pinned lead story, a
category-tinted panel with a 3px hue spine on its left edge), `accent-rule`, and
`stat-tile`.

## Rules that are easy to get wrong

- **Pills on primary CTAs, rounded-md on cards.** The pill radius is for buttons,
  badges and avatars only. Cards are `rounded-lg` (12px).
- **Indigo is the accent.** Brand mark, primary CTA, focus ring, link emphasis.
  It is never a card fill or a section background.
- **Display type is weight 500-600, not 300** (Deviation 2). Editorial density
  comes from the negative tracking, not from thin strokes. `hero-display` and
  `display-lg` are 500; `heading-lg` and `heading-md` are 600.
- `text-link` is a *different value* from `bg-primary`. The indigo that passes
  AA as a button fill does not pass as body-sized text, so links use a deeper
  indigo.
- Never write a literal `text-white` on an ink fill: `ink` inverts with the
  theme, so the label token is `text-on-ink`.
- `border-hairline` is for inputs and tab outlines. Section breaks, card borders
  and table rules use `border-hairline-soft`.
- **Cards have shadows.** Unlike the previous flat system, cards should carry
  their subtle shadow for visual depth.
- Depth comes from shadows + surface lifts. `shadow-panel` exists for the
  sticky checkout rail.
- The product-state palette (`success` / `warning` / `error`, and the
  `gold` / `silver` / `bronze` placings) is for dashboards, admin tables, badges
  and form validation. It must not appear on marketing pages.
- **`cat-*` is a different ladder from state colour** (Deviation 6). Category
  hues carry taxonomy and belong on public pages; state colour carries
  settled/overdue/failed and does not. Never reach for `success` to mean
  "a result post".
- **A category's hue is set once, in `src/lib/news.ts`.** Components spread
  `categoryVars(category)` onto a wrapper and let `card-feature` / `accent-rule`
  read `--cat` and `--cat-tint`. Don't hand-pick a `cat-*` class in a component.
- **`Badge tone="bare"` is how a caller supplies its own fill.** A tone class and
  a caller-supplied class are the same specificity, so which wins would otherwise
  depend on stylesheet order. `bare` emits geometry and no colour.
- **The hero mesh is `mesh-fade`, not `mesh`** (Deviation 7). The unmasked `mesh`
  ends in a hard seam against the canvas.
