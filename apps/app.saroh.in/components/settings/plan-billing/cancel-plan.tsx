"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { CalendarX2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/shared/confirm/confirm-dialog";
import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { runAction } from "@/lib/api/run-action";
import { formatDate, viewerTimeZone } from "@/lib/format/datetime";
import {
    changePlanAction,
    quoteChangeAction,
} from "@/lib/saroh-billing/billing-actions";
import type { CancelOffer } from "@/lib/saroh-billing/plan-view";
import type { CancelWords } from "@/lib/saroh-billing/quote-words";
import { cancelWords } from "@/lib/saroh-billing/quote-words";

/** Said when the API answered with something that isn't a move to Free. */
const NOT_CANCELLED = "Your plan couldn't be cancelled. Nothing changed.";

/**
 * "Cancel plan" under Your plan (owner, 17 Oct 2026), for whoever holds
 * `billing:manage`. Pressed, it asks the API for Free's quote first, so
 * the confirm's date is the API's (the end of what is paid), never the
 * browser's. The confirm is the app's one (`ConfirmDialog`): what stops,
 * until when the plan is kept, then Free; "Keep ‹plan›" or "Cancel plan".
 * Cancelling is `POST /billing/change-plan` to Free, the same change the
 * plan picker makes (`CheckoutService.toFree`): autopay stops and the plan
 * runs to the end of what is paid. Afterwards the page is read again and
 * Your plan says it ends. Nothing takes it back yet (no undo in the API).
 */
export function CancelPlan({ offer }: { offer: CancelOffer }) {
    const router = useRouter();
    const trigger = useRef<HTMLButtonElement>(null);
    const [quoting, setQuoting] = useState(false);
    const [words, setWords] = useState<CancelWords | null>(null);

    async function ask() {
        const res = await runAction(
            () => quoteChangeAction({ plan: offer.freePlanId, cycle: "month" }),
            { setBusy: setQuoting },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        if (res.data.kind !== "TO_FREE") {
            showError(NOT_CANCELLED);
            return;
        }
        setWords(
            cancelWords(res.data, {
                planName: offer.planName,
                yearly: offer.yearly,
            }),
        );
    }

    async function cancel() {
        const res = await runAction(
            () => changePlanAction({ plan: offer.freePlanId, cycle: "month" }),
            { quiet: true },
        );
        if (!res) return { ok: false, error: undefined };
        if (!res.ok) return { ok: false, error: res.error };
        if (res.data.kind !== "TO_FREE") {
            return { ok: false, error: NOT_CANCELLED };
        }
        const at = res.data.effectiveAt;
        showSuccess(
            new Date(at) > new Date()
                ? `Plan cancelled. You keep ${offer.planName} until ${formatDate(at, viewerTimeZone())}.`
                : `Plan cancelled. You're on ${offer.freePlanName} from today.`,
        );
        router.refresh();
        return { ok: true };
    }

    return (
        <>
            <p>
                <Button
                    ref={trigger}
                    type="button"
                    variant="outline"
                    size="sm"
                    busy={quoting}
                    busyLabel="Checking…"
                    onClick={() => void ask()}
                >
                    Cancel plan
                </Button>
            </p>
            <ConfirmDialog
                open={words !== null}
                onOpenChange={(open) => {
                    if (!open) setWords(null);
                }}
                title={words?.title ?? ""}
                description={
                    words ? (
                        <>
                            {words.lead}
                            {words.iso ? <ViewerDate iso={words.iso} /> : null}
                            {words.tail}
                        </>
                    ) : null
                }
                confirmLabel={words?.confirm ?? "Cancel plan"}
                busyLabel="Cancelling…"
                keepLabel={words?.keep ?? `Keep ${offer.planName}`}
                icon={CalendarX2}
                returnFocusTo={trigger}
                onConfirm={cancel}
            />
        </>
    );
}
