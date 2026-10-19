import { act } from "react";
import type { Root } from "react-dom/client";

import type { BookingRules, StaffView, WeeklyRange } from "@/lib/staff/types";

import { AvailabilityEditor } from "./availability-editor";

/**
 * Hours and time off's component tests (U17): the people the boards draw,
 * the page drawn at a phone's width or a desk's, and the few presses the
 * tests make. For tests only.
 */

export const TODAY = "2026-10-19"; // a Monday

const range = (dayOfWeek: number, startMinute: number, endMinute: number) => ({
    dayOfWeek,
    startMinute,
    endMinute,
});

/** Meera: 9 am to 7 pm with lunch 1 to 3 on weekdays, Saturday 9 to 1. */
export const MEERA_WEEK: WeeklyRange[] = [
    ...[1, 2, 3, 4, 5].flatMap((d) => [
        range(d, 540, 780),
        range(d, 900, 1140),
    ]),
    range(6, 540, 780),
];

export const MEERA: StaffView = {
    id: "st_meera",
    name: "Meera Iyer",
    title: "Physiotherapist",
    status: "ACTIVE",
    membership: null,
    serviceIds: ["sv_assess"],
    hours: MEERA_WEEK,
    weeklyMinutes: 2640,
    extraHours: [
        { id: "x1", date: "2026-10-24", startMinute: 840, endMinute: 1020 },
    ],
    timeOff: [
        {
            id: "t1",
            startAt: "2026-10-26T18:30:00.000Z",
            endAt: "2026-10-29T18:30:00.000Z",
            allDay: true,
            reason: "Leave",
        },
    ],
};

export const ARJUN: StaffView = {
    ...MEERA,
    id: "st_arjun",
    name: "Arjun Rao",
    title: "Sports therapist",
    serviceIds: [],
    hours: [
        ...[1, 2, 3, 4, 5].map((d) => range(d, 600, 1080)),
        range(6, 600, 840),
    ],
    extraHours: [],
    timeOff: [],
};

/** Neha works a split day: mornings and evenings. */
export const NEHA: StaffView = {
    ...MEERA,
    id: "st_neha",
    name: "Neha Kapoor",
    title: "Pilates teacher",
    serviceIds: [],
    hours: [range(1, 420, 660), range(1, 1020, 1200)],
    extraHours: [],
    timeOff: [],
};

export const RULES: BookingRules = {
    bookAheadDays: 28,
    latestBookingMinutes: 120,
    freeCancelHours: 24,
    refundInTimeCancels: true,
    bookingPayment: "BOTH",
    gapMinutes: 0,
};

/** Monday to Saturday, 10 to 7: the business's opening hours. */
export const OPENING: WeeklyRange[] = [1, 2, 3, 4, 5, 6].map((d) =>
    range(d, 600, 1140),
);

/** The phone's width (under 760px), or the desk's. */
export function setWidth(phone: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: phone && query.includes("max-width: 759"),
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }),
    });
}

export type EditorProps = Parameters<typeof AvailabilityEditor>[0];

export function drawEditor(root: Root, over: Partial<EditorProps> = {}) {
    act(() =>
        root.render(
            <AvailabilityEditor
                staff={[MEERA, ARJUN, NEHA]}
                closures={[]}
                openingHours={OPENING}
                rules={RULES}
                serviceHours={null}
                services={[{ id: "sv_assess", name: "Physio assessment" }]}
                timezone="Asia/Kolkata"
                today={TODAY}
                kept={[]}
                bookedOn={{ "st_meera|2026-10-24": 3 }}
                business="Kaya Physio"
                me="Mohit Mehta"
                canEdit
                canManage
                onlineBlocker={null}
                {...over}
            />,
        ),
    );
}

/** Every open sheet or panel. */
export const dialog = () =>
    document.body.querySelector<HTMLElement>("[role=dialog]");

/** A button by its words or its accessible name, anywhere on the page. */
export function button(
    name: string | RegExp,
    within: ParentNode = document.body,
) {
    const hit = Array.from(within.querySelectorAll("button")).find((b) => {
        const words = [
            b.textContent.trim(),
            b.getAttribute("aria-label") ?? "",
        ].map((w) => w.replace(/\u00a0/g, " "));
        return words.some((w) =>
            typeof name === "string" ? w === name : name.test(w),
        );
    });
    if (!hit) throw new Error(`No "${String(name)}" button`);
    return hit;
}

export const hasButton = (name: string | RegExp, within?: ParentNode) => {
    try {
        button(name, within);
        return true;
    } catch {
        return false;
    }
};

/** A radio in a `RadioCards` set, by the words of its row. */
export function radio(words: string) {
    const label = Array.from(document.body.querySelectorAll("label")).find(
        (l) => l.textContent.includes(words),
    );
    const hit = label?.querySelector<HTMLElement>("[role=radio]");
    if (!hit) throw new Error(`No "${words}" choice`);
    return hit;
}

export async function press(el: HTMLElement) {
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}

/** Lets awaited actions and their toasts settle. */
export async function settle() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
    });
}

/** The text a screen reader reads, with the dot's no-break spaces plain. */
export const said = (el: Element | null | undefined) =>
    (el?.textContent ?? "").replace(/\u00a0/g, " ");
