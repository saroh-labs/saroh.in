"use client";

import { Button } from "@saroh/ui/button";
import { Textarea } from "@saroh/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { logActivity } from "@/lib/leads/actions";

/**
 * Note composer for a lead (S3-007). Writes a free-text NOTE onto the lead's
 * timeline via the `logActivity` server action (`activity:write`), then clears
 * the field and refreshes the server-rendered view so the note appears at the
 * top of the timeline. Owner/Admin-only writes are enforced by the api.
 */
export function ActivityComposer({ leadId }: { leadId: string }) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (!text) return;
        setBusy(true);
        const res = await logActivity(leadId, text);
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setBody("");
        toast.success("Note added");
        router.refresh();
    }

    return (
        <form onSubmit={onSubmit} className="grid gap-2">
            <Textarea
                aria-label="Add a note"
                placeholder="Log a note or call summary…"
                value={body}
                disabled={busy}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
            />
            <div className="flex justify-end">
                <Button
                    type="submit"
                    size="sm"
                    className="wk-press"
                    disabled={busy || !body.trim()}
                >
                    {busy ? "Saving…" : "Add note"}
                </Button>
            </div>
        </form>
    );
}
