"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { updateLead } from "@/lib/leads/actions";
import type { LeadStatus } from "@/lib/leads/service";

const STATUSES: LeadStatus[] = ["OPEN", "WON", "LOST"];

/**
 * Status picker for a single lead (S3-005). Changing the selection calls the
 * `updateLead` server action (`lead:write`) and refreshes on success. A native
 * `<select>` keeps it simple + accessible.
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
            toast.error(res.error);
            return;
        }
        toast.success("Lead updated");
        router.refresh();
    }

    return (
        <div className="grid gap-1">
            <span className="text-xs text-muted-foreground">Status</span>
            <select
                aria-label="Lead status"
                value={status}
                disabled={busy}
                onChange={(e) => onChange(e.target.value as LeadStatus)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
                {STATUSES.map((s) => (
                    <option key={s} value={s}>
                        {s}
                    </option>
                ))}
            </select>
        </div>
    );
}
