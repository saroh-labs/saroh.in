import { cn } from "@saroh/ui/lib/utils";

import type { SetupStepId } from "@/lib/organizations/setup-steps";

/** The heading's id per step: the choices name themselves by it. */
export function stepHeadingId(step: SetupStepId): string {
    if (step === "kind") return "kind-label";
    if (step === "first") return "goal-label";
    if (step === "billing") return "billing-heading";
    return "name-heading";
}

/** The id of the sentence under the heading, which describes the choices. */
export const STEP_LEAD_ID = "step-lead";

/**
 * One setup step, and only this one: a large plain heading, one sentence
 * under it, then that step's fields with room around them.
 *
 * The caller keys it by the step, so each arrives as a new block: the
 * entrance plays again, and nothing of the step before is left in the
 * page. The entrance is the shared fade, and is off where the person has
 * asked for less motion. A step asked for by the address is held back
 * (`hidden`) until the tab's draft has been read, so a Create button never
 * flashes over an empty name.
 *
 * The heading can take the keyboard (`tabIndex={-1}`) and is never a tab
 * stop. Its words and the sentence are Saroh's own, so a recording may
 * read them. What is typed below is not.
 */
export function SetupStepFrame({
    step,
    heading,
    lead,
    headingRef,
    hidden,
    entering,
    arrival,
    note,
    children,
}: {
    step: SetupStepId;
    heading: string;
    lead: string;
    headingRef: React.Ref<HTMLHeadingElement>;
    hidden: boolean;
    entering: boolean;
    /** Said once, on the first step: why they are here again. */
    arrival?: React.ReactNode;
    /** Said on every step: the plan or the invite the create will act on. */
    note?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div
            data-setup-step={step}
            className={cn(
                hidden && "invisible",
                entering &&
                    "duration-base ease-out animate-in fade-in-0 motion-reduce:animate-none",
            )}
        >
            <div data-ph-unmask="">
                <h1
                    id={stepHeadingId(step)}
                    ref={headingRef}
                    tabIndex={-1}
                    className="text-balance font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] outline-none"
                >
                    {heading}
                </h1>
                <p
                    id={STEP_LEAD_ID}
                    className="mb-7 mt-2 text-pretty text-[13.5px] leading-[1.55] text-muted-foreground"
                >
                    {lead}
                </p>
            </div>
            {step === "kind" && arrival ? (
                <div className="-mt-2 mb-6">{arrival}</div>
            ) : null}
            {note ? <div className="-mt-2 mb-6">{note}</div> : null}
            <div className="grid gap-5">{children}</div>
        </div>
    );
}
