"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/v2/button";
import type { Consent } from "@/lib/consent";
import { readChoices, subscribeConsent, writeChoices } from "@/lib/consent";
import type { TagConfig } from "@/lib/ga";
import { hasAdTags } from "@/lib/ga";
import { isPreviewPath } from "@/lib/pricing-preview";
import {
    allowedNow,
    browserOptsOut,
    NOTHING_ALLOWED,
    syncTags,
} from "@/lib/tags";
import { WELCOME_PATH } from "@/lib/welcome";

/** Before the browser has been asked (the server's render): show nothing. */
const UNREAD = "unread";

/**
 * The team cookie is set by a page load, and a browser's privacy signal by
 * its settings: neither changes while a page is open.
 */
const NO_CHANGES = () => () => undefined;
const optsOut = () => browserOptsOut();

/**
 * saroh.in's third-party tags and the cookie notice that gates them: Google
 * Analytics, and the advertising tags, Google Ads and the Meta Pixel
 * (DEC-127). `config` holds the ids the layout passes, which it does only on
 * a production deployment (`lib/ga.ts`). Without any, nothing loads and no
 * notice shows, so previews, local dev and the browser tests reach neither
 * Google nor Meta. Never on a pricing draft preview (KTD-10): a staff member
 * checking a draft is not a visit, and the preview address must not reach a
 * third party.
 *
 * A tag loads only after the visitor accepts its kind in the notice
 * (`lib/tags.ts` loads it; this decides when). Until they answer, the notice
 * sits in a corner (not a wall: the page works behind it). Refusing keeps
 * the tags off and clears their cookies; the answers are remembered
 * (`lib/consent.ts`), and "Cookie choices" in the footer asks again.
 *
 * Advertising is its own answer. With an advertising tag set, the notice
 * says so and offers visit counts alone; someone who accepted visit counts
 * before saroh.in advertised is asked once about advertising, and someone
 * who refused is left alone.
 *
 * Never in a Saroh team browser (`lib/team-browser.ts`), and never in one
 * sending Do Not Track or Global Privacy Control: no tags, and no notice.
 */
export function SiteTags({
    config,
    privacyHref,
}: {
    config: TagConfig;
    /** The Privacy page, once it is published; the notice links it. */
    privacyHref?: string;
}) {
    const pathname = usePathname();
    const choices = useSyncExternalStore(
        subscribeConsent,
        readChoices,
        () => UNREAD,
    );
    const optedOut = useSyncExternalStore(NO_CHANGES, optsOut, () => false);
    const ready =
        (Boolean(config.gaId) || hasAdTags(config)) && choices !== UNREAD;
    const preview = isPreviewPath(pathname);

    // The sign-up hand-off is gone in a moment: it asks nothing, and loads
    // its own tags once it has cut its address back (`lib/welcome-forward.ts`).
    const handOff = pathname === WELCOME_PATH;

    // After every answer and every page: load what is allowed, stop what
    // isn't. `choices` is here so a changed answer runs it again.
    useEffect(() => {
        if (!ready || handOff) return;
        syncTags(config, preview ? NOTHING_ALLOWED : allowedNow());
    }, [ready, handOff, preview, choices, config]);

    if (!ready || preview || optedOut || handOff) return null;
    const ask = question(config, choices);
    return ask ? <CookieNotice ask={ask} privacyHref={privacyHref} /> : null;
}

interface Ask {
    text: string;
    buttons: {
        label: string;
        choose: { analytics?: Consent; ads?: Consent };
    }[];
}

const SAME = "Refuse them and the site works the same.";

/**
 * What the notice asks, or null when everything it would ask has been
 * answered. Each sentence names only the tags this deployment loads.
 */
export function question(config: TagConfig, choices: string): Ask | null {
    const [analytics, ads] = choices.split(":");
    const adTags = hasAdTags(config);
    const askAnalytics = Boolean(config.gaId) && analytics === "-";
    const askAds = adTags && ads === "-";
    if (!askAnalytics && !askAds) return null;

    if (!adTags) {
        return {
            text: `saroh.in uses Google Analytics cookies to count visits. ${SAME}`,
            buttons: [
                { label: "Accept", choose: { analytics: "granted" } },
                { label: "Refuse", choose: { analytics: "refused" } },
            ],
        };
    }

    const tags = [config.adsId && "Google Ads", config.pixelId && "Meta"]
        .filter(Boolean)
        .join(" and ");
    const companies = [config.adsId && "Google", config.pixelId && "Meta"]
        .filter(Boolean)
        .join(" and ");
    const why = `to see which of our ads work and to show Saroh's ads to people who've visited`;
    const told = `They tell ${companies} you were here.`;

    if (askAnalytics) {
        return {
            text: `saroh.in uses Google Analytics cookies to count visits, and ${tags} cookies ${why}. ${told} ${SAME}`,
            buttons: [
                {
                    label: "Accept all",
                    choose: { analytics: "granted", ads: "granted" },
                },
                {
                    label: "Visit counts only",
                    choose: { analytics: "granted", ads: "refused" },
                },
                {
                    label: "Refuse",
                    choose: { analytics: "refused", ads: "refused" },
                },
            ],
        };
    }
    return {
        // Visit counts were answered before saroh.in advertised, or this
        // deployment has no Google Analytics: only advertising is asked.
        text: config.gaId
            ? `saroh.in now advertises. May we use ${tags} cookies ${why}? ${told} ${SAME}`
            : `saroh.in uses ${tags} cookies ${why}. ${told} ${SAME}`,
        buttons: [
            { label: "Accept", choose: { ads: "granted" } },
            { label: "Refuse", choose: { ads: "refused" } },
        ],
    };
}

/**
 * The cookie notice: a sentence or two, a link to Privacy (once published),
 * and buttons of equal weight. A region in the corner, never a modal:
 * nothing behind it is blocked, and focus is not taken.
 */
function CookieNotice({
    ask,
    privacyHref,
}: {
    ask: Ask;
    privacyHref?: string;
}) {
    return (
        <section
            aria-label="Cookies"
            className="fixed inset-x-3 bottom-3 z-40 grid gap-4 rounded-mk-card border border-border bg-card p-5 font-sans text-foreground shadow-mk-menu min-[520px]:inset-x-auto min-[520px]:bottom-5 min-[520px]:left-5 min-[520px]:max-w-[420px]"
        >
            <p className="m-0 text-[14.5px] leading-[1.55] text-mk-copy">
                {ask.text}
                {privacyHref ? (
                    <>
                        {" "}
                        <Link
                            href={privacyHref}
                            className="cursor-pointer rounded-sm text-foreground underline underline-offset-[3px] hover:text-mk-copy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:text-muted-foreground"
                        >
                            Privacy
                        </Link>
                    </>
                ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
                {ask.buttons.map((button) => (
                    <button
                        key={button.label}
                        type="button"
                        onClick={() => writeChoices(button.choose)}
                        className={buttonClasses({
                            variant: "secondary",
                            size: "sm",
                            className: "bg-transparent",
                        })}
                    >
                        {button.label}
                    </button>
                ))}
            </div>
        </section>
    );
}
