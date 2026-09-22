"use client";

import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { LEAD_STATUS } from "@/lib/crm/format";
import { updateLead } from "@/lib/leads/actions";
import type { LeadStatus } from "@/lib/leads/service";

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
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    async function onChange(next: LeadStatus) {
        if (next === status) return;
        setBusy(true);
        const res = await updateLead(leadId, { status: next });
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Lead updated");
        router.refresh();
    }

    return (
        <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
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
