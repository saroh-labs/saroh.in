import type { LegalHoldFacts } from "@/lib/businesses";
import { LEGAL_HOLD_MEANS, legalHoldLine } from "@/lib/deletion-words";

/**
 * A business's legal hold, at the top of its page (DEC-119): that it is
 * held, who placed the hold and when, why, and what that means for whoever
 * is about to act on it. Shown to every operator who opens the business;
 * the reason is the operator's own, from the admin ledger.
 */
export function LegalHoldNotice({ hold }: { hold: LegalHoldFacts }) {
    return (
        <section
            role="status"
            aria-label="Legal hold"
            className="grid gap-1.5 rounded-xl border border-destructive bg-destructive-subtle px-4 py-3 text-destructive-subtle-foreground"
        >
            <h2 className="text-[15px] font-semibold">Legal hold</h2>
            <p className="text-sm">{legalHoldLine(hold)}</p>
            <p className="break-words text-sm">
                Why: {hold.reason ?? "No reason was recorded."}
            </p>
            <p className="max-w-[80ch] text-[13px]">{LEGAL_HOLD_MEANS}</p>
        </section>
    );
}
