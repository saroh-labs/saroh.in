import { cn } from "../../lib/utils";
import { card, focusRing } from "../styles";

/** A pay-now hold that ran out before it was paid. */
export function ExpiredCard({
    when,
    headingRef,
    onAgain,
}: {
    when: string;
    headingRef: React.RefObject<HTMLHeadingElement | null>;
    onAgain: () => void;
}) {
    return (
        <div className={cn(card, "px-[26px] py-7")}>
            <h2
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-site-fg text-[26px] font-semibold tracking-[-0.03em] outline-none"
            >
                The time held for you ran out
            </h2>
            <p className="text-site-body mt-2 text-[15px] leading-relaxed">
                {when} wasn&apos;t paid for within 15 minutes, so it went back
                on the calendar. Nothing was charged.
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
