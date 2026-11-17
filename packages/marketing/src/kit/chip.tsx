import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { ring } from "../ring";

/**
 * The kit's four chips (KIT.md), all pill-shaped and 36px tall, with a
 * 44px tap area on a touch screen:
 *
 * - `filter` — outline; Ink when `on` (the hub's "Food and shops 7").
 * - `chapter` — outline; the chapter you are in is Ink (a long page's
 *   jump links, `on` marks it).
 * - `source` — Paper fill with a coloured dot: a part of the business an
 *   answer read (`SourceChips`, "Read from").
 * - `plan` — plain meta text, not a pill: plan pills read as buttons.
 * - `ink` — the `filter` chip on an Ink band: outline in the band's line,
 *   Paper when `on` (a closing band's picks).
 *
 * With `href` it is a link, with `onClick` a toggle button (`aria-pressed`
 * from `on`), otherwise words. `count` sits after the label in mono.
 */
export type ChipVariant = "filter" | "chapter" | "source" | "plan" | "ink";

const BASE =
    "inline-flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[14px] font-medium leading-none no-underline transition-[background-color,border-color,color] duration-fast ease-out [@media(pointer:coarse)]:min-h-11";

const LOOK: Record<ChipVariant, { off: string; on: string }> = {
    filter: {
        off: "border border-border-strong bg-card text-foreground hover:border-foreground",
        on: "border border-foreground bg-foreground text-background",
    },
    chapter: {
        off: "border border-border-strong bg-card text-foreground hover:border-foreground",
        on: "border border-foreground bg-foreground text-background",
    },
    source: {
        off: "border border-border bg-background text-foreground",
        on: "border border-border bg-background text-foreground",
    },
    plan: {
        off: "min-h-0 rounded-none px-0 text-mk-note font-normal text-muted-foreground [@media(pointer:coarse)]:min-h-0",
        on: "min-h-0 rounded-none px-0 text-mk-note font-semibold text-foreground [@media(pointer:coarse)]:min-h-0",
    },
    ink: {
        off: "border border-mk-on-ink-line bg-transparent text-mk-on-ink hover:border-mk-on-ink",
        // Dark text named by its value: an Ink section rewrites `text-foreground`.
        on: "border border-background bg-background text-[hsl(var(--foreground))]",
    },
};

export function chipClasses({
    variant = "filter",
    on = false,
    className,
}: {
    variant?: ChipVariant;
    on?: boolean;
    className?: string;
} = {}) {
    const look = LOOK[variant][on ? "on" : "off"];
    return cn(
        BASE,
        look,
        variant === "ink" ? ring({ offset: 3, color: "paper" }) : ring(),
        className,
    );
}

export function Chip({
    variant = "filter",
    on = false,
    href,
    onClick,
    count,
    dot,
    className,
    children,
}: {
    variant?: ChipVariant;
    on?: boolean;
    href?: string;
    onClick?: () => void;
    /** After the label in mono: "All 34". */
    count?: number;
    /** A `source` chip's dot, as a CSS colour. */
    dot?: string;
    className?: string;
    children: ReactNode;
}) {
    const classes = chipClasses({
        variant,
        on,
        className: cn(
            (href !== undefined || onClick !== undefined) &&
                variant !== "plan" &&
                "cursor-pointer",
            className,
        ),
    });
    const content = (
        <>
            {variant === "source" ? (
                <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: dot ?? "hsl(var(--brand-500))" }}
                />
            ) : null}
            {children}
            {count !== undefined ? (
                <span
                    className={cn(
                        "font-mono text-[13px]",
                        on ? "text-background/80" : "text-muted-foreground",
                    )}
                >
                    {count}
                </span>
            ) : null}
        </>
    );
    if (href) {
        return (
            <Link
                href={href}
                aria-current={on && variant === "chapter" ? "true" : undefined}
                className={classes}
            >
                {content}
            </Link>
        );
    }
    if (onClick) {
        return (
            <button
                type="button"
                aria-pressed={on}
                onClick={onClick}
                className={classes}
            >
                {content}
            </button>
        );
    }
    return <span className={classes}>{content}</span>;
}

/** One part of the business an answer read. */
export interface Source {
    name: string;
    /** Its screen or its "how it works" page. */
    href?: string;
    /** The dot's colour; Saffron when unset. */
    dot?: string;
}

/**
 * "Read from" and the parts an answer read, as `source` chips (KIT.md: one
 * component wherever Ask AI's sources show). `label` stays "Read from".
 */
export function SourceChips({
    sources,
    label = "Read from",
    className,
}: {
    sources: readonly Source[];
    label?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-2 text-mk-note text-muted-foreground",
                className,
            )}
        >
            <span>{label}</span>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {sources.map((s) => (
                    <li key={s.name}>
                        <Chip variant="source" href={s.href} dot={s.dot}>
                            {s.name}
                        </Chip>
                    </li>
                ))}
            </ul>
        </div>
    );
}
