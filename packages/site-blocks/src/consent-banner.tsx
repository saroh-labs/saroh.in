"use client";

import type { LookId } from "@saroh/block-contract";
import { useEffect, useId, useRef, useState } from "react";

import { frontButton } from "./blocks/look-front";
import { focusRing } from "./booking-flow/styles";
import type { ConsentDock } from "./consent-dock";
import { consentDock, DOCK_INSET, heroTargets } from "./consent-dock";
import { SITE_CONSENT_OFFSET, SITE_CONSENT_OPEN_EVENT } from "./consent-events";
import { cn } from "./lib/utils";

/**
 * The cookie banner on a merchant's site (DEC-108), shown only while a
 * tracker the merchant connected needs the visitor's say. It names the
 * tools, links to the notice, and offers Accept and Reject with equal
 * weight. In the site's own colours and type, never Saroh's.
 *
 * On a phone it is a bottom bar that reports its height as
 * `--site-consent-offset`; the site's fixed cart and Book bars sit above
 * it, so it never covers them. Sheets and dialogs still open over it.
 */
export function ConsentBanner({
    tools,
    noticeHref,
    onAccept,
    onReject,
    look,
    countsVisits = false,
}: {
    /** The tools' names, as the visitor would know them. */
    tools: readonly string[];
    /** The merchant's privacy page, or the site's generated notice. */
    noticeHref: string;
    onAccept: () => void;
    onReject: () => void;
    /**
     * Folio, Quiet or Live (DEC-172, U15): the banner as that look's board
     * draws it ({@link LookConsentBanner}). Absent is Classic, unchanged.
     */
    look?: LookId;
    /**
     * The site counts visits without cookies before any choice (its own
     * visit count, and any tool that needs no consent), so a look's banner
     * says so: it names what runs before the visitor chooses.
     */
    countsVisits?: boolean;
}) {
    if (look) {
        return (
            <LookConsentBanner
                look={look}
                tools={tools}
                noticeHref={noticeHref}
                onAccept={onAccept}
                onReject={onReject}
                countsVisits={countsVisits}
            />
        );
    }
    return (
        <ClassicConsentBanner
            tools={tools}
            noticeHref={noticeHref}
            onAccept={onAccept}
            onReject={onReject}
        />
    );
}

