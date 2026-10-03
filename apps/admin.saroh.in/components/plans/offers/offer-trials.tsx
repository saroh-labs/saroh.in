"use client";

import { TRIAL_DAYS_MAX, TRIAL_DAYS_MIN } from "@saroh/pricing-catalog";
import { Checkbox } from "@saroh/ui/checkbox";
import { useId } from "react";

import { useDraft } from "../draft-store";
import { WholeField } from "./number-field";
import { paidPlans, trialOf } from "./offers";
import { CHECKBOX_SAFFRON, ChangedDot, OfferCard } from "./parts";

/**
 * A free trial per paid plan, 1–60 days. Free can't have one (the schema
 * refuses it), so Free isn't listed.
 */
export function OfferTrials() {
    const { catalog, live, edit, canEdit } = useDraft();
    const id = useId();
    if (!catalog) return null;
    const plans = paidPlans(catalog);

    function set(planId: string, patch: { on?: boolean; days?: number }) {
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
                Off unless you switch one on. The business adds a card or UPI
                Autopay first and is charged when the trial ends. If that charge
                fails, they drop to Free.
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
                    was?.on !== t.on || (t.on && was.days !== t.days);
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
                            days · {t.on ? "shown on the pricing page" : "off"}
                        </span>
                        <ChangedDot on={changed} />
                    </div>
                );
            })}
        </OfferCard>
    );
}
