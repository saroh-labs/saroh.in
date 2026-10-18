import {
    ModuleToggle,
    RepairModules,
} from "@/components/business/module-actions";
import { SessionTab } from "@/components/business/session-tab";
import { Panel } from "@/components/panel";
import type { BusinessTabProps } from "@/lib/business-page";
import { businessGate, tabTitle } from "@/lib/business-page";
import { can } from "@/lib/console";
import { asWords } from "@/lib/format";
import { moduleLabel } from "@/lib/modules";

export async function generateMetadata({ params }: BusinessTabProps) {
    const { organizationId } = await params;
    return { title: await tabTitle("Modules", organizationId) };
}

/**
 * Modules (admin plan U2): what this business has switched on, and the
 * switches for an operator holding `organization:modules:write`. U4
 * rebuilds it on each module's true state.
 */
export default async function ModulesTab({ params }: BusinessTabProps) {
    const gate = await businessGate();
    if (!gate.ok) return null;
    const { staff } = gate;
    const { organizationId } = await params;
    const modulesWrite = can(staff, "organization:modules:write");

    return (
        <SessionTab staff={staff} organizationId={organizationId}>
            {(view) => {
                const id = view.facts.id;
                return (
                    <Panel
                        title="Modules"
                        description="What this business has switched on."
                        actions={
                            modulesWrite ? (
                                <RepairModules organizationId={id} />
                            ) : undefined
                        }
                        data={view.modules}
                    >
                        {(modules) => (
                            <ul className="grid gap-1 sm:grid-cols-2">
                                {modules.map((module) => (
                                    <li
                                        key={module.key}
                                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-1.5"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {module.label}
                                            </p>
                                            <p className="truncate text-[12.5px] text-muted-foreground">
                                                {module.status === "ENABLED"
                                                    ? "On"
                                                    : module.status ===
                                                        "NOT_INSTALLED"
                                                      ? "Never set up"
                                                      : asWords(module.status)}
                                                {module.dependencies.length >
                                                    0 &&
                                                    ` · needs ${module.dependencies.map(moduleLabel).join(", ")}`}
                                            </p>
                                        </div>
                                        {modulesWrite &&
                                            module.status !== "ARCHIVED" && (
                                                <ModuleToggle
                                                    organizationId={id}
                                                    moduleKey={module.key}
                                                    label={module.label}
                                                    enabled={
                                                        module.status ===
                                                        "ENABLED"
                                                    }
                                                />
                                            )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Panel>
                );
            }}
        </SessionTab>
    );
}
