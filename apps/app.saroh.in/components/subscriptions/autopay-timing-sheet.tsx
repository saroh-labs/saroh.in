"use client";

import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { setAutopayChargeTiming } from "@/lib/subscriptions/actions";
import type {
    AutopayChargeTiming,
    AutopayTimingSettings,
} from "@/lib/subscriptions/autopay-timing";
import { TIMING_LABEL } from "@/lib/subscriptions/plan-settings";

import { AutopayTimingSetting } from "./autopay-timing-setting";

/**
 * "When autopay charges", changed in its row's sheet (owner, 10 Oct:
 * read-first rows, edit in a side sheet): the three timing cards with
 * their worked examples, and the sheet's own Save. Nothing is saved until
 * Save. A refusal is said in a toast and the sheet stays open with what
 * was picked. The row says the toast and offers Undo (`plan-settings.tsx`).
 */
export function AutopayTimingSheet({
    settings,
    saved,
    nowIso,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    settings: AutopayTimingSettings;
    /** The timing as it is saved now. */
    saved: AutopayChargeTiming;
    nowIso: string;
    open: boolean;
    /** The id of the Edit that takes the keyboard back. */
    returnTo: string;
    onClose: () => void;
    onSaved: (timing: AutopayChargeTiming) => void;
}) {
    const [choice, setChoice] = useState(saved);
    const [pending, setPending] = useState(false);

    async function save() {
        const res = await runAction(() => setAutopayChargeTiming(choice), {
            setBusy: setPending,
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onSaved(choice);
        onClose();
    }

    return (
        <FormSheet
            open={open}
            returnFocusTo={returnTo}
            title={TIMING_LABEL}
            description="For every plan. Renewals from now on charge this way once you save."
            pending={pending}
            wide
            dirty={choice !== saved}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <AutopayTimingSetting
                settings={settings}
                value={choice}
                onChange={setChoice}
                disabled={pending}
                nowIso={nowIso}
            />
        </FormSheet>
    );
}
