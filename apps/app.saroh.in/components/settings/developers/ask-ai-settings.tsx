"use client";

import type { AskAiState } from "@saroh/api-contract";
import { ProgressBar } from "@saroh/ui/progress-bar";
import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { runAction } from "@/lib/api/run-action";
import { MARKETING_URL } from "@/lib/help/links";
import { saveAskAiOn } from "@/lib/settings/ask-ai-actions";

/** Team › Roles, where "Use Ask AI" is given. */
export const ROLES_HREF = "/settings/people?tab=roles";

const CARD = "rounded-xl border border-border bg-card p-4";
const LINK =
    "font-semibold text-foreground underline decoration-border underline-offset-[3px]";

/**
 * The Ask AI tab ("AI Settings" boards, desk and phone): the business's
 * switch, this period's questions and when they come back, who can use
 * it, and where questions go. Counts only, never what anyone asked.
 *
 * shortcut: no per-person table ("Who asked this month") until the API
 * has a per-person count read; add it here when it does.
 */
export function AskAiSettingsView({
    business,
    state,
}: {
    business: string;
    /** Null when it couldn't be read for this business. */
    state: AskAiState | null;
}) {
    const usage = state?.usage ?? null;
    return (
        <div className="mt-[18px] grid items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid min-w-0 gap-3">
                {state?.reason === "unavailable" ? (
                    <p className={`${CARD} text-[13.5px] text-foreground/80`}>
                        Ask AI isn&apos;t open for {business} yet.
                    </p>
                ) : (
                    <BusinessSwitch
                        business={business}
                        on={state?.businessOn ?? false}
                    />
                )}
            </div>
            <div className="grid min-w-0 gap-3">
                {usage ? (
                    <section aria-label="This month" className={CARD}>
                        <div className="flex flex-wrap items-baseline gap-x-2.5">
                            <h3 className="flex-1 text-[15px] font-semibold">
                                This month
                            </h3>
                            <span className="text-[13px] text-muted-foreground">
                                Comes back{" "}
                                <ViewerDate
                                    iso={usage.resetsAt}
                                    variant="dayMonth"
                                />
                            </span>
                        </div>
                        <p className="mt-2">
                            <b className="text-[22px] tabular-nums">
                                {usage.used}
                            </b>{" "}
                            <span className="text-muted-foreground">
                                {usage.limit === null
                                    ? "questions asked"
                                    : `of ${usage.limit} questions used`}
                            </span>
                        </p>
                        {usage.limit === null ? null : (
                            <ProgressBar
                                className="mt-2"
                                value={usage.used}
                                max={usage.limit}
                                label={`${usage.used} of ${usage.limit} questions used`}
                            />
                        )}
                        <p className="mt-1.5 text-pretty text-[12.5px] leading-snug text-muted-foreground">
                            Shared by the team. Common questions, refusals and
                            errors don&apos;t count.
                        </p>
                    </section>
                ) : null}
                <section aria-label="Who can use it" className={CARD}>
                    <h3 className="text-[15px] font-semibold">
                        Who can use it
                    </h3>
                    <p className="mt-1.5 text-pretty text-[13.5px] leading-normal text-foreground/80">
                        Owner and Admin, and any role or person given &ldquo;Use
                        Ask AI&rdquo;. Answers only cover what that person can
                        already see.
                    </p>
                    <p className="mt-2">
                        <Link
                            href={ROLES_HREF}
                            className={`${LINK} text-[13px]`}
                        >
                            Change in Team › Roles
                        </Link>
                    </p>
                </section>
                <p className="text-pretty text-[12.5px] leading-normal text-foreground/80">
                    Questions and the business details needed to answer them are
                    processed by Anthropic, outside India.{" "}
                    <a
                        href={`${MARKETING_URL}/privacy`}
                        target="_blank"
                        rel="noreferrer"
                        className={LINK}
                    >
                        See how your data is used
                    </a>
                </p>
            </div>
        </div>
    );
}

/**
 * "Ask AI for ‹business›": moves as it is pressed and goes back if the
 * save is refused, as Help improve Saroh's switch does.
 */
function BusinessSwitch({ business, on }: { business: string; on: boolean }) {
    const [pending, startTransition] = useTransition();
    const [shown, setShown] = useOptimistic(on);
    const flip = () => {
        if (pending) return;
        const next = !shown;
        startTransition(async () => {
            setShown(next);
            const result = await runAction(() => saveAskAiOn(next));
            if (!result) return;
            if (!result.ok) {
                showError(result.error, "Ask AI is as it was.");
                return;
            }
            showSuccess(
                next
                    ? `Ask AI is on for ${business}`
                    : `Ask AI is off for ${business}`,
            );
        });
    };
    return (
        <section
            aria-label="Ask AI switch"
            className="flex items-start gap-3 rounded-[10px] border border-border bg-card p-3"
        >
            <div className="min-w-0 flex-1">
                <h3
                    id="ask-ai-switch-title"
                    className="text-[14.5px] font-semibold"
                >
                    Ask AI for {business}
                </h3>
                <p
                    id="ask-ai-switch-help"
                    className="mt-[3px] text-pretty text-[12.5px] leading-snug text-muted-foreground"
                >
                    On for everyone whose role has &ldquo;Use Ask AI&rdquo;.
                    Off, the button disappears for everyone and nothing is
                    asked. Conversations stay until their 90 days end.
                </p>
            </div>
            {/* A press while a save is out is dropped in `flip`, not
                disabled: the switch keeps the keyboard. */}
            <Switch
                checked={shown}
                aria-busy={pending || undefined}
                aria-labelledby="ask-ai-switch-title"
                aria-describedby="ask-ai-switch-help"
                onCheckedChange={flip}
                className="wk-press"
            />
        </section>
    );
}
