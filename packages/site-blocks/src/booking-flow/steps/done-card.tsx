import { BOOKINGS_HREF } from "../../account/bookings-model";
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
    MOVE_OR_CANCEL,
} from "../model";
import { card, focusRing } from "../styles";

export function DoneCard({
    phase,
    headingRef,
    business,
    where,
    rules,
    visits = 1,
    soldBy = null,
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
    /** "Run by ‹legal name›" (DEC-118); null draws none. */
    soldBy?: string | null;
    onAgain: () => void;
}) {
    const { booking } = phase;
    const addToCalendar = () => {
        const ics = buildIcs({
            reference: booking.reference,
            title: `${booking.serviceName} · ${business}`,
            startAt: booking.startAt,
            endAt: booking.endAt,
            description: booking.meetingUrl
                ? `Join online: ${booking.meetingUrl} ${changeText(business, rules, phase.paid, true)}`
                : changeText(business, rules, phase.paid, true),
        });
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
          ? `Pay ${phase.price} at the front desk when you arrive.`
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
        <div className={cn(card, "px-[26px] py-7")}>
            <div
                aria-hidden="true"
                className="bg-site-accent text-site-accent-fg flex size-11 items-center justify-center rounded-full text-[22px] font-bold"
            >
                ✓
            </div>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-site-heading text-site-fg mb-1.5 mt-4 text-[32px] font-semibold tracking-[-0.03em] outline-none"
            >
                You&apos;re booked{phase.first ? `, ${phase.first}` : ""}.
            </h2>
            <p className="text-site-fg text-[15px] leading-[1.55] opacity-90">
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
            {/* Where the booking lives until the account area (A5) shows it. */}
            <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                We&apos;ve saved this to your details with {business}.
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
                    className={cn(
                        "border-site-border bg-site-surface text-site-fg h-11 cursor-pointer rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold",
                        focusRing,
                    )}
                >
                    Add to calendar
                </button>
                <button
                    type="button"
                    onClick={onAgain}
                    className={cn(
                        "text-site-fg h-11 cursor-pointer px-4 text-sm font-semibold underline",
                        focusRing,
                    )}
                >
                    Book another
                </button>
            </div>
            {/* Moved or cancelled from their own bookings (UX-055). */}
            <p className="text-site-muted border-site-border mt-4 border-t pt-3.5 text-[12.5px] leading-[1.55]">
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
            {/* Who the booking is with, in its own name (DEC-118). */}
            <SoldByLine line={soldBy} className="text-site-muted mt-2" />
        </div>
    );
}
