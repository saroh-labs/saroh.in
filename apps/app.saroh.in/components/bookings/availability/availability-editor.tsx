"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { count } from "@/lib/format/plural";
import { useNarrow } from "@/lib/hooks/use-narrow";
import { firstName } from "@/lib/names";
import type { KeptBooking } from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import type { SeveralChoice } from "@/lib/staff/day-plan";
import {
    severalRanges,
    severalSaved,
    weekMeta,
    withDays,
} from "@/lib/staff/day-plan";
import {
    comingExtra,
    comingOff,
    severalStart,
    usualDay,
    weekRows,
} from "@/lib/staff/hours-view";
import { startingWeek } from "@/lib/staff/starting-week";
import type {
    BookingRules,
    Closure,
    OnlineBlocker,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

import { AddPersonDialog } from "./add-person-dialog";
import { AddTimeOffSheet } from "./add-time-off-sheet";
import { useBookingRules } from "./booking-rules-card";
import { FirstHours, useSetMine } from "./first-hours";
import { HoursHeader } from "./hours-header";
import type { Panel } from "./hours-panels";
import { HoursPanels } from "./hours-panels";
import { MoreSection, RulesRow } from "./more-list";
import { OutsideNote } from "./outside-note";
import { PersonRulesSection, RuleRequestLine } from "./person-rules";
import { PersonRulesPanels } from "./person-rules-panels";
import { SeveralDaysSheet } from "./several-days-sheet";
import { TimeOffCard } from "./time-off-card";
import { useHours } from "./use-hours";
import type { PersonRulesData } from "./use-person-rules";
import { usePersonRules } from "./use-person-rules";
import { WeeklyHours } from "./weekly-hours";
import { EVERYONE, WhoseRow } from "./whose-hours";

/**
 * Bookings › Hours and time off (U17, V2; DEC-170): when each person can be
 * booked. Under the page's header, the "Whose hours" card picks whose
 * week shows (or everyone's; `?person=` opens on someone, as the calendar's
 * ⋯ links here). The week is a calm list, a row a day; a row opens that
 * day's sheet, the chips over it change several days at once. Time off is
 * on the same screen, and More holds extra opening hours, what customers
 * see and the business's booking rules. On a desk Time off and More sit in
 * a column on the right; on a phone they follow the week. Every sheet is a
 * bottom sheet on a phone and a right-hand panel on a desk.
 *
 * Every change saves as it is made, with a toast and Undo: there is no
 * draft, no Save bar, and leaving never asks. A Member changes anyone's
 * hours, time off and extra hours (`hours:write`), but not who takes
 * bookings, the business's closures or its rules (`service:write`).
 * Without either, the page only reads, and says so in one line.
 *
 * With nobody on the diary it asks "When can customers book Meera?" with
 * the week they would start with (`FirstHours`).
 *
 * Each person's own booking rules (U20, #1038) sit between Time off and
 * More, and the requests waiting in one line under Whose hours
 * (`usePersonRules`); `personRules` is what the page read for them.
 */
export function AvailabilityEditor({
    staff,
    closures,
    openingHours,
    rules,
    serviceHours = null,
    services = [],
    seatNote = null,
    timezone,
    today,
    kept,
    bookedOn,
    person = null,
    business,
    me,
    canEdit,
    canManage,
    onlineBlocker,
    personRules = null,
}: {
    staff: StaffView[];
    /** When the whole business is closed (E3). */
    closures: Closure[];
    /** When the business is open (DEC-087, DEC-096), or null with no hours saved. */
    openingHours: WeeklyRange[] | null;
    /** The saved booking rules, or null when they couldn't be read. */
    rules: BookingRules | null;
    /** With nobody on the diary: the services' own hours together. */
    serviceHours?: WeeklyRange[] | null;
    /** The services the booking page offers, for "What customers see". */
    services?: { id: string; name: string }[];
    /** Said when adding someone, only when the plan counts seats. */
    seatNote?: string | null;
    timezone: string;
    today: LocalDate;
    /** This week's live bookings by person, or null when unread. */
    kept: KeptBooking[] | null;
    /** Live bookings per `${staffId}|${date}` over the next three weeks. */
    bookedOn: Record<string, number> | null;
    /** `?person=`: whose week to open on, or `all` for everyone's. */
    person?: string | null;
    /** The business's name, for "Nobody at Kaya Physio can be booked." */
    business: string;
    /** The signed-in person's name, for the first-time card. */
    me: string;
    /** May change hours, time off and extra hours (`hours:write`). */
    canEdit: boolean;
    /** May add or remove people, close the business, set its rules. */
    canManage: boolean;
    onlineBlocker?: OnlineBlocker | null;
    /** Each person's own rules: who you are, and the requests (U20). */
    personRules?: PersonRulesData | null;
}) {
    const router = useRouter();
    const phone = useNarrow();
    const people = staff.filter((p) => p.status === "ACTIVE");
    const { weeks, save, outside } = useHours(staff);
    const rulesState = useBookingRules(rules);
    const [who, setWho] = useState(() =>
        person === EVERYONE && people.length > 1
            ? EVERYONE
            : people.some((p) => p.id === person)
              ? (person ?? "")
              : (people.at(0)?.id ?? ""),
    );
    const [panel, setPanel] = useState<Panel | null>(null);
    const [several, setSeveral] = useState<{
        open: boolean;
        days: number[];
        start: SeveralChoice;
        opened: number;
    } | null>(null);
    const [addingOff, setAddingOff] = useState<{
        open: boolean;
        opened: number;
    } | null>(null);
    const [adding, setAdding] = useState(false);
    const mine = useSetMine(setWho);

    const everyone = who === EVERYONE && people.length > 0;
    const shown = everyone
        ? null
        : (people.find((p) => p.id === who) ?? people.at(0) ?? null);
    const shownWeek = shown ? (weeks[shown.id] ?? shown.hours) : [];
    const whoShort = shown ? firstName(shown.name) : "Everyone";
    const firstWeek = startingWeek(openingHours);
    const theirs = people.filter((p) => everyone || p.id === shown?.id);
    const extraItems = comingExtra(theirs, bookedOn, today);
    const pr = usePersonRules({
        staff,
        people,
        shown,
        everyone,
        canEdit,
        canManage,
        business: rulesState.shown,
        data: personRules,
    });

    function pickWho(id: string) {
        setWho(id);
        setPanel(null);
        router.replace(
            `/bookings/availability?person=${encodeURIComponent(id)}`,
            { scroll: false },
        );
    }

    function openSeveral(days: number[], start: SeveralChoice) {
        setSeveral((s) => ({
            open: true,
            days,
            start,
            opened: (s?.opened ?? 0) + 1,
        }));
    }

    const header = <HoursHeader readOnly={!canEdit} />;

    // The sheets and dialogs, whichever state the page is in.
    const tail = (
        <>
            <HoursPanels
                panel={panel}
                setPanel={setPanel}
                people={people}
                weeks={weeks}
                save={save}
                shown={shown}
                everyone={everyone}
                phone={phone}
                canEdit={canEdit}
                canManage={canManage}
                today={today}
                timezone={timezone}
                openingHours={openingHours}
                extraItems={extraItems}
                services={services}
                closures={closures}
                rulesState={rulesState}
                ownName={pr.ownName}
                onlineBlocker={onlineBlocker}
                onPickWho={pickWho}
                onAddPerson={() => setAdding(true)}
            />
            <PersonRulesPanels pr={pr} timezone={timezone} />
            {several ? (
                <SeveralDaysSheet
                    key={several.opened}
                    open={several.open}
                    onClose={() =>
                        setSeveral((s) => (s ? { ...s, open: false } : s))
                    }
                    who={shown ? whoShort : firstName(me) || "you"}
                    days={several.days}
                    start={several.start}
                    onApply={(days, choice) =>
                        shown
                            ? save(
                                  shown.id,
                                  withDays(
                                      shownWeek,
                                      days,
                                      severalRanges(choice),
                                  ),
                                  {
                                      done: severalSaved(days, choice),
                                      failed: `Couldn't change those days for ${whoShort}. Nothing has changed.`,
                                  },
                              )
                            : mine.setMine(
                                  withDays(
                                      firstWeek,
                                      days,
                                      severalRanges(choice),
                                  ),
                              )
                    }
                />
            ) : null}
            {canEdit && addingOff ? (
                <AddTimeOffSheet
                    key={addingOff.opened}
                    open={addingOff.open}
                    onClose={() =>
                        setAddingOff((a) => (a ? { ...a, open: false } : a))
                    }
                    people={people}
                    who={shown?.id ?? people.at(0)?.id ?? ""}
                    today={today}
                    business={business}
                    canClose={canManage}
                    closures={closures}
                />
            ) : null}
            <AddPersonDialog
                open={adding}
                onOpenChange={setAdding}
                onAdded={(id) => setWho(id)}
                week={openingHours?.length ? "opening" : "default"}
                seatNote={seatNote}
                hoursScreen
                hoursHint="Their week is on Hours and time off. Change any day."
            />
        </>
    );

    // — Nobody on the diary yet ————————————————————————————————————
    if (!people.length) {
        return (
            <>
                {header}
                <FirstHours
                    me={me}
                    week={firstWeek}
                    serviceHours={serviceHours}
                    canStart={canManage}
                    busy={mine.busy}
                    onSet={() => void mine.setMine()}
                    onChoose={() => openSeveral([], usualDay(firstWeek))}
                    onAdd={() => setAdding(true)}
                    rules={
                        <RulesRow onOpen={() => setPanel({ kind: "rules" })} />
                    }
                />
                {tail}
            </>
        );
    }

    // — Someone's week ——————————————————————————————————————————————
    const selected = phone
        ? null
        : panel?.kind === "day" && panel.staffId === shown?.id
          ? panel.day
          : panel?.kind === "everyoneDay"
            ? panel.day
            : null;

    return (
        <>
            {header}
            <WhoseRow
                name={shown ? shown.name : "Everyone"}
                role={shown ? shown.title : "the whole team"}
                meta={
                    everyone
                        ? count(people.length, "person", "people")
                        : weekMeta(shownWeek)
                }
                everyone={everyone}
                member={canEdit && !canManage}
                onOpen={() => setPanel({ kind: "whose" })}
            />
            <RuleRequestLine pr={pr} />

            <div className="min-[760px]:grid min-[760px]:grid-cols-[minmax(0,1fr)_400px] min-[760px]:items-start min-[760px]:gap-5">
                <div className="min-w-0">
                    <WeeklyHours
                        rows={weekRows(
                            everyone
                                ? people.map((p) => ({
                                      name: p.name,
                                      hours: weeks[p.id] ?? p.hours,
                                  }))
                                : [{ name: whoShort, hours: shownWeek }],
                            everyone,
                        )}
                        canEdit={canEdit}
                        showChips={!everyone}
                        whose={
                            everyone ? "for everyone" : `${whoShort}'s hours`
                        }
                        selected={selected}
                        onOpenDay={(day) =>
                            setPanel(
                                everyone
                                    ? { kind: "everyoneDay", day }
                                    : {
                                          kind: "day",
                                          staffId: shown?.id ?? "",
                                          day,
                                      },
                            )
                        }
                        onSeveral={(start) => {
                            const at = severalStart(start, shownWeek);
                            openSeveral(at.days, at.choice);
                        }}
                    />
                    {shown ? (
                        <OutsideNote
                            staffId={shown.id}
                            briefs={outside[shown.id]}
                            kept={kept}
                            week={shownWeek}
                            timezone={timezone}
                            today={today}
                        />
                    ) : null}
                    {canEdit ? (
                        <p className="mt-2.5 hidden text-[12.5px] text-muted-foreground min-[760px]:block">
                            Click a day to change it. Its hours save as you
                            change them, and a toast lets you undo.
                        </p>
                    ) : null}
                </div>

                <div className="grid min-w-0 gap-0 min-[760px]:gap-[18px]">
                    <TimeOffCard
                        items={comingOff(theirs, closures, timezone, today)}
                        today={today}
                        canEdit={canEdit}
                        onOpen={(item) => setPanel({ kind: "off", item })}
                        onAdd={() =>
                            setAddingOff((a) => ({
                                open: true,
                                opened: (a?.opened ?? 0) + 1,
                            }))
                        }
                    />
                    {pr.subject ? (
                        <div data-slot="person-rules" className="min-w-0">
                            <PersonRulesSection pr={pr} />
                        </div>
                    ) : null}
                    <MoreSection
                        extraLine={
                            extraItems.length
                                ? `${extraItems.length} coming up`
                                : "None"
                        }
                        onExtra={() => setPanel({ kind: "extra" })}
                        onSee={() => setPanel({ kind: "see" })}
                        onRules={() => setPanel({ kind: "rules" })}
                    />
                </div>
            </div>

            {tail}
        </>
    );
}
