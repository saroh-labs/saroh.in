"use client";

import { Button } from "@saroh/ui/button";
import { OptionSelect } from "@saroh/ui/option-select";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { EmptyPanel } from "@/components/states/empty-panel";
import { formatDateTime } from "@/lib/format";
import type { LeadCard, LeadContact } from "@/lib/saroh-lead-words";
import type {
    MemberActivity as Entry,
    MemberBusiness,
} from "@/lib/team-member-words";
import { activityWords, withLogged } from "@/lib/team-member-words";

import { LogCallSheet } from "./log-call-sheet";

type Target =
    | { type: "business"; id: string; name: string }
    | { type: "lead"; id: string; name: string; followUpOn: string | null };

const keyOf = (target: Target) => `${target.type}:${target.id}`;

/** A call just logged, as Activity shows it. */
export function loggedEntry(contact: LeadContact, target: Target): Entry {
    return {
        id: `contact:${contact.id}`,
        type: "contact",
        at: contact.happenedAt,
        kind: contact.kind,
        minutes: contact.minutes,
        summary: contact.summary,
        with: { type: target.type, id: target.id, name: target.name },
    };
}

/**
 * The Activity tab (R33): their calls, visits and messages with leads and
 * businesses, the roles they were given and when each ended, and the
 * businesses they started and stopped looking after, newest first. On
 * their own page, Log a call: pick who it was with, and the call is at the
 * top of the list as soon as it is saved.
 */
export function MemberActivity({
    platformAdminId,
    activity,
    businesses,
    leads,
    canLog,
}: {
    platformAdminId: string;
    activity: Entry[];
    businesses: MemberBusiness[];
    leads: LeadCard[] | null;
    canLog: boolean;
}) {
    const id = useId();
    const router = useRouter();
    const targets: Target[] = [
        ...businesses.map((business): Target => ({
            type: "business",
            id: business.organizationId,
            name: business.name,
        })),
        ...(leads ?? []).map((lead): Target => ({
            type: "lead",
            id: lead.id,
            name: lead.name,
            followUpOn: lead.followUpOn,
        })),
    ];
    const [chosen, setChosen] = useState(targets[0] ? keyOf(targets[0]) : "");
    const [logging, setLogging] = useState<Target | null>(null);
    const [logged, setLogged] = useState<Entry[]>([]);
    const entries = withLogged(activity, logged);
    const target = targets.find((t) => keyOf(t) === chosen) ?? null;

    return (
        <section aria-label="Activity" className="grid gap-3">
            {canLog ? (
                targets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Log a call here once you look after a business or work a
                        lead.
                    </p>
                ) : (
                    <div className="flex flex-wrap items-end gap-2">
                        <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-sm">
                            <label
                                htmlFor={`${id}-with`}
                                className="text-[13px] font-medium"
                            >
                                Who it was with
                            </label>
                            <OptionSelect<string>
                                id={`${id}-with`}
                                value={chosen}
                                onValueChange={setChosen}
                                options={targets.map((t) => ({
                                    value: keyOf(t),
                                    label: t.name,
                                    hint:
                                        t.type === "business"
                                            ? "A business you look after"
                                            : "A lead",
                                }))}
                            />
                        </div>
                        <Button
                            type="button"
                            disabled={!target}
                            onClick={() => setLogging(target)}
                        >
                            Log a call
                        </Button>
                    </div>
                )
            ) : null}

            {entries.length === 0 ? (
                <EmptyPanel
                    title="Nothing yet"
                    description="Calls and visits they log, roles they're given and businesses they look after show here."
                />
            ) : (
                <ol
                    aria-label="What they did"
                    className="rounded-xl border bg-card"
                >
                    {entries.map((entry) => {
                        const words = activityWords(entry);
                        return (
                            <li
                                key={entry.id}
                                data-entry={entry.id}
                                className="grid gap-1 border-b px-4 py-3 last:border-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4"
                            >
                                <span className="text-[13px] tabular-nums text-muted-foreground">
                                    {formatDateTime(entry.at)}
                                </span>
                                <span className="grid min-w-0 gap-0.5">
                                    <span className="text-sm font-medium">
                                        {words.what}
                                    </span>
                                    {words.line ? (
                                        <span className="break-words text-[13px] text-muted-foreground">
                                            {words.line}
                                        </span>
                                    ) : null}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            )}

            {logging ? (
                logging.type === "business" ? (
                    <LogCallSheet
                        business={{
                            organizationId: logging.id,
                            platformAdminId,
                        }}
                        leadName={logging.name}
                        onOpenChange={(open) => {
                            if (!open) setLogging(null);
                        }}
                        onLogged={(contact) => {
                            setLogged((now) => [
                                loggedEntry(contact, logging),
                                ...now,
                            ]);
                            showSuccess(`Logged with ${logging.name}`);
                            router.refresh();
                        }}
                    />
                ) : (
                    <LogCallSheet
                        leadId={logging.id}
                        leadName={logging.name}
                        followUpOn={logging.followUpOn}
                        onOpenChange={(open) => {
                            if (!open) setLogging(null);
                        }}
                        onLogged={(contact) => {
                            setLogged((now) => [
                                loggedEntry(contact, logging),
                                ...now,
                            ]);
                            showSuccess(`Logged with ${logging.name}`);
                            router.refresh();
                        }}
                    />
                )
            ) : null}
        </section>
    );
}
