"use client";

import { useId } from "react";

import type {
    AutopayChargeTiming,
    AutopayTimingSettings,
} from "@/lib/subscriptions/autopay-timing";
import {
    sampleRenewal,
    timingOptions,
} from "@/lib/subscriptions/autopay-timing";
import { TIMING_LABEL } from "@/lib/subscriptions/plan-settings";

import { TimingCard } from "./timing-card";

/**
 * "When autopay charges" (round-2 D13B, DEC-065): the business's choice of
 * when a renewal's autopay debit happens, as three radio cards, each with
 * what it means and a small timeline for a renewal a week out.
 *
 * The cards only choose. They sit in the setting's sheet
 * (`autopay-timing-sheet.tsx`), which saves the choice on Save: the row
 * under the Plans list reads the saved one in a sentence. A plan can
 * choose its own on Plan Detail.
 */
export function AutopayTimingSetting({
    settings,
    value,
    onChange,
    disabled = false,
    nowIso,
}: {
    settings: AutopayTimingSettings;
    /** The card that is picked. */
    value: AutopayChargeTiming;
    onChange: (next: AutopayChargeTiming) => void;
    disabled?: boolean;
    nowIso: string;
}) {
    const id = useId();
    const renewal = sampleRenewal(new Date(nowIso));
    const options = timingOptions(settings);

    return (
        <fieldset
            className="min-w-0"
            aria-describedby={`${id}-hint`}
            disabled={disabled}
        >
            {/* The sheet's title says it on screen. */}
            <legend className="sr-only">{TIMING_LABEL}</legend>
            <p
                id={`${id}-hint`}
                className="mb-2.5 text-pretty text-[12.5px] text-muted-foreground"
            >
                For people who pay by autopay. The bank tells them{" "}
                {settings.noticeHours} hours before it takes the money. A plan
                can choose differently on its own page.
            </p>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(min(100%,240px),1fr))]">
                {options.map((o) => (
                    <TimingCard
                        key={o.value}
                        name={`${id}-timing`}
                        option={o}
                        renewal={renewal}
                        settings={settings}
                        checked={value === o.value}
                        disabled={disabled}
                        onPick={() => onChange(o.value)}
                    />
                ))}
            </div>
        </fieldset>
    );
}
