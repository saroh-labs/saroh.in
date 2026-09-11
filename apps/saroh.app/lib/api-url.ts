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
 */
export function publicApiUrl(): string {
    return env.NEXT_PUBLIC_API_URL ?? env.API_URL ?? "https://api.saroh.in";
}
