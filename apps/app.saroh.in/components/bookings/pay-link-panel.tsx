"use client";

import { Refusal } from "@/components/shared/refusal";
import { isRoleRefusal } from "@/lib/api/role-denied";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { Share2 } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { useGstRateStep } from "@/components/gst-rates/use-gst-rate-step";
import type { RateItem } from "@/lib/gst-rates/missing";
import { createBookingPayLink } from "@/lib/services/actions";
import { CopyButton, ShareLink } from "@saroh/ui/copy-button";
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
 *
 * `variant="card"` is New booking's done screen (U8, BKMNewBookingStep6
 * "payment link made"): a card headed "Payment link" with Copy link and
 * Share, and no Done of its own, since the screen has one.
 */
export function PayLinkPanel({
    booked,
    bookingId,
    first,
    onDone,
    variant = "panel",
    payer = null,
    onLink,
}: {
    /** "Booked Priya Raman with Asha at 10:00." */
    booked?: string;
    bookingId: string;
    first: PayLinkResult;
    /** The panel's Done; the card has none. */
    onDone?: () => void;
    variant?: "panel" | "card";
    /** Who pays, by first name, for the card's line: "Send it to Zara…". */
    payer?: string | null;
    /** The link once it is made, the first time or on Try again. */
    onLink?: (url: string) => void;
}) {
    const id = useId();
    const [link, setLink] = useState(first);
    const [trying, setTrying] = useState(false);
    // The service has no GST rate: chosen here, then the link is made.
    const rates = useGstRateStep(LINK_STEP);
    const needsRate = !link.ok && Boolean(link.rates?.length);
    const card = variant === "card";

    const retry = (
        <Button
            type="button"
            variant={card ? "outline" : "default"}
            onClick={() => {
                setTrying(true);
                void rates
                    .run(() => makePayLink(bookingId))
                    .then((next) => {
                        // Closed without a rate: it stays as said.
                        if (next) {
                            setLink(next);
                            if (next.ok) onLink?.(next.url);
                        }
                        setTrying(false);
                    });
            }}
            busy={trying}
            busyLabel={needsRate ? "Making the link…" : "Trying again…"}
        >
            {needsRate ? "Choose a GST rate" : "Try again"}
        </Button>
    );

    const problem = link.ok ? null : link.plan ? (
        <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
            No payment link. Your plan doesn&apos;t take payment online. The
            booking is made, and they can pay at the visit.
        </p>
    ) : needsRate ? (
        <Refusal>{`${link.error} ${LINK_NEEDS_RATE}`}</Refusal>
    ) : (
        <Refusal>{`${link.error} ${isRoleRefusal(link.error) ? LINK_REFUSED : LINK_FAILED}`}</Refusal>
    );

    if (card) {
        const who = payer ?? "them";
        return (
            <div
                data-pay-link=""
                className="grid min-w-0 gap-2 rounded-[12px] border border-border bg-card px-4 py-3.5"
            >
                <span id={id} className="label">
                    Payment link
                </span>
                {link.ok ? (
                    <>
                        <Input
                            readOnly
                            aria-labelledby={id}
                            value={link.url}
                            onFocus={(e) => e.currentTarget.select()}
                            className="font-mono text-[13px]"
                        />
                        <p className="text-pretty text-[12.5px] leading-[1.5] text-muted-foreground">
                            Send it to {who} however you talk. The booking shows
                            Awaiting payment until they pay. Cancelling the
                            booking stops the link.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <CopyButton
                                value={link.url}
                                size="default"
                                className="flex-1"
                                wrapperClassName="flex flex-1"
                            />
                            <ShareButton
                                url={link.url}
                                text="Your link to pay for the booking"
                            />
                        </div>
                    </>
                ) : (
                    <>
                        {problem}
                        {link.plan ? null : (
                            <div className="flex flex-wrap gap-2">{retry}</div>
                        )}
                    </>
                )}
                {rates.step}
            </div>
        );
    }

    return (
        <div className="grid gap-3">
            {booked ? (
                <p className="text-[13px] font-semibold">{booked}</p>
            ) : null}
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
            ) : (
                problem
            )}
            <div className="flex flex-wrap justify-end gap-2">
                {onDone ? (
                    <Button type="button" variant="outline" onClick={onDone}>
                        Done
                    </Button>
                ) : null}
                {link.ok ? (
                    <ShareLink
                        value={link.url}
                        text="Your link to pay for the booking"
                        variant="default"
                        size="default"
                    />
                ) : link.plan ? null : (
                    retry
                )}
            </div>
            {rates.step}
        </div>
    );
}

/** What the browser can do never changes while the page is open. */
const subscribeNever = () => () => undefined;

/**
 * Share, beside Copy link, where the browser can open its share sheet
 * (WhatsApp, Messages, Mail); left out where it can't, so there are never
 * two Copy links.
 */
function ShareButton({ url, text }: { url: string; text: string }) {
    const canShare = useSyncExternalStore(
        subscribeNever,
        () =>
            typeof navigator !== "undefined" &&
            typeof navigator.share === "function",
        () => false,
    );
    if (!canShare) return null;
    return (
        <Button
            type="button"
            className="flex-1"
            onClick={() => {
                // Closing the sheet without sharing is not a failure.
                void navigator.share({ url, text }).catch(() => undefined);
            }}
        >
            <Share2 aria-hidden />
            Share
        </Button>
    );
}
