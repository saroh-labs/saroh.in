import type { LookId } from "@saroh/block-contract";
import type { ReactNode } from "react";

import { frontButton } from "../blocks/look-front";
import { focusRing } from "../booking-flow/styles";
import { cn } from "../lib/utils";
import type { BusinessReach } from "../reach-links";
import { ReachLinks } from "../reach-links";
import { LOOK_PAGE } from "../site-page-message";

/**
 * A whole page that has nothing to show: the shop or the booking page when
 * its read failed, a shop with nothing on sale yet.
 *
 * One look for all of them, in the site's own palette: a short rule in the
 * accent, what happened as the page's heading, one sentence, then the ways
 * on. A failed read offers "Try again" (the page's own address, asked for
 * afresh) and the business's phone and WhatsApp when the site shows them;
 * an empty page offers only the ways to reach the business. Nothing here
 * can be pressed that cannot work.
 *
 * `failed` is announced (`role="alert"`): "we could not find out" is not
 * "there is nothing", and a screen reader hears the difference as a sighted
 * visitor reads it. No `"use client"`: a server page draws it.
 */

/** The page-state's main button: the accent, 44px, the site's radius. */
export const stateButton = cn(
    "bg-site-accent text-site-accent-fg inline-flex min-h-11 cursor-pointer items-center justify-center rounded-[calc(var(--site-radius)+8px)] px-5 text-[15px] font-semibold transition-[opacity,transform] duration-100 ease-out hover:opacity-90 active:scale-[0.98]",
    focusRing,
);

export function SitePageState({
    title,
    children,
    failed = false,
    retryHref = null,
    reach = null,
    action = null,
    look,
}: {
    title: string;
    /** The one sentence under the heading. */
    children: ReactNode;
    /** A read that failed, rather than a page with nothing on it. */
    failed?: boolean;
    /** Where "Try again" asks again: the page's own address. */
    retryHref?: string | null;
    /** A call and a message, when the site shows them. */
    reach?: BusinessReach | null;
    /** Another way on, drawn after "Try again". */
    action?: ReactNode;
    /**
     * Folio, Quiet or Live (DEC-172, U15; the boards' 27 and 28): the
     * same words and ways in the look's type, "Try again" its one filled
     * button. Absent is Classic, drawn exactly as before.
     */
    look?: LookId;
}) {
    if (look) {
        const type = LOOK_PAGE[look];
        return (
            <div className="bg-site-bg max-w-site-content mx-auto w-full px-[var(--site-page-margin,20px)] pb-16 pt-14 min-[700px]:pb-32 min-[700px]:pt-24">
                <div
                    data-page-state={failed ? "failed" : "empty"}
                    data-site-state-look={look}
                    role={failed ? "alert" : undefined}
                    className="grid max-w-[36rem] gap-4"
                >
                    <h1 className={type.title}>{title}</h1>
                    <p className={cn("max-w-[52ch]", type.lead)}>{children}</p>
                    {retryHref || action ? (
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
                            {retryHref ? (
                                <a
                                    href={retryHref}
                                    data-site-primary=""
                                    className={frontButton(look, "fill")}
                                >
                                    Try again
                                </a>
                            ) : null}
                            {action}
                        </div>
                    ) : null}
                    <ReachLinks reach={reach} />
                </div>
            </div>
        );
    }
    return (
        <div className="bg-site-bg max-w-site-content mx-auto w-full px-5 py-16 sm:px-[var(--site-page-margin)] sm:py-24">
            <div
                data-page-state={failed ? "failed" : "empty"}
                role={failed ? "alert" : undefined}
                className="max-w-[34rem]"
            >
                <span
                    aria-hidden="true"
                    className="bg-site-accent block h-0.5 w-10"
                />
                <h1 className="font-site-heading text-site-fg mt-5 text-[calc(clamp(1.625rem,5vw,2.125rem)*var(--site-heading-scale,1))] font-semibold leading-[1.12] tracking-[-0.025em] [text-wrap:balance]">
                    {title}
                </h1>
                <p className="text-site-body mt-3 text-base leading-[1.6] [text-wrap:pretty]">
                    {children}
                </p>
                {retryHref || action ? (
                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        {retryHref ? (
                            // A plain link, so the page is asked for again
                            // from the server, never redrawn from memory.
                            <a href={retryHref} className={stateButton}>
                                Try again
                            </a>
                        ) : null}
                        {action}
                    </div>
                ) : null}
                <ReachLinks reach={reach} className="mt-4" />
            </div>
        </div>
    );
}
