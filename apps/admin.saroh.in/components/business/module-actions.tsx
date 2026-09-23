"use client";

import { repairModulesAction, setModuleAction } from "@/lib/business-actions";

import { OperatorDialog } from "../operator-dialog";

/**
 * Turn one module on or off for a business, under the same dependency and
 * safe-deactivation rules its owner meets. When a rule blocks it, the API's
 * reason — "disable Appointments first", "3 open orders" — is what shows.
 */
export function ModuleToggle({
    organizationId,
    moduleKey,
    label,
    enabled,
}: {
    organizationId: string;
    moduleKey: string;
    label: string;
    enabled: boolean;
}) {
    return (
        <OperatorDialog
            trigger={enabled ? "Turn off" : "Turn on"}
            triggerVariant="ghost"
            title={`${enabled ? "Turn off" : "Turn on"} ${label}`}
            effect={
                enabled
                    ? `${label} disappears from this business's workspace. Nothing is deleted; turning it back on brings it all back.`
                    : `${label} appears in this business's workspace. Anything it depends on must already be on.`
            }
            submitLabel={enabled ? `Turn off ${label}` : `Turn on ${label}`}
            destructive={enabled}
            onSubmit={({ reason, idempotencyKey }) =>
                setModuleAction(organizationId, moduleKey, {
                    reason,
                    idempotencyKey,
                    enabled: !enabled,
                })
            }
        />
    );
}

export function RepairModules({ organizationId }: { organizationId: string }) {
    return (
        <OperatorDialog
            trigger="Repair"
            triggerVariant="outline"
            title="Repair module records"
            effect="Adds any module record this business is missing, worked out from what it already uses. It never changes a module the owner has already turned on or off."
            submitLabel="Repair"
            onSubmit={({ reason, idempotencyKey }) =>
                repairModulesAction(organizationId, { reason, idempotencyKey })
            }
        />
    );
}
