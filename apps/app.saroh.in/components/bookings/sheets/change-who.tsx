"use client";

import { Button } from "@saroh/ui/button";
import { Notice } from "@saroh/ui/notice";
import { Skeleton } from "@saroh/ui/skeleton";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import type { SendHeld } from "@/components/bookings/sheets/cancel-sheet";
import { TimePicker } from "@/components/bookings/sheets/time-picker";
import type { RadioCard } from "@/components/shared/fields/choice-group";
import { RadioCards } from "@/components/shared/fields/choice-group";
import {
    FormSheet,
    FormSheetBody,
    FormSheetFoot,
} from "@/components/shared/forms/form-sheet";
import { FailedRead } from "@/components/shared/states/failed-read";
import type { HeldResult } from "@/components/shared/undo/use-hold";
import { formatDateTime, formatTime } from "@/lib/format/datetime";
import type { NoticeReach } from "@/lib/messages/notice-reach";
import { firstName } from "@/lib/names";
import {
    readReassignCandidates,
    reassignBooking,
} from "@/lib/services/actions";
import { localDateOf } from "@/lib/services/diary";
import type { ReassignCandidate } from "@/lib/services/service";

/**
 * "Change who" (#1157): give a booking to someone else on the team, or
 * give one that has nobody a person, from the calendar's quick look, the
 * booking's page and the phone's sheet. One list of everyone who takes the
 * service, each saying whether they're free at the booking's time (booked
 * then says when; not working then says so), so nobody is ever
 * double-booked. "Change the time too" opens the one time picker in the
 * same step. The change waits ten seconds with Undo, since it tells the
 * customer (`useHold().send`); everything else on the booking stays.
 */

/** The booking whose person is being changed, as the screen knows it. */
export interface ChangeWhoTarget {
    id: string;
    serviceId: string;
    serviceName: string;
    startAt: string;
    /** The customer: "Kabir Singh". */
    who: string;
    /** Who it is with now; null when it has nobody. */
    staff: { id: string; name: string } | null;
}

/**
 * Who this viewer may give bookings to (#1157, `booking-reassign.ts`):
 * `any` (`service:write`) gives anyone's to anyone; otherwise only a
 * booking on their own diary (`me`), or one with nobody, to themselves.
 */
export interface ReassignScope {
    any: boolean;
    /** The viewer on the diary; null when they aren't on it. */
    me: string | null;
}

/** Whether Change who is offered on a booking with `staffId`. */
export function mayChangeWho(
    scope: ReassignScope | undefined,
    staffId: string | null,
): boolean {
    if (!scope || scope.any) return true;
    if (!scope.me) return false;
    return staffId === null || staffId === scope.me;
}

/** The one person it may go to, when the viewer may only take it. */
export function onlyTo(
    scope: ReassignScope | undefined,
    staffId: string | null,
): string | null {
    if (!scope || scope.any || staffId !== null) return null;
    return scope.me;
}

/** "Assign someone" when it has nobody, else "Change who". */
export function changeWhoLabel(staff: { name: string } | null): string {
    return staff ? "Change who it's with" : "Assign someone";
}

/** The sheet's title: "Who should Kabir's booking be with?". */
export function changeWhoTitle(target: ChangeWhoTarget): string {
    const first = firstName(target.who);
    const whose = first ? `${first}'s booking` : "this booking";
    return target.staff
        ? `Change who ${whose} is with`
        : `Assign someone to ${whose}`;
}

/** What a person's row says under their name. */
export function candidateNote(
    person: ReassignCandidate,
    timezone: string,
): string {
    switch (person.state) {
        case "current":
            return "With them now";
        case "free":
            return "Free then";
        case "busy":
            return person.busyFrom && person.busyTo
                ? `Booked ${formatTime(person.busyFrom, timezone)} to ${formatTime(person.busyTo, timezone)}`
                : "Booked then";
        case "off":
            return "Not working then";
    }
}

/** The main button: "Give it to Meera", "Assign Meera", "… at 12:00 pm". */
export function changeWhoSave(
    target: ChangeWhoTarget,
    picked: { name: string } | null,
    at: string | null,
    timezone: string,
): string {
    if (!picked) return target.staff ? "Pick who it's with" : "Pick someone";
    const name = firstName(picked.name) || picked.name;
    const verb = target.staff ? `Give it to ${name}` : `Assign ${name}`;
    return at ? `${verb} at ${formatTime(at, timezone)}` : verb;
}

/** The toast once it's done: "Kabir's booking is now with Meera.". */
export function changedText(
    target: ChangeWhoTarget,
    picked: { name: string },
    at: string | null,
    timezone: string,
): string {
    const first = firstName(target.who);
    const whose = first ? `${first}'s booking` : "The booking";
    const name = firstName(picked.name) || picked.name;
    return at
        ? `${whose} is now with ${name}, ${formatDateTime(at, timezone, { weekday: "short" })}.`
        : `${whose} is now with ${name}.`;
}

