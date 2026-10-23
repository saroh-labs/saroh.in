"use client";

import { Button } from "@saroh/ui/button";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import { runAction } from "@/lib/api/run-action";
import { firstName } from "@/lib/names";
import type { RuleKey } from "@/lib/services/availability-rules";
import { ruleRows } from "@/lib/services/availability-rules";
import type { LocalDate } from "@/lib/services/diary";
import {
    addClosure,
    addTimeOff,
    removeClosures,
    removeTimeOffMany,
} from "@/lib/staff/actions";
import { dayName } from "@/lib/staff/day-plan";
import type { ExtraItem, OffItem } from "@/lib/staff/hours-view";
import { offRowWords } from "@/lib/staff/time-off";
import type {
    Closure,
    OnlineBlocker,
    StaffView,
    WeeklyRange,
} from "@/lib/staff/types";

import type { useBookingRules } from "@/components/bookings/booking-rules/booking-rules-card";
import {
    ApprovalSwitch,
    RuleChoices,
    RulesList,
} from "@/components/bookings/booking-rules/booking-rules-card";
import {
    OffDetails,
    rangeOfLine,
} from "@/components/bookings/time-off/time-off-card";
import { BookablePreview, WhyNotOffered } from "./bookable-preview";
import type { SaveWeek } from "./day-editor";
import { DayEditor } from "./day-editor";
import { EveryoneDay } from "./everyone-day";
import { ExtraHoursBody } from "./extra-hours";
import { HoursPanel } from "./hours-panel";
import { EVERYONE, WhosePicker } from "./whose-hours";

/** Which sheet is open: one at a time. */
export type Panel =
    | { kind: "whose" }
    | { kind: "everyoneDay"; day: number }
    | { kind: "day"; staffId: string; day: number }
    | { kind: "off"; item: OffItem }
    | { kind: "extra" }
    | { kind: "see" }
    | { kind: "why" }
    | { kind: "rules" }
    | { kind: "rule"; key: RuleKey };

/**
 * Hours and time off's sheets (U17), one at a time: whose hours, everyone's
 * day, one person's day, a time off, extra opening hours, what customers
 * see and why a time isn't offered, and the business's booking rules with
 * each rule's choices. Each is a bottom sheet on a phone and a right-hand
 * panel on a desk (`HoursPanel`), and what it changes saves at once with
 * Undo.
 */
