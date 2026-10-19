"use client";

import { Badge } from "@saroh/ui/badge";
import { Chip } from "@saroh/ui/chip";
import { ListSearch } from "@saroh/ui/list-search";
import { ListToolbar } from "@saroh/ui/list-toolbar";
import { Segmented } from "@saroh/ui/segmented";
import { showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { EmptyPanel } from "@/components/states/empty-panel";
import { formatDate, plural } from "@/lib/format";
import type { StaffInvite, StaffMember } from "@/lib/staff";
import type { JobFilter, TeamRow } from "@/lib/team-words";
import {
    JOB_FILTER_LABEL,
    jobChips,
    jobCounts,
    rowPasses,
} from "@/lib/team-words";

import { LoadBar } from "./load-bar";
import type { Person } from "./person-card";
import { PersonActions, PersonCard, personFacts } from "./person-card";

type View = "table" | "cards";

function rowOf(person: Person): TeamRow {
    if (person.kind === "invite") {
        const { invite } = person;
        return {
            id: `invite:${invite.id}`,
            kind: "invite",
            name: invite.name,
            email: invite.email,
            job: invite.worksAs,
            roles: invite.roles,
        };
    }
    const { member } = person;
    return {
        id: member.platformAdminId,
        kind: "member",
        name: member.name ?? member.email,
        email: member.email,
        job: member.profile?.worksAs ?? null,
        roles: member.roles.map((role) => role.role),
    };
}

/**
 * The Teammates tab's people (R30): a search, the job filter (one chip at
 * a time, each with its count) and a Table · Cards switch. On a phone the
 * table's rows stack into a list, so nothing scrolls sideways. People with
 * access come first, then invites waiting. Revoked people are listed
 * apart, below, as before.
 */
export function TeamPeople({
    members,
    invites,
    canGrant,
}: {
    members: StaffMember[];
    invites: StaffInvite[];
    canGrant: boolean;
}) {
    const [filter, setFilter] = useState<JobFilter>("all");
    const [q, setQ] = useState("");
    const [view, setView] = useState<View>("table");

    const active = members.filter((member) => !member.revokedAt);
    const former = members.filter((member) => member.revokedAt);
    const people: Person[] = [
        ...active.map((member) => ({ kind: "member" as const, member })),
        ...invites
            .filter(
                (invite) =>
                    invite.state === "waiting" || invite.state === "expired",
            )
            .map((invite) => ({ kind: "invite" as const, invite })),
    ];
    const rows = people.map(rowOf);
    const counts = jobCounts(rows);
    const shown = people.filter((person) =>
        rowPasses(rowOf(person), filter, q),
    );
    const narrowed = filter !== "all" || q.trim() !== "";
    const done = (message: string) => showSuccess(message);

    return (
        <section aria-label="Teammates" className="grid gap-3">
            <ListToolbar
                search={
                    <ListSearch
                        placeholder="Search teammates"
                        describe="By name or email"
                        defaultValue={q}
                        onSearch={setQ}
                    />
                }
                filters={
                    <div
                        role="radiogroup"
                        aria-label="Works as"
                        className="flex flex-wrap items-center gap-2"
                    >
                        {/* Says the chips are by job, so they read apart
                            from the summary's role count. */}
                        <span
                            aria-hidden
                            className="text-[12.5px] text-muted-foreground"
                        >
                            Works as
                        </span>
                        {jobChips(counts).map((chip) => (
                            <Chip
                                key={chip}
                                on={filter === chip}
                                onClick={() => setFilter(chip)}
                            >
                                {JOB_FILTER_LABEL[chip]}
                                <span className="tabular-nums opacity-70">
                                    {counts[chip]}
                                </span>
                            </Chip>
                        ))}
                    </div>
                }
                onClear={
                    narrowed
                        ? () => {
                              setFilter("all");
                              setQ("");
                          }
                        : undefined
                }
                clearLabel={filter === "all" ? "Clear search" : "Clear filters"}
                end={
                    <Segmented<View>
                        label="View"
                        value={view}
                        onValueChange={setView}
                        options={[
                            { value: "table", label: "Table" },
                            { value: "cards", label: "Cards" },
                        ]}
                    />
                }
                count={plural(shown.length, "person", "people")}
            />

            {people.length === 0 ? (
                <EmptyPanel
                    title="Nobody has been given access yet"
                    description="Until someone is, the console is reachable only through the emergency staff list."
                />
            ) : shown.length === 0 ? (
                <EmptyPanel
                    kind="no-results"
                    things="teammates"
                    cause={filter === "all" ? "search" : "filters"}
                    query={q}
                    onClear={() => {
                        setFilter("all");
                        setQ("");
                    }}
                />
            ) : view === "cards" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shown.map((person) => (
                        <PersonCard
                            key={personFacts(person).id}
                            person={person}
                            canGrant={canGrant}
                            onDone={done}
                        />
                    ))}
                </div>
            ) : (
                <PeopleTable people={shown} canGrant={canGrant} onDone={done} />
            )}

            {former.length > 0 && (
                <section className="grid gap-2">
                    <h2 className="text-[15px] font-semibold">
                        No longer on the team
                    </h2>
                    <ul className="grid gap-1 text-sm text-muted-foreground">
                        {former.map((member) => (
                            <li key={member.platformAdminId}>
                                {member.name ?? member.email} · revoked{" "}
                                {formatDate(member.revokedAt)}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </section>
    );
}

const COLUMNS =
    "md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_11rem] md:items-start md:gap-4";

/**
 * The table layout: a header and one row per person on a wide screen; on
 * a phone each row stacks, every cell under its own small label.
 */
export function PeopleTable({
    people,
    canGrant,
    onDone,
}: {
    people: Person[];
    canGrant: boolean;
    onDone: (message: string) => void;
}) {
    return (
        <div className="rounded-xl border bg-card">
            <div
                aria-hidden="true"
                className={`hidden border-b px-4 py-2 text-[12px] font-medium text-muted-foreground ${COLUMNS}`}
            >
                <span>Person</span>
                <span>Works as</span>
                <span>Console role</span>
                <span>Since</span>
                <span>Businesses</span>
                <span className="sr-only">Actions</span>
            </div>
            <ul aria-label="People on the team">
                {people.map((person) => {
                    const facts = personFacts(person);
                    return (
                        <li
                            key={facts.id}
                            data-person={facts.id}
                            className={`grid gap-2 border-b px-4 py-3 last:border-0 ${COLUMNS}`}
                        >
                            <div className="grid min-w-0 gap-0.5">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="truncate font-medium">
                                        {facts.name}
                                    </span>
                                    {facts.status && (
                                        <Badge variant={facts.status.tone}>
                                            {facts.status.text}
                                        </Badge>
                                    )}
                                </span>
                                {facts.email !== facts.name && (
                                    <span className="break-all text-[13px] text-muted-foreground">
                                        {facts.email}
                                    </span>
                                )}
                            </div>
                            <Cell label="Works as">{facts.job}</Cell>
                            <Cell label="Console role">
                                {facts.roles.length > 0
                                    ? facts.roles.map((r) => r.text).join(", ")
                                    : "None"}
                            </Cell>
                            <Cell label="Since">
                                <span className="grid gap-0.5">
                                    <span>{facts.since}</span>
                                    <span className="text-muted-foreground">
                                        {facts.ends}
                                    </span>
                                    {facts.note && (
                                        <span className="text-muted-foreground">
                                            {facts.note}
                                        </span>
                                    )}
                                </span>
                            </Cell>
                            <Cell label="Businesses">
                                {facts.load ? (
                                    <LoadBar
                                        count={facts.load.count}
                                        capacity={facts.load.capacity}
                                    />
                                ) : (
                                    <span className="text-muted-foreground">
                                        —
                                    </span>
                                )}
                            </Cell>
                            <div className="md:justify-self-end">
                                {canGrant && (
                                    <PersonActions
                                        person={person}
                                        onDone={onDone}
                                    />
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** A table cell; on a phone it carries its column's name before it. */
function Cell({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2 text-[13px] md:block">
            <span className="text-muted-foreground md:sr-only">{label}</span>
            <div className="min-w-0 break-words">{children}</div>
        </div>
    );
}
