import type { ReleaseSwitch } from "@saroh/marketing/feature-switches";
import { switchedOffSet } from "@saroh/marketing/feature-switches";

/**
 * The release switches this build has off (plan 2026-11-13-002, U1), by
 * saroh.in's rule: the only thing that decides whether a feature page shows
 * here (a feature's `state` never hides one). Production leaves them unset,
 * which is off, until Global's launch steps (ticket 10). Each name is read
 * literally, so Next inlines it into browser code too.
 */
export function featuresOff(): ReleaseSwitch[] {
    return switchedOffSet({
        NEXT_PUBLIC_TEMPLATES: process.env.NEXT_PUBLIC_TEMPLATES,
        NEXT_PUBLIC_AI_APPS: process.env.NEXT_PUBLIC_AI_APPS,
        NEXT_PUBLIC_ASK_AI: process.env.NEXT_PUBLIC_ASK_AI,
        NEXT_PUBLIC_SOCIAL: process.env.NEXT_PUBLIC_SOCIAL,
        NEXT_PUBLIC_DEVELOPERS: process.env.NEXT_PUBLIC_DEVELOPERS,
        NEXT_PUBLIC_DOCS: process.env.NEXT_PUBLIC_DOCS,
        NODE_ENV: process.env.NODE_ENV,
    });
}
