"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import * as React from "react";
import { cn } from "../../lib/utils";

/*
 * Avatars (brand file §7). One fact, one property:
 *
 * - FILL encodes permission, and only where permission exists. Team members
 *   are ranked, so their monogram takes the role's step on the Ink ramp and
 *   the role name always sits beside it. Customers have no role, so they get
 *   the neutral monogram and colour stays free for the status column.
 * - The RING marks one fact: the signed-in user in a team list, or a
 *   returning customer in a customer list — 2px of surface, then 2px of
 *   Saffron, so it survives greyscale by position.
 * - SIZE follows density: 32 in a list, 28 in a table row, 64 on a record.
 *
 * Four fills at most; beyond four, people stop learning the colour. Real
 * photos replace the fill, so permission has to move to a ring or a badge on
 * the day avatars carry pictures.
 */
const avatarVariants = cva(
    "relative flex shrink-0 overflow-hidden rounded-full font-semibold",
    {
        variants: {
            size: {
                list: "size-8 text-[12px]",
                table: "size-7 text-[11px]",
                detail: "size-16 font-display text-[22px]",
            },
            tone: {
                owner: "bg-[#1C1C1A] text-[#F5F2EC]",
                admin: "bg-[#4D4941] text-[#F5F2EC]",
                staff: "bg-[#948F82] text-[#1C1C1A]",
                viewer: "bg-[#D9D6CC] text-[#1C1C1A]",
                neutral: "bg-[#EDEAE3] text-[#35322C]",
            },
            ring: {
                true: "",
                false: "",
            },
        },
        compoundVariants: [
            {
                ring: true,
                size: ["list", "detail"],
                className:
                    "shadow-[0_0_0_2px_hsl(var(--card)),0_0_0_4px_hsl(var(--highlight))]",
            },
            {
                ring: true,
                size: "table",
                className:
                    "shadow-[0_0_0_1.5px_hsl(var(--card)),0_0_0_3px_hsl(var(--highlight))]",
            },
        ],
        defaultVariants: {
            size: "list",
            tone: "neutral",
            ring: false,
        },
    },
);

type AvatarTone = NonNullable<VariantProps<typeof avatarVariants>["tone"]>;

/**
 * The fill for a workspace role. Saroh's roles map onto the brand's four:
 * a member does the work (Staff) and a reviewer only reads (Viewer).
 */
function avatarToneForRole(role: string | null | undefined): AvatarTone {
    switch (role) {
        case "OWNER":
            return "owner";
        case "ADMIN":
            return "admin";
        case "MEMBER":
            return "staff";
        case "REVIEWER":
            return "viewer";
        default:
            return "neutral";
    }
}

/** Two letters from a name, or the first of an email when there is no name. */
function avatarInitials(name: string | null | undefined, email?: string) {
    const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
    const first = words.at(0) ?? "";
    const last = words.at(-1) ?? "";
    if (words.length >= 2) return `${first[0]}${last[0]}`.toUpperCase();
    if (first) return first.slice(0, 2).toUpperCase();
    return (email ?? "?").slice(0, 1).toUpperCase();
}

const Avatar = React.forwardRef<
    React.ElementRef<typeof AvatarPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> &
        VariantProps<typeof avatarVariants>
>(({ className, size, tone, ring, ...props }, ref) => (
    <AvatarPrimitive.Root
        ref={ref}
        className={cn(avatarVariants({ size, tone, ring }), className)}
        {...props}
    />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
    React.ElementRef<typeof AvatarPrimitive.Image>,
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Image
        ref={ref}
        className={cn("aspect-square h-full w-full", className)}
        {...props}
    />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

/** The monogram. It takes its fill and colour from the Avatar's tone. */
const AvatarFallback = React.forwardRef<
    React.ElementRef<typeof AvatarPrimitive.Fallback>,
    React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
    <AvatarPrimitive.Fallback
        ref={ref}
        className={cn(
            "flex h-full w-full items-center justify-center rounded-full",
            className,
        )}
        {...props}
    />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export {
    Avatar,
    AvatarFallback,
    AvatarImage,
    avatarInitials,
    avatarToneForRole,
    avatarVariants,
};
