"use client";

import { TRIAL_DAYS_MAX, TRIAL_DAYS_MIN } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { useId } from "react";

import { useDraft } from "../draft-store";
import { RupeesField, WholeField } from "./number-field";
import { paidPlans, trialOf } from "./offers";
import { CHECKBOX_SAFFRON, ChangedDot, OfferCard } from "./parts";

/**
 * A first period per paid plan, 1–60 days: free, or at a nominal amount
 * taken as autopay is set up (DEC-093's first month). Free can't have one
 * (the schema refuses it), so Free isn't listed. Monthly only: a yearly
 * plan is one payment and never has a trial.
 */
export function OfferTrials() {
    const { catalog, live, edit, canEdit } = useDraft();
    const id = useId();
    if (!catalog) return null;
    const plans = paidPlans(catalog);

    function set(
        planId: string,
        patch: { on?: boolean; days?: number; firstPaise?: number },
    ) {
        edit((c) => {
            c.plans = c.plans.map((p) =>
                p.id === planId
                    ? { ...p, trial: { ...trialOf(p), ...patch } }
                    : p,
            );
        });
    }

    return (
        <OfferCard label="Free trials">
            <span className="font-semibold">Free trials</span>
            <span className="text-[12.5px] leading-normal text-muted-foreground">
                Off unless you switch one on. The business sets up UPI Autopay
                or a card first, paying the first-month amount then (0 makes the
                days free, and Razorpay refunds its small check), and the
                plan&apos;s own charges start when the days end. If that charge
                fails, they drop to Free. Monthly plans only.
            </span>
            {plans.length === 0 && (
                <span className="text-[12.5px] text-muted-foreground">
                    No plan costs anything yet, so there&apos;s nothing to try.
                </span>
            )}
            {plans.map((p) => {
                const t = trialOf(p);
                const o = live?.catalog.plans.find((x) => x.id === p.id);
                const was = o ? trialOf(o) : null;
                const changed =
                    was?.on !== t.on ||
                    (t.on &&
                        (was.days !== t.days ||
                            (was.firstPaise ?? 0) !== (t.firstPaise ?? 0)));
                const box = `${id}-${p.id}`;
                return (
                    <div
                        key={p.id}
                        className="flex flex-wrap items-center gap-2.5"
                    >
                        <div className="flex min-w-20 items-center gap-[9px] font-semibold">
                            <Checkbox
                                id={box}
                                checked={t.on}
                                disabled={!canEdit}
                                className={CHECKBOX_SAFFRON}
                                onCheckedChange={(v) =>
                                    set(p.id, { on: v === true })
                                }
                            />
                            <label htmlFor={box} className="cursor-pointer">
                                {p.name}
                            </label>
                        </div>
                        <WholeField
                            aria-label={`${p.name} trial days`}
                            value={t.days}
                            min={TRIAL_DAYS_MIN}
                            max={TRIAL_DAYS_MAX}
                            disabled={!canEdit || !t.on}
                            className="w-14"
                            onValue={(days) => set(p.id, { days })}
                        />
                        <span className="text-[12.5px] text-muted-foreground">
                            days for ₹
                        </span>
                        <RupeesField
                            aria-label={`${p.name} first month, before GST`}
                            paise={t.firstPaise ?? 0}
                            disabled={!canEdit || !t.on}
                            className="w-20"
                            onPaise={(firstPaise) =>
                                set(p.id, {
                                    firstPaise: Math.min(
                                        firstPaise,
                                        p.pricePaise,
                                    ),
                                })
                            }
                        />
                        <span className="text-[12.5px] text-muted-foreground">
                            + GST · {t.on ? "shown on the pricing page" : "off"}
                        </span>
                        <ChangedDot on={changed} />
                    </div>
                );
            })}
        </OfferCard>
    );
}
