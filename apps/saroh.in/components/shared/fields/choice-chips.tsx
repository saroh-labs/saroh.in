import type { ButtonHTMLAttributes, Ref } from "react";

import { cn } from "@/lib/cn";
import { ring } from "@/lib/ring";

/**
 * One choice in a row of choices (DEC-195, V9): 36px, 14px, white card,
 * Ink when chosen; 44px on a touch screen. The caller gives the row its role
 * (a radiogroup with `aria-checked`, or toggles with `aria-pressed`).
 *
 * - `chip` — its own pill with a border; `invalid` reddens it.
 * - `segment` — inside a track that draws the border (Desk / Phone).
 */
export function ChoiceChip({
    on,
    invalid = false,
    look = "chip",
    type = "button",
    className,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    on: boolean;
    invalid?: boolean;
    look?: "chip" | "segment";
    ref?: Ref<HTMLButtonElement>;
}) {
    return (
        <button
            type={type}
            className={cn(
                "inline-flex min-h-9 max-w-full cursor-pointer items-center rounded-full px-3.5 py-1 font-sans text-[14px] leading-tight transition-[background-color,border-color,color,transform] duration-fast ease-out active:scale-[0.97] [@media(pointer:coarse)]:min-h-11",
                ring(),
                look === "chip" && "border",
                on
                    ? "border-foreground bg-foreground text-background"
                    : look === "chip"
                      ? cn(
                            "bg-card text-foreground hover:border-border-strong",
                            invalid ? "border-destructive" : "border-border",
                        )
                      : "text-mk-copy hover:bg-mk-hover hover:text-foreground",
                className,
            )}
            {...props}
        />
    );
}
