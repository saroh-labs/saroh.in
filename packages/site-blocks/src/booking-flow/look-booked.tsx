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

    // VD08f: centred, a ringed tick, the service and the date in the
    // display face (the date in italic), then the details as a list.
    const quiet = look === "quiet";
    const calendar = (
        <a
            href={googleCalendarHref({ ...entry, location: where })}
            target="_blank"
            rel="noopener noreferrer"
            className={quiet ? lookLink : lookOutline}
        >
            Add to Google Calendar
        </a>
    );
    const directionsLink = directions ? (
        <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className={quiet ? lookLink : lookOutline}
        >
            Directions
        </a>
    ) : null;

    return (
        <div
            data-booking-done=""
            data-site-fade=""
            className={cn("min-w-0", quiet && "text-center")}
        >
            {quiet ? (
                <span
                    aria-hidden="true"
                    className="border-site-fg text-site-fg mb-6 inline-flex size-[72px] items-center justify-center rounded-full border"
                >
                    <svg
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                </span>
            ) : null}
            <h2
                ref={headingRef}
                tabIndex={-1}
                className={cn(
                    STEP_HEADING[look],
                    "text-site-fg outline-none [text-wrap:balance]",
                    quiet &&
                        "min-[700px]:text-[calc(4rem*var(--site-heading-scale,1))]",
                )}
            >
                You&apos;re booked{phase.first ? `, ${phase.first}` : ""}.
            </h2>
            {quiet ? (
                <>
                    <p className="font-site-heading text-site-fg mt-5 text-[28px] font-normal leading-[1.15] min-[700px]:text-[34px]">
                        {booking.serviceName}
                    </p>
                    <p
                        data-booking-when=""
                        className="font-site-heading text-site-fg mt-4 text-[28px] italic leading-[1.2] min-[700px]:text-[34px]"
                    >
                        {phase.when}
                    </p>
                </>
            ) : (
                <p className="text-site-fg mt-2 text-[17px] font-medium">
                    {booking.serviceName}
                </p>
            )}
            {/* What happens next: an email only when one goes. */}
            <p className="text-site-body mt-1 text-[14.5px] [overflow-wrap:anywhere]">
                {toldText(reachOrNull(booking.reach), email)}
            </p>

            {quiet ? (
                <dl
                    data-booking-ticket=""
                    className="border-site-border mt-7 grid grid-cols-1 gap-1 border-t pt-7 text-left text-[15.5px] min-[700px]:grid-cols-[128px_minmax(0,1fr)] min-[700px]:gap-x-6 min-[700px]:gap-y-3.5"
                >
                    {/* The date is said above, in the display face. */}
                    {rows
                        .filter(([k]) => k !== "When")
                        .map(([k, v]) => (
                            <div key={k} className="contents">
                                <dt className="text-site-muted pt-[3px] text-[12px] font-medium uppercase tracking-[0.2em]">
                                    {k}
                                </dt>
                                <dd className="text-site-body m-0 pb-3 [overflow-wrap:anywhere] min-[700px]:pb-0">
                                    {v}
                                </dd>
                            </div>
                        ))}
                </dl>
            ) : (
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
            )}

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

            {quiet ? (
                <div className="mt-7 grid justify-items-center gap-3.5">
                    <button
                        type="button"
                        onClick={addToCalendar}
                        className={lookPrimary(false)}
                    >
                        Add to calendar
                    </button>
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-1.5">
                        {calendar}
                        {directionsLink}
                    </div>
                </div>
            ) : (
                <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={addToCalendar}
                        className={lookPrimary(false)}
                    >
                        Add to calendar
                    </button>
                    {calendar}
                    {directionsLink}
                </div>
            )}

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

            <div
                className={cn(
                    "mt-4 flex flex-wrap items-center gap-x-6",
                    quiet && "justify-center",
                )}
            >
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
