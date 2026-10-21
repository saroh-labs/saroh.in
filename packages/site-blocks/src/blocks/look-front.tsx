import type { LookId, RenderedCta } from "@saroh/block-contract";
import Link from "next/link";

import { cn } from "../lib/utils";

/**
 * What the front-door blocks share under a look (DEC-172, plan U6, #1094):
 * the hero, services, people, proof and the closing band of a home or
 * About page, drawn as each look's fixed board draws them (VA01, VD01 and
 * VB01 Home; VA04, VD04 and VB04 About; desk and phone).
 *
 * Only a look's blocks read this. Classic (no look) draws exactly as it
 * did; the `classic-pin` snapshots hold that.
 *
 * The rules every block here keeps (the audits' fix rules):
 * - ONE FILLED BUTTON PER VIEW. A block's own main action is filled and
 *   marked `data-site-primary`, which the chrome's controller reads
 *   (`sticky-actions.tsx`); every other button in it is an outline or a
 *   quiet edge.
 * - 44px TARGETS on every pointer.
 * - Corners from the look's tokens: `rounded-site` for buttons only (a
 *   pill under Quiet), `rounded-site-s` for cards and small things,
 *   `rounded-site-photo` for photographs.
 * - Phone and desk differ by `max-[699px]:` and `min-[700px]:` classes,
 *   never by a width read in script.
 * - Drawn from `--site-*` only (gates G2 and G7).
 */

/** A ring every look's blocks share: the page's ink, 2px, set off. */
export const FRONT_RING =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-fg focus-visible:ring-offset-2 focus-visible:ring-offset-site-bg";

/** Colour changes over the look's base step (140ms), never longer. */
const EASE =
    "transition-[color,background-color,border-color,opacity] duration-[var(--site-motion-base,140ms)] [transition-timing-function:var(--site-ease,ease-out)]";

/** The page column a look's section keeps, with its margins. */
export const FRONT_WRAP =
    "mx-auto w-full max-w-site-content px-[var(--site-page-margin,20px)]";

/**
 * The type each look sets, as its boards draw it (phone, then desk from
 * 700px). Sizes are the boards'; the merchant's heading scale still moves
 * every heading, as it does on Classic.
 */
export const FRONT_TYPE: Record<
    LookId,
    {
        /** A section's heading. */
        h2: string;
        /** A row's or a person's name. */
        name: string;
        /** The small capitals over a group. */
        eyebrow: string;
        /** A row's quieter line. */
        meta: string;
        /** A price on a row. */
        price: string;
    }
> = {
    folio: {
        h2: "font-site-heading text-[calc(34px*var(--site-heading-scale,1))] font-light leading-[1.06] tracking-[-0.03em] text-site-fg [text-wrap:balance] min-[700px]:text-[calc(56px*var(--site-heading-scale,1))] min-[700px]:leading-[1.02]",
        name: "font-site-heading text-[calc(20px*var(--site-heading-scale,1))] font-light leading-[1.2] tracking-[-0.01em] text-site-fg min-[700px]:text-[calc(24px*var(--site-heading-scale,1))]",
        eyebrow:
            "text-[12px] font-semibold uppercase tracking-[0.18em] text-site-muted",
        meta: "text-[14px] leading-[1.55] text-site-muted",
        price: "font-semibold tabular-nums whitespace-nowrap text-site-fg",
    },
    quiet: {
        h2: "font-site-heading text-[calc(36px*var(--site-heading-scale,1))] font-normal leading-[1.1] text-site-fg [text-wrap:balance] [font-variant-numeric:lining-nums] min-[700px]:text-[calc(56px*var(--site-heading-scale,1))] min-[700px]:font-light min-[700px]:leading-[1.05] min-[700px]:tracking-[-0.01em]",
        name: "font-site-heading text-[calc(23px*var(--site-heading-scale,1))] font-normal leading-[1.2] text-site-fg [font-variant-numeric:lining-nums] min-[700px]:text-[calc(28px*var(--site-heading-scale,1))]",
        eyebrow:
            "text-[12px] font-medium uppercase tracking-[0.22em] text-site-muted",
        meta: "text-[14.5px] leading-[1.55] text-site-muted",
        price: "font-medium tabular-nums whitespace-nowrap text-site-fg",
    },
    live: {
        h2: "font-site-heading text-[calc(32px*var(--site-heading-scale,1))] font-extrabold leading-none tracking-[-0.03em] text-site-fg [font-stretch:80%] [text-wrap:balance] min-[700px]:text-[calc(40px*var(--site-heading-scale,1))]",
        name: "text-[16px] font-bold leading-snug text-site-fg",
        eyebrow: "text-[13px] font-bold tracking-[0.02em] text-site-muted",
        meta: "text-[14px] leading-[1.45] text-site-muted",
        price: "font-bold tabular-nums whitespace-nowrap text-site-fg",
    },
};

/** How a look's button is drawn: the one filled, or a quieter one. */
export type FrontButtonKind = "fill" | "outline" | "quiet" | "link";

const BUTTON_BASE =
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-site active:opacity-80 aria-disabled:pointer-events-none aria-disabled:opacity-55";

