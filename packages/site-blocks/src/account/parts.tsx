import Link from "next/link";
import type { ReactNode } from "react";

import { focusRing, quietFill } from "../booking-flow/styles";
import { cn } from "../lib/utils";

/**
 * The account area's cards, rows, tags and buttons (round-2 plan A, A5;
 * the look DEC-142 gave them): a card per subject, rows with a title, a
 * line under it and a tag, and the actions beside the row from tablet width
 * up, under it on a phone. Drawn from the site's own tokens only (H1): the
 * merchant's accent, ground, corner and type scale, never Saroh's.
 *
 * Every control has a designed hover, focus and pressed state, and is 44px
 * tall where a finger presses it. Motion is a short opacity, colour or
 * 1px shift, and none at all for someone who asked for less.
 */

/**
 * One easing and one length for every control here: the site's own curve
 * (`--site-ease`, the craft layer's, `site-craft.ts`), so the account moves
 * as the rest of the business's site does.
 */
const MOTION =
    "transition-[background-color,border-color,opacity,transform] duration-150 ease-[var(--site-ease,cubic-bezier(0.2,0.8,0.2,1))] motion-reduce:transition-none motion-reduce:active:translate-y-0";

/** A card's or page's heading size, on the site's own scale. */
const TITLE =
    "font-site-heading text-site-fg m-0 text-[calc(1.0625rem*var(--site-heading-scale,1))] font-semibold leading-snug tracking-[-0.01em] [text-wrap:balance]";

export function AccountCard({
    title,
    sub,
    lead,
    children,
    actions,
    labelledBy,
    id,
    needsYou = false,
    className,
}: {
    title: string;
    /** Small text to the right of the title ("3", "Nothing booked"). */
    sub?: string;
    /** A sentence under the title: the empty state or what the card is for. */
    lead?: ReactNode;
    children?: ReactNode;
    actions?: ReactNode;
    labelledBy: string;
    /** An anchor other pages link to. */
    id?: string;
    /**
     * Something here waits on the customer (an invoice to pay, a place held
     * for them): the accent runs down its edge, as on a chosen option.
     */
    needsYou?: boolean;
    className?: string;
}) {
    return (
        <section
            id={id}
            aria-labelledby={labelledBy}
            className={cn(
                "bg-site-surface border-site-border scroll-mt-24 rounded-[calc(var(--site-radius)+12px)] border p-4 md:p-5",
                needsYou
                    ? "shadow-[inset_3px_0_0_hsl(var(--site-accent))]"
                    : "shadow-[0_1px_2px_hsl(var(--site-fg)/0.06)]",
                className,
            )}
        >
            <div className="flex items-baseline gap-3">
                <h2 id={labelledBy} className={cn(TITLE, "min-w-0 flex-1")}>
                    {title}
                </h2>
                {sub ? (
                    <span className="text-site-body shrink-0 text-[13px] tabular-nums">
                        {sub}
                    </span>
                ) : null}
            </div>
            {lead ? (
                // The site's own body size (its type scale), held to 17px
                // so a card stays a card.
                <div className="text-site-body mt-1.5 max-w-[60ch] text-[length:min(var(--site-body-size,1rem),1.0625rem)] leading-normal [text-wrap:pretty]">
                    {lead}
                </div>
            ) : null}
            {children}
            {actions ? (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {actions}
                </div>
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
                "inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold leading-[1.35]",
                TONES[tone],
            )}
        >
            {children}
        </span>
    );
}

/** A link in running text or a row's title. */
export const textLink = cn(
    "text-site-fg cursor-pointer rounded-sm underline decoration-[hsl(var(--site-fg)/0.35)] decoration-1 underline-offset-[3px] hover:decoration-[hsl(var(--site-fg))] active:opacity-70",
    MOTION,
    focusRing,
);

export function AccountRow({
    title,
    href,
    sub,
    tag,
    actions,
}: {
    title: ReactNode;
    /** The thing's own page: the title links to it. */
    href?: string;
    sub?: ReactNode;
    tag?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <div className="border-site-border mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <span className="min-w-0">
                <span className="text-site-fg block text-[15px] font-semibold leading-snug">
                    {href ? (
                        <Link href={href} className={textLink}>
                            {title}
                        </Link>
                    ) : (
                        title
                    )}
                </span>
                {sub ? (
                    <span className="text-site-body mt-0.5 block text-[13.5px] leading-normal">
                        {sub}
                    </span>
                ) : null}
            </span>
            <span>{tag ?? null}</span>
            {actions ? (
                <span className="col-span-full flex flex-wrap gap-2 md:col-span-1 md:justify-end">
                    {actions}
                </span>
            ) : null}
        </div>
    );
}

