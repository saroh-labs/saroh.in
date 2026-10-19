"use client";

import { cn } from "@saroh/ui/lib/utils";
import { useId } from "react";

import { WhoTag } from "@/components/services/services-rows";
import { CheckRow } from "@/components/shared/check-row";
import type { Bookers } from "@/lib/services/service-form";
import { bookerWords, mixOf, WHO_CAN_BOOK } from "@/lib/services/service-form";

/**
 * "Who can book it" (DEC-170, Q5): two ticks, "Customers, on your booking
 * page" and "Your team, from Bookings", any of the four mixes; neither is
 * paused. Its tag says the mix in the Services list's own words, and the
 * line under it what that means. On a new service the ticks are part of
 * the draft; on a saved one each tick saves as it is pressed, with Undo
 * (the caller's `onChange`).
 */
export function WhoCanBookCard({
    bookers,
    onChange,
    line,
    freeTime = null,
    disabled = false,
    pair = false,
    bare = false,
}: {
    bookers: Bookers;
    onChange: (next: Bookers) => void;
    /** Under the ticks. */
    line: string;
    /** Whose free time customers pick in: "Meera's free hours". */
    freeTime?: string | null;
    disabled?: boolean;
    /** The two ticks side by side at a desk (a saved service's page). */
    pair?: boolean;
    /** Drawn without its own card (inside More details on a phone). */
    bare?: boolean;
}) {
    const id = useId();
    const ticks = (["customers", "team"] as const).map((which) => {
        const words = bookerWords(which, freeTime);
        const on = bookers[which];
        return (
            <CheckRow
                key={which}
                checked={on}
                disabled={disabled}
                onChange={(next) => onChange({ ...bookers, [which]: next })}
                className={cn(
                    "min-h-[52px] items-center gap-3 rounded-[10px] border bg-card px-3.5 py-2.5",
                    on ? "border-foreground" : "border-border",
                )}
            >
                <span className="min-w-0" data-ph-unmask="">
                    <span className="block text-[14px] font-semibold">
                        {words.label}
                    </span>
                    <span
                        className="mt-0.5 block text-[12.5px] text-muted-foreground"
                        data-ph-mask={freeTime ? "" : undefined}
                    >
                        {words.sub}
                    </span>
                </span>
            </CheckRow>
        );
    });
    return (
        <section
            role="group"
            aria-labelledby={id}
            className={cn(
                !bare &&
                    "rounded-[12px] border border-border bg-card px-[18px] py-4",
            )}
        >
            <div className="flex items-center gap-2">
                <h2
                    id={id}
                    data-ph-unmask=""
                    className="flex-1 font-display text-[16px] font-semibold tracking-[-0.01em]"
                >
                    {WHO_CAN_BOOK}
                </h2>
                <WhoTag who={mixOf(bookers)} />
            </div>
            <div
                className={cn(
                    "mt-2.5 grid gap-2",
                    pair && "min-[760px]:grid-cols-2",
                )}
            >
                {ticks}
            </div>
            <p
                role="status"
                className="mt-2 text-pretty text-[12.5px] leading-[1.5] text-muted-foreground"
                data-ph-unmask=""
            >
                {line}
            </p>
        </section>
    );
}
