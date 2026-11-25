// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://shuttlersunited.com',

  // The club app is session-driven (auth, dues, bookings), so render on demand
  // by default and opt individual marketing pages back into prerendering.
  output: 'server',

  // The roster moved from /players to /members; keep old links working.
  redirects: {
    '/players': '/members',
    '/players/[slug]': '/members/[slug]',
  },
  // Deployed as a Cloudflare Worker with static assets (see wrangler.jsonc).
  // Images are transformed by the Cloudflare Images binding at runtime, since
  // the homepage renders on demand and sharp cannot run in workerd.
  adapter: cloudflare({ imageService: 'cloudflare-binding' }),

  vite: {
    plugins: [tailwindcss()],
  },

  // Auth lives in a signed httpOnly cookie, not server-side session storage.
  // Disabling sessions keeps the server bundle smaller.
  session: false,

  env: {
    schema: {
      // --- Session signing ---
      AUTH_COOKIE_SECRET: envField.string({ context: 'server', access: 'secret' }),

      // --- WhatsApp OTP (Gupshup) ---
      GUPSHUP_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      GUPSHUP_SOURCE_NUMBER: envField.string({ context: 'server', access: 'secret', optional: true }),
      GUPSHUP_APP_NAME: envField.string({ context: 'server', access: 'secret', optional: true }),
      GUPSHUP_OTP_TEMPLATE_ID: envField.string({ context: 'server', access: 'secret', optional: true }),

      // --- Razorpay ---
      // Server-public: the browser gets it via the createOrder action result,
      // so it never needs to be inlined into the client bundle.
      RAZORPAY_KEY_ID: envField.string({ context: 'server', access: 'public', optional: true }),
      RAZORPAY_KEY_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      RAZORPAY_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
