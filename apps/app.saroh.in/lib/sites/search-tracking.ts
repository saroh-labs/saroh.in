import type {
    CodeProblem,
    PosthogRegion,
    TrackerKind,
    VerificationService,
} from "@saroh/block-contract";
import {
    checkTrackerId,
    checkVerificationCode,
    CONSENT_FREE_TRACKERS,
    extractTrackerId,
    extractVerificationCode,
} from "@saroh/block-contract";

import {
    HELP_TOPICS,
    helpArticleUrl,
    helpHasMoved,
    helpUrl,
} from "@/lib/help/links";

/**
 * A site's "Search and tracking" section (DEC-108, U7): its verification
 * codes, the business's own trackers and the privacy page the cookie
 * banner links to — the shapes, the words and the paste rules. Pure and
 * client-safe; the read and the save are `search-tracking-read.ts`.
 *
 * What a merchant pastes is read here, in the browser, with the shared
 * validators (`@saroh/block-contract`): only the id found in it is ever
 * sent, never the paste, and a value that looks secret is refused before
 * anything leaves the page.
 */

/** The section as `GET …/sites/:siteId/search-and-tracking` answers it. */
export interface TrackerView {
    kind: TrackerKind;
    trackerId: string;
    region: PosthogRegion | null;
    enabled: boolean;
}

export interface SearchTrackingView {
    verifications: Record<VerificationService, string | null>;
    trackers: TrackerView[];
    /** The merchant's own privacy page; null: the notice Saroh writes. */
    privacyUrl: string | null;
    /** Saroh staff have switched this site's trackers off. */
    switchedOff: boolean;
}

/** The read, or that it couldn't be had — never an empty section. */
export type SearchTrackingRead =
    { ok: true; data: SearchTrackingView } | { ok: false };

/** One tracker as a save names it. */
export interface TrackerSave {
    id: string;
    region?: PosthogRegion;
    enabled?: boolean;
}

/** A save: an absent key is left alone, null removes it. */
export interface SearchTrackingSave {
    verifications?: Partial<Record<VerificationService, string | null>>;
    trackers?: Partial<Record<TrackerKind, TrackerSave | null>>;
    privacyUrl?: string | null;
}

/** The API's words for a refused value (`site-tracking.service.ts`). */
export const PROBLEM_WORDS: Record<CodeProblem, string> = {
    empty: "Enter the code, or remove it.",
    secret: "This looks like a private key. Never paste it here.",
    "tag-manager":
        "Google Tag Manager isn't supported. Connect each tool on its own.",
    format: "This doesn't look like the right code for this tool.",
};

export const PRIVACY_URL_PROBLEM =
    "Use the full address of your privacy page, starting https://";

/** What a paste comes to: nothing yet, the value to save, or why not. */
export type PasteRead =
    | { state: "empty" }
    | {
          state: "ok";
          value: string;
          /** The value was taken out of a longer paste (a tag or snippet). */
          extracted: boolean;
          /** PostHog's region, when the snippet named its host. */
          region?: PosthogRegion;
      }
    | { state: "bad"; problem: CodeProblem; message: string };

function bad(problem: CodeProblem): PasteRead {
    return { state: "bad", problem, message: PROBLEM_WORDS[problem] };
}

/** A verification field's paste: the `<meta>` tag or the bare code. */
export function readVerificationPaste(
    service: VerificationService,
    pasted: string,
): PasteRead {
    const text = pasted.trim();
    if (text === "") return { state: "empty" };
    const candidate = extractVerificationCode(service, text);
    const checked = checkVerificationCode(service, candidate);
    if (!checked.ok) return bad(checked.problem);
    return {
        state: "ok",
        value: checked.value,
        extracted: checked.value !== text,
    };
}

/** A tracker's paste: its id, or the snippet the tool gave. */
export function readTrackerPaste(kind: TrackerKind, pasted: string): PasteRead {
    const text = pasted.trim();
    if (text === "") return { state: "empty" };
    const found = extractTrackerId(kind, text);
    const checked = checkTrackerId(kind, found.id);
    if (!checked.ok) return bad(checked.problem);
    return {
        state: "ok",
        value: checked.value,
        extracted: checked.value !== text,
        ...(found.region ? { region: found.region } : {}),
    };
}

/** Each verification service, as the merchant knows it. */
export const VERIFICATION_WORDS: Record<
    VerificationService,
    {
        label: string;
        /** Where they press Verify once the code is live. */
        console: string;
        /** One line on getting the code; `{host}` is the live address. */
        where: string;
    }
> = {
    google: {
        label: "Google Search Console",
        console: "Search Console",
        where: "Add a property, choose URL prefix, enter {host}, then choose HTML tag. Paste the tag or just the code.",
    },
    bing: {
        label: "Bing Webmaster Tools",
        console: "Bing Webmaster Tools",
        where: "Add {host}, choose HTML Meta Tag, and paste the tag or just the code.",
    },
    meta: {
        label: "Meta",
        console: "Meta Business Suite",
        where: "In Business settings, open Domains, add {host} and choose the meta-tag option. Paste the tag or just the code.",
    },
    pinterest: {
        label: "Pinterest",
        console: "Pinterest",
        where: "In Settings, open Claimed accounts, claim {host} and choose Add HTML tag. Paste the tag or just the code.",
    },
};

