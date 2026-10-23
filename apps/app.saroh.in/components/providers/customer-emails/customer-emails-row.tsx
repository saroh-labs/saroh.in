"use client";

import { Button } from "@saroh/ui/button";
import { useId, useState } from "react";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import { Row } from "@/components/shared/page/settings-rows";
import type { CustomerEmails } from "@/lib/communications/customer-emails";
import {
    CUSTOMER_EMAILS_ROW,
    CUSTOMER_EMAILS_TITLE,
    customerEmailsRow,
} from "@/lib/communications/customer-emails";

import {
    CUSTOMER_EMAILS_ROW_ID,
    CustomerEmailsSheet,
} from "./customer-emails-sheet";

/**
 * Settings › Providers' "Emails to your customers" (DEC-174, U4 #1135):
 * the automatic emails Saroh sends the business's customers from its own
 * email, under "Updates in Messages". Read first: how many are on, which
 * are not sent, and at most one quiet line (no email provider, else why
 * this person can only read them). Edit opens the sheet of switches;
 * someone without `comms:manage` opens the same sheet with View, fixed.
 *
 * Drawn only while the business is offered at least one (`customerEmailsRow`):
 * the API lists only the emails Saroh sends today whose module is on, so
 * nobody is shown a switch that does nothing.
 */
export function CustomerEmailsBlock({ state }: { state: CustomerEmails }) {
    const id = useId();
    const [editing, setEditing] = useState({ open: false, opened: 0 });
    const row = customerEmailsRow(state);
    if (!row) return null;

    return (
        <section aria-labelledby={id}>
            <h3 id={id} className="label mb-2">
                {CUSTOMER_EMAILS_TITLE}
            </h3>
            <div className="overflow-hidden rounded-xl border border-border bg-card">
                <Row
                    id={CUSTOMER_EMAILS_ROW_ID}
                    label={CUSTOMER_EMAILS_ROW}
                    action={
                        <Button
                            size="sm"
                            variant="outline"
                            aria-haspopup="dialog"
                            aria-label={`${state.canChange ? "Edit" : "View"} emails to your customers`}
                            onClick={() =>
                                setEditing((e) => ({
                                    open: true,
                                    opened: e.opened + 1,
                                }))
                            }
                        >
                            {state.canChange ? "Edit" : "View"}
                        </Button>
                    }
                >
                    <div className="space-y-1" data-testid="customer-emails">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <StatusBadge
                                tone={row.allOff ? "warning" : "neutral"}
                            >
                                {row.status}
                            </StatusBadge>
                            <span className="min-w-0 text-pretty">
                                {row.says}
                            </span>
                        </div>
                        {row.line ? (
                            <p className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                                {row.line}
                            </p>
                        ) : null}
                    </div>
                </Row>
            </div>
            {editing.opened > 0 ? (
                <CustomerEmailsSheet
                    key={editing.opened}
                    state={state}
                    open={editing.open}
                    onClose={() => setEditing((e) => ({ ...e, open: false }))}
                />
            ) : null}
        </section>
    );
}