/**
 * A card's main and secondary buttons: 44px, so a finger finds them. The
 * accent is for the one thing a card most wants done.
 */
export function buttonClasses(primary: boolean): string {
    return cn(
        "inline-flex h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-[calc(var(--site-radius)+8px)] px-4 text-[14px] font-semibold active:translate-y-px disabled:cursor-default disabled:opacity-60 disabled:active:translate-y-0",
        MOTION,
        focusRing,
        primary
            ? "bg-site-accent text-site-accent-fg hover:opacity-90 active:opacity-80"
            : "border-site-fg text-site-fg border bg-transparent hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_7%,transparent)] active:bg-[color-mix(in_srgb,hsl(var(--site-fg))_12%,transparent)]",
    );
}

/**
 * A row's button: 44px on a phone, 36px where a pointer presses it (from
 * tablet width up).
 */
export const smallButton = cn(
    "border-site-border bg-site-bg text-site-fg inline-flex h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-[calc(var(--site-radius)+6px)] border px-3.5 text-[13.5px] font-semibold hover:border-[hsl(var(--site-fg)/0.45)] hover:bg-[color-mix(in_srgb,hsl(var(--site-fg))_6%,hsl(var(--site-bg)))] active:translate-y-px active:bg-[color-mix(in_srgb,hsl(var(--site-fg))_11%,hsl(var(--site-bg)))] disabled:cursor-default disabled:opacity-60 disabled:active:translate-y-0 md:h-9 md:px-3",
    MOTION,
    focusRing,
);

/** A row's one main thing to do ("Pay now", "Book this place"). */
export const smallPrimaryButton = cn(
    "bg-site-accent text-site-accent-fg inline-flex h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-[calc(var(--site-radius)+6px)] px-3.5 text-[13.5px] font-semibold hover:opacity-90 active:translate-y-px active:opacity-80 disabled:cursor-default disabled:opacity-60 disabled:active:translate-y-0 md:h-9 md:px-3",
    MOTION,
    focusRing,
);

/** A read that failed: said plainly, never shown as zero or "none". */
export function Unavailable({ what }: { what: string }) {
    return (
        <p role="status" className="text-site-body mt-1.5 text-[15px]">
            {what} couldn't be loaded. Refresh the page to try again.
        </p>
    );
}

/** The way back from a thing's own page to its list ("← Orders"). */
export function BackLink({
    href,
    children,
}: {
    href: string;
    children: ReactNode;
}) {
    return (
        <Link
            href={href}
            className={cn(
                "text-site-fg -ml-1 inline-flex h-11 cursor-pointer items-center rounded-sm px-1 text-[14px] font-semibold underline-offset-[3px] hover:underline active:opacity-70 print:hidden",
                MOTION,
                focusRing,
            )}
        >
            <span aria-hidden="true">←&nbsp;</span>
            {children}
        </Link>
    );
}

// ---- Held layouts (loading) -------------------------------------------------

/** A bar standing in for a line of text while it loads. */
function HeldLine({ className }: { className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn(
                "block h-3.5 rounded-full bg-[color-mix(in_srgb,hsl(var(--site-fg))_9%,hsl(var(--site-surface)))]",
                className,
            )}
        />
    );
}

/**
 * A card held in place while its page loads: the card's own shape, a title
 * bar and as many rows as the page usually has, so nothing jumps when the
 * words arrive. Decorative: the page's `HeldPage` says what is loading.
 */
export function HeldCard({
    rows = 2,
    className,
}: {
    rows?: number;
    className?: string;
}) {
    return (
        <div
            aria-hidden="true"
            className={cn(
                "bg-site-surface border-site-border rounded-[calc(var(--site-radius)+12px)] border p-4 md:p-5",
                className,
            )}
        >
            <HeldLine className="h-4 w-2/5" />
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={i}
                    className="border-site-border mt-3 grid gap-2 border-t pt-3"
                >
                    <HeldLine className={i % 2 === 0 ? "w-3/4" : "w-3/5"} />
                    <HeldLine className="h-3 w-2/5" />
                </div>
            ))}
        </div>
    );
}

/**
 * A page of the account while it loads: said once to a screen reader
 * (`aria-busy`, a label), drawn as its held cards. The bars breathe, and
 * hold still for someone who asked for less motion.
 */
export function HeldPage({
    label,
    children,
    className,
}: {
    /** "Loading your orders". */
    label: string;
    children: ReactNode;
    /** The held cards' grid, where the page has columns. */
    className?: string;
}) {
    return (
        <div role="status" aria-busy="true">
            <span className="sr-only">{label}</span>
            <div
                className={cn(
                    "grid animate-pulse gap-3.5 motion-reduce:animate-none md:gap-4",
                    className,
                )}
            >
                {children}
            </div>
        </div>
    );
}
