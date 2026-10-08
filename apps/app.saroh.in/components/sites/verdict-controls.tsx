"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { useId, useState } from "react";

import type { ReviewerVerdict } from "@/lib/sites/service";

/** The API's own floor and cap on a reason (`CreateApprovalDto.reason`). */
export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** What is wrong with a reason as typed, or null when it can be sent. */
export function reasonProblem(reason: string): string | null {
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) return "Say what needs changing.";
    if (trimmed.length > REASON_MAX) return "Keep it under 500 characters.";
    return null;
}

/**
 * Approve, or Ask for changes with a short reason (UX-043).
 *
 * "Ask for changes" no longer records on the press: it opens a field for
 * what needs changing, because the person whose work it is can't act on a
 * bare "changes requested". `onRecord` resolves true when the verdict was
 * recorded, which closes the field.
 */
export function VerdictControls({
    onRecord,
    recording,
    compact = false,
}: {
    onRecord: (outcome: ReviewerVerdict, reason?: string) => Promise<boolean>;
    recording: boolean;
    /** The editor's rail: small buttons sharing one row. */
    compact?: boolean;
}) {
    const [asking, setAsking] = useState(false);
    const [reason, setReason] = useState("");
    const [problem, setProblem] = useState<string | null>(null);
    const fieldId = useId();
    const size = compact ? "sm" : "default";

    async function send() {
        const wrong = reasonProblem(reason);
        setProblem(wrong);
        if (wrong) return;
        if (await onRecord("CHANGES_REQUESTED", reason.trim())) {
            setAsking(false);
            setReason("");
        }
    }

    if (asking) {
        return (
            <div className="grid w-full gap-2">
                <label htmlFor={fieldId} className="text-xs font-medium">
                    What needs changing?
                </label>
                <Textarea
                    id={fieldId}
                    value={reason}
                    rows={3}
                    maxLength={REASON_MAX}
                    autoFocus
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${fieldId}-error` : undefined}
                    onChange={(e) => {
                        setReason(e.target.value);
                        if (problem) setProblem(null);
                    }}
                    placeholder="The opening hours on Home are last season's."
                    className="text-sm"
                />
                {problem ? (
                    <p
                        id={`${fieldId}-error`}
                        className="text-xs text-destructive"
                    >
                        {problem}
                    </p>
                ) : null}
                <div className="flex gap-2">
                    <Button
                        type="button"
                        size={size}
                        disabled={recording}
                        onClick={() => void send()}
                    >
                        {recording ? "Sending…" : "Ask for changes"}
                    </Button>
                    <Button
                        type="button"
                        size={size}
                        variant="ghost"
                        disabled={recording}
                        onClick={() => {
                            setAsking(false);
                            setProblem(null);
                        }}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <>
            <Button
                type="button"
                size={size}
                variant="outline"
                className={cn(compact && "flex-1")}
                disabled={recording}
                onClick={() => void onRecord("APPROVED")}
            >
                Approve
            </Button>
            <Button
                type="button"
                size={size}
                variant="outline"
                className={cn(compact && "flex-1")}
                disabled={recording}
                onClick={() => setAsking(true)}
            >
                Ask for changes
            </Button>
        </>
    );
}
