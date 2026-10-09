/**
 * The Worker's entry for accounts (wrangler.jsonc `main`): OpenNext's handler,
 * with Saroh's crash page in place of Cloudflare's own error screen when the
 * handler throws before Next can render anything (`withCrashPage`,
 * `@saroh/ui/lib/crash-page`). Next's own failures never reach it: Next
 * renders them with `app/error.tsx` and `app/global-error.tsx`.
 *
 * `.open-next/worker.js` exists only after `pnpm cf:build`, and wrangler
 * bundles this file after it; so this file is left out of `tsc` (tsconfig
 * `exclude`) and the lint, as saroh.app's is. What it runs is
 * `crash-page.ts`, which is typed and tested.
 */
import { withCrashPage } from "@saroh/ui/lib/crash-page";
import handler from "./.open-next/worker.js";

export default {
    fetch: withCrashPage(
        (request, env, ctx) => handler.fetch(request, env, ctx),
        {
            brand: "saroh",
            homeHref: "/apps",
            homeLabel: "Go to your apps",
        },
    ),
};
