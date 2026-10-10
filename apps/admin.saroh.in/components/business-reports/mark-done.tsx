"use client";

import { markBusinessReportDoneAction } from "@/lib/business-report-actions";

import { OperatorDialog } from "../operator-dialog";

/**
 * Close one customer's report. Nothing happens to the business: suspending
 * it is its own action on the business's page.
 */
export function MarkDone({ id, host }: { id: string; host: string }) {
    return (
        <OperatorDialog
            trigger="Mark done"
            triggerVariant="ghost"
            title={`Mark the report about ${host} done`}
            effect="The report moves to Done. Nothing changes for the business; suspend it from its own page if it needs to stop."
            submitLabel="Mark done"
            onSubmit={({ reason, idempotencyKey }) =>
                markBusinessReportDoneAction({ id, reason, idempotencyKey })
            }
        />
    );
}
