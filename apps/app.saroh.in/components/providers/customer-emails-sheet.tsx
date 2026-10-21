"use client";

import { Notice } from "@saroh/ui/notice";
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
} from "@/lib/communications/customer-emails";
import {
    CUSTOMER_EMAILS_TITLE,
    customerEmailLocked,
    customerEmailSaved,
    customerEmailsNote,
    customerEmailsSheetLine,
    customerEmailWhy,
    withCustomerEmail,
} from "@/lib/communications/customer-emails";
import { setCustomerEmail } from "@/lib/communications/customer-emails-actions";

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
    const [shown, flipShown] = useOptimistic(state, withCustomerEmail);
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
}: {
    email: CustomerEmail;
    why: string | null;
    locked: boolean;
    onFlip: (on: boolean) => void;
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
        </li>
    );
}
