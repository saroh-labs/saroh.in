import { cn } from "@/lib/cn";
import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
    /** Ink, the page's main action. */
    | "primary"
    /** Outlined, on Paper or white. */
    | "secondary"
    /** Saffron, the main action on a dark (Ink) band. */
    | "saffron"
    /** Outlined, on a dark (Ink) band. */
    | "secondary-on-ink";

/**
 * - `lg` — 52px, the hero and CTA band buttons.
 * - `md` — 46px, full width, the plan cards.
 * - `sm` — 40px, the nav's start button.
 */
export type ButtonSize = "lg" | "md" | "sm";

const BASE =
    "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-semibold no-underline transition-[background-color,color,transform] duration-fast ease-out active:scale-[0.97] focus-visible:[outline-style:solid] focus-visible:outline-2";

const VARIANT: Record<ButtonVariant, string> = {
    primary:
        "bg-foreground text-background hover:bg-mk-ink-hover hover:text-background focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    secondary:
        "border border-border-strong text-foreground hover:bg-mk-hover hover:text-foreground focus-visible:outline-offset-2 focus-visible:outline-brand-500",
    saffron:
        "bg-mk-saffron text-foreground hover:bg-mk-saffron-hover hover:text-foreground focus-visible:outline-offset-2 focus-visible:outline-background",
    "secondary-on-ink":
        "border border-mk-on-ink-line text-background hover:bg-mk-on-ink-hover hover:text-background focus-visible:outline-offset-2 focus-visible:outline-background",
};

const SIZE: Record<ButtonSize, string> = {
    lg: "h-[52px] gap-2.5 rounded-mk-btn px-6 text-base",
    md: "h-[46px] w-full gap-2 rounded-[11px] px-4 text-[15px]",
    sm: "h-10 gap-2 rounded-[10px] px-[18px] text-mk-nav",
};

/** The class list, for a `<button>` or a link that is not `ButtonLink`. */
export function buttonClasses({
    variant = "primary",
    size = "lg",
    className,
}: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
} = {}) {
    return cn(
        BASE,
        VARIANT[variant],
        SIZE[size],
        // The design pads the Saffron band button wider than the Ink one.
        variant === "saffron" && size === "lg" && "px-[26px]",
        // The design's outlined buttons are links sized content-box: 52px
        // plus the 1px border each side, so they stand 2px taller than the
        // filled one beside them. Drawn that way, kept that way.
        (variant === "secondary" || variant === "secondary-on-ink") &&
            (size === "lg"
                ? "h-[54px] px-[22px]"
                : size === "md"
                  ? "h-12"
                  : "h-[42px]"),
        className,
    );
}

/** The design's play mark: a Saffron triangle before "See it in action". */
export function PlayMark({ onInk = false }: { onInk?: boolean }) {
    return (
        <span
            aria-hidden
            className={cn(
                "h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent",
                onInk ? "border-l-mk-saffron" : "border-l-brand-500",
            )}
        />
    );
}

const isExternal = (href: string) => /^(https?:|mailto:|tel:)/.test(href);

export interface ButtonLinkProps extends Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href"
> {
    href: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Adds the play mark before the label. */
    play?: boolean;
    children: ReactNode;
}

/** A link that looks like the design's buttons. */
export function ButtonLink({
    href,
    variant = "primary",
    size = "lg",
    play = false,
    className,
    children,
    ...props
}: ButtonLinkProps) {
    const classes = buttonClasses({ variant, size, className });
    const content = (
        <>
            {play ? <PlayMark onInk={variant === "secondary-on-ink"} /> : null}
            {children}
        </>
    );
    if (isExternal(href)) {
        return (
            <a href={href} className={classes} {...props}>
                {content}
            </a>
        );
    }
    return (
        <Link href={href} className={classes} {...props}>
            {content}
        </Link>
    );
}
