"use client";

import { useCanChangePlan } from "@/components/billing/plan-way";
import { PlanAsides, readyRows } from "@/components/settings/ready-rows";
import { SetupChecklist } from "@/components/shared/setup-checklist/setup-checklist";
import type { ReadyChecklist } from "@/lib/settings/ready";
import { checklistWords, takeMoneyPlace } from "@/lib/settings/ready";

import { setSetupHidden, useSetupHidden } from "./use-setup-hidden";

/**
 * "Finish setup" on Home ("Saroh Home" design, F8): the same steps Settings
 * › Business lists, drawn by the one checklist
 * (`components/shared/setup-checklist/setup-checklist.tsx`), each with why it matters and
 * one button to where it is done.
 *
 * Home renders this twice — `slot="first"` above Needs you and `slot="late"`
 * at the foot of the column — and each draws only when the checklist belongs
 * there: first while fewer than half the steps are done, at the foot once
 * more are. Hidden, the foot keeps a "Show setup" link. Finished, it is back
 * at the top: the card says so on the visit the last step was done, is one
 * quiet line on the next, and is gone after that.
 *
 * The line under its name follows the steps (DEC-070): it is about the site
 * when publishing the site is all there is, and nothing invoices or takes
 * money.
 *
 * What the plan holds back (taking payment online on a plan without it,
 * DEC-092) follows the steps, outside the count and the bar, with the plan
 * that has it — the same as Settings › Business.
 *
 * Hide is per person, per business, in this browser (default 123): there is
 * no per-person preference store on the server to keep it in. Both slots
 * read one store (`use-setup-hidden.ts`) so hiding in one moves the other
 * at once, and Settings › Business's "Show setup on Home" brings it back
 * (A4).
 *
 * At a desk, Home A draws the foot's checklist as one line (`compact`,
 * `HAPageD`): the next step and "Show the 5 done steps".
 */

type Slot = "first" | "late";

export function TakeMoneyChecklist({
    list,
    businessId,
    slot,
    compact = false,
    phoneOwnCard = false,
}: {
    list: ReadyChecklist;
    businessId: string;
    slot: Slot;
    /**
     * One line rather than the card, while steps are left (Home A at a
     * desk, `HAPageD`): the next step, and the done ones folded.
     */
    compact?: boolean;
    /**
     * Below 640px the phone Home draws its own card while setup leads
     * (U17, `HPStates`): this one is then the desk's alone.
     */
    phoneOwnCard?: boolean;
}) {
    const hidden = useSetupHidden(businessId);
    // A step that is the way to another plan is a plan prompt.
    const canChangePlan = useCanChangePlan();
    const place = takeMoneyPlace(list, hidden);
    // Hidden, the foot keeps the way back. Finished, the top has the last
    // word. Otherwise each slot draws only its own.
    const mine =
        place === "hidden"
            ? slot === "late"
            : place === "done"
              ? slot === "first"
              : place === slot;
    if (!mine) return null;

    return (
        <SetupChecklist
            name="home"
            {...checklistWords(list)}
            rows={readyRows(list.steps, canChangePlan)}
            hide={{
                hidden,
                onHide: () => setSetupHidden(businessId, true),
                onShow: () => setSetupHidden(businessId, false),
                said: "Setup hidden. Show it again from the bottom of Home or Settings › Business.",
            }}
            compact={compact}
            className={
                phoneOwnCard && place === "first" ? "max-sm:hidden" : undefined
            }
            // One line on the next visit, then Home is left to the work.
            fold="once"
            foldKey={`home:${businessId}`}
        >
            {place === "done" ? null : <PlanAsides items={list.outside} />}
        </SetupChecklist>
    );
}
