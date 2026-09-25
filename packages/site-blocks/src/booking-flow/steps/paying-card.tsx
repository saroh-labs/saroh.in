import { destructiveAlertClasses } from "../../alert";
import { cn } from "../../lib/utils";
import type { Phase } from "../flow-state";
import { timeIn } from "../model";
import { card, focusRing, quietFill } from "../styles";

export function PayingCard({
    phase,
    now,
    zone,
    headingRef,
    serviceName,
    busy,
    onDesk,
    onBack,
}: {
    phase: Extract<Phase, { kind: "paying" }>;
    now: number | null;
    zone: string;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    serviceName: string;
    /** Letting the hold go, or booking it at the desk, is under way. */
    busy: boolean;
    onDesk: () => void;
    onBack: () => void;
}) {
    const until = phase.booking.holdExpiresAt;
    const minutesLeft =
        until && now !== null
            ? Math.max(0, Math.ceil((Date.parse(until) - now) / 60_000))
            : null;
    return (
        <div className={cn(card, "px-[26px] py-7")}>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-site-fg text-[26px] font-semibold tracking-[-0.03em] outline-none"
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

            {phase.payError ? (
                <div className="mt-4">
                    <p role="alert" className={destructiveAlertClasses}>
                        {phase.payError}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={onDesk}
                            aria-disabled={busy}
                            className={cn(
                                "bg-site-fg text-site-bg h-11 cursor-pointer rounded-[calc(var(--site-radius)+8px)] px-4 text-sm font-semibold",
                                busy && "cursor-default opacity-60",
                                focusRing,
                            )}
                        >
                            {busy ? "Booking…" : "Book it to pay at the desk"}
                        </button>
                        <button
                            type="button"
                            onClick={onBack}
                            aria-disabled={busy}
                            className={cn(
                                "text-site-fg h-11 cursor-pointer px-4 text-sm font-semibold underline",
                                busy && "cursor-default opacity-60",
                                focusRing,
                            )}
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
                        {phase.handoff
                            ? `${phase.handoff.provider.charAt(0)}${phase.handoff.provider.slice(1).toLowerCase()} checkout opens here`
                            : "Starting the payment…"}
                    </p>
                    <p className="text-site-muted mt-1 text-[12.5px]">
                        This page moves on by itself once the payment has gone
                        through.
                    </p>
                </div>
            )}

            {phase.payError ? null : (
                <button
                    type="button"
                    onClick={onBack}
                    aria-disabled={busy}
                    className={cn(
                        "text-site-fg mt-4 cursor-pointer text-sm font-semibold underline",
                        busy && "cursor-default opacity-60",
                        focusRing,
                    )}
                >
                    Cancel and pick another time
                </button>
            )}
        </div>
    );
}
