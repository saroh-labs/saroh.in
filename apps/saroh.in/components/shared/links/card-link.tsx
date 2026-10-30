import { cn } from "@/lib/cn";
import { ring } from "@/lib/ring";
import Link from "next/link";
import type { ReactNode } from "react";

import { Arrow } from "./arrow";

/** The link card's hover (DEC-195, V5): an Ink border and the lift shadow. */
const HOVER =
    "transition-[border-color,box-shadow] duration-base ease-out hover:border-foreground hover:text-foreground hover:shadow-mk-lift";

/** The same hover on a card's frame inside a `group` link (a template's browser frame). */
export const CARD_GROUP_HOVER =
    "transition-[border-color,box-shadow] duration-base ease-out group-hover:border-foreground group-hover:shadow-mk-lift";

/**
 * A white card that is one link, for a card that draws its own inside (the
 * integrations, Contact's side cards, Previous / Next): the frame, the hover
 * and the ring. `className` adds its padding and gap.
 */
export function cardLinkClasses(className?: string) {
    return cn(
        "grid cursor-pointer content-start rounded-mk-card border border-border bg-card text-foreground no-underline",
        HOVER,
        ring(),
        className,
    );
}

/**
 * A white card that is one link: Home's "Eight parts" grid and Solutions
 * cards, a feature page's "Works with". Title in Space Grotesk, body, an
 * optional muted meta line, then the Saffron 700 "See … →".
 *
 * - `md` — 22px padding, 21px title (feature cards).
 * - `lg` — 24px padding, 22px title (solution cards, with `meta`).
 */
export function CardLink({
    href,
    title,
    body,
    meta,
    action,
    size = "md",
    className,
}: {
    href: string;
    title: ReactNode;
    body: ReactNode;
    meta?: ReactNode;
    /** Defaults to "See {title}". */
    action?: ReactNode;
    size?: "md" | "lg";
    className?: string;
}) {
    return (
        <Link
            href={href}
            className={cardLinkClasses(
                cn("gap-2", size === "md" ? "p-[22px]" : "p-6", className),
            )}
        >
            <span
                className={cn(
                    "font-display font-bold",
                    size === "md" ? "text-mk-card" : "text-mk-card-lg",
                )}
            >
                {title}
            </span>
            <span className="text-mk-card-body text-mk-copy [text-wrap:pretty]">
                {body}
            </span>
            {meta ? (
                <span className="text-mk-note text-muted-foreground">
                    {meta}
                </span>
            ) : null}
            <span
                className={cn(
                    "text-mk-nav font-semibold text-brand-700",
                    size === "md" ? "mt-1" : "mt-1.5",
                )}
            >
                {action ?? <>See {title}</>}
                <Arrow />
            </span>
        </Link>
    );
}
