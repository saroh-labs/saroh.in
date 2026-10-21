"use client";

import { Field } from "@saroh/ui/field";
import { Notice } from "@saroh/ui/notice";
import { OptionSelect } from "@saroh/ui/option-select";
import { showError } from "@saroh/ui/toast";
import { useId, useOptimistic, useTransition } from "react";

import { useSettingsUndo } from "@/components/organizations/use-settings-undo";
import { SwitchRow } from "@/components/shared/check-row";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import type {
    CustomerEmail,
    CustomerEmails,
    OverdueTiming,
} from "@/lib/communications/customer-emails";
import {
    CUSTOMER_EMAILS_TITLE,
    customerEmailLocked,
    customerEmailSaved,
    customerEmailsNote,
    customerEmailsSheetLine,
    customerEmailWhy,
    OVERDUE_TIMING_SAVED,
    overdueTimingOptions,
    withCustomerEmail,
    withOverdueTiming,
    withTimingField,
} from "@/lib/communications/customer-emails";
import {
    setCustomerEmail,
    setOverdueTiming,
} from "@/lib/communications/customer-emails-actions";

/** What the screen shows before a save lands: a switch, or the timing. */
type Shown = { kind: string; on: boolean } | { timing: OverdueTiming };

const shownWith = (state: CustomerEmails, change: Shown): CustomerEmails =>
    "timing" in change
        ? withOverdueTiming(state, change.timing)
        : withCustomerEmail(state, change);

/** The row the sheet is opened from; its button takes the keyboard back. */
export const CUSTOMER_EMAILS_ROW_ID = "customer-emails";

/**
 * The row's sheet: one switch per automatic email the business is
 * offered, each with what the customer gets. A switch saves as it is
 * flipped and says so, with Undo for ten seconds (`useSettingsUndo`, as
 * Your profile's alerts): Undo saves it back. The switch moves as it is
 * pressed and goes back if the save is refused. Done closes it; there is
 * no draft to lose.
 *
 * Overdue reminders, while on, also say when they go (DEC-178, #1169):
 * the day after the due date for the first and second reminder, and the
 * hours they may go in, the business's own time. Each choice saves as it
 * is made, with Undo that puts the previous timing back, as a switch does.
 *
 * One note at most (owner, 13 Oct): with no email provider, that none of
 * them go out yet. A switch that can't be changed says why on its own
 * line only when that note doesn't already say it. Someone without
 * `comms:manage` sees every switch, fixed, and why under the title.
 */
export function CustomerEmailsSheet({
    state,
    open,
    onClose,
}: {
    state: CustomerEmails;
    open: boolean;
    onClose: () => void;
}) {
    const noteId = useId();
    const [pending, startTransition] = useTransition();
    const [shown, flipShown] = useOptimistic(state, shownWith);
    const { offer } = useSettingsUndo();
    const note = customerEmailsNote(shown);

    const flip = (email: CustomerEmail, on: boolean) => {
        if (customerEmailLocked(email, shown) || pending) return;
        const change = { kind: email.kind, on };
        startTransition(async () => {
            flipShown(change);
            const res = await runAction(() => setCustomerEmail(change));
            if (!res) return;
            if (!res.ok) {
                showError(res.error, "Nothing has changed.");
                return;
            }
            offer(customerEmailSaved(email.label, on), async () => {
                const back = await runAction(
                    () => setCustomerEmail({ kind: email.kind, on: !on }),
                    { quiet: true },
                );
                if (!back) return { ok: false, error: UNREACHED };
                return back.ok
                    ? { ok: true }
                    : { ok: false, error: back.error };
            });
        });
    };

    const retime = (
        email: CustomerEmail,
        field: keyof OverdueTiming,
        value: number,
    ) => {
        const before = email.timing;
        if (!before || customerEmailLocked(email, shown) || pending) return;
        const timing = withTimingField(before, field, value);
        if (before[field] === timing[field]) return;
        startTransition(async () => {
            flipShown({ timing });
            const res = await runAction(() => setOverdueTiming(timing));
            if (!res) return;
            if (!res.ok) {
                showError(res.error, "Nothing has changed.");
                return;
            }
            offer(OVERDUE_TIMING_SAVED, async () => {
                const back = await runAction(() => setOverdueTiming(before), {
                    quiet: true,
                });
                if (!back) return { ok: false, error: UNREACHED };
                return back.ok
                    ? { ok: true }
                    : { ok: false, error: back.error };
            });
        });
    };

    return (
        <FormSheet
            id={`${CUSTOMER_EMAILS_ROW_ID}-panel`}
            returnFocusTo={() =>
                document.querySelector<HTMLElement>(
                    `#${CUSTOMER_EMAILS_ROW_ID} button`,
                )
            }
            title={CUSTOMER_EMAILS_TITLE}
            description={customerEmailsSheetLine(shown)}
            open={open}
            // Each switch has saved already: nothing to lose on the way out.
            dirty={false}
            onClose={onClose}
            doneOnly
            doneLabel={shown.canChange ? "Done" : "Close"}
        >
            {note ? (
                <Notice id={noteId} tone="warning" role="note" className="mb-3">
                    {note}
                </Notice>
            ) : null}
            <ul
                aria-label={CUSTOMER_EMAILS_TITLE}
                aria-describedby={note ? noteId : undefined}
                aria-busy={pending || undefined}
                className="divide-y divide-border rounded-xl border border-border bg-card"
                data-testid="customer-emails-list"
            >
                {shown.notices.map((email) => (
                    <CustomerEmailSwitch
                        key={email.kind}
                        email={email}
                        why={customerEmailWhy(email, shown)}
                        locked={customerEmailLocked(email, shown)}
                        onFlip={(on) => flip(email, on)}
                        onRetime={(field, value) => retime(email, field, value)}
                    />
                ))}
            </ul>
        </FormSheet>
    );
}

