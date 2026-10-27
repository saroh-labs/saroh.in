import { cn } from "@/lib/cn";
import type { ElementType, HTMLAttributes } from "react";

const TONE = {
    brand: "text-brand-700",
    muted: "text-muted-foreground",
    "on-ink": "text-mk-on-ink-muted",
} as const;

const SIZE = {
    /** 13px at 0.12em: a section's eyebrow. */
    md: "text-mk-eyebrow",
    /** 11px at 0.1em: a side column's group ("On this page"). */
    sm: "text-[11px] tracking-[0.1em]",
} as const;

/**
 * The small caps label (DEC-195, V12): Geist 600, uppercase.
 *
 * - `tone` — `brand` (Saffron 700, the design's eyebrow), `muted` (Ink 500:
 *   a group's label), `on-ink` (on an Ink band).
 * - `size` — `md` (13px) or `sm` (11px).
 */
export function eyebrowClasses({
    tone = "brand",
    size = "md",
    className,
}: {
    tone?: keyof typeof TONE;
    size?: keyof typeof SIZE;
    className?: string;
} = {}) {
    return cn(
        "font-sans font-semibold uppercase",
        SIZE[size],
        TONE[tone],
        className,
    );
}

export function Eyebrow({
    as: Tag = "div",
    tone,
    size,
    className,
    ...props
}: HTMLAttributes<HTMLElement> & {
    as?: ElementType;
    tone?: keyof typeof TONE;
    size?: keyof typeof SIZE;
}) {
    return (
        <Tag className={eyebrowClasses({ tone, size, className })} {...props} />
    );
}
