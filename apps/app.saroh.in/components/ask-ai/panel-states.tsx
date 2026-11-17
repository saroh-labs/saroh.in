"use client";

import type { AskAiConversationSummary } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Info, Lock, Power, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useCanChangePlan } from "@/components/billing/plan-way";
import { upgradeHref } from "@/lib/billing/access";
import { formatRecent, localDateKey } from "@/lib/format/datetime";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { planName } from "./words";

/**
 * The panel's whole-panel states (boards 8, 9, 18): locked on the plan,
 * not part of the role, switched off for the business, and the person's
 * own conversations.
 */

function LockCard({
    icon,
    title,
    children,
}: {
    icon: ReactNode;
    title: string;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col items-start gap-2.5 rounded-[14px] border-[1.5px] border-dashed border-border-strong bg-card p-5">
            <span
                aria-hidden
                className="inline-flex size-10 items-center justify-center rounded-xl bg-muted text-neutral-700 dark:text-foreground [&_svg]:size-[19px]"
            >
                {icon}
            </span>
            <h3 className="m-0 text-[17px] font-semibold">{title}</h3>
            {children}
        </div>
    );
}

const body = "m-0 text-sm leading-[1.5] text-neutral-700 dark:text-foreground";

/** One example the locked panel shows, on sample words (AF 11). */
function Example({ ask, children }: { ask: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-3.5">
            <p className="m-0 text-[12.5px] text-neutral-700 dark:text-foreground">
                &ldquo;{ask}&rdquo;
            </p>
            {children}
        </div>
    );
}

/**
 * Free (AF 11): what Ask AI does that no screen does, as three examples
 * on sample words, then the plans or who can change them, and Not now.
 */
