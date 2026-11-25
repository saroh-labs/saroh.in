"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { LEAD_STATUS } from "@/lib/crm/format";
import { updateLead } from "@/lib/leads/actions";
import type { LeadStatus } from "@/lib/leads/service";
import { useLeadsSave } from "@/lib/leads/use-leads";
import { OptionSelect } from "@saroh/ui/option-select";

const STATUSES: LeadStatus[] = ["OPEN", "WON", "LOST"];

/**
 * Status picker for a single lead (S3-005). Changing the selection calls the
 * `updateLead` server action (`lead:write`) and refreshes on success. A native
 * shadcn Select, like every other picker in the product.
 */
export function LeadStatusControl({
    leadId,
    status,
}: {
    leadId: string;
    status: LeadStatus;
}) {
    const save = useLeadsSave();
    const [busy, setBusy] = useState(false);

    async function onChange(next: LeadStatus) {
        if (next === status) return;
        const res = await runAction(
            () => updateLead(leadId, { status: next }, save.orgId),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Lead saved.");
        void save.saved();
    }

    return (
        <div className="grid gap-1">
            <span data-ph-unmask="" className="text-xs text-muted-foreground">
                Status
            </span>
            <OptionSelect
                aria-label="Lead status"
                value={status}
                disabled={busy}
                onValueChange={(v) => void onChange(v)}
                options={STATUSES.map((s) => ({
                    value: s,
                    label: LEAD_STATUS[s].label,
                }))}
                className="w-40"
            />
        </div>
    );
}
