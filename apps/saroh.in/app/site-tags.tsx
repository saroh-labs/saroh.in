"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { buttonClasses } from "@/components/v2/button";
import type { Consent } from "@/lib/consent";
import { readChoices, subscribeConsent, writeChoices } from "@/lib/consent";
import { browserTracking } from "@/lib/error-tracking-browser";
import type { TagConfig } from "@/lib/ga";
import { asksConsent, hasAdTags } from "@/lib/ga";
import { isPreviewPath } from "@/lib/pricing-preview";
import {
    allowedNow,
    browserOptsOut,
    NOTHING_ALLOWED,
    startRecording,
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
 * Everything on saroh.in that waits for the cookie notice, and the notice
 * itself. The notice asks about two things, each its own answer
 * (`lib/consent.ts`):
 *
 * 1. **Understanding the site**: Google Analytics' visit counts, and
 *    recording how the site is used (session replay, DEC-125). One answer
 *    covers both.
 * 2. **Advertising**: Google Ads and the Meta Pixel (DEC-127).
 *
 * `config` holds what this deployment switches on: the tags' ids, which the
 * layout passes only on a production deployment (`lib/ga.ts`), and whether
 * recording is on (`lib/site-recording.ts`). With none of them nothing
 * loads and no notice shows, so previews, local dev and the browser tests
 * reach neither Google nor Meta and are never recorded. Never on a pricing
 * draft preview (KTD-10): a staff member checking a draft is not a visit,
 * and the preview address must not reach a third party.
 *
 * A tag loads, and the recorder starts, only after the visitor accepts its
 * kind in the notice (`lib/tags.ts` does both; this decides when). Until
 * they answer, the notice sits in a corner (not a wall: the page works
 * behind it). Refusing keeps everything off and clears the tags' cookies;
 * the answers are remembered, and "Cookie choices" in the footer asks
 * again, which stops the recorder at once.
 *
 * Advertising is its own answer. With an advertising tag set, the notice
 * says so and offers the first answer alone; someone who accepted visit
 * counts before saroh.in advertised is asked once about advertising, and
 * someone who refused is left alone.
 *
 * So is an accept from before the notice said it records: it was for visit
 * counts, so Google Analytics carries on, nothing is recorded, and the
 * notice asks once about recording. "Refuse" there keeps what they had
 * agreed to.
 *
 * Never in a Saroh team browser (`lib/team-browser.ts`), and never in one
 * sending Do Not Track or Global Privacy Control: no tags, no recording,
 * and no notice.
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
    const ready = asksConsent(config) && choices !== UNREAD;
    const preview = isPreviewPath(pathname);

    // The sign-up hand-off is gone in a moment: it asks nothing, is never
    // recorded, and loads its own tags once it has cut its address back
    // (`lib/welcome-forward.ts`).
    const handOff = pathname === WELCOME_PATH;

    // After every answer and every page: load what is allowed, stop what
    // isn't. `choices` is here so a changed answer runs it again.
    useEffect(() => {
        if (!ready || handOff) return;
        syncTags(config, preview ? NOTHING_ALLOWED : allowedNow());
    }, [ready, handOff, preview, choices, config]);

    // The recorder (DEC-125): only where it is switched on, on a page that
    // may be recorded, for a visitor who accepted a notice that said so.
    // After the effect above, and `startRecording` cuts the address back
    // itself before it starts. Taking the answer back, or moving to a page
    // that is never recorded, stops it at once.
    const record =
        ready &&
        Boolean(config.recording) &&
        !preview &&
        !handOff &&
        !optedOut &&
        choices.split(":")[2] === "granted";
    useEffect(() => {
        const recorder = browserTracking;
        if (!recorder) return;
        if (!record) {
            // Refused, forgotten, or a page that is never recorded.
            recorder.stopReplay();
            return;
        }
        return startRecording(recorder);
    }, [record]);

    if (!ready || preview || optedOut || handOff) return null;
    const ask = question(config, choices);
    return ask ? <CookieNotice ask={ask} privacyHref={privacyHref} /> : null;
}

interface Ask {
    text: string;
    buttons: {
        label: string;
        choose: { analytics?: Consent; recording?: boolean; ads?: Consent };
    }[];
}

/** After a sentence about cookies alone, as the notice has always said it. */
const SAME = "Refuse them and the site works the same.";
/** Where recording is asked too: it is not a cookie, so not "them". */
const SAME_ALL = "Refuse and the site works the same.";
const COUNTS = "saroh.in uses Google Analytics cookies to count visits";
const RECORDS = "records how the site is used so we can make it clearer";
const WHY_ADS =
    "to see which of our ads work and to show Saroh's ads to people who've visited";

