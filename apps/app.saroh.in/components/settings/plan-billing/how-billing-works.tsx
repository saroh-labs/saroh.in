import { TextLink } from "@saroh/ui/text-link";

import { billingRules } from "@/lib/saroh-billing/plan-status";
import type { PlanNote } from "@/lib/saroh-billing/plan-view";

import { NoteWords, changeHref } from "./your-plan";

/**
 * "How billing works", closed until asked for, under the plans: what is
 * true of this business's plan and asks nothing of it now (its first
 * month's small print, how many charges its autopay covers and when it
 * runs out, a plan given for a while, and any note the page's one message
 * left unsaid), then how every plan is paid: an autopay covers so many
 * monthly charges, prices can change with 30 days' notice and approval
 * (DEC-161). The change dialog says the same of the one change it quotes;
 * this is where the page keeps it without a stack of notes.
 */
export function HowBillingWorks({
    notes,
    yearly,
    charges = 12,
    canChange,
}: {
    /** Every note that isn't the page's one message (`planMessage`'s `rest`). */
    notes: readonly PlanNote[];
    /** Whether the catalogue offers yearly billing. */
    yearly: boolean;
    /** Monthly charges one autopay covers on the live catalogue (DEC-161). */
    charges?: number;
    canChange: boolean;
}) {
    return (
        <details className="rounded-lg border border-border bg-card px-3.5 py-2.5 text-[13px]">
            <summary className="cursor-pointer font-semibold">
                How billing works
            </summary>
            <ul className="mt-2.5 grid list-disc gap-1.5 text-pretty pl-5 leading-[1.55] text-foreground/80">
                {notes.map((note) => (
                    <li key={`${note.kind}${note.lead}${note.iso ?? ""}`}>
                        <NoteWords note={note} />
                        {note.action && canChange ? (
                            <>
                                {" "}
                                <TextLink
                                    href={changeHref(
                                        note.action.planId,
                                        note.action.cycle,
                                    )}
                                >
                                    {note.action.label}
                                </TextLink>
                            </>
                        ) : null}
                    </li>
                ))}
                {billingRules(yearly, charges).map((rule) => (
                    <li key={rule}>{rule}</li>
                ))}
            </ul>
        </details>
    );
}