type Read =
    | { key: string; state: "ready"; people: ReassignCandidate[] }
    | { key: string; state: "failed" };

/**
 * Everything the sheet decides: who, the time when it changes too, the
 * list read at that time, and the held change. Shared by the page's
 * sheet and the quick look's step so both say and do the same.
 */
export function useChangeWho({
    target,
    timezone,
    reach,
    send,
    only = null,
    onDone,
}: {
    target: ChangeWhoTarget;
    timezone: string;
    reach: NoticeReach | null | undefined;
    /** The screen's own hold, so the Undo outlives the sheet. */
    send: SendHeld;
    /** The one person it may go to (`onlyTo`); null: anyone free. */
    only?: string | null;
    /** The sheet closes once the change is held. */
    onDone: () => void;
}) {
    const router = useRouter();
    const [picked, setPicked] = useState<{ id: string; name: string } | null>(
        null,
    );
    const [timeOpen, setTimeOpen] = useState(false);
    const [at, setAt] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [read, setRead] = useState<Read | null>(null);
    const when = at ?? target.startAt;
    const key = `${target.id}|${when}|${attempt}`;

    useEffect(() => {
        let live = true;
        void readReassignCandidates(target.id, at ?? undefined)
            .catch(() => null)
            .then((found) => {
                if (!live) return;
                setRead(
                    found
                        ? { key, state: "ready", people: found.people }
                        : { key, state: "failed" },
                );
            });
        return () => {
            live = false;
        };
    }, [key, target.id, at]);

    const shown = read?.key === key ? read : null;
    const loading = shown === null;
    // Someone who may only take it sees the others, unpickable, saying why.
    const people = (shown?.state === "ready" ? shown.people : []).map(
        (p): ReassignCandidate & { onlyOthers?: boolean } =>
            only && p.id !== only && p.state === "free"
                ? { ...p, onlyOthers: true }
                : p,
    );
    // Someone picked who isn't free at the new time is no longer picked.
    const pickedRow = picked ? people.find((p) => p.id === picked.id) : null;
    const pickable =
        pickedRow?.state === "free" && pickedRow.onlyOthers !== true;
    const chosen = loading || pickable ? picked : null;

    function save() {
        if (!chosen || !pickable) return;
        const to = chosen;
        const time = at;
        const first = firstName(target.who);
        send(`reassign-booking:${target.id}`, {
            soon: `Giving it to ${firstName(to.name) || to.name} in 10 seconds`,
            description: toldLine(reach, first),
            run: async (): Promise<HeldResult> => {
                const res = await reassignBooking(target.id, {
                    staffId: to.id,
                    ...(time ? { startAt: time } : {}),
                });
                if (!res.ok) return { ok: false, error: res.error };
                router.refresh();
                return { ok: true };
            },
            sent: changedText(target, to, time, timezone),
            failed: "Who it's with wasn't changed.",
        });
        onDone();
    }

    return {
        picked: chosen,
        setPicked,
        timeOpen,
        openTime: () => setTimeOpen(true),
        keepTime: () => {
            setTimeOpen(false);
            setAt(null);
        },
        at,
        setAt,
        loading,
        failed: shown?.state === "failed",
        retry: () => setAttempt((n) => n + 1),
        people,
        canSave: pickable,
        save,
        saveLabel: changeWhoSave(target, chosen, at, timezone),
    };
}

export type ChangeWho = ReturnType<typeof useChangeWho>;

/** Who hears of it, under the toast's "in 10 seconds". */
function toldLine(reach: NoticeReach | null | undefined, first: string) {
    const who = first || "They";
    if (reach === "EMAIL_AND_ACCOUNT" || reach === "EMAIL") {
        return `${who} ${first ? "is" : "are"} emailed once it's done.`;
    }
    if (reach === "ACCOUNT" || reach === "ON_SIGN_IN") {
        return `It shows in ${first ? `${first}'s` : "their"} account on your site.`;
    }
    return `Saroh doesn't message ${first || "them"}. Tell them yourself.`;
}

/**
 * The list and the time: the body both sheets draw. Busy and off rows
 * can't be picked, and say why.
 */
