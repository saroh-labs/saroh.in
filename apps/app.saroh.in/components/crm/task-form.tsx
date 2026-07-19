"use client";

import { Button } from "@saroh/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { createTask } from "@/lib/leads/actions";

/**
 * Follow-up task form for a lead (S3-007). Captures what to do (`body`) and a
 * due date/time, then calls the `createTask` server action (`activity:write`)
 * which records an `Activity{ type:"TASK", dueAt }`. On success it clears the
 * form and refreshes so the new task shows on the timeline. The datetime-local
 * input value is converted to an ISO string for the api's `IsISO8601` check.
 */
export function TaskForm({ leadId }: { leadId: string }) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [due, setDue] = useState("");
    const [busy, setBusy] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        const text = body.trim();
        if (!text || !due) return;
        const parsed = new Date(due);
        if (Number.isNaN(parsed.getTime())) {
            toast.error("Enter a valid due date");
            return;
        }
        setBusy(true);
        const res = await createTask(leadId, {
            body: text,
            dueAt: parsed.toISOString(),
        });
        setBusy(false);
        if (!res.ok) {
            toast.error(res.error);
            return;
        }
        setBody("");
        setDue("");
        toast.success("Follow-up scheduled");
        router.refresh();
    }

    return (
        <form
            onSubmit={onSubmit}
            className="grid gap-2 sm:grid-cols-[1fr_auto]"
        >
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
                <input
                    aria-label="Follow-up task"
                    placeholder="Follow up with…"
                    value={body}
                    disabled={busy}
                    onChange={(e) => setBody(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
                <input
                    aria-label="Due date"
                    type="datetime-local"
                    value={due}
                    disabled={busy}
                    onChange={(e) => setDue(e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                />
            </div>
            <div className="flex justify-end sm:col-span-2">
                <Button
                    type="submit"
                    size="sm"
                    variant="secondary"
                    disabled={busy || !body.trim() || !due}
                >
                    {busy ? "Scheduling…" : "Add follow-up"}
                </Button>
            </div>
        </form>
    );
}
