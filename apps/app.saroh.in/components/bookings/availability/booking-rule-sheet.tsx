"use client";

import { showError } from "@saroh/ui/toast";
import { useId, useState } from "react";

import { RadioCards } from "@/components/shared/choice-group";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import type { RuleRow } from "@/lib/services/availability-rules";
import { rulePatch } from "@/lib/services/availability-rules";
import { updateBookingRules } from "@/lib/staff/actions";
import type { BookingRules } from "@/lib/staff/types";

const NONE = "none";

/**
 * One booking rule, changed in its row's sheet (owner, 10 Oct: read-first
 * rows, edit in a side sheet): the choices the rule always had, one to a
 * row with its help under it, and the sheet's own Save. It writes that one
 * rule and nothing else on the page, so it never raises the page's unsaved
 * bar. A refusal is said in a toast and the sheet stays open with what was
 * chosen.
 */
export function BookingRuleSheet({
    row,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    row: RuleRow;
    open: boolean;
    /** The id of the Edit that takes the keyboard back. */
    returnTo: string;
    onClose: () => void;
    /** The rules as the API now has them. */
    onSaved: (rules: BookingRules) => void;
}) {
    const id = useId();
    // "No limit" is the empty value, which a radio group reads as nothing
    // chosen: it travels as NONE inside the sheet.
    const [choice, setChoice] = useState(row.value || NONE);
    const value = choice === NONE ? "" : choice;
    const [pending, setPending] = useState(false);

    async function save() {
        const res = await runAction(
            () => updateBookingRules(rulePatch(row.key, value)),
            { setBusy: setPending },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onSaved(res.data);
        onClose();
    }

    return (
        <FormSheet
            open={open}
            returnFocusTo={returnTo}
            title={row.title}
            description="For the whole business. New bookings follow it as soon as you save."
            pending={pending}
            dirty={value !== row.value}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <RadioCards
                label={row.title}
                describedBy={row.hint ? `${id}-hint` : undefined}
                options={row.options.map((o) => ({
                    value: o.value || NONE,
                    label: o.label,
                    note: o.note,
                }))}
                value={choice}
                onChange={setChoice}
                disabled={pending}
            />
            {row.hint ? (
                <p
                    id={`${id}-hint`}
                    className="text-pretty text-[12.5px] leading-normal text-muted-foreground"
                >
                    {row.hint}
                </p>
            ) : null}
        </FormSheet>
    );
}
