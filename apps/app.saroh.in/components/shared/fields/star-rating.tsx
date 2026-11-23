"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Star } from "lucide-react";
import { useId } from "react";

const ARROWS: Record<string, number> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
};

/**
 * An optional 1 to 5 star rating (ERVReviewStars, 23 Nov 2026), as one
 * radio group: one Tab stop, the arrows move and pick, each star named
 * "1 star" to "5 stars", the group "Stars (optional)". Clear shows once a
 * star is set and puts it back to none; Tab reaches it after the group.
 * Filled stars are Saffron 700; empty ones are an outline, so the count
 * never rests on colour. 40px targets on a desk, 44px on a phone.
 */
export function StarRating({
    value,
    onChange,
}: {
    /** The stars set, or null for none. */
    value: number | null;
    onChange: (next: number | null) => void;
}) {
    const hint = useId();
    return (
        <div className="grid gap-1.5" data-star-rating="">
            <div className="flex items-center gap-1">
                <span className="mr-2 text-[0.8125rem] font-semibold">
                    Stars{" "}
                    <span
                        data-ph-unmask=""
                        className="font-normal text-muted-foreground"
                    >
                        (optional)
                    </span>
                </span>
                <RadioGroupPrimitive.Root
                    aria-label="Stars (optional)"
                    aria-describedby={hint}
                    value={value === null ? "" : String(value)}
                    onValueChange={(v) => onChange(Number(v))}
                    className="flex gap-0.5"
                    orientation="horizontal"
                >
                    {[1, 2, 3, 4, 5].map((n) => (
                        <RadioGroupPrimitive.Item
                            key={n}
                            value={String(n)}
                            aria-label={n === 1 ? "1 star" : `${n} stars`}
                            // WAI-ARIA radio group: an arrow moves AND picks.
                            onKeyDown={(e) => {
                                const step = ARROWS[e.key];
                                if (!step) return;
                                e.preventDefault();
                                const to = ((n - 1 + step + 5) % 5) + 1;
                                onChange(to);
                                const radios =
                                    e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                                        "[role=radio]",
                                    );
                                radios?.[to - 1]?.focus();
                            }}
                            className="grid size-10 place-items-center rounded-md text-[#91550C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:size-11"
                        >
                            <Star
                                aria-hidden
                                className={cn(
                                    "size-6",
                                    value !== null && n <= value
                                        ? "fill-current"
                                        : "fill-none",
                                )}
                            />
                        </RadioGroupPrimitive.Item>
                    ))}
                </RadioGroupPrimitive.Root>
                {value !== null ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onChange(null)}
                    >
                        Clear
                    </Button>
                ) : null}
            </div>
            <p id={hint} className="text-xs text-muted-foreground">
                {value === null
                    ? "Leave empty and no stars show."
                    : `Shows ${value} of 5 stars with the quote.`}
            </p>
        </div>
    );
}
