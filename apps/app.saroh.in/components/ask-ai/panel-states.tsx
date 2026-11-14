"use client";

import type { AskAiConversationSummary } from "@saroh/api-contract";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { WHO_CAN_CHANGE_PLAN } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Gem, Lock, Power } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { useCanChangePlan } from "@/components/billing/plan-way";
import { upgradeHref } from "@/lib/billing/access";
import { formatRecent, localDateKey } from "@/lib/format/datetime";
import { plansShown } from "@/lib/saroh-billing/plans-shown";
import { Question } from "./thread";
import { HISTORY_LINE, planName } from "./words";

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

/** Free (board 8): the plan named, an example on sample data, one way up. */
export function PlanLocked({ upgradeTo }: { upgradeTo: string | null }) {
    const canChangePlan = useCanChangePlan();
    return (
        <LockCard
            icon={<Gem />}
            title={`Ask AI comes with ${planName(upgradeTo)}`}
        >
            <p data-ph-unmask="" className={body}>
                Ask about your bookings, payments and customers in plain words,
                and add or change things by asking.
            </p>
            <div
                aria-label="Example, sample data"
                className="flex w-full flex-col gap-2.5 rounded-xl border border-border bg-background p-3"
            >
                <span
                    data-ph-unmask=""
                    className="inline-flex h-[22px] items-center self-start rounded-full bg-muted px-2 text-xs font-semibold text-neutral-700 dark:text-foreground"
                >
                    Example · sample data, not yours
                </span>
                <Question>Who hasn&apos;t paid this week?</Question>
                <p data-ph-unmask="" className="m-0 text-[15px] font-semibold">
                    4 bookings aren&apos;t paid yet.
                </p>
            </div>
            {canChangePlan ? (
                plansShown() ? (
                    <Button asChild>
                        <Link href={upgradeHref()}>See plans</Link>
                    </Button>
                ) : null
            ) : (
                <p className={body}>{WHO_CAN_CHANGE_PLAN}</p>
            )}
        </LockCard>
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

/** The person's own conversations, newest first (board 9). */
export function ConversationList({
    conversations,
    zone,
    phone,
    line = HISTORY_LINE,
    grouped = true,
    onOpen,
    now = new Date(),
}: {
    conversations: AskAiConversationSummary[];
    zone: string;
    phone: boolean;
    line?: string;
    grouped?: boolean;
    onOpen: (id: string) => void;
    now?: Date;
}) {
    const groups = conversations.map((c) =>
        groupOf(c.lastMessageAt, zone, now),
    );
    return (
        <div className="flex flex-col">
            <p className="m-0 mb-1 text-[12.5px] leading-[1.4] text-muted-foreground">
                {line}
            </p>
            {conversations.length === 0 ? (
                <EmptyState size="inline" title="No conversations yet" />
            ) : null}
            {conversations.map((c, i) => {
                const group = groups[i];
                const head = grouped && group !== groups[i - 1];
                return (
                    <div key={c.id} className="contents">
                        {head ? (
                            <h3 className="label mx-3 mb-1 mt-3">{group}</h3>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => onOpen(c.id)}
                            className={cn(
                                "flex flex-col gap-0.5 rounded-[9px] px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                phone && "min-h-11",
                            )}
                        >
                            <b className="truncate text-[13.5px] font-medium">
                                {c.title ?? "Untitled conversation"}
                            </b>
                            <span className="text-xs text-muted-foreground">
                                {formatRecent(c.lastMessageAt, zone, now)}
                            </span>
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
