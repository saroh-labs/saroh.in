"use client";

import { useEffect, useId, useRef } from "react";

import { focusRing } from "./booking-flow/styles";
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
}: {
    /** The tools' names, as the visitor would know them. */
    tools: readonly string[];
    /** The merchant's privacy page, or the site's generated notice. */
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
