"use client";

import { DatePicker } from "@saroh/ui/date-picker";
import { cn } from "@saroh/ui/lib/utils";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { formatDate } from "@/lib/format";
import { publishPricingAction } from "@/lib/pricing-actions";
import { changeCount } from "@/lib/pricing-draft";
import type { PublishPolicy } from "@/lib/pricing-types";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { usePlansNav } from "../plans-nav";
import { useFlash } from "../toast";
import type { When } from "./publish";
import {
    dateProblem,
    goLiveOf,
    publishedMessage,
    publishLabel,
    refusalText,
    tomorrowStart,
} from "./publish";

/**
 * "Publish version N" (plans catalogue U10): when, what happens to the
 * businesses already on a plan, a note for the change log, and the button
 * whose label says what's missing. Publishing goes through `OperatorDialog`
 * for the reason and the idempotency key; the draft is saved first and the
 * revision it was saved as is the one published.
 *
 * "Move them" is per subscription, at each business's first renewal at least
 * seven days after go-live (design deviation D-6), not one date for all.
 */
export function PublishPanel({
    nextV,
    blocked,
}: {
    nextV: number;
    /** What else stops a publish, in the button's words; null when nothing. */
    blocked: string | null;
}) {
    const { pricing } = usePlans();
    const draft = useDraft();
    const { setTab } = usePlansNav();
    const flash = useFlash();
    const id = useId();
    const [when, setWhen] = useState<When>("now");
    const [day, setDay] = useState<Date | null>(null);
    const [policy, setPolicy] = useState<PublishPolicy | null>(null);
    const [note, setNote] = useState("");

    const now = new Date();
    const problem = dateProblem(when, day, now);
    const { label, ready } = publishLabel({
        nextV,
        when,
        policy,
        dateProblem: problem,
        blocked,
    });
    const onPlan = pricing.businesses.total;
    const changes = draft.check.changes;
    const goLive = when === "date" && day ? goLiveOf(day) : null;

    return (
        <section
            aria-label="Publish"
            className="grid gap-3.5 rounded-[14px] border border-highlight/50 bg-background p-4"
        >
            <h2 className="font-display text-base font-semibold">
                Publish version {nextV}
            </h2>

            <RadioGroup
                aria-labelledby={`${id}-when`}
                value={when}
                onValueChange={(v) => setWhen(v as When)}
                className="grid gap-2"
            >
                <span
                    id={`${id}-when`}
                    className="text-[12px] text-muted-foreground"
                >
                    When
                </span>
                <Choice id={`${id}-now`} value="now" on={when === "now"}>
                    <span className="font-semibold">Now</span>
                </Choice>
                <Choice
                    id={`${id}-date`}
                    value="date"
                    on={when === "date"}
                    after={
                        <DatePicker
                            value={day ?? undefined}
                            onValueChange={(d) => {
                                setDay(d ?? null);
                                setWhen("date");
                            }}
                            disabledDays={{ before: tomorrowStart(now) }}
                            aria-label="Go-live date"
                            placeholder="Pick a date"
                            className="h-[30px] w-[10rem] rounded-[7px] border-border-strong bg-card px-2 text-[12.5px] coarse:h-11"
                        />
                    }
                >
                    <span className="font-semibold">On a date</span>
                </Choice>
            </RadioGroup>

            <RadioGroup
                aria-labelledby={`${id}-who`}
                value={policy ?? ""}
                onValueChange={(v) => setPolicy(v as PublishPolicy)}
                className="grid gap-2"
            >
                <span
                    id={`${id}-who`}
                    className="text-[12px] text-muted-foreground"
                >
                    {onPlan === 1
                        ? "1 business is on a plan."
                        : `${onPlan} businesses are on a plan.`}{" "}
                    What happens to them?
                </span>
                <Choice id={`${id}-keep`} value="keep" on={policy === "keep"}>
                    <span className="grid gap-0.5">
                        <span className="font-semibold">
                            They keep their current terms
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                            Only businesses that join or change plan get this
                            version.
                        </span>
                    </span>
                </Choice>
                <Choice id={`${id}-move`} value="move" on={policy === "move"}>
                    <span className="grid gap-0.5">
                        <span className="font-semibold">
                            Move them at their next renewal
                        </span>
                        <span className="text-[12px] leading-[1.45] text-muted-foreground">
                            Each business moves on its first billing date at
                            least 7 days after this goes live, and is told 7
                            days before. Anything over a new limit stays,
                            read-only.
                        </span>
                    </span>
                </Choice>
            </RadioGroup>

            <div className="grid gap-[5px]">
                <label
                    htmlFor={`${id}-note`}
                    className="text-[12px] text-muted-foreground"
                >
                    Note for the change log
                </label>
                <textarea
                    id={`${id}-note`}
                    rows={2}
                    value={note}
                    maxLength={500}
                    placeholder="Why this changed"
                    onChange={(e) => setNote(e.target.value)}
                    className="resize-y rounded-[8px] border border-border-strong bg-card px-2.5 py-2 text-[13px] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
            </div>

            <OperatorDialog
                trigger={label}
                triggerVariant="highlight"
                triggerClassName="h-auto min-h-10 w-full whitespace-normal rounded-[10px] py-2 text-[14px]"
                disabled={!ready}
                title={
                    goLive
                        ? `Schedule version ${nextV} for ${formatDate(goLive)}?`
                        : `Publish version ${nextV} now?`
                }
                effect={
                    <div className="grid gap-2">
                        <p>
                            {goLive
                                ? `It goes live on ${formatDate(goLive)}, and the pricing page changes then.`
                                : "It goes live now, and the pricing page changes with it."}{" "}
                            {policy === "move"
                                ? "Businesses already on a plan move at their next renewal at least 7 days after it goes live, and are told 7 days before."
                                : "Businesses already on a plan keep their current terms."}
                        </p>
                        {changes.length > 0 && (
                            <>
                                <p className="font-semibold text-foreground">
                                    {changeCount(changes.length)}
                                </p>
                                <ul className="grid list-disc gap-0.5 pl-[18px]">
                                    {changes.slice(0, 6).map((c, i) => (
                                        <li key={`${i}-${c}`}>{c}</li>
                                    ))}
                                    {changes.length > 6 && (
                                        <li className="list-none">
                                            and {changes.length - 6} more
                                        </li>
                                    )}
                                </ul>
                            </>
                        )}
                    </div>
                }
                submitLabel={
                    goLive
                        ? `Schedule version ${nextV}`
                        : `Publish version ${nextV}`
                }
                onSubmit={async ({ reason, idempotencyKey }) => {
                    if (!policy) {
                        return {
                            ok: false,
                            error: "Choose what happens to existing businesses.",
                        };
                    }
                    const stillWrong = dateProblem(when, day, new Date());
                    if (stillWrong)
                        return { ok: false, error: `${stillWrong}.` };
                    const { saved, revision } = await draft.flush();
                    if (!saved) {
                        return {
                            ok: false,
                            error: "The draft could not be saved, so it wasn't published. Nothing changed.",
                        };
                    }
                    const r = await publishPricingAction({
                        revision,
                        goLiveAt: goLive ? goLive.toISOString() : undefined,
                        policy,
                        note: note.trim() || undefined,
                        reason,
                        idempotencyKey,
                    });
                    if (!r.ok) {
                        return {
                            ok: false,
                            error: refusalText(r.error, r.details),
                        };
                    }
                    setNote("");
                    setPolicy(null);
                    setWhen("now");
                    setDay(null);
                    setTab("versions");
                    flash(publishedMessage(r.data));
                    return { ok: true };
                }}
            />
        </section>
    );
}

/** One radio as the design draws it: a bordered row, saffron when picked. */
function Choice({
    id,
    value,
    on,
    after,
    children,
}: {
    id: string;
    value: string;
    on: boolean;
    after?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                "flex flex-wrap items-center gap-2.5 rounded-[9px] border px-3 py-2.5 transition-colors duration-fast",
                on
                    ? "border-highlight"
                    : "border-border-strong hover:border-foreground/40",
            )}
        >
            <RadioGroupItem
                id={id}
                value={value}
                className="data-[state=checked]:border-highlight data-[state=checked]:text-highlight"
            />
            <label
                htmlFor={id}
                className={cn("cursor-pointer", !after && "flex-1")}
            >
                {children}
            </label>
            {after}
        </div>
    );
}
