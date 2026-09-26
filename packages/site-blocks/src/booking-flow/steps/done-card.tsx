import { cn } from "../../lib/utils";
import type { Phase } from "../flow-state";
import type { BookingPageData } from "../model";
import { buildIcs, changeText } from "../model";
import { card, focusRing } from "../styles";

export function DoneCard({
    phase,
    headingRef,
    business,
    rules,
    onAgain,
}: {
    phase: Extract<Phase, { kind: "done" }>;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    business: string;
    rules: BookingPageData["rules"];
    onAgain: () => void;
}) {
    const { booking } = phase;
    const addToCalendar = () => {
        const ics = buildIcs({
            reference: booking.reference,
            title: `${booking.serviceName} · ${business}`,
            startAt: booking.startAt,
            endAt: booking.endAt,
            description: changeText(business, rules),
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
    const payText = phase.paid
        ? `Paid ${phase.price ?? ""} online.`
        : phase.price
          ? `Pay ${phase.price} at the front desk when you arrive.`
          : "Nothing to pay in advance.";
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
                className="font-display text-site-fg mb-1.5 mt-4 text-[32px] font-semibold tracking-[-0.03em] outline-none"
            >
                You&apos;re booked{phase.first ? `, ${phase.first}` : ""}.
            </h2>
            <p className="text-site-fg text-[15px] leading-[1.55] opacity-90">
                {booking.serviceName} · {phase.when}
            </p>
            <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                {payText}
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
            <p className="text-site-muted border-site-border mt-4 border-t pt-3.5 text-[12.5px] leading-[1.55]">
                {changeText(business, rules)}
            </p>
        </div>
    );
}
