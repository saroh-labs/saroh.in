"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { setPlanChargeTiming } from "@/lib/subscriptions/actions";
import type {
    AutopayChargeTiming,
    AutopayTimingSettings,
} from "@/lib/subscriptions/autopay-timing";
import {
    isAutopayChargeTiming,
    sampleRenewal,
    timelineText,
    timingOptions,
    timingTimeline,
    timingTitle,
} from "@/lib/subscriptions/autopay-timing";

const BUSINESS = "BUSINESS";

/**
 * A plan's own "When autopay charges" (round-2 D13B, DEC-065), in Plan
 * Detail's At a glance column: "Use the business setting" or one of the
 * three, saved as soon as it's picked, with what the choice means and its
 * timeline for a renewal a week out. Straight onto the plan, not its draft:
 * buyers never see it. Shown only when autopay can charge for the business.
 */
export function PlanAutopayTiming({
    planId,
    planTiming,
    settings,
    canWrite,
    nowIso,
}: {
    planId: string;
    planTiming: AutopayChargeTiming | null;
    settings: AutopayTimingSettings;
    canWrite: boolean;
    nowIso: string;
}) {
    const router = useRouter();
    const id = useId();
    const [value, setValue] = useState<AutopayChargeTiming | null>(planTiming);
    const [pending, start] = useTransition();
    const effective = value ?? settings.chargeTiming;
    const option = timingOptions(settings).find((o) => o.value === effective);
    const steps = timingTimeline(
        effective,
        sampleRenewal(new Date(nowIso)),
        settings,
    );

    function change(raw: string) {
        const next = isAutopayChargeTiming(raw) ? raw : null;
        if (next === value) return;
        const before = value;
        setValue(next);
        start(async () => {
            const res = await setPlanChargeTiming(planId, next);
            if (!res.ok) {
                setValue(before);
                showError(res.error);
                return;
            }
            showSuccess(
                next
                    ? "Saved. This plan's renewals charge this way from now on."
                    : "Saved. This plan follows the business setting.",
            );
            router.refresh();
        });
    }

    return (
        <section
            aria-labelledby={`${id}-title`}
            className="rounded-[12px] border border-border bg-card px-[18px] py-4"
        >
            <h2
                id={`${id}-title`}
                className="mb-1 font-display text-[16px] font-semibold tracking-[-0.01em] text-foreground"
            >
                When autopay charges
            </h2>
            <label htmlFor={`${id}-select`} className="sr-only">
                When autopay charges for this plan
            </label>
            <div className="relative mt-1.5">
                <select
                    id={`${id}-select`}
                    value={value ?? BUSINESS}
                    disabled={!canWrite || pending}
                    onChange={(e) => change(e.target.value)}
                    aria-describedby={`${id}-line ${id}-when`}
                    className={cn(
                        "h-9 w-full appearance-none rounded-[8px] border border-border bg-card pl-2.5 pr-8 text-[13px] text-foreground",
                        "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted",
                        "disabled:cursor-default disabled:opacity-80 coarse:h-11",
                    )}
                >
                    <option value={BUSINESS}>
                        {`Use the business setting (${timingTitle(settings.chargeTiming)})`}
                    </option>
                    {timingOptions(settings).map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.title}
                        </option>
                    ))}
                </select>
                <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute right-2.5 top-1/2 size-[13px] -translate-y-1/2 text-muted-foreground"
                />
            </div>
            <p
                id={`${id}-line`}
                className="mt-2 text-pretty text-[12px] leading-[1.45] text-muted-foreground"
            >
                {option?.consequence}
            </p>
            <p
                id={`${id}-when`}
                className="mt-1 text-pretty text-[12px] tabular-nums text-foreground/80"
            >
                {`For example: ${timelineText(steps)}.`}
            </p>
        </section>
    );
}
