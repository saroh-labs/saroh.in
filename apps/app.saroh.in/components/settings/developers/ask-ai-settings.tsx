"use client";

import type {
    AskAiPeopleUsage,
    AskAiPersonUsage,
    AskAiState,
    AskAiUsage,
} from "@saroh/api-contract";
import { cn } from "@saroh/ui/lib/utils";
import { ListTable, ListTableHead, listTable } from "@saroh/ui/list-table";
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

/** On a phone the two columns let go, so their pieces fall in the boards' order. */
const COLUMN = "grid min-w-0 gap-3 max-[1099px]:contents";

/**
 * The Ask AI tab ("AI Settings" boards, desk and phone): the business's
 * switch, who asked this month, this period's questions and when they
 * come back, who can use it, and where questions go. Counts only, never
 * what anyone asked.
 */
export function AskAiSettingsView({
    business,
    state,
    usage,
    people,
}: {
    business: string;
    /** Null when it couldn't be read for this business. */
    state: AskAiState | null;
    /** The period's total, kept while the switch is off; null when not on the plan or unread. */
    usage: AskAiUsage | null;
    /** Null when it couldn't be read. */
    people: AskAiPeopleUsage | null;
}) {
    return (
        <div className="mt-[18px] grid items-start gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_360px] min-[1100px]:gap-5">
            <div className={COLUMN}>
                {state?.reason === "unavailable" ? (
                    <p
                        className={`${CARD} order-1 text-[13.5px] text-foreground/80`}
                    >
                        Ask AI isn&apos;t open for {business} yet.
                    </p>
                ) : (
                    <div className="order-1">
                        <BusinessSwitch
                            business={business}
                            on={state?.businessOn ?? false}
                        />
                    </div>
                )}
                {people ? <WhoAsked people={people.people} /> : null}
            </div>
            <div className={COLUMN}>
                {usage ? (
                    <section
                        aria-label="This month"
                        className={`${CARD} order-2`}
                    >
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
                <section
                    aria-label="Who can use it"
                    className={`${CARD} order-4`}
                >
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
                <p className="order-5 text-pretty text-[12.5px] leading-normal text-foreground/80">
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

const PEOPLE_COLS =
    "sm:grid sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,.7fr)_minmax(0,.8fr)] sm:items-center sm:gap-x-3";

/**
 * "Who asked this month": everyone on the team, most questions first.
 * Someone whose role doesn't have Ask AI shows a dash. A row a person on
 * the desk; on a phone the role and the last question go under the name.
 */
function WhoAsked({ people }: { people: AskAiPersonUsage[] }) {
    const rows = [...people].sort((a, b) => b.questions - a.questions);
    return (
        <section
            aria-labelledby="ask-ai-who-asked"
            className="order-3 grid gap-2"
        >
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <h2 id="ask-ai-who-asked" className="text-[15px] font-semibold">
                    Who asked this month
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    Counts only. Conversations stay with each person.
                </span>
            </div>
            <ListTable>
                <ListTableHead className={cn("hidden", PEOPLE_COLS)}>
                    <span>Person</span>
                    <span>Role</span>
                    <span>Questions</span>
                    <span>Last asked</span>
                </ListTableHead>
                <ul>
                    {rows.map((p) => {
                        const role = p.givenAskAi
                            ? `${p.role} · given Ask AI`
                            : p.role;
                        const dash = !p.canUse && p.questions === 0;
                        const last = p.lastAskedAt ? (
                            <ViewerDate iso={p.lastAskedAt} variant="heading" />
                        ) : p.canUse ? (
                            "—"
                        ) : (
                            "Can't use it"
                        );
                        return (
                            <li
                                key={p.userId}
                                data-person={p.userId}
                                className={cn(
                                    listTable.rowStill,
                                    "flex min-h-12 items-center gap-3 text-[13.5px]",
                                    PEOPLE_COLS,
                                )}
                            >
                                <span className="min-w-0 flex-1">
                                    <b className="block font-semibold">
                                        {p.name}
                                    </b>
                                    <span className="block text-[12.5px] text-muted-foreground sm:hidden">
                                        {role} ·{" "}
                                        {p.lastAskedAt ? (
                                            <>last asked {last}</>
                                        ) : p.canUse ? (
                                            "not asked yet"
                                        ) : (
                                            "can't use it"
                                        )}
                                    </span>
                                </span>
                                <span className="text-muted-foreground max-sm:hidden">
                                    {role}
                                </span>
                                <span
                                    data-questions=""
                                    className="font-semibold tabular-nums"
                                >
                                    {dash ? "—" : p.questions}
                                </span>
                                <span
                                    data-last-asked=""
                                    className="text-muted-foreground max-sm:hidden"
                                >
                                    {last}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </ListTable>
        </section>
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
