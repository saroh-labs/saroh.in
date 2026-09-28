import type { ReactNode } from "react";

import { focusRing, quietFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";

/**
 * The account area's cards, rows, tags and buttons (round-2 plan A, A5), as
 * the Customer Site design draws them: a card per subject, rows with a
 * title, a line under it and a tag, and the actions at the card's foot.
 * Drawn from the site's own tokens only (H1): the merchant's accent, ground
 * and type, never Saroh's.
 */

export function AccountCard({
    title,
    sub,
    lead,
    children,
    actions,
    labelledBy,
}: {
    title: string;
    /** Small text to the right of the title ("3", "Nothing booked"). */
    sub?: string;
    /** A sentence under the title: the empty state or what the card is for. */
    lead?: ReactNode;
    children?: ReactNode;
    actions?: ReactNode;
    labelledBy: string;
}) {
    return (
        <section
            aria-labelledby={labelledBy}
            className="bg-site-surface border-site-border rounded-[calc(var(--site-radius)+14px)] border p-4"
        >
            <div className="flex items-baseline gap-2">
                <h2
                    id={labelledBy}
                    className="font-site-heading text-site-fg m-0 flex-1 text-[17px] font-semibold tracking-[-0.01em]"
                >
                    {title}
                </h2>
                {sub ? (
                    <span className="text-site-muted text-[12.5px]">{sub}</span>
                ) : null}
            </div>
            {lead ? (
                <div className="text-site-body mt-1.5 text-sm leading-normal">
                    {lead}
                </div>
            ) : null}
            {children}
            {actions ? (
                <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
            ) : null}
        </section>
    );
}

export type Tone = "quiet" | "accent";

const TONES: Record<Tone, string> = {
    quiet: cn(quietFill, "text-site-fg"),
    accent: "bg-site-accent text-site-accent-fg",
};

/**
 * A small status tag, an opaque fill with its own foreground. In the
 * merchant's own two: the accent for what is live or on its way, a quiet
 * fill for the rest. The design's green and red are Saroh's colours, which a
 * merchant's page never wears (G2).
 */
export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
    return (
        <span
            className={cn(
                "whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11.5px] font-bold",
                TONES[tone],
            )}
        >
            {children}
        </span>
    );
}

export function AccountRow({
    title,
    sub,
    tag,
    actions,
}: {
    title: ReactNode;
    sub?: ReactNode;
    tag?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="border-site-border mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1 border-t py-[11px]">
            <span className="min-w-0">
                <span className="text-site-fg block text-[14.5px] font-semibold">
                    {title}
                </span>
                {sub ? (
                    <span className="text-site-muted mt-0.5 block text-[12.5px]">
                        {sub}
                    </span>
                ) : null}
            </span>
            <span>{tag ?? null}</span>
            {actions ? (
                <span className="col-span-full mt-1 flex flex-wrap gap-1.5">
                    {actions}
                </span>
            ) : null}
        </div>
    );
}

/** The card's main and secondary buttons (the design's 38px buttons). */
export function buttonClasses(primary: boolean): string {
    return cn(
        "inline-flex h-[38px] cursor-pointer items-center whitespace-nowrap rounded-[calc(var(--site-radius)+8px)] px-3.5 text-[13.5px] font-bold transition-opacity active:opacity-80 disabled:cursor-default disabled:opacity-60",
        focusRing,
        primary
            ? "bg-site-accent text-site-accent-fg hover:opacity-90"
            : "border-site-fg text-site-fg border bg-transparent hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,transparent)]",
    );
}

/** A row's small button (the design's 32px buttons). */
export const smallButton = cn(
    "border-site-border bg-site-bg text-site-fg inline-flex h-8 cursor-pointer items-center rounded-[calc(var(--site-radius)+6px)] border px-[11px] text-[12.5px] font-semibold transition-colors hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,hsl(var(--site-bg)))] active:opacity-80 disabled:cursor-default disabled:opacity-60",
    focusRing,
);

/** A read that failed: said plainly, never shown as zero or "none". */
export function Unavailable({ what }: { what: string }) {
    return (
        <p role="status" className="text-site-body mt-1.5 text-sm">
            {what} couldn't be loaded. Refresh the page to try again.
        </p>
    );
}
