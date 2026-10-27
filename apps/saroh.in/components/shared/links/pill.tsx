import { cn } from "@/lib/cn";
import { ring } from "@/lib/ring";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import { Arrow } from "./arrow";

const TONE = {
    plain: "inline-flex items-center rounded-full border border-border bg-card px-[11px] py-[5px] text-[13px] font-semibold text-foreground",
    soon: "whitespace-nowrap rounded-full bg-mk-soon px-2 py-0.5 text-[11.5px] font-semibold text-brand-700",
    ok: "rounded-full bg-mk-ok-tint px-[9px] py-[3px] text-[12px] font-semibold text-mk-ok",
    outline:
        "rounded-full border border-border-strong px-[9px] py-[3px] text-[12.5px] font-semibold",
} as const;

/**
 * A chip that only says something (DEC-195, A19):
 * - `plain` — the hero's "UPI Autopay", "GST invoices"… (13px Geist 600 on
 *   white, a hairline border).
 * - `soon` — "Coming soon" beside a plan table's row.
 * - `ok` — an integration's "Available".
 * - `outline` — "Not available yet".
 */
export function Pill({
    tone = "plain",
    className,
    ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONE }) {
    return <span className={cn(TONE[tone], className)} {...props} />;
}

/**
 * A chip that goes somewhere, with its arrow:
 * - `md` — Home's "Works for" chips (14.5px).
 * - `lg` — a feature page's "Used by" chips (15px).
 */
export function PillLink({
    href,
    size = "md",
    className,
    children,
}: {
    href: string;
    size?: "md" | "lg";
    className?: string;
    children: ReactNode;
}) {
    return (
        <Link
            href={href}
            className={cn(
                `inline-flex cursor-pointer items-center rounded-full border border-border bg-card font-semibold text-foreground no-underline transition-colors duration-fast ease-out hover:border-border-strong hover:text-foreground ${ring()} active:scale-[0.98]`,
                size === "md"
                    ? "px-3.5 py-[7px] text-mk-nav"
                    : "px-4 py-2.5 text-[15px]",
                className,
            )}
        >
            {children}
            <Arrow />
        </Link>
    );
}