export function ChangeWhoFields({
    target,
    state: s,
    timezone,
    now,
}: {
    target: ChangeWhoTarget;
    state: ChangeWho;
    timezone: string;
    now?: number;
}) {
    const ids = { list: useId(), when: useId() };
    const when = s.at ?? target.startAt;
    const others = s.people.filter((p) => p.state !== "current");
    const options: RadioCard<string>[] = s.people.map((p) => ({
        value: p.id,
        label: p.state === "current" ? `${p.name} (now)` : p.name,
        note: p.onlyOthers
            ? "Free then. An owner or admin can give it to them."
            : candidateNote(p, timezone),
        disabled: p.state !== "free" || p.onlyOthers === true,
    }));
    return (
        <div className="grid min-w-0 gap-3.5">
            <div className="grid min-w-0 gap-1.5">
                <span id={ids.list} className="label">
                    Who it&apos;s with
                </span>
                <span
                    id={ids.when}
                    className="text-[12.5px] text-muted-foreground"
                >
                    Free at{" "}
                    {formatDateTime(when, timezone, {
                        weekday: "short",
                        relative: "lower",
                        now,
                    })}
                </span>
                {s.loading ? (
                    <div className="grid gap-2" aria-busy="true">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : s.failed ? (
                    <FailedRead
                        things="who is free"
                        reassurance="Nothing has changed."
                        onRetry={s.retry}
                    />
                ) : others.length === 0 ? (
                    <Notice tone="info">
                        Nobody else takes {target.serviceName}. Add who takes it
                        on the service first.
                    </Notice>
                ) : (
                    <RadioCards
                        labelledBy={ids.list}
                        describedBy={ids.when}
                        options={options}
                        value={s.picked?.id ?? null}
                        onChange={(id) => {
                            const person = s.people.find((p) => p.id === id);
                            if (person) {
                                s.setPicked({
                                    id: person.id,
                                    name: person.name,
                                });
                            }
                        }}
                    />
                )}
            </div>
            {s.timeOpen ? (
                <div className="grid min-w-0 gap-2">
                    <TimePicker
                        serviceId={target.serviceId}
                        timezone={timezone}
                        value={s.at}
                        onChange={(startAt, person) => {
                            s.setAt(
                                startAt && startAt !== target.startAt
                                    ? startAt
                                    : null,
                            );
                            if (person && person.id !== target.staff?.id) {
                                s.setPicked(person);
                            }
                        }}
                        people={others.map((p) => ({ id: p.id, name: p.name }))}
                        withId={s.picked?.id ?? null}
                        onWithChange={(id) => {
                            const person = others.find((p) => p.id === id);
                            s.setPicked(
                                person
                                    ? { id: person.id, name: person.name }
                                    : null,
                            );
                        }}
                        initialDay={localDateOf(target.startAt, timezone)}
                        now={now}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        className="justify-self-start"
                        onClick={s.keepTime}
                    >
                        Keep the time
                    </Button>
                </div>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={s.openTime}
                >
                    Change the time too
                </Button>
            )}
            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                Only the person
                {s.timeOpen ? " and the time" : ""} change. What was paid, a
                deposit, a payment link and a class pack stay on the booking.
            </p>
        </div>
    );
}

/**
 * "Change who" from a booking's page (#1157): a bottom sheet on a phone,
 * the right-hand panel at a desk, like Move and Cancel beside it.
 */
export function ChangeWhoSheet({
    open,
    target,
    timezone,
    reach,
    now,
    send,
    only = null,
    onClose,
}: {
    open: boolean;
    target: ChangeWhoTarget;
    timezone: string;
    reach: NoticeReach | null;
    now?: number;
    send: SendHeld;
    /** The one person it may go to (`onlyTo`); null: anyone free. */
    only?: string | null;
    onClose: () => void;
}) {
    return (
        <FormSheet
            open={open}
            bottomOnPhone
            wide
            title={changeWhoTitle(target)}
            description={`${target.serviceName}, ${formatDateTime(target.startAt, timezone, { weekday: "short", relative: "lower", now })}${target.staff ? `, now with ${target.staff.name}` : ", with nobody yet"}.`}
            onClose={onClose}
        >
            {/* Drawn only while open: a fresh choice per opening. */}
            {open ? (
                <SheetDraft
                    target={target}
                    timezone={timezone}
                    reach={reach}
                    now={now}
                    send={send}
                    only={only}
                    onClose={onClose}
                />
            ) : null}
        </FormSheet>
    );
}

function SheetDraft({
    target,
    timezone,
    reach,
    now,
    send,
    only,
    onClose,
}: {
    target: ChangeWhoTarget;
    timezone: string;
    reach: NoticeReach | null;
    now?: number;
    send: SendHeld;
    only: string | null;
    onClose: () => void;
}) {
    const state = useChangeWho({
        target,
        timezone,
        reach,
        send,
        only,
        onDone: onClose,
    });
    return (
        <>
            <FormSheetBody className="gap-3.5">
                <ChangeWhoFields
                    target={target}
                    state={state}
                    timezone={timezone}
                    now={now}
                />
            </FormSheetBody>
            <FormSheetFoot
                saveLabel={state.saveLabel}
                savingLabel="Changing…"
                saveOff={!state.canSave}
                pending={false}
                onSubmit={state.save}
            />
        </>
    );
}
