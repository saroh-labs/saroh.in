"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { RadioCards } from "@/components/shared/choice-group";
import { FormSheet } from "@/components/shared/form-sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import { Row } from "@/components/sites/settings-rows";
import { runAction } from "@/lib/api/run-action";
import type {
    AccountUpdates,
    AccountUpdatesChoice,
} from "@/lib/communications/account-updates";
import {
    ACCOUNT_UPDATES_CHOICES,
    ACCOUNT_UPDATES_SHEET_LINE,
    ACCOUNT_UPDATES_TITLE,
    accountUpdatesEmailLine,
    accountUpdatesRow,
    accountUpdatesSaved,
} from "@/lib/communications/account-updates";
import { setAccountUpdates } from "@/lib/communications/account-updates-actions";

/** The row the sheet is opened from; its Edit takes the keyboard back. */
export const ACCOUNT_UPDATES_ROW_ID = "account-updates";

/**
 * Settings › Providers' "Updates in Messages" (12 Oct 2026): whether Saroh
 * posts order, booking and invoice updates to the business's customers'
 * Messages. Read first: the row says what is saved and what that leaves
 * the customers with, and Edit opens the sheet that changes it.
 *
 * Drawn only while the choice can have an effect (`offered`: customers
 * have an account, and Messages is on for this business), so nobody is
 * offered a switch that does nothing. The page reads it only for someone
 * who manages providers, and the API refuses anyone else.
 */
export function AccountUpdatesBlock({ state }: { state: AccountUpdates }) {
    const id = useId();
    const [editing, setEditing] = useState({ open: false, opened: 0 });
    const row = accountUpdatesRow(state);
    if (!row) return null;

    return (
        <section aria-labelledby={id}>
            <h3 id={id} className="label mb-2">
                Messages in customer accounts
            </h3>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <Row
                    id={ACCOUNT_UPDATES_ROW_ID}
                    label={ACCOUNT_UPDATES_TITLE}
                    action={
                        <Button
                            size="sm"
                            variant="outline"
                            aria-haspopup="dialog"
                            aria-label="Edit updates in Messages"
                            onClick={() =>
                                setEditing((e) => ({
                                    open: true,
                                    opened: e.opened + 1,
                                }))
                            }
                        >
                            Edit
                        </Button>
                    }
                >
                    <div className="space-y-1" data-testid="account-updates">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusBadge
                                tone={row.nothingSent ? "warning" : "neutral"}
                            >
                                {row.status}
                            </StatusBadge>
                            <span className="text-pretty">{row.says}</span>
                        </div>
                        <p className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                            {row.reach}
                        </p>
                    </div>
                </Row>
            </div>
            {editing.opened > 0 ? (
                <AccountUpdatesSheet
                    // A fresh draft each time it opens.
                    key={editing.opened}
                    state={state}
                    open={editing.open}
                    onClose={() => setEditing((e) => ({ ...e, open: false }))}
                />
            ) : null}
        </section>
    );
}

/**
 * The row's Edit sheet: the two choices as sentences, what each leaves the
 * customers with, and one Save. Saved, it closes with a toast and Undo,
 * which puts the choice back as it was. A refusal keeps it open.
 */
export function AccountUpdatesSheet({
    state,
    open,
    onClose,
}: {
    state: AccountUpdates;
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const noteId = useId();
    const [choice, setChoice] = useState<AccountUpdatesChoice>(
        state.on ? "on" : "off",
    );
    const [pending, setPending] = useState(false);
    const next = choice === "on";
    const changed = next !== state.on;

    async function save() {
        const res = await runAction(() => setAccountUpdates(next), {
            setBusy: setPending,
        });
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onClose();
        router.refresh();
        showUndo(accountUpdatesSaved(next), async () => {
            const undo = await setAccountUpdates(state.on);
            router.refresh();
            return undo;
        });
    }

    return (
        <FormSheet
            id={`${ACCOUNT_UPDATES_ROW_ID}-panel`}
            returnFocusTo={() =>
                document.querySelector<HTMLElement>(
                    `#${ACCOUNT_UPDATES_ROW_ID} button`,
                )
            }
            title={ACCOUNT_UPDATES_TITLE}
            description={ACCOUNT_UPDATES_SHEET_LINE}
            open={open}
            pending={pending}
            dirty={changed}
            onClose={onClose}
            onSubmit={async (e) => {
                e.preventDefault();
                await save();
            }}
        >
            <RadioCards
                label={ACCOUNT_UPDATES_TITLE}
                describedBy={noteId}
                options={ACCOUNT_UPDATES_CHOICES}
                value={choice}
                onChange={setChoice}
                disabled={pending}
            />
            <Notice
                id={noteId}
                tone={state.emailConnected ? "neutral" : "warning"}
                role="note"
                className="mt-3"
            >
                {accountUpdatesEmailLine(state.emailConnected)}
            </Notice>
        </FormSheet>
    );
}
