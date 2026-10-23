"use client";

import { Skeleton } from "@saroh/ui/skeleton";
import { TextLink } from "@saroh/ui/text-link";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { RadioCards } from "@/components/shared/fields/choice-group";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/forms/form-sheet";
import { FailedRead } from "@/components/shared/states/failed-read";
import type { HeldResult } from "@/components/shared/undo/use-hold";
import { useHold } from "@/components/shared/undo/use-hold";
import { runAction } from "@/lib/api/run-action";
import { cancelBooking, readBookingForCancel } from "@/lib/services/actions";
import type { BookingMoney } from "@/lib/services/booking-money";
import { cancelledMessage } from "@/lib/services/booking-money";
import type { CancelChoice, MoneyChoice } from "@/lib/services/cancel-choice";
import {
    cancelChoice,
    cancelLabel,
    cancelOptions,
} from "@/lib/services/cancel-choice";
import { firstName } from "@/lib/services/time-picker";

/** The booking being cancelled, as far as the screen that asks knows it. */
export interface CancelSheetBooking {
    id: string;
    /** Who it is for: "Kabir Singh". Empty: "Cancel this booking?". */
    who: string;
    /** The line under the title: "Today, 11:30 am · ₹400 deposit paid". */
    when?: string;
    /**
     * What was paid (E8). Left out (the list holds none), the sheet reads
     * it as it opens, so every cancel asks about the money (BA-01).
     */
    money?: BookingMoney | null;
    /** The free-cancel time fixed at booking (DEC-051). */
    freeCancelUntil?: string | null;
    /** The business's zone (Q10). */
    timezone: string;
}

/** A held cancel, from the screen that keeps the Undo (`useHold().send`). */
export type SendHeld = ReturnType<typeof useHold>["send"];

/**
 * The one cancel sheet (U3, BA-01, R4): every screen that cancels a single
 * booking opens it — the booking's page, the list, the quick look's
 * "Move or cancel". A bottom sheet on a phone, the right-hand panel at a
 * desk (BKMQuickLookStep2, BKMAllBookings, BKDQuickLook).
 *
 * With money paid online it says the business's policy in one sentence and
 * asks the money question, the policy's answer picked (Q14: the same for
 * everyone, a Member included): Refund when it is cancelled in time, Keep
 * the deposit when late, with Refund still there for someone who may
 * refund payments. The cancel is then made at once, and the toast says
 * what happened to the money.
 *
 * With nothing paid it is a plain "Cancel booking? · Keep booking", and the
 * cancel waits ten seconds with Undo, since it tells the customer
 * (`useHold`). Pass `send` from the screen's own `useHold` when the sheet
 * may unmount before the ten seconds are up (a quick look that closes);
 * left out, the sheet holds it, and must stay mounted.
 */
export function CancelSheet({
    open,
    booking,
    canRefund = false,
    canReadOrder = false,
    send,
    returnFocusTo,
    onClose,
    onCancelled,
}: {
    open: boolean;
    booking: CancelSheetBooking;
    /** `payment:manage`: may refund what the policy keeps. */
    canRefund?: boolean;
    /** `order:read`: a treatment's visit links to its order (E9). */
    canReadOrder?: boolean;
    send?: SendHeld;
    returnFocusTo?: string | (() => HTMLElement | null | undefined);
    onClose: () => void;
    /** Once it is cancelled (or, held, once the ten seconds are up). */
    onCancelled?: () => void;
}) {
    const own = useHold();
    const held = send ?? own.send;
    const first = firstName(booking.who);
    return (
        <FormSheet
            open={open}
            bottomOnPhone
            wide
            title={
                first ? `Cancel ${first}'s booking?` : "Cancel this booking?"
            }
            description={
                booking.when?.trim()
                    ? booking.when
                    : "They're told once it's cancelled."
            }
            returnFocusTo={returnFocusTo}
            onClose={onClose}
        >
            {/* Drawn only while open: a fresh choice per opening. */}
            {open ? (
                <CancelDraft
                    booking={booking}
                    canRefund={canRefund}
                    canReadOrder={canReadOrder}
                    send={held}
                    onClose={onClose}
                    onCancelled={onCancelled}
                />
            ) : null}
        </FormSheet>
    );
}

type Read =
    | { state: "given" }
    | { state: "loading" }
    | { state: "failed" }
    | {
          state: "ready";
          money: BookingMoney | null;
          freeCancelUntil: string | null;
          timezone: string;
      };

