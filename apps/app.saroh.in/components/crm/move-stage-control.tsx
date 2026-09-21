"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { moveLead } from "@/lib/leads/actions";
import type { LeadStage } from "@/lib/leads/service";

/**
 * Stage picker for a single lead (S3-005). Changing the selection calls the
 * `moveLead` server action (the api validates the target stage belongs to the
 * lead's pipeline and logs a STAGE_CHANGED activity atomically) and refreshes
 * the server-rendered view on success. Used on the lead detail page and the
 * pipeline board. A shadcn Select, like every other picker in the product.
 */
export function MoveStageControl({
    leadId,
    currentStageId,
    stages,
    label = "Stage",
    compact = false,
}: {
    leadId: string;
    currentStageId: string;
    stages: LeadStage[];
    label?: string;
    compact?: boolean;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function onChange(stageId: string) {
        if (stageId === currentStageId) return;
        setBusy(true);
        const res = await moveLead(leadId, stageId);
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Lead moved");
        router.refresh();
    }

    return (
        <div className="grid gap-1">
            {!compact && (
                <span className="text-xs text-muted-foreground">{label}</span>
            )}
            <OptionSelect
                aria-label="Move to stage"
                value={currentStageId}
                disabled={busy || stages.length === 0}
                onValueChange={(v) => void onChange(v)}
                options={stages.map((stage) => ({
                    value: stage.id,
                    label: stage.name,
                }))}
                className="w-48"
            />
        </div>
    );
}
