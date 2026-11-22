"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError } from "@saroh/ui/toast";
import { GripVertical, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
    TeamAvatar,
    TeamPicker,
} from "@/components/sites/editor/add/team-picker";
import { addPeople } from "@/components/sites/editor/inspector/team-empty";
import { runAction } from "@/lib/api/run-action";
import type { PersonContent, PersonMember } from "@/lib/sites/service";
import { membersOf, syncChosen, withMembers } from "@/lib/sites/team-people";
import { setTeamPage } from "@/lib/staff/actions";
import { readTeamForPicker } from "@/lib/staff/team-picker-read";
import type { StaffView } from "@/lib/staff/types";

/**
 * Our team's People list (round 3, `EBTeamPicker` 1): who is on this
 * section, in order, each with this page's own words under their name.
 * Add people opens the picker; the cross takes someone off. Only an owner
 * or admin changes who appears (the API holds to it); everyone else sees
 * the list read only. Someone taken off leaves the live site at once, as
 * the public read checks who is chosen.
 */
export function TeamPeople({
    content,
    onChange,
}: {
    content: PersonContent;
    onChange: (next: PersonContent) => void;
}) {
    const [read, setRead] = useState<{
        team: StaffView[] | null;
        canChoose: boolean;
    } | null>(null);
    const [picking, setPicking] = useState(false);
    const [busy, setBusy] = useState(false);
    const dragged = useRef<number | null>(null);

    useEffect(() => {
        let live = true;
        readTeamForPicker()
            .then((r) => {
                if (!live) return;
                setRead(r);
                if (addPeople.asked && r.canChoose && r.team) setPicking(true);
                addPeople.asked = false;
            })
            .catch(() => live && setRead({ team: null, canChoose: false }));
        return () => {
            live = false;
        };
    }, []);

    const canPick = read?.canChoose === true && read.team !== null;
    useEffect(() => {
        if (!canPick) return;
        addPeople.open = () => setPicking(true);
        return () => {
            addPeople.open = null;
        };
    }, [canPick]);

    const members = membersOf(content);
    const can = read?.canChoose === true;
    const set = (next: PersonMember[]) => onChange(withMembers(content, next));
    const move = (from: number, to: number) => {
        if (to < 0 || to >= members.length || from === to) return;
        const next = [...members];
        next.splice(to, 0, ...next.splice(from, 1));
        set(next);
    };

    async function remove(i: number) {
        const m = members[i];
        if (m.staffId && read?.team) {
            const chosen = read.team
                .filter((p) => p.showOnTeamPage === true && p.id !== m.staffId)
                .map((p) => p.id);
            const res = await runAction(() => setTeamPage(chosen), {
                setBusy,
            });
            if (!res) return;
            if (!res.ok) return showError(res.error);
            setRead({
                ...read,
                team: read.team.map((p) =>
                    p.id === m.staffId ? { ...p, showOnTeamPage: false } : p,
                ),
            });
        }
        set(members.filter((_, j) => j !== i));
    }

    return (
        <div className="grid gap-2.5" data-team-people="">
            <p className="text-[0.8125rem] font-semibold">
                People on this page · {members.length}
            </p>
            <ul className="grid gap-2.5">
                {members.map((m, i) => (
                    <li
                        key={`${m.staffId ?? "typed"}-${i}`}
                        onDragOver={(e) => {
                            if (dragged.current === null) return;
                            e.preventDefault();
                            move(dragged.current, i);
                            dragged.current = i;
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            dragged.current = null;
                        }}
                        className="flex min-h-[52px] items-center gap-2.5 rounded-[10px] border px-2 py-1.5"
                    >
                        {can ? (
                            <button
                                type="button"
                                draggable={!busy}
                                disabled={busy}
                                aria-label={`Move ${m.name}, ${i + 1} of ${members.length}. Use the up and down arrows.`}
                                onDragStart={(e) => {
                                    dragged.current = i;
                                    e.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => {
                                    dragged.current = null;
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "ArrowUp") {
                                        e.preventDefault();
                                        move(i, i - 1);
                                    } else if (e.key === "ArrowDown") {
                                        e.preventDefault();
                                        move(i, i + 1);
                                    }
                                }}
                                className="grid size-7 shrink-0 cursor-grab place-items-center rounded-[6px] text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing coarse:size-11"
                            >
                                <GripVertical
                                    aria-hidden
                                    className="size-3.5"
                                />
                            </button>
                        ) : null}
                        <TeamAvatar name={m.name} />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                            <b className="truncate text-[0.84rem]">{m.name}</b>
                            {can ? (
                                // The grey line under the name, typed into
                                // in place (EBTeamPicker 1).
                                <Input
                                    dense
                                    className="h-6 border-transparent bg-transparent px-1 text-xs text-muted-foreground hover:border-input focus-visible:text-foreground"
                                    value={m.role ?? ""}
                                    aria-label={`The words under ${m.name}`}
                                    placeholder="What they do"
                                    onChange={(e) =>
                                        set(
                                            members.map((x, j) =>
                                                j === i
                                                    ? {
                                                          ...x,
                                                          role:
                                                              e.target.value ||
                                                              undefined,
                                                      }
                                                    : x,
                                            ),
                                        )
                                    }
                                />
                            ) : m.role ? (
                                <span className="truncate text-xs text-muted-foreground">
                                    {m.role}
                                </span>
                            ) : null}
                        </span>
                        {can ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={busy}
                                aria-label={`Take ${m.name} off this page`}
                                onClick={() => void remove(i)}
                            >
                                <X aria-hidden className="size-4" />
                            </Button>
                        ) : null}
                    </li>
                ))}
            </ul>
            {can && read.team ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 justify-self-start"
                    disabled={busy}
                    onClick={() => setPicking(true)}
                >
                    <Plus aria-hidden className="size-4" />
                    Add people
                </Button>
            ) : null}
            {can ? (
                <p className="text-xs text-muted-foreground">
                    Drag to set the order. The words under each name are this
                    page&apos;s own. Change them here. Photos come from each
                    person&apos;s profile.
                </p>
            ) : null}
            <p className="border-t pt-2.5 text-xs text-muted-foreground">
                Only owners and admins can change who appears. Others see this
                list read-only.
            </p>
            {picking && read?.team ? (
                <TeamPicker
                    team={read.team}
                    onClose={() => setPicking(false)}
                    onSaved={(chosen) => {
                        setPicking(false);
                        const team = read.team ?? [];
                        setRead({
                            ...read,
                            team: team.map((p) => ({
                                ...p,
                                showOnTeamPage: chosen.some(
                                    (c) => c.id === p.id,
                                ),
                            })),
                        });
                        set(syncChosen(members, chosen));
                    }}
                />
            ) : null}
        </div>
    );
}