export function PlanLocked({
    upgradeTo,
    businessName,
    onNotNow,
}: {
    upgradeTo: string | null;
    businessName: string;
    onNotNow?: () => void;
}) {
    const canChangePlan = useCanChangePlan();
    return (
        <div className="flex flex-col gap-3.5">
            <div>
                <h3 className="m-0 flex items-center gap-2 font-display text-[21px] font-semibold tracking-[-0.01em]">
                    <Lock className="size-[18px] shrink-0" aria-hidden />
                    Ask AI comes with {planName(upgradeTo)}
                </h3>
                <p
                    data-ph-unmask=""
                    className="m-0 mt-1 text-[13.5px] text-neutral-700 dark:text-foreground"
                >
                    What it does that no screen in Saroh does:
                </p>
            </div>
            <div
                aria-label="Examples, sample words"
                className="flex flex-col gap-3"
            >
                <Example ask="How did November go vs October?">
                    <p data-ph-unmask="" className="m-0 text-sm font-semibold">
                        Up 20%. The bun box did most of it.
                    </p>
                </Example>
                <Example ask="Move Kavya's tasting to Tuesday 4 pm">
                    <p className="m-0 text-[13.5px]">
                        <s className="text-muted-foreground">Mon 4:00 pm</s> Tue
                        17 Nov, 4:00 pm · Kavya gets a message
                    </p>
                    {/* A picture of the card, not a control: nothing here acts. */}
                    <p aria-hidden className="m-0 flex items-center gap-2.5">
                        <span
                            data-ph-unmask=""
                            className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-[13.5px] font-semibold text-primary-foreground"
                        >
                            Move booking
                        </span>
                        <span data-ph-unmask="" className="text-[12.5px]">
                            Undo all day
                        </span>
                    </p>
                </Example>
                <Example ask="Regulars who haven't been back?">
                    <p data-ph-unmask="" className="m-0 text-sm font-semibold">
                        5 people · Call · Order again
                    </p>
                </Example>
            </div>
            <p
                data-ph-unmask=""
                className="m-0 text-[12.5px] text-neutral-700 dark:text-foreground"
            >
                Examples, not {businessName}&apos;s own.
            </p>
            <div className="flex flex-wrap items-center gap-2">
                {canChangePlan ? (
                    plansShown() ? (
                        <Button asChild className="h-11">
                            <Link href={upgradeHref()}>See plans</Link>
                        </Button>
                    ) : null
                ) : (
                    <p className={body}>{WHO_CAN_CHANGE_PLAN}</p>
                )}
                {onNotNow ? (
                    <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        onClick={onNotNow}
                    >
                        Not now
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

/** A role without "Use Ask AI" (board 8, phone): a role, not a plan. */
export function RoleLocked() {
    return (
        <LockCard icon={<Lock />} title="Ask AI isn't part of your role">
            <p data-ph-unmask="" className={body}>
                Ask your business owner. They choose who can use it in Settings
                › Team › Roles.
            </p>
        </LockCard>
    );
}

/** Switched off for the business (board 18): history stays readable. */
export function OffCard({
    businessName,
    ownerName,
    canSwitch,
    busy,
    onTurnOn,
}: {
    businessName: string;
    ownerName: string | null;
    canSwitch: boolean;
    busy: boolean;
    onTurnOn: () => void;
}) {
    return (
        <LockCard icon={<Power />} title={`Ask AI is off for ${businessName}`}>
            {canSwitch ? (
                <>
                    <p data-ph-unmask="" className={body}>
                        Nobody can ask until it&apos;s back on.
                    </p>
                    <Button
                        type="button"
                        onClick={onTurnOn}
                        disabled={busy}
                        aria-busy={busy}
                    >
                        Turn on
                    </Button>
                </>
            ) : (
                <p className={body}>
                    Ask {ownerName ?? "your business owner"} if you need it back
                    on.
                </p>
            )}
        </LockCard>
    );
}

type Group = "Today" | "This week" | "Earlier";

function groupOf(at: string, zone: string, now: Date): Group {
    if (localDateKey(at, zone) === localDateKey(now, zone)) return "Today";
    return now.getTime() - Date.parse(at) < 7 * 24 * 3_600_000
        ? "This week"
        : "Earlier";
}

/** The person's own conversations, newest first, each with where it began (AF 9). */
export function ConversationList({
    conversations,
    businessName,
    zone,
    phone,
    line,
    grouped = true,
    searching = false,
    current = null,
    onOpen,
    now = new Date(),
}: {
    conversations: AskAiConversationSummary[];
    businessName: string;
    zone: string;
    phone: boolean;
    line?: string;
    grouped?: boolean;
    /** A search is narrowing the list: none found says so. */
    searching?: boolean;
    /** The conversation open now. */
    current?: string | null;
    onOpen: (id: string) => void;
    now?: Date;
}) {
    const groups = conversations.map((c) =>
        groupOf(c.lastMessageAt, zone, now),
    );
    return (
        <div className="flex flex-col">
            {line ? (
                <p className="m-0 mb-1 text-[12.5px] leading-[1.4] text-muted-foreground">
                    {line}
                </p>
            ) : null}
            {conversations.length === 0 ? (
                <EmptyState
                    size="inline"
                    title={
                        searching
                            ? "No conversation has those words"
                            : "No conversations yet"
                    }
                />
            ) : null}
            {conversations.map((c, i) => {
                const group = groups[i];
                const head = grouped && group !== groups[i - 1];
                const on = c.id === current;
                return (
                    <div key={c.id} className="contents">
                        {head ? (
                            <h3 className="mx-3 mb-1.5 mt-3.5 text-xs font-semibold text-neutral-700 first:mt-1 dark:text-foreground">
                                {group}
                            </h3>
                        ) : null}
                        <button
                            type="button"
                            aria-current={on ? "true" : undefined}
                            onClick={() => onOpen(c.id)}
                            className={cn(
                                "flex min-h-[74px] flex-col justify-center gap-1 rounded-[9px] px-3 py-2 text-left hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                phone && "min-h-[74px]",
                                on &&
                                    "bg-card shadow-[inset_3px_0_0_hsl(var(--ask))]",
                            )}
                        >
                            <b className="truncate text-[14.5px] font-medium">
                                {c.title ?? "Untitled conversation"}
                            </b>
                            <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                                {c.about ? (
                                    <span className="inline-flex min-w-0 items-center gap-1 text-ask-subtle-foreground">
                                        <Sparkles
                                            className="size-3 shrink-0"
                                            aria-hidden
                                        />
                                        <span className="truncate">
                                            {c.about.label}
                                        </span>
                                    </span>
                                ) : (
                                    <span className="inline-flex min-w-0 items-center gap-1">
                                        <Info
                                            className="size-3 shrink-0"
                                            aria-hidden
                                        />
                                        <span className="truncate">
                                            All of {businessName}
                                        </span>
                                    </span>
                                )}
                                <span aria-hidden>·</span>
                                <span className="shrink-0">
                                    {formatRecent(c.lastMessageAt, zone, now)}
                                </span>
                                {c.done ? (
                                    // What was done from it (AF 9).
                                    <>
                                        <span aria-hidden>·</span>
                                        <span className="truncate">
                                            {c.done}
                                        </span>
                                    </>
                                ) : null}
                            </span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