function CancelDraft({
    booking,
    canRefund,
    canReadOrder,
    send,
    onClose,
    onCancelled,
}: {
    booking: CancelSheetBooking;
    canRefund: boolean;
    canReadOrder: boolean;
    send: SendHeld;
    onClose: () => void;
    onCancelled?: () => void;
}) {
    const router = useRouter();
    const headingId = useId();
    const given = booking.money !== undefined;
    const [read, setRead] = useState<Read>(
        given ? { state: "given" } : { state: "loading" },
    );
    const [attempt, setAttempt] = useState(0);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (given) return;
        let live = true;
        void readBookingForCancel(booking.id)
            .catch(() => null)
            .then((found) => {
                if (!live) return;
                setRead(
                    found ? { state: "ready", ...found } : { state: "failed" },
                );
            });
        return () => {
            live = false;
        };
    }, [given, booking.id, attempt]);

    // Read at the moment it is asked for: the deadline may just have gone.
    const [now] = useState(() => Date.now());
    const source =
        read.state === "ready"
            ? read
            : read.state === "given"
              ? {
                    money: booking.money ?? null,
                    freeCancelUntil: booking.freeCancelUntil ?? null,
                    timezone: booking.timezone,
                }
              : null;
    const choice: CancelChoice | null = source
        ? cancelChoice({
              money: source.money ?? undefined,
              freeCancelUntil: source.freeCancelUntil,
              timezone: source.timezone,
              now,
              canRefund,
              first: firstName(booking.who),
          })
        : null;
    const [picked, setPicked] = useState<MoneyChoice | null>(null);
    const pick: MoneyChoice =
        picked ?? (choice?.kind === "money" ? choice.preset : "keep");

    function finish() {
        onCancelled?.();
        router.refresh();
    }

    async function submit() {
        if (!choice || busy) return;
        if (choice.kind === "plain") {
            // Tells the customer: held ten seconds with Undo.
            let said = "Booking cancelled";
            onClose();
            send(`cancel-booking:${booking.id}`, {
                soon: "Cancelling in 10 seconds",
                description: "They're told once it is cancelled.",
                run: async (): Promise<HeldResult> => {
                    const res = await cancelBooking(booking.id, {});
                    if (!res.ok) return res;
                    const message = cancelledMessage(res.data.money);
                    if (message.tone === "error") {
                        showError(message.title, message.body);
                        finish();
                        return { ok: false, error: "", said: true };
                    }
                    said = message.title;
                    finish();
                    return { ok: true };
                },
                sent: () => said,
                failed: "The booking wasn't cancelled.",
            });
            return;
        }
        const res = await runAction(
            () => cancelBooking(booking.id, cancelOptions(choice, pick)),
            { setBusy },
        );
        if (!res) return;
        if (!res.ok) {
            showError(res.error);
            return;
        }
        const message = cancelledMessage(res.data.money);
        if (message.tone === "error") showError(message.title, message.body);
        else showSuccess(message.title);
        onClose();
        finish();
    }

    return (
        <>
            <FormSheetBody className="gap-3.5">
                {read.state === "loading" ? (
                    <div aria-busy="true" className="grid gap-2">
                        <p className="text-[13px] text-muted-foreground">
                            Checking what was paid…
                        </p>
                        <Skeleton className="h-[60px] rounded-[12px]" />
                        <Skeleton className="h-[60px] rounded-[12px]" />
                    </div>
                ) : read.state === "failed" ? (
                    <FailedRead
                        size="panel"
                        things="what was paid for it"
                        reassurance="The booking hasn't been cancelled."
                        onRetry={() => {
                            setRead({ state: "loading" });
                            setAttempt((n) => n + 1);
                        }}
                    />
                ) : choice?.kind === "money" ? (
                    <>
                        <p className="text-pretty text-[14px] leading-[1.55]">
                            {choice.policy}
                        </p>
                        <span id={headingId} className="label">
                            {choice.heading}
                        </span>
                        <RadioCards
                            labelledBy={headingId}
                            value={pick}
                            onChange={setPicked}
                            rowClassName="min-h-[60px] rounded-[12px] px-3.5 py-3 text-[14.5px] font-semibold"
                            options={[
                                {
                                    value: "refund",
                                    label: choice.refund.label,
                                    note: choice.refund.note,
                                    disabled: choice.refund.disabled,
                                },
                                {
                                    value: "keep",
                                    label: choice.keep.label,
                                    note: choice.keep.note,
                                    disabled: choice.keep.disabled,
                                },
                            ]}
                        />
                    </>
                ) : choice?.kind === "visit" ? (
                    <p className="text-pretty text-[14px] leading-[1.55]">
                        {choice.body}
                        {canReadOrder ? (
                            <>
                                {" "}
                                <TextLink
                                    href={`/commerce/orders/${encodeURIComponent(choice.treatmentOrderId)}`}
                                >
                                    Open the order
                                </TextLink>
                            </>
                        ) : null}
                    </p>
                ) : choice ? (
                    <p className="text-pretty text-[14px] leading-[1.55]">
                        {choice.body}
                    </p>
                ) : null}
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={
                    choice ? cancelLabel(choice, pick) : "Cancel booking"
                }
                savingLabel="Cancelling…"
                cancelLabel="Keep booking"
                tone="destructive"
                saveOff={!choice}
                pending={busy}
                onSubmit={submit}
            />
        </>
    );
}
