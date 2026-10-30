"use client";

import { cn } from "@/lib/cn";
import { writeConsent } from "@/lib/consent";

/**
 * "Cookie choices" in the footer: forgets the visitor's answer, so the
 * cookie notice asks again. Changing your mind is as easy as answering.
 */
export function CookieChoicesButton({ className }: { className?: string }) {
    return (
        <button
            type="button"
            onClick={() => writeConsent(null)}
            className={cn(
                className,
                "border-none bg-transparent p-0 font-sans text-[13.5px]",
            )}
        >
            Cookie choices
        </button>
    );
}
