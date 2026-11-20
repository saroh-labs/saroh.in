"use client";

import { ConfirmDialog } from "@saroh/ui/confirm-dialog";
import { showError, showSuccess } from "@saroh/ui/toast";
import { CircleCheck, Clock, MessageSquareWarning } from "lucide-react";
import { useState } from "react";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { VerdictControls } from "@/components/sites/review/verdict-controls";
import { runAction } from "@/lib/api/run-action";
import { approvePost, askPostChanges } from "@/lib/content/actions";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { count, plural } from "@/lib/format/plural";
import type { ReviewerVerdict } from "@/lib/sites/service";
import { whenIn } from "@/lib/sites/zone-time";

import type { PostEditorModel } from "../editor/post-model";
import { approvalStatus, firstName } from "./approval-words";

/**
 * The approval band under the post's bar (O7; `blogdesk/WXWReview`,
 * `blogphone/WXYReview`, `WXYApproval`), at desk and on a phone:
 *
 * - to someone who may approve it, with a request open: "Ritika asked you to
 *   approve 3 changes · 10:05 am", her note, then Approve and Ask for
 *   changes (a reason, UX-043). Approving with feedback still open asks
 *   first. Approving publishes the post, or leaves it for her day.
 * - to everyone else: "Waiting for Kavya's approval", "Kavya asked for
 *   changes" with the reason, or "Approved by Kavya · goes live …".
 *
 * Nothing when the setting is off or nothing is asked.
 */
export function ApprovalBand({ model }: { model: PostEditorModel }) {
    const zone = useBusinessZone();
    const [recording, setRecording] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const { approval, draft, data } = model;
    const postId = draft.postId;
    if (!approval?.on || !postId) return null;
    const { request, verdict } = approval;
    const openNotes =
        data.feedback?.comments.filter((c) => c.resolvedAt === null).length ??
        0;
    const asker = request?.by ? firstName(request.by.name) : "A teammate";
    const later =
        model.scheduledAt && new Date(model.scheduledAt) > new Date()
            ? `Goes live ${formatDateTime(model.scheduledAt, zone)} once approved.`
            : null;

    async function approve(): Promise<boolean> {
        if (!postId || !approval) return false;
        const res = await runAction(
            () => approvePost(data.siteId, postId, approval.fingerprint),
            { setBusy: setRecording },
        );
        if (!res) return false;
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(
            res.data.published
                ? "Approved. It is live now."
                : `Approved. It goes live ${whenIn(res.data.scheduledAt ?? "", zone)}.`,
        );
        draft.refresh();
        return true;
    }

    async function onRecord(
        outcome: ReviewerVerdict,
        reason?: string,
    ): Promise<boolean> {
        if (!postId || !approval) return false;
        if (outcome === "APPROVED") {
            if (openNotes > 0) {
                setConfirming(true);
                return false;
            }
            return approve();
        }
        const res = await runAction(
            () =>
                askPostChanges(
                    data.siteId,
                    postId,
                    reason ?? "",
                    approval.fingerprint,
                ),
            { setBusy: setRecording },
        );
        if (!res) return false;
        if (!res.ok) {
            showError(res.error);
            return false;
        }
        showSuccess(`Sent. ${asker} hears about it.`);
        draft.refresh();
        return true;
    }

    const band =
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 text-[0.8125rem]";

    if (approval.canApprove && request && approval.state !== "approved") {
        const what = draft.live ? count(model.waiting, "change") : "this post";
        return (
            <section
                data-approval-band="approver"
                aria-label="Approval"
                className={`${band} bg-info-subtle text-info-subtle-foreground`}
            >
                <p className="min-w-0 flex-1">
                    <b className="font-semibold">
                        {asker} asked you to approve {what}
                    </b>{" "}
                    · {formatRelative(request.at)}
                    {request.note ? (
                        <span className="block text-foreground/80">
                            “{request.note}”
                        </span>
                    ) : null}
                    {later ? <span className="block">{later}</span> : null}
                </p>
                <div className="flex w-full flex-wrap gap-2 min-[760px]:w-auto">
                    <VerdictControls
                        onRecord={onRecord}
                        recording={recording}
                        compact
                    />
                </div>
                <ConfirmDialog
                    open={confirming}
                    onOpenChange={setConfirming}
                    tone="neutral"
                    title={`${count(openNotes, "piece")} of feedback ${plural(openNotes, "is", "are")} still open. Approve anyway?`}
                    description={`It goes live as ${asker} asked. Your feedback stays on the post as history.`}
                    confirmLabel="Approve anyway"
                    busyLabel="Approving…"
                    keepLabel="Back to feedback"
                    onConfirm={async () => {
                        if (await approve()) setConfirming(false);
                    }}
                />
            </section>
        );
    }

    if (approval.state === "asked" && verdict) {
        return (
            <section
                data-approval-band="asked"
                aria-label="Approval"
                className={`${band} bg-warning-subtle text-warning-subtle-foreground`}
            >
                <MessageSquareWarning aria-hidden className="size-4 shrink-0" />
                <p className="min-w-0 flex-1">
                    <b className="font-semibold">{approvalStatus(approval)}</b>
                    {verdict.at ? ` · ${formatRelative(verdict.at)}` : ""}
                    {verdict.reason ? (
                        <span className="block text-foreground/80">
                            “{verdict.reason}”
                        </span>
                    ) : null}
                </p>
            </section>
        );
    }

    if (approval.state === "approved" && verdict?.by && later) {
        return (
            <section
                data-approval-band="approved"
                aria-label="Approval"
                className={`${band} bg-success-subtle text-success-subtle-foreground`}
            >
                <CircleCheck aria-hidden className="size-4 shrink-0" />
                <p className="min-w-0 flex-1">
                    <b className="font-semibold">
                        Approved by {firstName(verdict.by.name)}
                    </b>{" "}
                    · goes live {formatDateTime(model.scheduledAt ?? "", zone)}
                </p>
            </section>
        );
    }

    const waiting = approvalStatus(approval);
    if (waiting && request) {
        return (
            <section
                data-approval-band="waiting"
                aria-label="Approval"
                className={`${band} bg-info-subtle text-info-subtle-foreground`}
            >
                <Clock aria-hidden className="size-4 shrink-0" />
                <p role="status" className="min-w-0 flex-1">
                    <b className="font-semibold">{waiting}</b> · sent{" "}
                    {formatRelative(request.at)}
                    {later ? <span className="block">{later}</span> : null}
                </p>
            </section>
        );
    }
    return null;
}