export function HoursPanels({
    panel,
    setPanel,
    people,
    weeks,
    save,
    shown,
    everyone,
    phone,
    canEdit,
    canManage,
    today,
    timezone,
    openingHours,
    extraItems,
    services,
    closures,
    rulesState,
    ownName = null,
    onlineBlocker,
    onPickWho,
    onAddPerson,
}: {
    panel: Panel | null;
    setPanel: (panel: Panel | null) => void;
    people: StaffView[];
    weeks: Record<string, WeeklyRange[]>;
    save: (
        staffId: string,
        next: WeeklyRange[],
        words: Parameters<SaveWeek>[1],
    ) => Promise<boolean>;
    shown: StaffView | null;
    everyone: boolean;
    phone: boolean;
    canEdit: boolean;
    canManage: boolean;
    today: LocalDate;
    timezone: string;
    openingHours: WeeklyRange[] | null;
    extraItems: ExtraItem[];
    services: { id: string; name: string }[];
    closures: Closure[];
    rulesState: ReturnType<typeof useBookingRules>;
    /** A Member's own first name, when they take bookings (U20). */
    ownName?: string | null;
    onlineBlocker?: OnlineBlocker | null;
    onPickWho: (id: string) => void;
    onAddPerson: () => void;
}) {
    const router = useRouter();
    const whoShort = shown ? firstName(shown.name) : "Everyone";
    const shownWeek = shown ? (weeks[shown.id] ?? shown.hours) : [];
    const dayPerson =
        panel?.kind === "day"
            ? people.find((p) => p.id === panel.staffId)
            : undefined;

    async function removeOff(item: OffItem) {
        const { line, staffId } = item;
        setPanel(null);
        const res = await runAction(
            async (): Promise<{ ok: true } | { ok: false; error: string }> => {
                const r = staffId
                    ? await removeTimeOffMany(staffId, line.ids)
                    : await removeClosures(line.ids);
                return r.ok ? { ok: true } : r;
            },
        );
        if (!res) return;
        if (!res.ok) {
            showError(
                "Couldn't remove the time off. Nothing has changed.",
                res.error,
            );
            return;
        }
        router.refresh();
        showUndo("Time off removed.", async () => {
            const back = staffId
                ? await addTimeOff(staffId, rangeOfLine(line))
                : await addClosure({
                      ...rangeOfLine(line),
                      fromDate: line.fromDate,
                  });
            if (!back.ok) return back;
            router.refresh();
            return { ok: true };
        });
    }

    const rulesPanel = (() => {
        if (panel?.kind !== "rules" && panel?.kind !== "rule") return null;
        const rows = rulesState.shown
            ? ruleRows(rulesState.shown, onlineBlocker)
            : [];
        const row =
            panel.kind === "rule"
                ? rows.find((r) => r.key === panel.key)
                : undefined;
        if (panel.kind === "rule" && row) {
            return (
                <HoursPanel
                    open
                    onClose={() => setPanel({ kind: "rules" })}
                    title={row.title}
                    sub="Saves as soon as you pick."
                >
                    <RuleChoices
                        row={row}
                        onPick={(value) =>
                            void rulesState.pick(row, value).then((ok) => {
                                if (ok) setPanel({ kind: "rules" });
                            })
                        }
                    />
                </HoursPanel>
            );
        }
        return (
            <HoursPanel
                open
                onClose={() => setPanel(null)}
                title="Booking rules"
                sub="For the whole business. Each saves as soon as you pick."
            >
                <RulesList
                    rules={rulesState.shown}
                    canEdit={canManage}
                    onlineBlocker={onlineBlocker}
                    ownName={canEdit ? ownName : null}
                    onOpen={(key) => setPanel({ kind: "rule", key })}
                />
                {/* "Members' rule changes need approval" (U20, #1038). */}
                {canManage &&
                rulesState.shown?.memberRuleChangesNeedApproval !==
                    undefined ? (
                    <ApprovalSwitch
                        on={rulesState.shown.memberRuleChangesNeedApproval}
                        onChange={(on) => void rulesState.needApproval(on)}
                    />
                ) : null}
            </HoursPanel>
        );
    })();

    return (
        <>
            {panel?.kind === "whose" ? (
                <HoursPanel
                    open
                    done={false}
                    onClose={() => setPanel(null)}
                    title="Whose hours?"
                >
                    <WhosePicker
                        value={everyone ? EVERYONE : (shown?.id ?? "")}
                        canAdd={canManage}
                        choices={[
                            ...(people.length > 1
                                ? [
                                      {
                                          id: EVERYONE,
                                          name: "Everyone",
                                          role: "All the people who take bookings",
                                      },
                                  ]
                                : []),
                            ...people.map((p) => ({
                                id: p.id,
                                name: p.name,
                                role: p.title,
                            })),
                        ]}
                        onPick={onPickWho}
                        onAdd={() => {
                            setPanel(null);
                            onAddPerson();
                        }}
                    />
                </HoursPanel>
            ) : null}

            {panel?.kind === "everyoneDay" ? (
                <HoursPanel
                    open
                    onClose={() => setPanel(null)}
                    title={dayName(panel.day)}
                    sub={`Who works, and when. ${phone ? "Tap" : "Click"} a person to change their ${dayName(panel.day)}.`}
                >
                    <EveryoneDay
                        day={panel.day}
                        canEdit={canEdit}
                        people={people.map((p) => ({
                            id: p.id,
                            name: p.name,
                            hours: weeks[p.id] ?? p.hours,
                        }))}
                        onPick={(staffId) =>
                            setPanel({ kind: "day", staffId, day: panel.day })
                        }
                    />
                </HoursPanel>
            ) : null}

            {panel?.kind === "day" && dayPerson ? (
                <HoursPanel
                    open
                    tall
                    onClose={() => setPanel(null)}
                    title={dayName(panel.day)}
                    sub={`${firstName(dayPerson.name)}'s hours · saves as you change it`}
                >
                    <DayEditor
                        key={`${dayPerson.id}-${panel.day}`}
                        person={dayPerson.name}
                        day={panel.day}
                        hours={weeks[dayPerson.id] ?? dayPerson.hours}
                        opening={openingHours}
                        onSave={(next, words) =>
                            save(dayPerson.id, next, words)
                        }
                    />
                </HoursPanel>
            ) : null}

            {panel?.kind === "off"
                ? (() => {
                      const words = offRowWords(
                          panel.item.line,
                          panel.item.who,
                          today,
                      );
                      return (
                          <HoursPanel
                              open
                              onClose={() => setPanel(null)}
                              title={words.title}
                              sub={words.sub}
                              foot={
                                  canEdit &&
                                  (panel.item.staffId || canManage) ? (
                                      <Button
                                          type="button"
                                          variant="outline"
                                          className="h-12 w-full text-destructive-subtle-foreground"
                                          onClick={() =>
                                              void removeOff(panel.item)
                                          }
                                      >
                                          Remove this time off
                                      </Button>
                                  ) : null
                              }
                          >
                              <OffDetails item={panel.item} today={today} />
                              <p className="mt-2.5 text-[12.5px] leading-normal text-muted-foreground">
                                  To change it, remove it and add it again. Undo
                                  puts it back.
                              </p>
                          </HoursPanel>
                      );
                  })()
                : null}

            {panel?.kind === "extra" ? (
                <HoursPanel
                    open
                    onClose={() => setPanel(null)}
                    title="Extra opening hours"
                    sub={`One-off hours on a single day, for ${whoShort}.`}
                >
                    <ExtraHoursBody
                        items={extraItems}
                        people={people}
                        who={shown?.id ?? null}
                        everyone={everyone}
                        today={today}
                        canEdit={canEdit}
                    />
                </HoursPanel>
            ) : null}

            {panel?.kind === "see" ? (
                <HoursPanel
                    open
                    onClose={() => setPanel(null)}
                    title="What customers see"
                    sub={`Times your booking page offers with ${whoShort}.`}
                >
                    <BookablePreview
                        person={
                            shown ? { id: shown.id, name: shown.name } : null
                        }
                        services={
                            shown
                                ? services.filter((x) =>
                                      shown.serviceIds.includes(x.id),
                                  )
                                : services
                        }
                        today={today}
                        timezone={timezone}
                        stamp={JSON.stringify([
                            shownWeek,
                            shown?.extraHours,
                            shown?.timeOff,
                            closures,
                            rulesState.shown,
                        ])}
                        onWhy={() => setPanel({ kind: "why" })}
                    />
                </HoursPanel>
            ) : null}

            {panel?.kind === "why" ? (
                <HoursPanel
                    open
                    onClose={() => setPanel(null)}
                    title="Why isn't a time offered?"
                >
                    <WhyNotOffered who={shown ? whoShort : "the person"} />
                </HoursPanel>
            ) : null}

            {rulesPanel}
        </>
    );
}
