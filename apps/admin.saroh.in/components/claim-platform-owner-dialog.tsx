"use client";

import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import { OperatorDialog } from "@/components/operator-dialog";
import { claimPlatformOwnerAction } from "@/lib/team-actions";

/**
 * Make me Platform owner (admin console U10, R16): records a Platform owner
 * grant for a break-glass operator, with a reason, on the audit trail. The
 * one dialog for it: the banner and the empty Your page both draw this.
 */
export function ClaimPlatformOwnerDialog({
    triggerVariant = "outline",
    triggerClassName,
}: {
    triggerVariant?: "outline" | "default";
    triggerClassName?: string;
}) {
    const router = useRouter();
    return (
        <OperatorDialog
            trigger="Make me Platform owner"
            triggerVariant={triggerVariant}
            triggerClassName={triggerClassName}
            title="Make me Platform owner"
            effect="Records a Platform owner grant for you on the team, so your access can be taken back and every change you make is traced to it. The emergency list stays as it is."
            submitLabel="Make me Platform owner"
            quickReasons={["Recording my own access"]}
            onSubmit={async ({ reason, idempotencyKey }) => {
                const result = await claimPlatformOwnerAction({
                    reason,
                    idempotencyKey,
                });
                if (!result.ok) {
                    return { ok: false, error: result.error };
                }
                showSuccess("You're a Platform owner on the record.");
                router.refresh();
                return { ok: true };
            }}
        />
    );
}
