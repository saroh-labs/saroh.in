import { BOOKINGS_HREF } from "../../account/bookings-model";
import { reachOrNull, toldText } from "../../lib/told";
import { cn } from "../../lib/utils";
import { payInstructionsOf, payWaysText } from "../../pay-instructions/model";
import { PayInstructionsCard } from "../../pay-instructions/pay-instructions";
import { SoldByLine } from "../../sold-by";
import type { Phase } from "../flow-state";
import type { BookingPageData } from "../model";
import {
    buildIcs,
    changeRules,
    changeText,
    firstVisitText,
    googleCalendarHref,
    MOVE_OR_CANCEL,
    payLaterText,
} from "../model";
import { card, focusRing, quietButton, textAction } from "../styles";

export function DoneCard({
    phase,
    headingRef,
    business,
    where,
    rules,
    visits = 1,
    gst = null,
    soldBy = null,
    email = null,
    onAgain,
}: {
    phase: Extract<Phase, { kind: "done" }>;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    business: string;
    /**
     * Where it happens — "At Kavi Dental" or "Video call" (E7) — or null
     * for a business that only ever meets in person.
     */
    where: string | null;
    rules: BookingPageData["rules"];
    /** More than one: visit 1 of a treatment was booked (E10). */
    visits?: number;
    /**
     * The price with its GST, as the page said it before booking: "₹1,000
     * + ₹180 GST (18%)". Null says nothing.
     */
    gst?: string | null;
    /** "Run by ‹legal name›" (DEC-121); null draws none. */
    soldBy?: string | null;
    /** The signed-in customer's address, for "We've emailed ‹address›". */
    email?: string | null;
    onAgain: () => void;
}) {
    const { booking } = phase;
    // The booking as a calendar entry: the file, and Google Calendar's own
    // page for those who keep their diary there.
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
    const paidText = phase.paid
        ? phase.rest
            ? `Paid a ${phase.price ?? ""} deposit. The rest (${phase.rest}) is paid at ${business}.`
            : `Paid ${phase.price ?? ""} online.`
        : phase.price
          ? payLaterText(phase.price, booking.online, business)
          : "Nothing to pay in advance.";
    // Paid with a class credit (A10): what it came from and what is left.
    const payText = phase.creditText ?? paidText;
    // To pay at the desk, with something to pay: how to pay ahead, if the
    // business says (R32).
    const payAhead =
        !phase.paid && !phase.creditText && phase.price
            ? payInstructionsOf(booking.payInstructions)
            : null;
    return (
        <div
            data-booking-done=""
            className={cn(
                card,
                "px-[26px] py-7 max-[699px]:px-5 max-[699px]:py-6",
            )}
        >
            <div
                aria-hidden="true"
                className="bg-site-accent text-site-accent-fg flex size-12 items-center justify-center rounded-full"
            >
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                    <path
                        d="M5 12.5 10 17.5 19 7.5"
                        stroke="currentColor"
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-site-heading text-site-fg mb-1.5 mt-4 text-[calc(clamp(1.625rem,6vw,2rem)*var(--site-heading-scale,1))] font-semibold leading-[1.1] tracking-[-0.03em] outline-none [text-wrap:balance]"
            >
                You&apos;re booked{phase.first ? `, ${phase.first}` : ""}.
            </h2>
            <p className="text-site-fg text-base font-medium leading-[1.55]">
                {[
                    booking.serviceName,
                    firstVisitText(visits),
                    where,
                    phase.when,
                ]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
            <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                {payText}
            </p>
            {/* The same GST words the page showed before booking; none
                for a class a credit paid for, or with nothing to pay. */}
            {gst && phase.price && !phase.creditText ? (
                <p
                    data-booking-gst=""
                    className="text-site-body mt-1 text-[13.5px] tabular-nums leading-[1.55]"
                >
                    {gst}
                </p>
            ) : null}
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
                    className="mt-4"
                />
            ) : null}
            {/* What happens next: an email, when one goes (the API says),
                else where the booking is kept. Never a promised message
                that isn't sent. */}
            <p className="text-site-body mt-2 text-sm leading-[1.55] [overflow-wrap:anywhere]">
                {toldText(reachOrNull(booking.reach), email)}
            </p>
            {booking.meetingUrl ? (
                <p className="text-site-body mt-2 text-[13.5px]">
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
            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={addToCalendar}
                    className={quietButton}
                >
                    Add to calendar
                </button>
                <a
                    href={googleCalendarHref({ ...entry, location: where })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={quietButton}
                >
                    Add to Google Calendar
                </a>
                <button
                    type="button"
                    onClick={onAgain}
                    className={cn(textAction, "h-11 px-2")}
                >
                    Book another
                </button>
            </div>
            {/* Moved or cancelled from their own bookings (UX-055). */}
            <p className="text-site-body border-site-border mt-5 border-t pt-4 text-sm leading-[1.55]">
                Need to change it?{" "}
                <a
                    href={BOOKINGS_HREF}
                    className={cn(
                        "text-site-fg rounded-sm font-semibold underline underline-offset-2",
                        focusRing,
                    )}
                >
                    {MOVE_OR_CANCEL}
                </a>
                .{changeRules(rules, phase.paid)}
            </p>
            {/* Who the booking is with, in its own name (DEC-121). */}
            <SoldByLine line={soldBy} className="text-site-muted mt-2" />
        </div>
    );
}
