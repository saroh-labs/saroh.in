"use client";

import { OptionSelect } from "@saroh/ui/option-select";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { runAction } from "@/lib/api/run-action";
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
            const res = await runAction(() =>
                setPlanChargeTiming(planId, next),
            );
            if (!res) return setValue(before);
            if (!res.ok) {
                setValue(before);
                showError(res.error);
                return;
            }
            showSuccess(
                next
                    ? "Timing saved. This plan's renewals charge this way from now on."
                    : "Timing saved. This plan follows the business setting.",
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
            <OptionSelect
                id={`${id}-select`}
                className="mt-1.5"
                value={value ?? BUSINESS}
                disabled={pending}
                readOnly={!canWrite}
                onValueChange={change}
                aria-describedby={`${id}-line ${id}-when`}
                options={[
                    {
                        value: BUSINESS,
                        label: `Use the business setting (${timingTitle(settings.chargeTiming)})`,
                    },
                    ...timingOptions(settings).map((o) => ({
                        value: o.value,
                        label: o.title,
                    })),
                ]}
            />
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
