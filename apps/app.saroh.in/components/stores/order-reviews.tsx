"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess, showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { EmailNoteText } from "@/components/communications/email-note";
import { inviteReviews } from "@/lib/product-reviews/actions";
import {
    invitationSentence,
    reviewEmailNote,
} from "@/lib/product-reviews/describe";
import type { InvitationState } from "@/lib/product-reviews/service";

/**
 * An order's Reviews section: where its invitation stands, and Invite or
 * Resend. Answers "was this customer asked?" before anyone asks twice.
 * With no email provider of the business's own (D11), it leads with that
 * and the way to fix it instead.
 */
export function OrderReviews({
    orderId,
    state,
    canWrite,
    may,
}: {
    orderId: string;
    state: InvitationState;
    canWrite: boolean;
    /** May connect a provider; may see the plans. */
    may: { connect: boolean; plans: boolean };
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const verb = state.state === "none" ? "Invite a review" : "Resend";
    const note =
        state.blocked?.reason === "no-email-provider"
            ? reviewEmailNote(state.email, may)
            : null;

    const invite = () => {
        startTransition(async () => {
            const res = await inviteReviews([orderId]);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            const result = res.data.at(0);
            if (result?.status === "queued") {
                showSuccess(
                    result.note === "consent-not-checked"
                        ? "Invitation sending — no contact on file, so email consent couldn't be checked"
                        : "Review invitation sending",
                );
            } else if (result) {
                showWarning(result.message);
            }
            router.refresh();
        });
    };

    return (
        <section
            aria-label="Reviews"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
        >
            <div className="min-w-0">
                <p className="text-[13px] font-medium">Reviews</p>
                <p className="text-[12.5px] text-muted-foreground">
                    {note ? (
                        <EmailNoteText note={note} />
                    ) : state.blocked && state.state === "none" ? (
                        state.blocked.message
                    ) : (
                        invitationSentence(state)
                    )}
                </p>
            </div>
            {canWrite && state.state !== "completed" && !note ? (
                <Button
                    variant="outline"
                    size="sm"
                    disabled={pending || state.blocked !== null}
                    title={state.blocked?.message}
                    onClick={invite}
                >
                    {pending ? "Sending…" : verb}
                </Button>
            ) : null}
        </section>
    );
}
