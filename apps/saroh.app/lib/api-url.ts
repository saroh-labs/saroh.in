import { env } from "@/env";

/**
 * The public API origin these pages hand to the interactive blocks.
 *
 * The enquiry and booking blocks used to read this app's env directly. They
 * live in `@saroh/site-blocks` now (#252) and are rendered by three apps with
 * three different answers, so it arrives as a prop instead.
 *
 * The expression is unchanged from what those components computed for
 * themselves, fallback included — without it a local dev site would post to
 * production, which is the one behaviour change this move must not make.
 *
 * Every deployment of this app sets BOTH `NEXT_PUBLIC_API_URL` and `API_URL`
 * to the same API (dev: the dev API; production: the production API). Some
 * server reads (the booking page's) take `API_URL` first and these blocks take
 * the public one first, so setting only one sends half the page to the
 * fallback: production. `NEXT_PUBLIC_*` is fixed at build time, so a change to
 * it needs a fresh build, not a restart.
 */
export function publicApiUrl(): string {
    return env.NEXT_PUBLIC_API_URL ?? env.API_URL ?? "https://api.saroh.in";
}
