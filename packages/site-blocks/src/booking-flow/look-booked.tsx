"use client";

import type { LookId } from "@saroh/block-contract";

import { BOOKINGS_HREF } from "../account/bookings-model";
import { directionsHref } from "../blocks/visit-us";
import { reachOrNull, toldText } from "../lib/told";
import { cn } from "../lib/utils";
import { payInstructionsOf, payWaysText } from "../pay-instructions/model";
import { PayInstructionsCard } from "../pay-instructions/pay-instructions";
import { SoldByLine } from "../sold-by";
import type { Phase } from "./flow-state";
import {
    lookLink,
    lookOutline,
    lookPrimary,
    STEP_HEADING,
} from "./look-styles";
import { cancelText } from "./look-words";
import type { BookingPageData } from "./model";
import {
    buildIcs,
    changeRules,
    changeText,
    firstVisitText,
    googleCalendarHref,
    MOVE_OR_CANCEL,
    payLaterText,
} from "./model";

/**
 * Booked, in a look (DEC-172, VA08f, VD08f, VB08f, plan U10): "You're
 * booked, Asha." with the ticket first, then Add to calendar, a way there
 * (Directions for a visit, the link to join for one online), and how to
 * move or cancel it by the business's own rule.
 *
 * Every line comes from the booking or the business: the free-cancel time
 * is the start less `BookingRules.freeCancelHours`, never a number of our
 * own; "We've emailed" only when the API says an email went. Money is
 * as it was asked for — paise belong to the receipt. A treatment books
 * its first visit here and the rest with the business, and says so.
 *
 * It fades in once over 200ms (`data-site-fade`, the look's rule), and
 * nothing waits for it: Add to calendar works from the first frame.
 */
export function LookBooked({
    look,
    phase,
    headingRef,
    business,
    where,
    address,
    rules,
    zone,
    now,
    visits = 1,
    soldBy = null,
    email = null,
    gst = null,
    onAgain,
}: {
    look: LookId;
    phase: Extract<Phase, { kind: "done" }>;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    business: string;
    /** "At Kavi Dental" or "Video call", for a business that works both ways. */
    where: string | null;
    /** The business's address, for Directions; null without one. */
    address: string | null;
    rules: BookingPageData["rules"];
    zone: string;
    /** The page's clock, for a deadline already past; null before it ticks. */
    now: number | null;
    visits?: number;
    soldBy?: string | null;
    email?: string | null;
    /** The GST in the price, in words without paise (`lookGstText`). */
    gst?: string | null;
    onAgain: () => void;
}) {
    const { booking } = phase;
    const online = booking.online || booking.meetingUrl !== null;
    const entry = {
        title: `${booking.serviceName} · ${business}`,
        startAt: booking.startAt,
        endAt: booking.endAt,
        description: booking.meetingUrl
            ? `Join online: ${booking.meetingUrl} ${changeText(business, rules, phase.paid, true)}`
            : changeText(business, rules, phase.paid, true),
    };
    const addToCalendar = () => {
        const ics = buildIcs({ reference: booking.reference, ...entry });
        const url = URL.createObjectURL(
            new Blob([ics], { type: "text/calendar;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "booking.ics";
        a.click();
        URL.revokeObjectURL(url);
    };
    const paidText =
        phase.creditText ??
        (phase.paid
            ? phase.rest
                ? `Paid a ${phase.price ?? ""} deposit. The rest (${phase.rest}) is paid at ${business}.`
                : `Paid ${phase.price ?? ""} online.`
            : phase.price
              ? payLaterText(phase.price, booking.online, business)
              : "Nothing to pay in advance.");
    const payAhead =
        !phase.paid && !phase.creditText && phase.price
            ? payInstructionsOf(booking.payInstructions)
            : null;
    const change =
        cancelText(
            booking.startAt,
            rules.freeCancelHours,
            zone,
            now ?? Date.parse(booking.startAt) - 1,
        ) ?? changeRules(rules, phase.paid).trim();
    const visit = firstVisitText(visits);
    const directions = !online && address ? directionsHref(address) : null;

    const rows: [string, React.ReactNode][] = [
        ["Booking", booking.reference],
        ["When", phase.when],
        ...(where || online
            ? [
                  [
                      "Where",
                      online ? "Online. The link to join is below." : where,
                  ] as [string, React.ReactNode],
              ]
            : []),
        ...(visit ? [["Visits", visit] as [string, React.ReactNode]] : []),
        [
            "Paying",
            gst && phase.price && !phase.creditText ? (
                <>
                    {paidText}{" "}
                    <span
                        data-booking-gst=""
                        className="text-site-body font-normal"
                    >
                        {gst}
                    </span>
                </>
            ) : (
                paidText
            ),
        ],
        ...(change ? [["Change", change] as [string, React.ReactNode]] : []),
    ];

    return (
        <div data-booking-done="" data-site-fade="" className="min-w-0">
            <h2
                ref={headingRef}
                tabIndex={-1}
                className={cn(
                    STEP_HEADING[look],
                    "text-site-fg outline-none [text-wrap:balance]",
                    look === "quiet" && "text-left min-[700px]:text-left",
                )}
            >
                You&apos;re booked{phase.first ? `, ${phase.first}` : ""}.
            </h2>
            <p className="text-site-fg mt-2 text-[17px] font-medium">
                {booking.serviceName}
            </p>
            {/* What happens next: an email only when one goes. */}
            <p className="text-site-body mt-1 text-[14.5px] [overflow-wrap:anywhere]">
                {toldText(reachOrNull(booking.reach), email)}
            </p>

            <dl
                data-booking-ticket=""
                className="border-site-fg mt-5 border-y py-1"
            >
                {rows.map(([k, v]) => (
                    <div
                        key={k}
                        className="border-site-border flex gap-4 border-b py-3 text-[14.5px] last:border-b-0"
                    >
                        <dt className="text-site-muted w-[84px] shrink-0">
                            {k}
                        </dt>
                        <dd className="text-site-fg min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                            {v}
                        </dd>
                    </div>
                ))}
            </dl>

            {booking.meetingUrl ? (
                <p className="text-site-body mt-3 text-[14.5px]">
                    Join online:{" "}
                    <a
                        href={booking.meetingUrl}
                        className="text-site-fg font-semibold underline"
                        rel="noopener noreferrer"
                        target="_blank"
                    >
                        {booking.meetingUrl}
                    </a>
                </p>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={addToCalendar}
                    className={lookPrimary(false)}
                >
                    Add to calendar
                </button>
                <a
                    href={googleCalendarHref({ ...entry, location: where })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={lookOutline}
                >
                    Add to Google Calendar
                </a>
                {directions ? (
                    <a
                        href={directions}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={lookOutline}
                    >
                        Directions
                    </a>
                ) : null}
            </div>

            {payAhead ? (
                <PayInstructionsCard
                    instructions={payAhead}
                    businessName={business}
                    reference={`Booking ${booking.reference}`}
                    title="Or pay ahead"
                    lead={
                        payWaysText(payAhead)
                            ? `${business} also takes payment by ${payWaysText(payAhead)} before you arrive.`
                            : null
                    }
                    className="mt-5"
                />
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-x-6">
                <a href={BOOKINGS_HREF} className={lookLink}>
                    {MOVE_OR_CANCEL}
                </a>
                <button type="button" onClick={onAgain} className={lookLink}>
                    Book another time
                </button>
            </div>
            <SoldByLine line={soldBy} className="text-site-muted mt-3" />
        </div>
    );
}
