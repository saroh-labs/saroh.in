import type { ReactNode } from "react";

/**
 * One of a person's holdings on their contact page, in the Leads section's
 * style: a quiet uppercase heading with its count, the panel's one action
 * beside it, then its rows.
 *
 * A read that failed says so in its own panel, and only there — the rest of
 * the page is still true. None says so in one line, next to the action that
 * would change it.
 */
export function ContactPanelSection({
    title,
    count,
    action,
    failed,
    empty,
    aside,
    children,
}: {
    title: string;
    /** Null while unknown: the read failed. */
    count: number | null;
    action?: ReactNode;
    /** What could not be read, as a sentence's subject ("Their class packs"). */
    failed: string;
    /** The one-line empty, used when `count` is 0. */
    empty: string;
    /** A line under the heading, such as what they owe. */
    aside?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <section className="overflow-hidden rounded-[12px] border border-border bg-card">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-muted px-4 py-[9px]">
                <h2 className="py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {title}
                    {count === null ? "" : ` · ${count}`}
                </h2>
                {action}
            </div>
            {aside}
            {count === null ? (
                <p
                    role="alert"
                    className="text-pretty px-4 py-3.5 text-[12.5px] leading-[1.5] text-muted-foreground"
                >
                    {failed} could not be loaded just now. Nothing has been
                    changed — reload the page to try again.
                </p>
            ) : count === 0 ? (
                <p className="text-pretty px-4 py-3.5 text-[12.5px] leading-[1.5] text-muted-foreground">
                    {empty}
                </p>
            ) : (
                children
            )}
        </section>
    );
}

/** A row's layout, matching the Leads rows. */
export const ROW_BODY =
    "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3";
/** A row's rule between rows. */
export const ROW_RULE = "border-b border-foreground/10 last:border-b-0";
export const ROW = `${ROW_BODY} ${ROW_RULE}`;
