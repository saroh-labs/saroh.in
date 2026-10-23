"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { ListSearch } from "@saroh/ui/list-search";
import { AttentionToggle, ListToolbar } from "@saroh/ui/list-toolbar";
import { Segmented } from "@saroh/ui/segmented";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { changedRowProps } from "@/components/changed-row";
import { plural } from "@/lib/format";
import type {
    LeadsBoard as Board,
    LeadCard,
    LeadStage,
    OwnerFilter,
} from "@/lib/saroh-lead-words";
import {
    followUpWords,
    inStage,
    LEAD_STAGES,
    leadLine,
    STAGE_LABEL,
} from "@/lib/saroh-lead-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { AddLeadSheet } from "./add-lead-sheet";
import { LeadSheet } from "./lead-sheet";

/**
 * Saroh's own sales leads as a board (DEC-169, R33, R35, U20): one column
 * per stage, New to Lost, each card a lead with where it came from and its
 * next follow-up. A card opens its sheet, where the stage is changed (by its
 * Stage control, so it works by keyboard; there is no dragging). On a phone
 * the board shows one stage at a time, picked above it.
 *
 * An Account manager's board is their own leads. Support and Platform owner
 * see every lead, can show only those nobody has, and give them out from a
 * lead's sheet. After a change the card moves to its column and lights for
 * two seconds; one the owner filter would now hide stays, lit, until the
 * filter changes.
 */
export function LeadsBoard({
    board,
    owner,
    q,
    canWrite,
}: {
    board: Board;
    owner: OwnerFilter;
    q: string;
    canWrite: boolean;
}) {
    const router = useRouter();
    const allScope = board.scope === "all";
    const feedback = useChangeFeedback({ filterKey: `${owner}|${q}` });
    // The board as read, with this screen's own changes laid over it until
    // the next read arrives.
    const [changed, setChanged] = useState<Record<string, LeadCard>>({});
    const [seenBoard, setSeenBoard] = useState(board);
    if (seenBoard !== board) {
        setSeenBoard(board);
        setChanged({});
    }
    const [open, setOpen] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [phoneStage, setPhoneStage] = useState<LeadStage>("NEW");

    const merged = mergeCards(board.leads, changed);
    const { rows, highlighted } = feedback.keep(merged, {
        id: (lead) => lead.id,
        passes: (lead) => owner !== "unowned" || lead.owner === null,
    });

    const onChanged = (card: LeadCard, message: string) => {
        setChanged((now) => ({ ...now, [card.id]: card }));
        feedback.report({ message, rowId: card.id });
        router.refresh();
    };

    const filtered = owner !== "all" || q.trim() !== "";
    const openCount =
        board.counts.NEW +
        board.counts.TALKED +
        board.counts.DEMO +
        board.counts.TRIAL;

    return (
        <div className="grid min-w-0 gap-4">
            <Summary board={board} openCount={openCount} />

            <ListToolbar
                search={
                    <ListSearch
                        placeholder="Search leads"
                        describe="By name, email, phone or city."
                        defaultValue={q}
                        onSearch={(term) => {
                            if (term === q) return;
                            router.replace(leadsHref(owner, term), {
                                scroll: false,
                            });
                        }}
                    />
                }
                attention={
                    allScope ? (
                        <AttentionToggle
                            label="Not given out"
                            count={board.unowned}
                            on={owner === "unowned"}
                            onToggle={() =>
                                router.push(
                                    leadsHref(
                                        owner === "unowned" ? "all" : "unowned",
                                        q,
                                    ),
                                    { scroll: false },
                                )
                            }
                        />
                    ) : undefined
                }
                onClear={
                    filtered
                        ? () => router.push("/leads", { scroll: false })
                        : undefined
                }
                clearLabel={owner === "all" ? "Clear search" : "Clear filters"}
                end={
                    canWrite ? (
                        <Button type="button" onClick={() => setAdding(true)}>
                            Add a lead
                        </Button>
                    ) : undefined
                }
            />

            {board.truncated ? (
                <p className="text-sm text-muted-foreground">
                    Showing the most recent leads. Search to find an older one.
                </p>
            ) : null}

            {rows.length === 0 ? (
                filtered ? (
                    <EmptyState
                        size="panel"
                        kind="no-results"
                        things="leads"
                        cause={q.trim() ? "search" : "filters"}
                        query={q.trim() || null}
                        clearHref="/leads"
                    />
                ) : (
                    <EmptyState
                        size="panel"
                        title="No leads yet"
                        description={
                            allScope
                                ? "Questions from saroh.in and the waitlist arrive here, and so do the leads your team adds."
                                : "Leads you add, and the ones Support gives you, show here."
                        }
                    />
                )
            ) : (
                <>
                    <div className="md:hidden">
                        <Segmented
                            label="Stage to show"
                            options={LEAD_STAGES.map((value) => ({
                                value,
                                label: STAGE_LABEL[value],
                                count: inStage(rows, value).length,
                            }))}
                            value={phoneStage}
                            onValueChange={setPhoneStage}
                        />
                    </div>
                    <div
                        data-board=""
                        className="grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-6"
                    >
                        {LEAD_STAGES.map((stage) => (
                            <StageColumn
                                key={stage}
                                stage={stage}
                                leads={inStage(rows, stage)}
                                total={board.counts[stage]}
                                today={board.today}
                                allScope={allScope}
                                shownOnPhone={stage === phoneStage}
                                highlighted={highlighted}
                                onOpen={setOpen}
                            />
                        ))}
                    </div>
                </>
            )}

            {open ? (
                <LeadSheet
                    key={open}
                    leadId={open}
                    today={board.today}
                    allScope={allScope}
                    onOpenChange={(next) => {
                        if (!next) setOpen(null);
                    }}
                    onChanged={onChanged}
                />
            ) : null}
            {adding ? (
                <AddLeadSheet
                    ownScope={!allScope}
                    onOpenChange={setAdding}
                    onAdded={(card) =>
                        onChanged(card, `${card.name} added to New.`)
                    }
                />
            ) : null}
        </div>
    );
}

