"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { moveLead } from "@/lib/leads/actions";
import type { LeadStage } from "@/lib/leads/service";

/**
 * Stage picker for a single lead (S3-005). Changing the selection calls the
 * `moveLead` server action (the api validates the target stage belongs to the
 * lead's pipeline and logs a STAGE_CHANGED activity atomically) and refreshes
 * the server-rendered view on success. Used on the lead detail page and the
 * pipeline board. A native `<select>` keeps it simple + accessible.
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
            toast.error(res.error);
            return;
        }
        toast.success("Lead moved");
        router.refresh();
    }

    return (
        <div className="grid gap-1">
            {!compact && (
                <span className="text-xs text-muted-foreground">{label}</span>
            )}
            <select
                aria-label="Move to stage"
                value={currentStageId}
                disabled={busy || stages.length === 0}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
                {stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                        {stage.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
