import { cn } from "@/lib/cn";
import { ring } from "@/lib/ring";
import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

import { Arrow } from "./arrow";

const TONE = {
    brand: "text-brand-700 no-underline underline-offset-[3px] hover:text-brand-700 hover:underline active:text-foreground",
    quiet: "text-muted-foreground no-underline hover:text-foreground active:text-mk-copy",
    copy: "text-mk-copy no-underline hover:text-brand-700 active:text-foreground",
    prose: "text-brand-700 underline underline-offset-[3px] hover:text-foreground",
} as const;

export type TextLinkTone = keyof typeof TONE;

/**
 * A link in a line of text (DEC-195, V1). Not `@saroh/ui`'s `TextLink`: that
 * one is Ink-underlined by rule, the marketing design's is Saffron.
 *
 * - `brand` — Saffron 700, underlined on hover ("See Orders →"), the
 *   Resources look.
 * - `quiet` — Ink 500, Ink on hover: crumbs, the footer, "On this page".
 * - `copy` — body Ink, Saffron on hover: Help's article lists.
 * - `prose` — always underlined: a link inside a sentence.
 *
 * Size and weight come from the caller's `className`.
 */
export function textLinkClasses({
    tone = "brand",
    className,
}: { tone?: TextLinkTone; className?: string } = {}) {
    return cn(
        "cursor-pointer rounded-sm transition-colors duration-fast ease-out",
        TONE[tone],
        ring(),
        className,
    );
}

const isExternal = (href: string) => /^(https?:|mailto:|tel:)/.test(href);

export function TextLink({
    href,
    tone,
    arrow = false,
    className,
    children,
    ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: string;
    tone?: TextLinkTone;
    /** Adds the "→" after the words. */
    arrow?: boolean;
    children: ReactNode;
}) {
    const classes = textLinkClasses({ tone, className });
    const content = (
        <>
            {children}
            {arrow ? <Arrow /> : null}
        </>
    );
    return isExternal(href) ? (
        <a href={href} className={classes} {...props}>
            {content}
        </a>
    ) : (
        <Link href={href} className={classes} {...props}>
            {content}
        </Link>
    );
}
