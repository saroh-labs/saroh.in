import type {
    ClaimSwitch,
    ReleaseSwitch,
} from "@saroh/marketing/feature-switches";
import {
    claimsOffSet,
    switchedOffSet,
} from "@saroh/marketing/feature-switches";

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

/**
 * The claim switches this build has off (DEC-221), by saroh.in's rule: a
 * claim is drawn only while its switch and its feature's are on. Production
 * leaves them unset, which is off.
 */
export function claimsOff(): ClaimSwitch[] {
    return claimsOffSet({
        NEXT_PUBLIC_TEMPLATES: process.env.NEXT_PUBLIC_TEMPLATES,
        NEXT_PUBLIC_AI_APPS: process.env.NEXT_PUBLIC_AI_APPS,
        NEXT_PUBLIC_ASK_AI: process.env.NEXT_PUBLIC_ASK_AI,
        NEXT_PUBLIC_SOCIAL: process.env.NEXT_PUBLIC_SOCIAL,
        NEXT_PUBLIC_DEVELOPERS: process.env.NEXT_PUBLIC_DEVELOPERS,
        NEXT_PUBLIC_DOCS: process.env.NEXT_PUBLIC_DOCS,
        NEXT_PUBLIC_CLAIM_SOCIAL_POSTING:
            process.env.NEXT_PUBLIC_CLAIM_SOCIAL_POSTING,
        NEXT_PUBLIC_CLAIM_SHARE_EVERY_PLAN:
            process.env.NEXT_PUBLIC_CLAIM_SHARE_EVERY_PLAN,
        NEXT_PUBLIC_CLAIM_ASK_AI_STOCK:
            process.env.NEXT_PUBLIC_CLAIM_ASK_AI_STOCK,
        NEXT_PUBLIC_CLAIM_ASK_AI_WEBSITE:
            process.env.NEXT_PUBLIC_CLAIM_ASK_AI_WEBSITE,
        NEXT_PUBLIC_CLAIM_ASK_AI_SOCIAL:
            process.env.NEXT_PUBLIC_CLAIM_ASK_AI_SOCIAL,
        NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES:
            process.env.NEXT_PUBLIC_CLAIM_ASK_AI_LANGUAGES,
        NEXT_PUBLIC_CLAIM_ASK_AI_PLANS:
            process.env.NEXT_PUBLIC_CLAIM_ASK_AI_PLANS,
        NEXT_PUBLIC_CLAIM_AI_APPS_PLANS:
            process.env.NEXT_PUBLIC_CLAIM_AI_APPS_PLANS,
        NODE_ENV: process.env.NODE_ENV,
    });
}
