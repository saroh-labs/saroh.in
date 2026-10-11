"use client";

import Link from "next/link";
import * as React from "react";
import { cn } from "../../lib/utils";
import type { ButtonProps } from "./button";
import { buttonVariants } from "./button";
import { Tip } from "./tooltip";

/*
 * Square, by size. Each grows to 44px under a thumb. The glyph is 16px
 * whatever the box (14px in `xs`), at lucide's own 2px stroke: one stroke
 * width for the product.
 */
const SIZE = {
    xs: "size-6 coarse:size-11 [&_svg]:size-3.5",
    sm: "size-8 coarse:size-11 [&_svg]:size-4",
    md: "size-[38px] coarse:size-11 [&_svg]:size-4",
} as const;

export interface IconButtonProps extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "title" | "children"
> {
    /**
     * Required. The accessible name, and the tooltip a mouse or keyboard
     * sees: "Edit", "More actions", "Close".
     */
    label: string;
    /** The glyph, a lucide icon element. Hidden from screen readers. */
    icon: React.ReactNode;
    size?: keyof typeof SIZE;
    variant?: ButtonProps["variant"];
    /** Draws a link that looks the same. `external` opens a new tab. */
    href?: string;
    external?: boolean;
    /** `false` where the tooltip would cover what the button controls. */
    tooltip?: boolean;
    tooltipSide?: "top" | "right" | "bottom" | "left";
}

/**
 * The one icon-only control. It cannot be made without a name: `label` is
 * the `aria-label` and the tooltip, so a screen reader, a keyboard and a
 * mouse all learn what it does. (A thumb gets neither a hover nor a
 * tooltip, so an icon button is for actions whose glyph is unmistakable;
 * anything else is a button with words.)
 */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    function IconButton(
        {
            label,
            icon,
            size = "sm",
            variant = "ghost",
            href,
            external,
            tooltip = true,
            tooltipSide,
            className,
            type = "button",
            ...props
        },
        ref,
    ) {
        const cls = cn(
            buttonVariants({ variant, size: "icon" }),
            "shrink-0 p-0",
            SIZE[size],
            className,
        );
        const glyph = (
            <span aria-hidden className="contents">
                {icon}
            </span>
        );
        const control =
            href !== undefined ? (
                external ? (
                    <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${label} (opens in a new tab)`}
                        className={cls}
                    >
                        {glyph}
                    </a>
                ) : (
                    <Link href={href} aria-label={label} className={cls}>
                        {glyph}
                    </Link>
                )
            ) : (
                <button
                    ref={ref}
                    type={type}
                    aria-label={label}
                    className={cls}
                    {...props}
                >
                    {glyph}
                </button>
            );
        return tooltip ? (
            <Tip label={label} side={tooltipSide}>
                {control}
            </Tip>
        ) : (
            control
        );
    },
);
