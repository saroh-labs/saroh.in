"use client";

import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import { OperatorDialog } from "@/components/operator-dialog";
import { claimPlatformOwnerAction } from "@/lib/team-actions";

/**
 * One line at the top of the work area while someone is in through the
 * break-glass `ADMIN_ALLOWLIST` with no recorded grant (admin console
 * redesign U10, R16), and its one action: Make me Platform owner, which
 * records the grant (with a reason, on the audit trail), after which the
 * line is gone. The API refuses it to anyone who already has a grant.
 */
export function BreakGlassBanner() {
    const router = useRouter();
    return (
        <div className="border-b border-warning/30 bg-warning-subtle px-4 py-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-warning-subtle-foreground">
                <strong className="font-semibold">Temporary access</strong>
                <span className="min-w-0 flex-[1_1_22rem]">
                    You&rsquo;re in through the emergency staff list, so this
                    access can&rsquo;t be taken back or traced to a role.
                </span>
                <OperatorDialog
                    trigger="Make me Platform owner"
                    triggerVariant="outline"
                    triggerClassName="h-8"
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
            </div>
        </div>
    );
}
