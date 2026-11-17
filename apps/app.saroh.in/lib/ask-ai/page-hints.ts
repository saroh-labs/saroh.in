import type { AskAiAbout, AskAiStarter } from "@saroh/api-contract";

import type { CalendarItem, CalendarMonth } from "@/lib/calendar/types";
import { addDays, weekTitle } from "@/lib/calendar/week";
import { formatDate, formatMonth, formatWeekday } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";

/**
 * What Ask AI offers on the page it is opened on (boards AF 1, 2, 5): the
 * page it is about, a line saying so, the box's words, and suggestions
 * with hints. Every hint is counted here from what the page already read:
 * opening the panel never calls the model or uses a question (the page's
 * rule: "hints tease, never fully answer"). Pure, so a test reads them.
 */

/**
 * One suggestion. A question (`fill` unset) is asked as written when
 * tapped, and is one of the API's common questions, which don't count.
 * A `fill` one ("Move a booking…") only puts its words in the box.
 */
export type AskAiSuggestion = {
    label: string;
    hint?: string | null;
} & (
    | { fill?: false; question: AskAiStarter }
    /** The words put in the box. */
    | { fill: true; question: string }
);

export interface AskAiPage {
    /** Null: the whole business (Home, or the label cleared). */
    about: AskAiAbout | null;
    /** "Looking at your Calendar, 16 to 22 Nov." Null on the whole business. */
    intro: string | null;
    placeholder: string;
    suggestions: AskAiSuggestion[];
}

const MOVE_BOOKING: AskAiSuggestion = {
    label: "Move a booking…",
    question: "Move the booking for ",
    fill: true,
};

/**
 * The whole business (AF 1): Home's own figures, where it has them. Also
 * what the panel offers on a page that says nothing of itself.
 */
export function businessPage(
    facts: {
        /** Today's date, `YYYY-MM-DD`, for the months' names. */
        today?: string;
        /** Orders due today (Home's To pack tile); absent without it. */
        dueToday?: number;
        /** Home has a bookings tile: bookings are on and readable. */
        bookings?: boolean;
    } = {},
): AskAiPage {
    const today = facts.today ?? new Date().toISOString().slice(0, 10);
    const month = formatMonth(today, "UTC", { year: "never" });
    const last = formatMonth(addDays(`${today.slice(0, 7)}-01`, -1), "UTC", {
        year: "never",
    });
    const suggestions: AskAiSuggestion[] = [
        {
            label: `${month} vs ${last}`,
            question: "How did this month go compared with last month?",
        },
        {
            label: "Regulars who haven't been back",
            question: "Which regulars haven't been back?",
        },
        {
            label: "Free time this week",
            question: "When do I have free time this week?",
        },
        {
            label: "Best sellers this month",
            question: "What sold best this month?",
        },
    ];
    if (facts.dueToday !== undefined) {
        suggestions.push({
            label: "Mark today's orders ready…",
            question: "Mark today's orders as ready for pick-up",
            hint: facts.dueToday > 0 ? `${facts.dueToday} due` : null,
            fill: true,
        });
    }
    if (facts.bookings) suggestions.push(MOVE_BOOKING);
    return {
        about: null,
        intro: null,
        placeholder: "Ask, or say what to do",
        suggestions,
    };
}

const SEATS = /(\d+) of (\d+) booked/;

/** A class's seats left from its "3 of 8 booked"; null when it doesn't say. */
function seatsLeft(item: CalendarItem): number | null {
    if (item.kind === "full") return 0;
    const m = SEATS.exec(item.subtitle ?? "");
    return m ? Math.max(0, Number(m[2]) - Number(m[1])) : null;
}

