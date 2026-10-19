import { RepairModules } from "@/components/business/module-actions";
import { ModuleRows } from "@/components/business/modules/module-rows";
import { Panel } from "@/components/panel";
import type { BusinessTabProps } from "@/lib/business-page";
import {
    businessGate,
    readModuleState,
    readSummary,
    readView,
    tabTitle,
} from "@/lib/business-page";
import { can } from "@/lib/console";
import { listFlags } from "@/lib/control-plane";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Modules", organizationId) };
}

/**
 * Modules (admin plan U4, R3): one row per module with its true state —
 * the availability check the business's own workspace runs (U1) — the
 * reason in words, what it works with, and the one fix for the gate in its
 * way. It reads with `organization:read` and no support session, so
 * Operations reaches the fixes its permissions allow (R10).
 *
 * Two reads only sharpen it: their own switch per module, when a support
 * session is open (for the Turn on / Turn off a release-off row can't
 * tell), and Releases, for what Undo puts back.
 */
export default async function ModulesTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;
    const modulesWrite = can(staff, "organization:modules:write");

    const [summary, state, switches, priorOverrides] = await Promise.all([
        readSummary(organizationId),
        readModuleState(organizationId),
        can(staff, "organization:view-as")
            ? readSwitches(organizationId)
            : undefined,
        can(staff, "flags:read")
            ? readPriorOverrides(organizationId)
            : undefined,
    ]);

    return (
        <Panel
            title="Modules"
            description="What they can use, what is in the way, and what clears it."
            actions={
                modulesWrite ? (
                    <RepairModules organizationId={organizationId} />
                ) : undefined
            }
            data={state}
        >
            {(data) => (
                <ModuleRows
                    organizationId={organizationId}
                    businessName={summary?.name ?? "this business"}
                    state={data}
                    permissions={staff.permissions}
                    switches={switches}
                    priorOverrides={priorOverrides}
                />
            )}
        </Panel>
    );
}

/** Their own switch per module; nothing when no session is open. */
async function readSwitches(
    organizationId: string,
): Promise<Record<string, boolean> | undefined> {
    const result = await readView(organizationId).catch(() => null);
    if (result?.status !== "ok") return undefined;
    const modules = result.view.modules;
    if (modules.status !== "ok") return undefined;
    return Object.fromEntries(
        modules.data
            .filter((m) => m.status !== "ARCHIVED")
            .map((m) => [m.key, m.status === "ENABLED"]),
    );
}

/** Each release's setting for this business alone (null: the default). */
async function readPriorOverrides(
    organizationId: string,
): Promise<Record<string, boolean | null> | undefined> {
    const flags = await listFlags().catch(() => null);
    if (!flags) return undefined;
    return Object.fromEntries(
        flags.map((flag) => [
            flag.key,
            flag.overrides.find((o) => o.organizationId === organizationId)
                ?.enabled ?? null,
        ]),
    );
}
