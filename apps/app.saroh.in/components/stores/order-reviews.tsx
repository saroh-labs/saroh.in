"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess, showWarning } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { inviteReviews } from "@/lib/product-reviews/actions";
import { invitationSentence } from "@/lib/product-reviews/describe";
import type { InvitationState } from "@/lib/product-reviews/service";

/**
 * An order's Reviews section: where its invitation stands, and Invite or
 * Resend. Answers "was this customer asked?" before anyone asks twice.
 */
export function OrderReviews({
    orderId,
    state,
    canWrite,
}: {
    orderId: string;
    state: InvitationState;
    canWrite: boolean;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const verb = state.state === "none" ? "Invite a review" : "Resend";

    const invite = () => {
        startTransition(async () => {
            const res = await inviteReviews([orderId]);
            if (!res.ok) {
                showError(res.error);
                return;
            }
            const result = res.data.at(0);
            if (result?.status === "sent") {
                showSuccess(
                    result.note === "consent-not-checked"
                        ? "Invitation sent — no contact on file, so email consent couldn't be checked"
                        : "Review invitation sent",
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
                    {state.blocked && state.state === "none"
                        ? state.blocked.message
                        : invitationSentence(state)}
                </p>
            </div>
            {canWrite && state.state !== "completed" ? (
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
