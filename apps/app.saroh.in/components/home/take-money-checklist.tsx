"use client";

import { useSyncExternalStore } from "react";

import { useCanChangePlan } from "@/components/billing/plan-way";
import { PlanAsides, readyRows } from "@/components/settings/ready-rows";
import { SetupChecklist } from "@/components/shared/setup-checklist";
import type { ReadyChecklist } from "@/lib/settings/ready";
import {
    checklistWords,
    readSetupHidden,
    SETUP_HIDDEN_KEY,
    takeMoneyPlace,
    writeSetupHidden,
} from "@/lib/settings/ready";

/**
 * "Finish setup" on Home ("Saroh Home" design, F8): the same steps Settings
 * › Business lists, drawn by the one checklist
 * (`components/shared/setup-checklist.tsx`), each with why it matters and
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
 * read one store so hiding in one moves the other at once; a browser that
 * won't store it still hides it for this visit.
 */

type Slot = "first" | "late";

const HIDE_EVENT = "saroh:setup-hidden";
/** This visit's choice, for a browser whose storage refused it. */
const remembered = new Map<string, boolean>();

const storage = () => window.localStorage;

function subscribe(onChange: () => void) {
    const onStorage = (e: StorageEvent) => {
        if (e.key === SETUP_HIDDEN_KEY) onChange();
    };
    window.addEventListener(HIDE_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
        window.removeEventListener(HIDE_EVENT, onChange);
        window.removeEventListener("storage", onStorage);
    };
}

function isHidden(businessId: string) {
    return remembered.get(businessId) ?? readSetupHidden(storage, businessId);
}

function setHidden(businessId: string, hidden: boolean) {
    if (writeSetupHidden(storage, businessId, hidden)) {
        remembered.delete(businessId);
    } else {
        remembered.set(businessId, hidden);
    }
    window.dispatchEvent(new Event(HIDE_EVENT));
}

export function TakeMoneyChecklist({
    list,
    businessId,
    slot,
}: {
    list: ReadyChecklist;
    businessId: string;
    slot: Slot;
}) {
    // The server can't see the browser's storage, so it draws the checklist
    // shown; a hidden one steps aside right after hydration.
    const hidden = useSyncExternalStore(
        subscribe,
        () => isHidden(businessId),
        () => false,
    );
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
                onHide: () => setHidden(businessId, true),
                onShow: () => setHidden(businessId, false),
                said: "Setup hidden. Show it again from the bottom of Home.",
            }}
            // One line on the next visit, then Home is left to the work.
            fold="once"
            foldKey={`home:${businessId}`}
        >
            {place === "done" ? null : <PlanAsides items={list.outside} />}
        </SetupChecklist>
    );
}
