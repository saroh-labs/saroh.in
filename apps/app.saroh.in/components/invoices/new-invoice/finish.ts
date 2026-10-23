"use client";

import { copyText } from "@saroh/ui/copy-button";
import { showError, showSuccess } from "@saroh/ui/toast";

import { reportFailure } from "@/components/billing/plan-refusal";
import { issueInvoice } from "@/lib/invoices/actions";
import { newPayLink } from "@/lib/invoices/link-actions";
import type { Invoice } from "@/lib/invoices/service";

type Issued = Awaited<ReturnType<typeof issueInvoice>>;

/** What a saved draft is told when it is kept as one. */
export const savedAsDraft = (who: string | undefined) =>
    `Saved as a draft for ${who ?? "them"}. No number yet.`;

/**
 * After Save draft or Issue, once the draft is on the server: keep it, or
 * issue it (through the business-details step, `run`) and, where a payment
 * link can be made, copy one; then go to the invoice. Each outcome is said
 * in the words today's form used: what happened, and what didn't.
 */
export async function finishInvoice({
    want,
    saved,
    detailsReady,
    run,
    withLink,
    push,
}: {
    want: "issue" | "draft";
    saved: Invoice;
    /** The business-details step was answered (#838). */
    detailsReady: boolean;
    /** Carries the issue through the business-details step (DEC-068). */
    run: (act: () => Promise<Issued>) => Promise<Issued | null>;
    withLink: boolean;
    push: (to: string) => void;
}): Promise<void> {
    const id = saved.id;
    const to = `/billing/invoices/${id}`;
    if (want === "draft") {
        showSuccess(savedAsDraft(saved.contact?.name));
        push(to);
        return;
    }
    // No registered address yet (DEC-068): asked here, then it issues.
    const issued = detailsReady ? await run(() => issueInvoice(id)) : null;
    if (!issued) {
        showSuccess("Saved as a draft. Issue it once your address is in.");
        push(to);
        return;
    }
    if (!issued.ok) {
        // The draft is saved; only issuing failed. Say which.
        showError("Saved as a draft, but not issued.", issued.error);
        push(to);
        return;
    }
    const number = issued.data.number ?? "Invoice";
    if (!withLink) {
        showSuccess(`${number} issued. Its lines are locked.`);
        push(to);
        return;
    }
    const link = await newPayLink(id, issued.data.updatedAt);
    if (!link.ok) {
        if (link.plan) {
            // Issued; only the payment link is the plan's to refuse.
            showSuccess(`${number} issued. Its lines are locked.`);
            reportFailure(link);
        } else {
            showError(
                `${number} issued, but no payment link was made.`,
                link.error,
            );
        }
    } else if (await copyText(link.data.url)) {
        showSuccess(
            `${number} issued and its payment link copied. Send it to ${issued.data.contact?.name ?? "them"}.`,
        );
    } else {
        showError(
            `${number} issued, but its payment link couldn't be copied. Copy a new one from the invoice.`,
        );
    }
    push(to);
}
