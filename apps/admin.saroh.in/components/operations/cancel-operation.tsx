"use client";

import { useRouter } from "next/navigation";

import { cancelOperationAction } from "@/lib/machinery-actions";

import { OperatorDialog } from "../operator-dialog";

/**
 * Stop a running operation (#907): the targets it has not reached are
 * skipped, and the one it is on finishes. The API checks the permission it
 * was started under and keeps the reason.
 */
export function CancelOperation({
    operationId,
    waiting,
}: {
    operationId: string;
    /** Targets it has not reached yet, for the dialog's words. */
    waiting: number;
}) {
    const router = useRouter();
    return (
        <OperatorDialog
            trigger="Cancel the rest"
            title="Cancel this operation"
            effect={`The ${waiting === 1 ? "target" : `${waiting} targets`} it has not reached yet will be skipped and recorded as cancelled. One it is working on now finishes first. Nothing already done is undone.`}
            submitLabel="Cancel the operation"
            destructive
            onSubmit={async ({ reason, idempotencyKey }) => {
                const result = await cancelOperationAction(operationId, {
                    reason,
                    idempotencyKey,
                });
                if (result.ok) router.refresh();
                return result;
            }}
        />
    );
}