function CustomerEmailSwitch({
    email,
    why,
    locked,
    onFlip,
    onRetime,
}: {
    email: CustomerEmail;
    why: string | null;
    locked: boolean;
    onFlip: (on: boolean) => void;
    onRetime: (field: keyof OverdueTiming, value: number) => void;
}) {
    return (
        <li data-kind={email.kind}>
            <SwitchRow
                checked={email.on}
                disabled={locked}
                name={email.label}
                onChange={onFlip}
                className="items-start justify-between gap-3 px-3.5 py-3"
            >
                <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="text-[13.5px] font-medium text-foreground">
                        {email.label}
                    </span>
                    <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                        {email.says}
                    </span>
                    {why ? (
                        <span className="text-pretty text-[12.5px] leading-[1.45] text-foreground/80">
                            {why}
                        </span>
                    ) : null}
                </span>
            </SwitchRow>
            {email.on && email.timing ? (
                <OverdueTimingFields
                    timing={email.timing}
                    locked={locked}
                    onChange={onRetime}
                />
            ) : null}
        </li>
    );
}

/**
 * When overdue reminders go: four choices under the switch, two by two on
 * a desk and one under another on a phone. Each offers only what fits with
 * the rest (the second after the first, the end after the start).
 */
function OverdueTimingFields({
    timing,
    locked,
    onChange,
}: {
    timing: OverdueTiming;
    locked: boolean;
    onChange: (field: keyof OverdueTiming, value: number) => void;
}) {
    const id = useId();
    const options = overdueTimingOptions(timing);
    const select = (field: keyof OverdueTiming) => (
        <OptionSelect
            id={`${id}-${field}`}
            value={String(timing[field])}
            options={options[field]}
            readOnly={locked}
            onValueChange={(v) => onChange(field, Number(v))}
        />
    );
    return (
        <div
            role="group"
            aria-label="When overdue reminders go"
            data-testid="overdue-timing"
            className="grid min-w-0 grid-cols-1 gap-3 px-3.5 pb-3.5 sm:grid-cols-2"
        >
            <Field label="First reminder" className="min-w-0">
                {select("firstDay")}
            </Field>
            <Field label="Second reminder" className="min-w-0">
                {select("secondDay")}
            </Field>
            <Field label="From" className="min-w-0">
                {select("fromHour")}
            </Field>
            <Field label="Until" className="min-w-0">
                {select("untilHour")}
            </Field>
            <p className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground sm:col-span-2">
                In your business&apos;s time zone. If one can&apos;t go on its
                day, it goes in the days after.
            </p>
        </div>
    );
}
