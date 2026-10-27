import { cn } from "@/lib/cn";
import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";

import { Arrow } from "./arrow";

/**
 * A chip that only says something: the hero's "UPI Autopay", "GST
 * invoices"… (13px Geist 600 on white, a hairline border).
 */
export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border border-border bg-card px-[11px] py-[5px] text-[13px] font-semibold text-foreground",
                className,
            )}
            {...props}
        />
    );
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
                "inline-flex cursor-pointer items-center rounded-full border border-border bg-card font-semibold text-foreground no-underline transition-colors duration-fast ease-out hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid] active:scale-[0.98]",
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