/** Classic's banner, exactly as before looks. */
function ClassicConsentBanner({
    tools,
    noticeHref,
    onAccept,
    onReject,
}: {
    tools: readonly string[];
    noticeHref: string;
    onAccept: () => void;
    onReject: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEffect(() => {
        const el = ref.current;
        const root = document.documentElement;
        if (!el) return;
        const report = () =>
            root.style.setProperty(SITE_CONSENT_OFFSET, `${el.offsetHeight}px`);
        report();
        const watch =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(report);
        watch?.observe(el);
        return () => {
            watch?.disconnect();
            root.style.removeProperty(SITE_CONSENT_OFFSET);
        };
    }, []);

    const button = cn(
        "border-site-fg text-site-fg h-11 min-w-[7.5rem] flex-1 cursor-pointer rounded-[calc(var(--site-radius)+8px)] border-2 px-4 text-[15px] font-semibold sm:flex-none",
        focusRing,
    );

    return (
        <div
            ref={ref}
            role="region"
            aria-labelledby={titleId}
            data-site-consent=""
            className="bg-site-surface text-site-fg border-site-border font-site-body fixed inset-x-0 bottom-0 z-50 border-t px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_hsl(var(--site-fg)/0.12)]"
        >
            <div className="max-w-site-content mx-auto flex flex-col gap-3 sm:flex-row sm:items-center">
                <p
                    id={titleId}
                    className="min-w-0 flex-1 text-[14px] leading-snug"
                >
                    This site uses {listOf(tools)} to see how visitors use it.
                    They set cookies only if you accept.{" "}
                    <a
                        href={noticeHref}
                        className={cn(
                            "rounded-sm underline underline-offset-2 hover:no-underline",
                            focusRing,
                        )}
                    >
                        What they do
                    </a>
                </p>
                <div className="flex gap-2">
                    <button type="button" className={button} onClick={onReject}>
                        Reject
                    </button>
                    <button type="button" className={button} onClick={onAccept}>
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * What a look's banner says (DEC-108, U15): only what is true of this
 * site now. What runs before a choice first (visits counted without
 * cookies, when the site does), then the tools that wait for an OK, by
 * name. One message; no promise about what the tools do beyond that.
 */
export function lookConsentWords(
    tools: readonly string[],
    countsVisits: boolean,
): string {
    const asking = listOf(tools);
    return countsVisits
        ? `We count visits without cookies. With your OK, we’d also use ${asking} to see how people find and use this site.`
        : `With your OK, we’d use ${asking} to see how people find and use this site. Nothing of theirs runs until you choose.`;
}

/** Each look's banner, as its board draws it (VA25, VD25, VB25). */
const LOOK_BANNER: Record<LookId, { box: string; title: string }> = {
    // VA25: the surface, an ink hairline, square; at the page's left
    // margin on a desk.
    folio: {
        box: "bg-site-surface border border-site-fg p-5 min-[700px]:left-[var(--site-page-margin,72px)] min-[700px]:right-auto min-[700px]:w-[460px] min-[700px]:p-7",
        title: "font-site-heading text-[calc(20px*var(--site-heading-scale,1))] font-light leading-[1.2] tracking-[-0.01em] text-site-fg min-[700px]:text-[calc(22px*var(--site-heading-scale,1))]",
    },
    // VD25: the page's ground, soft corners and a soft shadow; centred on
    // a desk.
    quiet: {
        box: "bg-site-bg rounded-[20px] p-[22px] shadow-[0_20px_60px_hsl(var(--site-fg)/0.16)] min-[700px]:inset-x-0 min-[700px]:mx-auto min-[700px]:w-[520px] min-[700px]:p-7",
        title: "font-site-heading text-[calc(21px*var(--site-heading-scale,1))] font-medium leading-[1.2] text-site-accent-text min-[700px]:text-[calc(22px*var(--site-heading-scale,1))]",
    },
    // VB25: a white card, round, lifted; at the right on a desk. Its
    // phone card has no heading, to stay short above the thumb.
    live: {
        box: "bg-site-surface rounded-[24px] p-4 shadow-[0_24px_60px_-20px_hsl(var(--site-fg)/0.45)] min-[700px]:left-auto min-[700px]:right-16 min-[700px]:w-[520px] min-[700px]:p-[22px]",
        title: "font-site-heading text-[20px] font-extrabold leading-tight tracking-[-0.02em] text-site-fg max-[699px]:hidden",
    },
};

/**
 * The banner under a look (DEC-172, plan U15, #1108). The same answers as
 * Classic's (Accept and Reject, equal in size and weight, side by side,
 * and the notice), drawn as the look's board draws it:
 *
 * - It floats inset from the screen's edges and counts as the phone's ONE
 *   FIXED BAR: the Book bar and Live's dock wait until it is answered
 *   (`sticky-actions.tsx` reads `data-site-consent`).
 * - It NEVER COVERS THE HERO'S BUTTONS: it sits at the foot unless that
 *   would cover one, then at the top (`consent-dock.ts`), checked again as
 *   the page scrolls or the screen turns.
 * - At the foot it reports its height and gap as `--site-consent-offset`,
 *   which lifts the page (the look's rule pads the page by it) and the
 *   fixed bars of the shop and booking above it. At the top it reports
 *   none.
 * - It fades and rises in over the look's slow step (`data-site-rise`,
 *   200ms, a fade alone under reduced motion).
 * - The two answers are outlines: neither is the page's one filled button.
 */
function LookConsentBanner({
    look,
    tools,
    noticeHref,
    onAccept,
    onReject,
    countsVisits,
}: {
    look: LookId;
    tools: readonly string[];
    noticeHref: string;
    onAccept: () => void;
    onReject: () => void;
    countsVisits: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const titleId = useId();
    const textId = useId();
    const [dock, setDock] = useState<ConsentDock>("bottom");

    useEffect(() => {
        const el = ref.current;
        const root = document.documentElement;
        if (!el) return;
        let frame = 0;
        const place = () => {
            frame = 0;
            const box = el.getBoundingClientRect();
            const next = consentDock({
                viewport: window.innerHeight,
                height: el.offsetHeight,
                left: box.left,
                right: box.right,
                targets: heroTargets(document).map((t) =>
                    t.getBoundingClientRect(),
                ),
            });
            setDock(next);
            root.style.setProperty(
                SITE_CONSENT_OFFSET,
                next === "bottom" ? `${el.offsetHeight + DOCK_INSET}px` : "0px",
            );
        };
        const soon = () => {
            if (!frame) frame = requestAnimationFrame(place);
        };
        place();
        const watch =
            typeof ResizeObserver === "undefined"
                ? null
                : new ResizeObserver(soon);
        watch?.observe(el);
        window.addEventListener("scroll", soon, { passive: true });
        window.addEventListener("resize", soon);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            watch?.disconnect();
            window.removeEventListener("scroll", soon);
            window.removeEventListener("resize", soon);
            root.style.removeProperty(SITE_CONSENT_OFFSET);
        };
    }, []);

    const style = LOOK_BANNER[look];
    const answer = frontButton(look, "outline", "w-full");

    return (
        <div
            ref={ref}
            role="region"
            aria-labelledby={titleId}
            aria-describedby={textId}
            data-site-consent=""
            data-site-consent-dock={dock}
            data-site-rise=""
            className={cn(
                "font-site-body text-site-body fixed inset-x-3 z-50 grid gap-4",
                dock === "bottom"
                    ? "bottom-[calc(12px+env(safe-area-inset-bottom))] min-[700px]:bottom-10"
                    : "top-3",
                style.box,
            )}
        >
            <p id={titleId} className={style.title}>
                Cookies on this site
            </p>
            <p
                id={textId}
                className="text-[14.5px] leading-[1.55] [text-wrap:pretty]"
            >
                {lookConsentWords(tools, countsVisits)}{" "}
                <a
                    href={noticeHref}
                    className={cn(
                        "text-site-fg rounded-sm font-semibold underline underline-offset-2 hover:no-underline",
                        focusRing,
                    )}
                >
                    Cookie notice
                </a>
            </p>
            <div className="grid grid-cols-2 gap-2.5">
                <button type="button" className={answer} onClick={onReject}>
                    Reject
                </button>
                <button type="button" className={answer} onClick={onAccept}>
                    Accept
                </button>
            </div>
        </div>
    );
}

/** "Google Analytics", "Google Analytics and Clarity", "A, B and C". */
export function listOf(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? "analytics tools";
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

/**
 * "Cookie choices" in the footer: reopens the banner so a visitor can
 * change their mind. Drawn only while the site has a tracker that asks.
 */
export function CookieChoicesButton({
    className = "",
}: {
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={() =>
                window.dispatchEvent(new Event(SITE_CONSENT_OPEN_EVENT))
            }
            className={cn(
                "focus-visible:ring-site-footer-fg cursor-pointer rounded-sm underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2",
                className,
            )}
        >
            Cookie choices
        </button>
    );
}
