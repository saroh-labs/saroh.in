"use client";

import { FormSheetBody } from "@/components/shared/form-sheet";
import { useToastsAboveFoot } from "@/components/shared/overlay-form";
import { Button } from "@saroh/ui/button";
import { useCopy } from "@saroh/ui/copy-button";
import { showError } from "@saroh/ui/toast";
import { Check, Copy, MessageCircle, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import { PayLinkPanel } from "@/components/bookings/pay-link-panel";
import { firstName } from "@/lib/names";
import type { MessagePay } from "@/lib/services/booking-message";
import {
    bookingMessage,
    smsHref,
    whatsAppHref,
} from "@/lib/services/booking-message";
import type { PaidBy, PayChoice } from "@/lib/services/booking-pay";
import { PAID_BY } from "@/lib/services/booking-pay";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import { zoneShortName } from "@/lib/services/time-picker";

/** What the free-time sheet booked, for its booked state and message. */
export interface GapBookedInfo {
    bookingId: string;
    customer: string;
    phone: string | null;
    service: string;
    staffName: string;
    startAt: string;
    timeZone: string;
    /** "today, 4:00 to 4:45 pm". */
    when: string;
    pay: PayChoice;
    paidBy: PaidBy | null;
    /** "₹800", or null where the viewer sees no amounts. */
    amount: string | null;
    /** The payment link, when one was asked for. */
    link: PayLinkResult | null;
    business: string | null;
}

/** "Pays at the visit", "Paid by UPI", "Awaiting payment". */
export function payWords(pay: PayChoice, paidBy: PaidBy | null): string {
    if (pay === "PAID") {
        const how = PAID_BY.find((p) => p.key === paidBy)?.label;
        return how ? `Paid by ${how}` : "Paid";
    }
    if (pay === "LINK") return BOOKING_WORDS.awaitingPayment;
    return BOOKING_WORDS.paysAtVisit;
}

/**
 * Booked (BKDFromGap "booked", Q12): who is booked, with whom and when,
 * how it is paid, the payment link when one was made, and "Let Kabir
 * know": WhatsApp and SMS open the phone's or computer's own app with the
 * message filled in, Copy message copies it. Saroh sends nothing itself.
 * View booking opens it; Done closes the sheet.
 */
export function GapBooked({
    booked,
    onDone,
}: {
    booked: GapBookedInfo;
    onDone: () => void;
}) {
    const first = firstName(booked.customer);
    const [url, setUrl] = useState<string | null>(
        booked.link?.ok ? booked.link.url : null,
    );
    const message: MessagePay =
        booked.pay === "LINK"
            ? { kind: "link", amount: booked.amount, url }
            : booked.pay === "PAID"
              ? { kind: "paid", amount: booked.amount }
              : { kind: "visit", amount: booked.amount };
    const text = bookingMessage({
        customer: booked.customer,
        service: booked.service,
        withName: booked.staffName,
        startAt: booked.startAt,
        timeZone: booked.timeZone,
        zone: zoneShortName(booked.timeZone, Date.parse(booked.startAt)),
        business: booked.business,
        pay: message,
    });
    const { copy, copied } = useCopy();
    // Booked: the keyboard and a screen reader start at what happened.
    const heading = useRef<HTMLHeadingElement | null>(null);
    useEffect(() => heading.current?.focus(), []);
    const foot = useRef<HTMLDivElement | null>(null);
    useToastsAboveFoot(foot);

    return (
        <>
            <FormSheetBody className="block">
                <div className="grid min-w-0 gap-2.5">
                    <span
                        aria-hidden
                        className="grid size-11 place-items-center rounded-full bg-success-subtle text-success-subtle-foreground"
                    >
                        <Check className="size-6" />
                    </span>
                    <h3
                        ref={heading}
                        tabIndex={-1}
                        data-ph-mask=""
                        className="font-display text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] outline-none"
                    >
                        {booked.customer} is booked
                    </h3>
                    <p
                        data-ph-mask=""
                        className="text-[14px] leading-[1.5] text-muted-foreground"
                    >
                        {booked.service} with {firstName(booked.staffName)},{" "}
                        {booked.when}. {payWords(booked.pay, booked.paidBy)}.
                    </p>
                    {booked.link ? (
                        <PayLinkPanel
                            variant="card"
                            bookingId={booked.bookingId}
                            first={booked.link}
                            payer={first}
                            onLink={setUrl}
                        />
                    ) : null}
                    <span data-ph-mask="" className="label mt-3">
                        Let {first} know
                    </span>
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" size="lg">
                            <a
                                href={whatsAppHref(booked.phone, text)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                <MessageCircle aria-hidden />
                                WhatsApp
                            </a>
                        </Button>
                        <Button asChild variant="outline" size="lg">
                            <a href={smsHref(booked.phone, text)}>
                                <MessageSquareText aria-hidden />
                                SMS
                            </a>
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            onClick={() => {
                                void copy(text).then((ok) => {
                                    if (!ok) {
                                        showError(
                                            "Couldn't copy the message. Send it on WhatsApp or by SMS instead.",
                                        );
                                    }
                                });
                            }}
                        >
                            {copied ? (
                                <Check aria-hidden />
                            ) : (
                                <Copy aria-hidden />
                            )}
                            <span aria-live="polite">
                                {copied ? "Copied" : "Copy message"}
                            </span>
                        </Button>
                    </div>
                    <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                        These open WhatsApp or SMS with the message filled in,
                        or copy it. Saroh sends nothing itself.
                    </p>
                </div>
            </FormSheetBody>
            <div
                ref={foot}
                data-overlay-foot
                className="mt-4 flex gap-2 border-t border-border pt-4 min-[760px]:justify-end"
            >
                <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="flex-1 min-[760px]:flex-none"
                >
                    <Link
                        href={`/bookings/${encodeURIComponent(booked.bookingId)}`}
                    >
                        View booking
                    </Link>
                </Button>
                <Button
                    type="button"
                    size="lg"
                    className="flex-1 min-[760px]:flex-none"
                    onClick={onDone}
                >
                    Done
                </Button>
            </div>
        </>
    );
}
