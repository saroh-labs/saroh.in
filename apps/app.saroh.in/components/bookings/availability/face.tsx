"use client";

import { Avatar, AvatarFallback, avatarInitials } from "@saroh/ui/avatar";
import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

/**
 * A person's initials in a circle, as the Hours and time off boards draw
 * them beside a name (36px; 44px on the first-time card, 30px in a field).
 * `icon` stands in for the letters: Everyone, the business, a plus.
 */
export function Face({
    name,
    icon,
    size = 36,
    tone = "neutral",
    className,
}: {
    name?: string;
    icon?: ReactNode;
    size?: 30 | 36 | 44;
    /** Amber for the business being closed. */
    tone?: "neutral" | "amber";
    className?: string;
}) {
    return (
        <Avatar
            aria-hidden
            className={cn(
                size === 44
                    ? "size-11 text-[13px]"
                    : size === 30
                      ? "size-[30px] text-[11px]"
                      : "size-9 text-[12.5px]",
                tone === "amber" &&
                    "bg-warning-subtle text-warning-subtle-foreground",
                className,
            )}
        >
            <AvatarFallback>
                {icon ?? avatarInitials(name ?? "")}
            </AvatarFallback>
        </Avatar>
    );
}
