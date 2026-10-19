import type { PayLinkResult } from "@/components/bookings/pay-link-panel";
import { formatTimeRange } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import type { PaidBy, PayChoice } from "@/lib/services/booking-pay";
import { PAID_BY } from "@/lib/services/booking-pay";
import { whenWords } from "@/lib/services/new-booking";
import { zoneShortName } from "@/lib/services/time-picker";

import type { Booked } from "./done-step";

/** "Pays at the visit · ₹800", or the words alone without a price. */
export function withAmount(words: string, amount: string | null): string {
    return amount ? `${words} · ${amount}` : words;
}

/** "10:45 am": when a booking of `minutes` starting then ends. */
export function endWords(
    startAt: string,
    minutes: number,
    zone: string,
): string {
    const end = new Date(Date.parse(startAt) + minutes * 60_000).toISOString();
    return whenWords(end, zone).split(", ")[1] ?? "";
}

/** How it was paid, as Book sent it. */
export type BookedPay =
    | { kind: "pack"; left: number }
    | { kind: PayChoice; paidBy: PaidBy | null; link: PayLinkResult | null };

/**
 * What the done screen says (BKMNewBookingStep6): who is booked with whom
 * and when, how it is paid, and the message's words for it.
 */
export function bookedOf(input: {
    bookingId: string;
    customer: string;
    phone: string | null;
    service: { name: string; minutes: number };
    /** Who they'll see, by name; null for a service nobody takes. */
    person: string | null;
    startAt: string;
    zone: string;
    now: number;
    amount: string | null;
    pay: BookedPay;
    business: string | null;
}): Booked {
    const { startAt, zone, amount, pay, person } = input;
    const first = firstName(input.customer);
    const end = new Date(
        Date.parse(startAt) + input.service.minutes * 60_000,
    ).toISOString();
    const [day = "", time = ""] = whenWords(startAt, zone).split(", ");
    const link = pay.kind === "LINK" ? pay.link : null;
    const paidWord =
        pay.kind === "PAID"
            ? (PAID_BY.find((p) => p.key === pay.paidBy)?.label ?? "")
            : "";
    return {
        bookingId: input.bookingId,
        customer: input.customer,
        phone: input.phone,
        service: input.service.name,
        withName: person,
        startAt,
        timeZone: zone,
        zone: zoneShortName(zone, input.now),
        when: `${day}, ${formatTimeRange(startAt, end, zone)}`,
        line: person
            ? `With ${firstName(person)} on ${day} at ${time}`
            : `On ${day} at ${time}`,
        pay:
            pay.kind === "pack"
                ? {
                      title: `From ${first}'s class pack`,
                      sub: `${pay.left} left after this. Cancelling gives it back.`,
                  }
                : pay.kind === "LINK"
                  ? {
                        title: withAmount("Awaiting payment", amount),
                        sub: "Send the payment link below",
                    }
                  : pay.kind === "PAID"
                    ? {
                          title: withAmount(`Paid by ${paidWord}`, amount),
                          sub: "Recorded with the booking",
                      }
                    : {
                          title: withAmount("Pays at the visit", amount),
                          sub: "Take it when they come",
                      },
        message:
            pay.kind === "pack"
                ? { kind: "pack" }
                : pay.kind === "LINK"
                  ? { kind: "link", amount, url: link?.ok ? link.url : null }
                  : pay.kind === "PAID"
                    ? { kind: "paid", amount }
                    : { kind: "visit", amount },
        link,
        business: input.business,
    };
}
