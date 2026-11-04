"use client";

import type { LookId } from "@saroh/block-contract";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import { ctaClasses } from "./cta";
import { frontButton } from "./look-front";

/**
 * A block whose read failed on the server (`feed.failed`): the read is not
 * "none" (`frontend-data-and-state.md`), so the section stays and says so,
 * with its own title and a way to ask again. The page that drew this is
 * never kept (`dontCachePage`), so loading it again reads afresh. Drawn from
 * `--site-*` only.
 */
export function FeedFailed({
    title,
    things,
    look,
}: {
    title: string;
    /** What couldn't be read, as in "We couldn't load our plans". */
    things: string;
    look?: LookId;
}) {
    return (
        <section
            data-feed-failed=""
            className="text-site-fg mx-auto w-full max-w-screen-xl px-5 py-[var(--site-section-padding)] sm:px-[var(--site-page-margin)]"
        >
            <h2
                data-site-title=""
                className="font-site-heading text-[calc(1.5rem*var(--site-heading-scale))] font-semibold tracking-tight"
            >
                {title}
            </h2>
            <p role="alert" className={cn(destructiveAlertClasses, "mt-4")}>
                We couldn&apos;t load {things} right now.
            </p>
            <button
                type="button"
                onClick={() => window.location.reload()}
                className={
                    look
                        ? frontButton(look, "outline", "mt-3")
                        : cn(ctaClasses("secondary"), "mt-3")
                }
            >
                Try again
            </button>
        </section>
    );
}