const BUTTON: Record<LookId, Record<FrontButtonKind, string>> = {
    // VA01: square, the accent filled for the action, an ink or a control
    // edge for the rest; a link is ink underlined.
    folio: {
        fill: "min-h-[52px] border border-site-accent bg-site-accent px-[26px] text-[15px] font-semibold tracking-[0.02em] text-site-accent-fg hover:opacity-90",
        outline:
            "border border-site-fg bg-transparent px-[18px] text-[14px] font-semibold tracking-[0.02em] text-site-fg hover:bg-site-fg/5",
        quiet: "border border-site-rule bg-transparent px-[18px] text-[14px] font-semibold tracking-[0.02em] text-site-fg hover:border-site-fg",
        link: "min-w-11 px-0 text-[15px] font-semibold text-site-fg underline decoration-1 underline-offset-[5px] hover:decoration-2",
    },
    // VD01: pills; the action in the accent, an ink edge for an outline,
    // the control edge for a quiet one.
    quiet: {
        fill: "min-h-[52px] border border-site-accent bg-site-accent px-[30px] text-[15px] font-medium tracking-[0.02em] text-site-accent-fg hover:opacity-90",
        outline:
            "border border-site-fg bg-transparent px-5 text-[14.5px] font-medium tracking-[0.02em] text-site-fg hover:bg-site-fg/5",
        quiet: "border border-site-rule bg-transparent px-5 text-[14.5px] font-medium tracking-[0.02em] text-site-fg hover:border-site-fg",
        link: "min-w-11 px-0 text-[15px] font-medium text-site-fg underline decoration-site-rule decoration-1 underline-offset-[5px] hover:decoration-current",
    },
    // VB01: bold; the action large in the accent, a white button with a
    // control edge, a soft one on a card.
    live: {
        fill: "min-h-[58px] bg-site-accent px-[26px] text-[17px] font-bold text-site-accent-fg hover:opacity-90",
        outline:
            "border-[1.5px] border-site-rule bg-site-surface px-4 text-[14.5px] font-bold text-site-fg hover:border-site-fg",
        quiet: "bg-site-bg px-4 text-[14.5px] font-bold text-site-fg hover:bg-site-border",
        link: "min-w-11 px-0 text-[15px] font-bold text-site-fg underline decoration-[1.5px] underline-offset-[3px]",
    },
};

/** A look's button classes, with the shared ring and colour change. */
export function frontButton(
    look: LookId,
    kind: FrontButtonKind,
    className?: string,
): string {
    return cn(BUTTON_BASE, BUTTON[look][kind], FRONT_RING, EASE, className);
}

/** True for anything that is not a route in this app (as `CtaButton`). */
function isExternal(href: string): boolean {
    return /^(https?:)?\/\//i.test(href) || /^(mailto|tel|sms):/i.test(href);
}

/** The kind a merchant's button style is drawn as under a look. */
export function ctaKind(style: RenderedCta["style"]): FrontButtonKind {
    if (style === "secondary") return "outline";
    if (style === "link") return "link";
    return "fill";
}

/**
 * A block's button under a look: the merchant's words and address, in the
 * look's shape. A `primary` one is the block's main action: filled, and
 * marked `data-site-primary` so the header's Book stays an outline while
 * it is on screen. A secondary or link style is never the main action.
 *
 * A button whose page was hidden after it was set draws its words and goes
 * nowhere, as `CtaButton` does.
 */
export function FrontCta({
    content,
    look,
    className,
}: {
    content: RenderedCta;
    look: LookId;
    className?: string;
}) {
    const kind = ctaKind(content.style);
    const classes = frontButton(look, kind, className);
    const primary = kind === "fill" ? { "data-site-primary": "" } : {};
    const href = content.href.trim();
    if (href === "") {
        return (
            <span role="link" aria-disabled="true" className={classes}>
                {content.label}
            </span>
        );
    }
    if (isExternal(href)) {
        return (
            <a
                href={href}
                rel="noopener noreferrer"
                className={classes}
                {...primary}
            >
                {content.label}
            </a>
        );
    }
    return (
        <Link href={href} className={classes} {...primary}>
            {content.label}
        </Link>
    );
}

/**
 * Up to two initials for a name, for a person who has no photo (Phase 1:
 * staff have a name and a title only). "Dr Anika Rao" is "AR": a title
 * before the name is not an initial.
 */
export function initialsOf(name: string): string {
    const words = name
        .split(/\s+/)
        .filter((w) => !/^(dr|mr|mrs|ms|miss|prof)\.?$/i.test(w))
        .map(firstLetter)
        .filter((c) => c !== "");
    if (words.length === 0) return "";
    const last = words.length > 1 ? words[words.length - 1] : "";
    return (words[0] + last).toLocaleUpperCase();
}

/**
 * A word's first character that isn't punctuation, whatever the script
 * (a Devanagari name has no capitals to look for); "" for none.
 */
function firstLetter(word: string): string {
    return (
        Array.from(word).find(
            (c) => !/[\s.,;:'"()[\]{}\-–—·&/\\!?*_+=@#%^`~|<>]/.test(c),
        ) ?? ""
    );
}

/** Something a merchant actually wrote, or null for blank. */
export function said(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === "" ? null : trimmed;
}

/**
 * The hero's way in beside its button (U6): the booking page, where the
 * next free time will show (U8 fills it in the browser), or the shop's
 * entry for a site that sells but takes no bookings. None for a site that
 * does neither: its own button is the way in.
 */
export type FrontDoor =
    { kind: "book"; href: string } | { kind: "shop"; href: string };

/**
 * One proof line for the first screen: the first quote of the page's own
 * testimonials, as the owner wrote it (it stands in for service reviews
 * until Phase 2). Never composed: a page without testimonials has none.
 */
export interface PageProof {
    quote: string;
    name: string;
}