/** Meta and Pinterest verify a domain of the business's own. */
export const OWN_DOMAIN_SERVICES: readonly VerificationService[] = [
    "meta",
    "pinterest",
];

export const OWN_DOMAIN_NOTE =
    "Meta and Pinterest verify only a domain of your own. Connect one to add them.";

/** Said once a verification code is saved. Never "Verified": we can't know. */
export function verificationSavedLine(service: VerificationService): string {
    return `Added to your live site. Go back to ${VERIFICATION_WORDS[service].console} and press Verify.`;
}

/** Each tracker, as the merchant knows it, in `TRACKER_KINDS` order. */
export const TRACKER_WORDS: Record<
    TrackerKind,
    { name: string; where: string; placeholder: string }
> = {
    ga4: {
        name: "Google Analytics",
        where: "In Google Analytics, Admin › Data streams › your web stream. The Measurement ID starts G-.",
        placeholder: "G-XXXXXXXXXX, or paste the Google tag",
    },
    "google-ads": {
        name: "Google Ads",
        where: "In Google Ads, Tools › Data manager › Google tag. The tag ID starts AW-.",
        placeholder: "AW-XXXXXXXXX, or paste the Google tag",
    },
    "meta-pixel": {
        name: "Meta Pixel",
        where: "In Meta Events Manager, Data sources › your pixel. The Pixel ID is a long number.",
        placeholder: "Your Pixel ID, or paste the pixel code",
    },
    posthog: {
        name: "PostHog",
        where: "In PostHog, Project settings › Project API key. It starts phc_.",
        placeholder: "phc_…, or paste the PostHog snippet",
    },
    clarity: {
        name: "Microsoft Clarity",
        where: "In Clarity, Settings › Overview › Project ID.",
        placeholder: "Your Project ID, or paste the Clarity code",
    },
    plausible: {
        name: "Plausible",
        where: "In Plausible, Site settings › Site installation. Paste the script; the ID starts pa-.",
        placeholder: "pa-…, or paste the Plausible script",
    },
    umami: {
        name: "Umami Cloud",
        where: "In Umami Cloud, Settings › Websites › Edit › Website ID.",
        placeholder: "Your Website ID, or paste the Umami script",
    },
};

export const POSTHOG_REGION_WORDS: Record<PosthogRegion, string> = {
    us: "US cloud",
    eu: "EU cloud",
};

/** The Help article on this section (saroh.in/help, once Help has moved). */
export const SEARCH_TRACKING_ARTICLE = "verify-your-site-and-add-analytics";

/** The article's step "Choose your analytics tool": `stepId` on saroh.in. */
const TRACKER_STEP = "step-4";

/**
 * Where Help explains finding a tool's id: the old site's anchor for that
 * tool (written in U8) until Help moves, then the article's step on choosing
 * the tool, which says each row names where its ID is.
 */
export function trackerHelpHref(
    kind: TrackerKind,
    now: Date = new Date(),
): string {
    if (helpHasMoved(now)) {
        return `${helpArticleUrl(SEARCH_TRACKING_ARTICLE)}#${TRACKER_STEP}`;
    }
    return `${helpUrl(HELP_TOPICS.website, now)}#trackers-${kind}`;
}

export function needsConsent(kind: TrackerKind): boolean {
    return !CONSENT_FREE_TRACKERS.includes(kind);
}

/** Said once a tracker is saved: only what is true of where it runs. */
export function trackerSavedLine(kind: TrackerKind): {
    title: string;
    description: string;
} {
    return {
        title: "Added to your live site.",
        description: needsConsent(kind)
            ? "It runs on pages visitors browse after they accept cookies, never on checkout or payment pages."
            : "It runs on every page except checkout and payment pages; it uses no cookies, so visitors aren't asked.",
    };
}

/** How a connected tracker runs now, in words. */
export function trackerRunsLine(kind: TrackerKind): string {
    return needsConsent(kind)
        ? "Runs after visitors accept cookies, never on checkout or payment pages."
        : "Runs on every page except checkout and payment pages. No cookies.";
}

export const PRIVACY_NOTE =
    "Without one, visitors see a short notice we write listing your tools.";

export const SUPPORT_EMAIL = "contact@saroh.in";

export const SWITCHED_OFF_LINE =
    "Saroh has switched off trackers on this site.";

export const NOT_RUNNING_LINE = "Saved, not running on your site.";

/** The live address's sitemap, which search consoles ask for. */
export function sitemapUrl(liveUrl: string): string {
    return `${liveUrl.replace(/\/+$/, "")}/sitemap.xml`;
}
