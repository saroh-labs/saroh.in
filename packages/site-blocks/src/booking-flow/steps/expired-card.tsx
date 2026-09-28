import { cn } from "../../lib/utils";
import { card, focusRing } from "../styles";

/**
 * A pay-now hold that ran out before it was paid. Its place went back on the
 * calendar, and the provider's window closed with the card (E11).
 *
 * When the provider's window had closed on a payment that the business never
 * confirmed in time, "nothing was charged" may not be true: the money can
 * still arrive, and the business then owes it back. The card says so.
 */
export function ExpiredCard({
    when,
    business,
    checkoutPaid = false,
    headingRef,
    onAgain,
}: {
    when: string;
    business: string;
    /** The provider's window had closed on a payment. */
    checkoutPaid?: boolean;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    onAgain: () => void;
}) {
    return (
        <div className={cn(card, "px-[26px] py-7")}>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-site-heading text-site-fg text-[26px] font-semibold tracking-[-0.03em] outline-none"
            >
                The time held for you ran out
            </h2>
            <p className="text-site-body mt-2 text-[15px] leading-relaxed">
                {checkoutPaid
                    ? `${when} went back on the calendar before your payment was confirmed. If money left your account, get in touch with ${business} and they can refund it.`
                    : `${when} wasn't paid for within 15 minutes, so it went back on the calendar. Nothing was charged.`}
            </p>
            <button
                type="button"
                onClick={onAgain}
                className={cn(
                    "border-site-border bg-site-surface text-site-fg mt-4 h-11 rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold",
                    focusRing,
                )}
            >
                Pick a time again
            </button>
        </div>
    );
}
