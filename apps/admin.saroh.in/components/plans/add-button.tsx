"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Plus } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * Every "make a new one" on Plans & modules looks the same (the Plans
 * console audit: four looks for one job hid them): a secondary button with
 * a plus, labelled verb and noun ("Add plan", "Add group", "New coupon"),
 * at the top right of its section.
 */
export function AddButton({
    children,
    className,
    ...props
}: Omit<ComponentProps<typeof Button>, "variant" | "type">) {
    return (
        <Button
            type="button"
            variant="secondary"
            className={cn(
                "h-[34px] gap-1.5 rounded-[9px] border border-border-strong px-3.5 text-[13px]",
                className,
            )}
            {...props}
        >
            <Plus aria-hidden className="size-3.5" />
            {children}
        </Button>
    );
}