/** A week of the Calendar (AF 2): its busiest day and a class with room. */
export function calendarWeekPage(
    data: Pick<CalendarMonth, "days" | "layers" | "timezone">,
    today: string,
): AskAiPage {
    const from = data.days[0]?.date ?? today;
    const title = weekTitle(from, today);
    const day = (date: string) => formatWeekday(date, "UTC", "short");

    let busiest: { date: string; n: number } | null = null;
    let open: { date: string; seats: number } | null = null;
    for (const d of data.days) {
        const n = Object.values(d.layers).reduce((sum, l) => sum + l.count, 0);
        if (n > 0 && (!busiest || n > busiest.n)) busiest = { date: d.date, n };
        for (const item of d.layers.classes?.items ?? []) {
            const seats = seatsLeft(item);
            if (!open && seats) open = { date: d.date, seats };
        }
    }

    const suggestions: AskAiSuggestion[] = [
        {
            label: "When do I have free time this week?",
            question: "When do I have free time this week?",
        },
    ];
    if (data.layers.includes("classes")) {
        suggestions.push({
            label: "Which classes still have seats?",
            question: "Which classes still have seats this week?",
            hint: open
                ? `${day(open.date)} · ${count(open.seats, "seat")}`
                : null,
        });
    }
    suggestions.push({
        label: "Busiest day this week",
        question: "What's my busiest day this week?",
        hint: busiest
            ? `${day(busiest.date)} · ${count(busiest.n, "thing")}`
            : null,
    });
    if (data.layers.includes("bookings")) {
        suggestions.push(
            {
                label: "Who booked more than once?",
                question: "Who booked more than once this week?",
            },
            MOVE_BOOKING,
        );
    }
    return {
        about: {
            kind: "calendar",
            label: `Calendar · ${title.replace(" to ", "–")}`,
        },
        intro: `Looking at your Calendar, ${title}.`,
        placeholder: "Ask about this week",
        suggestions,
    };
}

/** A month of the Calendar: the page named, the business's suggestions. */
export function calendarMonthPage(month: string, today: string): AskAiPage {
    const name = formatMonth(`${month}-01`, "UTC", {
        year: month.slice(0, 4) === today.slice(0, 4) ? "never" : "always",
    });
    return {
        ...businessPage({ today }),
        about: { kind: "calendar", label: `Calendar · ${name}` },
        intro: `Looking at your Calendar, ${name}.`,
        placeholder: "Ask about this month",
    };
}

const DAY_MS = 86_400_000;

/** A customer (AF 5): what they usually have and when they last came. */
export function customerPage(
    person: {
        id: string;
        name: string;
        firstName: string | null;
        createdAt: string;
    },
    facts: {
        zone: string;
        /** How many orders they have in all; the rows may be fewer. */
        total?: number | null;
        /** Their orders, newest first, each line's name; absent unread. */
        orders?: { placedAt: string; items: { name: string }[] }[];
        /** Their past bookings' starts; absent unread. */
        visits?: string[];
        now?: Date;
    },
): AskAiPage {
    const now = facts.now ?? new Date();
    const first = person.firstName?.trim()
        ? person.firstName.trim()
        : person.name.split(" ")[0];
    const orders = facts.orders ?? [];

    // What they usually have: the line on most of their orders.
    const on = new Map<string, number>();
    for (const o of orders) {
        for (const name of Array.from(new Set(o.items.map((i) => i.name)))) {
            on.set(name, (on.get(name) ?? 0) + 1);
        }
    }
    const usual = Array.from(on)
        .sort((a, b) => b[1] - a[1])
        .at(0);

    const last = [...orders.map((o) => o.placedAt), ...(facts.visits ?? [])]
        .filter((at) => Date.parse(at) <= now.getTime())
        .sort()
        .at(-1);
    const ago = last
        ? Math.floor((now.getTime() - Date.parse(last)) / DAY_MS)
        : null;

    const suggestions: AskAiSuggestion[] = [];
    if (facts.orders) {
        suggestions.push({
            label: "What do they usually order?",
            question: "What do they usually order?",
            hint:
                usual && usual[1] > 1
                    ? `${usual[0]} · ${usual[1]} of ${orders.length}`
                    : null,
        });
    }
    suggestions.push({
        label: "When did they last come?",
        question: "When did they last come?",
        hint:
            last && ago !== null
                ? `${formatDate(last, facts.zone, { now })} · ${ago === 0 ? "today" : `${count(ago, "day")} ago`}`
                : null,
    });
    // Only once they have been away a while: a month without them.
    if (ago !== null && ago >= 30) {
        suggestions.push({
            label: "Why did they stop coming?",
            question: "Why did they stop coming?",
        });
    }
    if (facts.orders && usual) {
        suggestions.push({
            label: `Order ${first}'s usual…`,
            question: `Make an order for ${person.name}: their usual, `,
            fill: true,
        });
    }
    if (facts.visits) {
        suggestions.push({
            label: `Book ${first} in…`,
            question: `Book ${person.name} in for `,
            fill: true,
        });
    }

    const since = formatMonth(person.createdAt, facts.zone, {
        now,
        year: "auto",
    });
    return {
        about: { kind: "customer", id: person.id, label: person.name },
        intro: facts.orders?.length
            ? `Looking at ${person.name}: ${count(facts.total ?? orders.length, "order")} since ${since}.`
            : `Looking at ${person.name}.`,
        placeholder: `Ask about ${first}`,
        suggestions,
    };
}
