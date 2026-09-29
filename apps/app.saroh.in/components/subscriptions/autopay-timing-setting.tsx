"use client";

import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { setAutopayChargeTiming } from "@/lib/subscriptions/actions";
import type {
    AutopayChargeTiming,
    AutopayTimingSettings,
} from "@/lib/subscriptions/autopay-timing";
import {
    sampleRenewal,
    timingOptions,
} from "@/lib/subscriptions/autopay-timing";

import { TimingCard } from "./timing-card";

/**
 * "When autopay charges" (round-2 D13B, DEC-065), on the Plans tab beside
 * "Members can pause": the business's choice of when a renewal's autopay
 * debit happens, as three radio cards, each with what it means and a small
 * timeline for a renewal a week out. Saved as soon as it's picked. A plan
 * can choose its own on Plan Detail.
 *
 * Shown only when autopay can charge for this business (`available`); a
 * business without it never sees the choice (DEC-057's spirit).
 */
export function AutopayTimingSetting({
    settings,
    canWrite,
    nowIso,
}: {
    settings: AutopayTimingSettings;
    canWrite: boolean;
    nowIso: string;
}) {
    const router = useRouter();
    const id = useId();
    const [value, setValue] = useState(settings.chargeTiming);
    const [pending, start] = useTransition();
    const renewal = sampleRenewal(new Date(nowIso));
    const options = timingOptions(settings);

    function change(next: AutopayChargeTiming) {
        if (next === value) return;
        const before = value;
        setValue(next);
        start(async () => {
            const res = await setAutopayChargeTiming(next);
            if (!res.ok) {
                setValue(before);
                showError(res.error);
                return;
            }
            showSuccess(
                "Saved. Renewals from now on charge this way; charges already on their way keep their date.",
            );
            router.refresh();
        });
    }

    return (
        <fieldset
            className="mb-3 min-w-0 rounded-[12px] border border-border bg-card px-4 py-3"
            aria-describedby={`${id}-hint`}
            disabled={!canWrite || pending}
        >
            <legend className="float-left w-full text-[14px] font-semibold text-foreground">
                When autopay charges
            </legend>
            <p
                id={`${id}-hint`}
                className="clear-both mb-2.5 text-pretty pt-0.5 text-[12.5px] text-muted-foreground"
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
                        disabled={!canWrite || pending}
                        onPick={() => change(o.value)}
                    />
                ))}
            </div>
            {!canWrite ? (
                <p className={cn("mt-2 text-[12px] text-muted-foreground")}>
                    Only someone who can change subscriptions can change this.
                </p>
            ) : null}
        </fieldset>
    );
}
