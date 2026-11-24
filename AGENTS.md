## Design

`DESIGN.md` is the design source of truth — read it before writing any UI. It is
the captured **Stripe** design system plus a **Shuttlers United — Adaptation**
section at the end covering the dark theme, the product-state palette, pill
buttons, card shadows, the editorial category palette, the gradient mesh, and
the token name mapping.

The system is rich, warm and premium: hierarchy comes from surface-tone shifts
(white → cream → soft blue-gray), soft card shadows, an atmospheric gradient
mesh on marketing heroes, and a vibrant chromatic accent (electric indigo
`#533afd`). The canvas is warm white, the ink is deep navy.

**This project is deliberately not minimal.** Two chromatic ladders do that
work: indigo as the scarce brand accent, and a six-hue `cat-*` taxonomy palette
that colour-codes the newsroom feed. Reaching for another neutral surface where
a hue belongs is the failure mode to watch for here.

Tokens live in `src/styles/global.css`. Both themes are defined as `--su-*`
custom properties (`:root` for light, `.dark` for dark) and exposed to Tailwind
through `@theme inline`, so every utility re-resolves per theme. **Light is the
default**; the dark theme uses deep navy surfaces (#0a0e1a, #111827). The toggle
writes `su-theme` to `localStorage` and an inline script in `Layout.astro`
applies the class before first paint.

Rules that are easy to get wrong:

- **Pills on primary CTAs, rounded-lg on cards.** Primary and secondary buttons
  use `rounded-full` (pill). Cards use `rounded-lg` (12px).
- **Display type is weight 500-600** (`hero-display`/`display-lg` 500,
  `heading-lg`/`heading-md` 600). Editorial density comes from the negative
  tracking, not thin strokes. Body is 400, labels and buttons 400-500.
  `font-bold` does not appear in this system.
- **Indigo is scarce** — brand mark, primary CTA (`variant="buy"`), focus ring
  and link emphasis. Never a card fill or a section background. Marketing CTAs
  use the ink button (`variant="primary"`).
- `text-link` is a *different value* from `bg-primary`: the indigo that clears
  AA as a button fill does not clear it as body-sized text, so links resolve to
  a deeper indigo in light and a lighter indigo in dark.
- **Selected means a surface lift**, not an ink fill. Active tabs, filter pills
  and sub-nav items take `bg-lift`; they never invert to `bg-ink`.
- Never write a literal `text-white` on an ink fill: `ink` inverts with the
  theme, so the label token is `text-on-ink`. Saturated badge fills take
  `text-on-fill` (or `text-on-error-fill` for red).
- `border-hairline` is for inputs and tab outlines. Section breaks, card borders
  and table rules use `border-hairline-soft`.
- `text-faint` is AA on `canvas`, `elevated` and `soft`. `text-disabled` is for
  genuinely disabled controls only — it does not clear AA for body text.
- **Cards have shadows.** The `card` and `panel` utilities include subtle
  box-shadows for visual depth. `shadow-panel` is for the sticky checkout rail.
- The product-state palette (`success` / `warning` / `error`, and the
  `gold` / `silver` / `bronze` placings) is for dashboards, admin tables, badges
  and form validation. It must not appear on marketing pages.
- **`cat-*` is a separate ladder from state colour** and *is* allowed on public
  pages — it carries taxonomy (which kind of post), not status. A category's hue
  is chosen once in `src/lib/news.ts` via `categoryVars` / `CATEGORY_BADGE` /
  `CATEGORY_DOT`; don't hand-pick a `cat-*` class inside a component.
- **Marketing heroes use `mesh-fade`**, not `mesh` — the unmasked one ends in a
  hard seam against the canvas.
- **`Badge tone="bare"`** emits chip geometry and no colour, for when the caller
  supplies its own fill. Passing a fill class alongside a real tone is a
  same-specificity collision decided by stylesheet order.

Formatting: `.astro` files are formatted with Prettier +
`prettier-plugin-astro`. Run
`npx prettier --plugin=prettier-plugin-astro --write "src/**/*.astro"`.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
