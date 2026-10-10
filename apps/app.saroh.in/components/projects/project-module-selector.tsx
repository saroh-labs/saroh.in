"use client";

import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useTransition } from "react";

import { runAction } from "@/lib/api/run-action";
import {
    deselectProjectModuleAction,
    selectProjectModuleAction,
} from "@/lib/modules/actions";
import { refusalSentence } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";
import { TextLink } from "@saroh/ui/text-link";

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
            const result = await runAction(() =>
                next
                    ? selectProjectModuleAction(projectId, module.key)
                    : deselectProjectModuleAction(projectId, module.key),
            );
            if (!result) return;
            if (result.ok) {
                showSuccess(
                    next
                        ? `${module.label} added to this project`
                        : `${module.label} removed from this project`,
                );
            } else {
                showError(refusalSentence(result));
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
                        <TextLink href="/settings/modules">
                            Enable it first
                        </TextLink>
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