/**
 * What the notice asks, or null when everything it would ask has been
 * answered. Each sentence names only what this deployment switches on.
 * `choices` is `lib/consent.ts`'s `readChoices()`: `counts:ads:recording`.
 */
export function question(config: TagConfig, choices: string): Ask | null {
    const [first, ads, recorded] = choices.split(":");
    const counts = Boolean(config.gaId);
    const recording = Boolean(config.recording);
    const adTags = hasAdTags(config);
    // The first answer has never been given.
    const askFirst = (counts || recording) && first === "-";
    // It was accepted, by a notice that said nothing of recording.
    const askRecording = recording && first === "granted" && recorded === "-";
    const askAds = adTags && ads === "-";
    if (!askFirst && !askRecording && !askAds) return null;

    const tags = [config.adsId && "Google Ads", config.pixelId && "Meta"]
        .filter(Boolean)
        .join(" and ");
    const companies = [config.adsId && "Google", config.pixelId && "Meta"]
        .filter(Boolean)
        .join(" and ");

    if (askFirst) {
        const accept = { analytics: "granted", recording } as const;
        if (!askAds) {
            const text = !recording
                ? `${COUNTS}. ${SAME}`
                : counts
                  ? `${COUNTS} and, if you accept, ${RECORDS}. What you type is never recorded. ${SAME_ALL}`
                  : `If you accept, saroh.in ${RECORDS}. What you type is never recorded. ${SAME_ALL}`;
            return {
                text,
                buttons: [
                    { label: "Accept", choose: accept },
                    { label: "Refuse", choose: { analytics: "refused" } },
                ],
            };
        }
        const refuse = { analytics: "refused", ads: "refused" } as const;
        if (!recording) {
            return {
                text: `${COUNTS}, and ${tags} cookies ${WHY_ADS}. They tell ${companies} you were here. ${SAME}`,
                buttons: [
                    {
                        label: "Accept all",
                        choose: { ...accept, ads: "granted" },
                    },
                    {
                        label: "Visit counts only",
                        choose: { ...accept, ads: "refused" },
                    },
                    { label: "Refuse", choose: refuse },
                ],
            };
        }
        const understanding = counts
            ? `${COUNTS} and, if you accept, ${RECORDS}`
            : `If you accept, saroh.in ${RECORDS}`;
        return {
            text: `${understanding}; what you type is never recorded. It also uses ${tags} cookies ${WHY_ADS}; they tell ${companies} you were here. ${SAME_ALL}`,
            buttons: [
                { label: "Accept all", choose: { ...accept, ads: "granted" } },
                {
                    label: counts
                        ? "Counts and recording only"
                        : "Recording only",
                    choose: { ...accept, ads: "refused" },
                },
                { label: "Refuse", choose: refuse },
            ],
        };
    }

    if (askRecording) {
        // Visit counts were accepted before the notice said it records.
        // They carry on; this asks about the rest, and "Refuse" leaves
        // what was agreed as it is.
        const asks = `${counts ? "You accepted Google Analytics cookies that count visits. May saroh.in also record" : "May saroh.in record"} how the site is used, so we can make it clearer? What you type is never recorded.`;
        if (!askAds) {
            return {
                text: `${asks} ${SAME_ALL}`,
                buttons: [
                    { label: "Accept", choose: { recording: true } },
                    { label: "Refuse", choose: { recording: false } },
                ],
            };
        }
        return {
            text: `${asks} It now advertises too, and would use ${tags} cookies ${WHY_ADS}; they tell ${companies} you were here. ${SAME_ALL}`,
            buttons: [
                {
                    label: "Accept all",
                    choose: { recording: true, ads: "granted" },
                },
                {
                    label: "Recording only",
                    choose: { recording: true, ads: "refused" },
                },
                {
                    label: "Refuse",
                    choose: { recording: false, ads: "refused" },
                },
            ],
        };
    }

    const told = `They tell ${companies} you were here.`;
    return {
        // The first answer was given before saroh.in advertised, or this
        // deployment has nothing else to ask about: only advertising is.
        text:
            counts || recording
                ? `saroh.in now advertises. May we use ${tags} cookies ${WHY_ADS}? ${told} ${SAME}`
                : `saroh.in uses ${tags} cookies ${WHY_ADS}. ${told} ${SAME}`,
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
