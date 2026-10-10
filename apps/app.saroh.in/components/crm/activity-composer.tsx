"use client";

import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { FormSheetBody, FormSheetFoot } from "@/components/shared/form-sheet";
import { logActivity } from "@/lib/leads/actions";

/**
 * Note composer for a lead (S3-007), drawn inside the lead's "Add note"
 * sheet. Writes a free-text NOTE onto the lead's timeline via the
 * `logActivity` server action (`activity:write`), then closes the sheet
 * (`onDone`) and refreshes the server-rendered view so the note appears at
 * the top of the timeline. A refusal is a toast and the sheet stays open
 * with what was typed. Owner/Admin-only writes are enforced by the api.
 */
export function ActivityComposer({
    leadId,
    onDone,
}: {
    leadId: string;
    /** The note was saved: close the sheet. */
    onDone: () => void;
}) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [busy, setBusy] = useState(false);
    const [tried, setTried] = useState(false);
    const id = useId();
    const empty = tried && !body.trim();

    async function onSubmit() {
        setTried(true);
        const text = body.trim();
        if (!text) return;
        setBusy(true);
        const res = await logActivity(leadId, text);
        setBusy(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        showSuccess("Note added.");
        onDone();
        router.refresh();
    }

    return (
        <>
            <FormSheetBody className="gap-4">
                <div className="grid gap-2">
                    <Label htmlFor={id}>Note</Label>
                    <Textarea
                        id={id}
                        placeholder="Log a note or call summary…"
                        value={body}
                        disabled={busy}
                        aria-invalid={empty || undefined}
                        aria-describedby={empty ? `${id}-problem` : undefined}
                        onChange={(e) => setBody(e.target.value)}
                        rows={6}
                    />
                    {empty ? (
                        <p
                            id={`${id}-problem`}
                            role="alert"
                            className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                        >
                            Write the note first.
                        </p>
                    ) : null}
                </div>
            </FormSheetBody>
            <FormSheetFoot
                saveLabel="Add note"
                savingLabel="Adding…"
                pending={busy}
                onSubmit={onSubmit}
            />
        </>
    );
}
