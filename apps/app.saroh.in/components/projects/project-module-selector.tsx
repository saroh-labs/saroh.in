"use client";

import { Switch } from "@saroh/ui/switch";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
    deselectProjectModuleAction,
    selectProjectModuleAction,
} from "@/lib/modules/actions";
import type { ModuleView } from "@/lib/modules/schema";

/**
 * Per-Project module selection (ADR-003 / #116). OWNER/ADMIN choose which of
 * the Organization's ENABLED modules appear in this Project. A module the
 * Organization has not enabled is shown disabled with a link to enable it first
 * — Organization enablement is always authoritative. Non-managers see the
 * selection read-only.
 */
export function ProjectModuleSelector({
    projectId,
    modules,
}: {
    projectId: string;
    modules: ModuleView[];
}) {
    return (
        <ul className="divide-y rounded-xl border">
            {modules.map((module, index) => (
                <ProjectModuleRow
                    key={module.key}
                    projectId={projectId}
                    module={module}
                    index={index}
                />
            ))}
        </ul>
    );
}

function ProjectModuleRow({
    projectId,
    module,
    index,
}: {
    projectId: string;
    module: ModuleView;
    /** Position in the list, for the staggered entrance only. */
    index: number;
}) {
    const [pending, startTransition] = useTransition();
    const orgEnabled = module.lifecycle === "ENABLED";

    const toggle = (next: boolean) => {
        startTransition(async () => {
            const result = next
                ? await selectProjectModuleAction(projectId, module.key)
                : await deselectProjectModuleAction(projectId, module.key);
            if (result.ok) {
                toast.success(
                    next
                        ? `${module.label} added to this project`
                        : `${module.label} removed from this project`,
                );
            } else {
                toast.error(result.error);
            }
        });
    };

    return (
        <li
            style={{ "--wk-i": index } as React.CSSProperties}
            className="wk-item flex items-center justify-between gap-4 p-4"
        >
            <div className="min-w-0">
                <p className="text-sm font-medium">{module.label}</p>
                {!orgEnabled ? (
                    <p className="text-sm text-muted-foreground">
                        Not enabled for the organization.{" "}
                        <Link
                            href="/settings/modules"
                            className="font-medium underline underline-offset-2"
                        >
                            Enable it first
                        </Link>
                    </p>
                ) : !module.canManage ? (
                    <p className="text-sm text-muted-foreground">
                        {module.selectedForProject
                            ? "In this project"
                            : "Not in this project"}
                    </p>
                ) : null}
            </div>
            {orgEnabled && module.canManage ? (
                <Switch
                    checked={module.selectedForProject}
                    disabled={pending}
                    onCheckedChange={toggle}
                    aria-label={`${module.label} in this project`}
                />
            ) : null}
        </li>
    );
}
