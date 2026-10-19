"use client";

import { Refusal } from "@/components/shared/refusal";
import { isRoleRefusal } from "@/lib/api/role-denied";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { useId, useState } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import type { RateItem } from "@/lib/gst-rates/missing";
import { createBookingPayLink } from "@/lib/services/actions";
import { ShareLink } from "@saroh/ui/copy-button";
import { Field } from "@saroh/ui/field";

/** After why the link wasn't made: the booking stands, and what to do. */
const LINK_FAILED =
    "The booking is made. Try again, or they can pay at the visit.";
/** The same for a role that can't make one: trying again won't help. */
const LINK_REFUSED = "The booking is made. They can pay at the visit.";

/** After a link refused for want of a GST rate: the booking stands. */
const LINK_NEEDS_RATE = "The booking is made, and they can pay at the visit.";

/** The GST rate ask's words where the action is a booking's payment link. */
export const LINK_STEP = {
    then: "make this payment link",
    continueLabel: "Save and make the link",
} as const;

/**
 * The payment link a booking got, or why it couldn't. `plan`: the business's
 * plan refused it (no online payments, R33) — trying again won't help.
 */
export type PayLinkResult =
    | { ok: true; url: string }
    | {
          ok: false;
          error: string;
          plan?: boolean;
          /**
           * The service has no GST rate, so its tax invoice can't be
           * issued: asked for in place (`use-gst-rate-step.tsx`).
           */
          rates?: RateItem[];
      };

/**
 * Make a booking's payment link, never throwing. A refusal by the plan is
 * shown as the plan's notice, with the way up (`showPlanRefusal`), as
 * every other screen shows one — not as a plain error.
 */
export async function makePayLink(bookingId: string): Promise<PayLinkResult> {
    try {
        const res = await createBookingPayLink(bookingId);
        if (res.ok) return { ok: true, url: res.data.url };
        if (res.plan) {
            showPlanRefusal(res.plan);
            return { ok: false, error: res.error, plan: true };
        }
        return {
            ok: false,
            error: res.error,
            ...(res.rates ? { rates: res.rates } : {}),
        };
    } catch {
        return { ok: false, error: "Couldn't make the payment link." };
    }
}

/**
 * After "Book it" with "Send a payment link" (E4): the booking is made, and here
 * is its link to copy and send — Saroh doesn't send it yet (A14, D17). The
 * link is shown in full, so it can be copied by hand where the clipboard
 * isn't allowed. When it couldn't be made, the booking still stands, and it
 * can be tried again.
 */
export function PayLinkPanel({
    booked,
    bookingId,
    first,
    onDone,
}: {
    /** "Booked Priya Raman with Asha at 10:00." */
    booked: string;
    bookingId: string;
    first: PayLinkResult;
    onDone: () => void;
}) {
    const id = useId();
    const [link, setLink] = useState(first);
    const [trying, setTrying] = useState(false);
    // The service has no GST rate: chosen here, then the link is made.
    const rates = useGstRateStep(LINK_STEP);
    const needsRate = !link.ok && Boolean(link.rates?.length);

    return (
        <div className="grid gap-3">
            <p className="text-[13px] font-semibold">{booked}</p>
            {link.ok ? (
                <>
                    <Field label="Payment link">
                        <Input
                            id={id}
                            readOnly
                            value={link.url}
                            onFocus={(e) => e.currentTarget.select()}
                        />
                    </Field>
                    <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                        Send it to them however you talk. The booking shows
                        unpaid until they pay. Cancelling it stops the link. A
                        payment they&apos;d already started shows on Home as one
                        to refund.
                    </p>
                </>
            ) : link.plan ? (
                <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                    No payment link. Your plan doesn&apos;t take payment online.
                    The booking is made, and they can pay at the visit.
                </p>
            ) : needsRate ? (
                <Refusal>{`${link.error} ${LINK_NEEDS_RATE}`}</Refusal>
            ) : (
                <Refusal>{`${link.error} ${isRoleRefusal(link.error) ? LINK_REFUSED : LINK_FAILED}`}</Refusal>
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={onDone}>
                    Done
                </Button>
                {link.ok ? (
                    <ShareLink
                        value={link.url}
                        text="Your link to pay for the booking"
                        variant="default"
                        size="default"
                    />
                ) : link.plan ? null : (
                    <Button
                        type="button"
                        onClick={() => {
                            setTrying(true);
                            void rates
                                .run(() => makePayLink(bookingId))
                                .then((next) => {
                                    // Closed without a rate: it stays as said.
                                    if (next) setLink(next);
                                    setTrying(false);
                                });
                        }}
                        busy={trying}
                        busyLabel={
                            needsRate ? "Making the link…" : "Trying again…"
                        }
                    >
                        {needsRate ? "Choose a GST rate" : "Try again"}
                    </Button>
                )}
            </div>
            {rates.step}
        </div>
    );
}
