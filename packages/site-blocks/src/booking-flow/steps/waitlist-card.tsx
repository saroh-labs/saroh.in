import { cn } from "../../lib/utils";
import type { Phase } from "../flow-state";
import { card, focusRing } from "../styles";
import { ordinal, waitlistReachText, waitlistTerms } from "../waitlist";

/**
 * On the waitlist (A12; the Pulse Fitness design's done card for a full
 * class): what they are waiting for, their place in line, how they will
 * hear a place is theirs — in words true for this business — and that
 * nothing is charged until they book it.
 */
export function WaitlistCard({
    phase,
    headingRef,
    onAgain,
}: {
    phase: Extract<Phase, { kind: "waitlisted" }>;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    onAgain: () => void;
}) {
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
                You&apos;re on the waitlist
                {phase.first ? `, ${phase.first}` : ""}.
            </h2>
            <p className="text-site-fg text-[15px] leading-[1.55] opacity-90">
                {[phase.serviceName, phase.when].filter(Boolean).join(" · ")}
            </p>
            {phase.placeInLine ? (
                <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                    You&apos;re {ordinal(phase.placeInLine)} in line.
                </p>
            ) : null}
            <p className="text-site-body mt-2 text-[13.5px] leading-[1.55]">
                {waitlistReachText(phase.reach, phase.email)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={onAgain}
                    className={cn(
                        "border-site-border bg-site-surface text-site-fg h-11 cursor-pointer rounded-[calc(var(--site-radius)+8px)] border px-4 text-sm font-semibold hover:opacity-90 active:opacity-80",
                        focusRing,
                    )}
                >
                    Book something else
                </button>
            </div>
            <p className="text-site-muted border-site-border mt-4 border-t pt-3.5 text-[12.5px] leading-[1.55]">
                {waitlistTerms()}
            </p>
        </div>
    );
}