function mergeCards(
    leads: readonly LeadCard[],
    changed: Record<string, LeadCard>,
): LeadCard[] {
    const seen = new Set(leads.map((lead) => lead.id));
    const added = Object.values(changed).filter((card) => !seen.has(card.id));
    return [...added, ...leads.map((lead) => changed[lead.id] ?? lead)];
}

function Summary({ board, openCount }: { board: Board; openCount: number }) {
    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat term="Open leads" value={openCount} />
            <Stat
                term="Follow-ups overdue"
                value={board.overdue}
                warn={board.overdue > 0}
            />
            {board.unowned !== null ? (
                <Stat
                    term="Not given out"
                    value={board.unowned}
                    warn={board.unowned > 0}
                />
            ) : null}
        </dl>
    );
}

function Stat({
    term,
    value,
    warn = false,
}: {
    term: string;
    value: number;
    warn?: boolean;
}) {
    return (
        <div className="rounded-lg border border-border bg-card px-3 py-2">
            <dt className="text-xs text-muted-foreground">{term}</dt>
            <dd
                className={cn(
                    "text-lg font-semibold tabular-nums",
                    warn && "text-warning",
                )}
            >
                {value}
            </dd>
        </div>
    );
}

/** The board's address for an owner filter and a search. */
export function leadsHref(owner: OwnerFilter, q: string): string {
    const search = new URLSearchParams();
    if (owner !== "all") search.set("owner", owner);
    if (q.trim()) search.set("q", q.trim());
    return search.size > 0 ? `/leads?${search.toString()}` : "/leads";
}

function StageColumn({
    stage,
    leads,
    total,
    today,
    allScope,
    shownOnPhone,
    highlighted,
    onOpen,
}: {
    stage: LeadStage;
    leads: LeadCard[];
    total: number;
    today: string;
    allScope: boolean;
    shownOnPhone: boolean;
    highlighted: (id: string) => boolean;
    onOpen: (id: string) => void;
}) {
    const label = `${STAGE_LABEL[stage]} · ${plural(total, "lead")}`;
    return (
        <section
            aria-label={label}
            data-stage={stage}
            data-phone-shown={shownOnPhone ? "" : undefined}
            className={cn(
                "flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3",
                !shownOnPhone && "max-md:hidden",
            )}
        >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex-1">{STAGE_LABEL[stage]}</span>
                <span className="rounded-full bg-muted px-2 text-xs font-medium tabular-nums text-muted-foreground">
                    {total}
                </span>
            </h3>
            {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground">None here.</p>
            ) : (
                <ul className="grid gap-2">
                    {leads.map((lead) => {
                        const due = followUpWords(lead, today);
                        return (
                            <li
                                key={lead.id}
                                {...changedRowProps(highlighted(lead.id))}
                            >
                                <button
                                    type="button"
                                    data-lead={lead.id}
                                    onClick={() => onOpen(lead.id)}
                                    className="grid w-full gap-0.5 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="font-semibold">
                                        {lead.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {leadLine(lead)}
                                    </span>
                                    {due ? (
                                        <span
                                            className={cn(
                                                "text-xs",
                                                lead.overdue
                                                    ? "font-semibold text-destructive"
                                                    : "text-muted-foreground",
                                            )}
                                        >
                                            {due}
                                        </span>
                                    ) : null}
                                    {allScope ? (
                                        <span className="text-xs text-muted-foreground">
                                            {lead.owner
                                                ? lead.owner.name
                                                : "Not given out"}
                                        </span>
                                    ) : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
