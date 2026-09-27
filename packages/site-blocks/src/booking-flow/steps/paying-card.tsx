import { destructiveAlertClasses } from "../../alert";
import { cn } from "../../lib/utils";
import type { CheckoutRequest } from "../checkout";
import type { Phase } from "../flow-state";
import { timeIn } from "../model";
import { card, focusRing, quietFill } from "../styles";
import { useCheckout } from "../use-checkout";

const primary = cn(
    "bg-site-fg text-site-bg h-11 cursor-pointer rounded-[calc(var(--site-radius)+8px)] px-4 text-sm font-semibold",
    focusRing,
);
const quiet = cn(
    "text-site-fg h-11 cursor-pointer px-4 text-sm font-semibold underline",
    focusRing,
);
const idle = "cursor-default opacity-60";

/** "RAZORPAY" → "Razorpay". */
function providerName(provider: string): string {
    return `${provider.charAt(0)}${provider.slice(1).toLowerCase()}`;
}

/**
 * A pay-now hold while its booker pays (U19, E11). The business's provider
 * opens its own window — UPI or card — over the page as soon as the payment
 * has started. The card says where that stands: open, closed without paying,
 * refused (try again; the time stays held), or "Paying…" once the window
 * closed on a payment, until the webhook confirms the booking and the page
 * moves on by itself.
 */
export function PayingCard({
    phase,
    now,
    zone,
    headingRef,
    serviceName,
    business,
    booker,
    busy,
    onDesk,
    onBack,
    onPaid,
}: {
    phase: Extract<Phase, { kind: "paying" }>;
    now: number | null;
    zone: string;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    serviceName: string;
    business: string;
    booker: CheckoutRequest["booker"];
    /** Letting the hold go, or booking it at the desk, is under way. */
    busy: boolean;
    onDesk: () => void;
    onBack: () => void;
    /** The provider's window closed on a payment. */
    onPaid: () => void;
}) {
    const request: CheckoutRequest | null =
        phase.handoff && !phase.payError
            ? {
                  handoff: phase.handoff,
                  business,
                  description: `${serviceName} · ${phase.when}`,
                  booker,
              }
            : null;
    const checkout = useCheckout(request, onPaid);
    const payAgain = () => {
        if (!busy) checkout.open();
    };

    const until = phase.booking.holdExpiresAt;
    const minutesLeft =
        until && now !== null
            ? Math.max(0, Math.ceil((Date.parse(until) - now) / 60_000))
            : null;
    const provider = phase.handoff ? providerName(phase.handoff.provider) : "";
    const paying = checkout.status === "paid";
    const refused =
        checkout.status === "failed"
            ? "The payment didn't go through — try again."
            : checkout.status === "unavailable"
              ? "We couldn't open the payment window. Check your connection and try again."
              : null;

    return (
        <div className={cn(card, "px-[26px] py-7")}>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-site-heading text-site-fg text-[26px] font-semibold tracking-[-0.03em] outline-none"
            >
                Pay {phase.price} to confirm your place
            </h2>
            <p className="text-site-fg mt-1.5 text-[15px] leading-[1.55] opacity-90">
                {serviceName} · {phase.when}
            </p>
            {until ? (
                <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                    It&apos;s held for you until {timeIn(until, zone)}
                    {minutesLeft !== null
                        ? ` — ${minutesLeft} ${minutesLeft === 1 ? "minute" : "minutes"} left`
                        : ""}
                    . If it isn&apos;t paid by then, the time goes back on the
                    calendar and nothing is charged.
                </p>
            ) : null}

            {phase.payError || refused ? (
                <div className="mt-4">
                    <p role="alert" className={destructiveAlertClasses}>
                        {phase.payError ?? refused}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {refused ? (
                            <button
                                type="button"
                                onClick={payAgain}
                                aria-disabled={busy}
                                className={cn(primary, busy && idle)}
                            >
                                Try again
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onDesk}
                            aria-disabled={busy}
                            className={cn(
                                refused ? quiet : primary,
                                busy && idle,
                            )}
                        >
                            {busy ? "Booking…" : "Book it to pay at the desk"}
                        </button>
                        <button
                            type="button"
                            onClick={onBack}
                            aria-disabled={busy}
                            className={cn(quiet, busy && idle)}
                        >
                            Pick another time
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    role="status"
                    className={cn(
                        "border-site-border mt-4 rounded-[calc(var(--site-radius)+10px)] border border-dashed p-4",
                        quietFill,
                    )}
                >
                    <p className="text-site-fg text-sm font-semibold">
                        {!phase.handoff
                            ? "Starting the payment…"
                            : paying
                              ? "Paying…"
                              : checkout.status === "closed"
                                ? "The payment window was closed before you paid"
                                : `Pay with UPI or card in the ${provider} window`}
                    </p>
                    <p className="text-site-muted mt-1 text-[12.5px]">
                        {paying
                            ? `${provider} is confirming your payment. This page moves on by itself — there's no need to pay again.`
                            : "This page moves on by itself once the payment has gone through."}
                    </p>
                    {checkout.status === "closed" ? (
                        <button
                            type="button"
                            onClick={payAgain}
                            aria-disabled={busy}
                            className={cn(primary, "mt-3", busy && idle)}
                        >
                            Pay {phase.price}
                        </button>
                    ) : null}
                </div>
            )}

            {phase.payError || refused || paying ? null : (
                <button
                    type="button"
                    onClick={onBack}
                    aria-disabled={busy}
                    className={cn(
                        "text-site-fg mt-4 cursor-pointer text-sm font-semibold underline",
                        busy && idle,
                        focusRing,
                    )}
                >
                    Cancel and pick another time
                </button>
            )}
        </div>
    );
}
