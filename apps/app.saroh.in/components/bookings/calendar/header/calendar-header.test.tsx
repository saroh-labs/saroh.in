// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingsOpens } from "@/lib/services/bookings-opens";
import { EVERYONE, OPENS_DEFAULT } from "@/lib/services/bookings-opens";
import type { CalendarLayout } from "@/lib/services/calendar-href";
import { calendarHref } from "@/lib/services/calendar-href";

import { CalendarHeader } from "./calendar-header";
import type { PersonChoice } from "./people-sheet";

const push = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn() }),
}));
const save = vi.fn((change: Partial<BookingsOpens>) =>
    Promise.resolve({ ok: true as const, data: change }),
);
vi.mock("@/lib/services/bookings-opens-actions", () => ({
    saveBookingsOpens: (change: Partial<BookingsOpens>) => save(change),
}));

/**
 * Header C (U2, #1018) on the desk and on a phone: the date title opens Go
 * to a day, the chip opens Whose bookings, "…" opens the view's options,
 * and the choices of where Bookings opens are kept for the person.
 */

const TODAY = "2026-10-19"; // a Monday
const choices: PersonChoice[] = [
    {
        key: EVERYONE,
        name: "Everyone",
        initials: "All",
        sub: "Everyone’s bookings together",
        count: 10,
    },
    {
        key: "meera",
        name: "Meera Iyer",
        initials: "MI",
        sub: "Physiotherapist",
        count: 5,
    },
    {
        key: "arjun",
        name: "Arjun Rao",
        initials: "AR",
        sub: "Sports therapist",
        count: 3,
    },
    {
        key: "neha",
        name: "Neha Kapoor",
        initials: "NK",
        sub: "Pilates teacher",
        count: 2,
    },
];

let host: HTMLDivElement;
let root: Root;
let phone = false;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    phone = false;
    window.matchMedia = ((query: string) => ({
        matches: phone && query.includes("max-width"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    push.mockClear();
    save.mockClear();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function draw(over: Partial<Parameters<typeof CalendarHeader>[0]> = {}) {
    const props: Parameters<typeof CalendarHeader>[0] = {
        layout: "day",
        date: TODAY,
        today: TODAY,
        summary: "10 booked · 8 free times · ₹4,800 booked",
        zone: "IST",
        choices,
        picked: EVERYONE,
        facts: (d) => ({
            count: d === "2026-10-22" ? 3 : d < "2026-11-01" ? 1 : null,
            closed: d === "2026-10-25",
        }),
        cancelled: { count: 1, shown: false, onChange: vi.fn() },
        opens: OPENS_DEFAULT,
        me: { id: "meera", name: "Meera Iyer" },
        hrefFor: (l: CalendarLayout, d, person = EVERYONE) =>
            calendarHref(l, d, { person }),
        newBooking: <button type="button">New booking</button>,
        calOnly: false,
        onAddPerson: vi.fn(),
        ...over,
    };
    act(() => root.render(<CalendarHeader {...props} />));
    return props;
}

const button = (label: RegExp) => {
    const found = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => label.test(b.getAttribute("aria-label") ?? b.textContent));
    if (!found) throw new Error(`no button ${label}`);
    return found;
};
const click = (el: Element | null | undefined) =>
    act(() => (el as HTMLElement).click());
const popover = () => document.querySelector("[data-header-popover]");
const sheet = () => document.querySelector("[data-header-sheet]");
const flush = () => act(() => Promise.resolve());

describe("the header on the desk", () => {
    it("is the date, the arrows, the chip with faces, ⋯ and New booking, then one line", () => {
        draw();
        expect(host.querySelector("h1")?.textContent).toBe("Today, Mon 19 Oct");
        expect(
            host
                .querySelector('a[aria-label="Previous day"]')
                ?.getAttribute("href"),
        ).toBe("/bookings?date=2026-10-18&layout=day&person=all");
        expect(
            host
                .querySelector('a[aria-label="Next day"]')
                ?.getAttribute("href"),
        ).toBe("/bookings?date=2026-10-20&layout=day&person=all");
        const chip = button(/^Whose bookings/);
        expect(chip.getAttribute("aria-label")).toBe(
            "Whose bookings: Everyone. Change",
        );
        // Three faces in the desk's stack.
        expect(chip.textContent).toContain("MIARNK");
        expect(host.querySelector('[role="status"]')?.textContent).toBe(
            "10 booked · 8 free times · ₹4,800 booked",
        );
        expect(host.textContent).toContain("Times in IST");
        expect(host.textContent).toContain("New booking");
    });

    it("names the title and the chip as buttons that open a dialog", () => {
        draw();
        const title = button(/Change the day or the view$/);
        expect(title.getAttribute("aria-label")).toBe(
            "Today, Mon 19 Oct. Change the day or the view",
        );
        expect(title.getAttribute("aria-haspopup")).toBe("dialog");
        expect(title.getAttribute("aria-expanded")).toBe("false");
        click(title);
        expect(title.getAttribute("aria-expanded")).toBe("true");
    });

    it("a week steps a week, and its title names it", () => {
        draw({ layout: "week", date: "2026-10-22" });
        expect(host.querySelector("h1")?.textContent).toBe(
            "This week, 19–25 Oct",
        );
        expect(
            host
                .querySelector('a[aria-label="Next week"]')
                ?.getAttribute("href"),
        ).toBe("/bookings?date=2026-10-29&layout=week&person=all");
    });

    it("one person in the business: no chip, the title alone", () => {
        draw({ choices: choices.slice(0, 2) });
        expect(() => button(/^Whose bookings/)).toThrow();
        expect(host.querySelector("h1")).not.toBeNull();
    });

    it("says why someone with the calendar only can't book", () => {
        draw({ calOnly: true, newBooking: null });
        expect(host.textContent).toContain(
            "Your role sees the calendar only, so you can't book or change bookings.",
        );
    });

    it("says who it shows when it opened on their last pick", () => {
        draw({
            picked: "arjun",
            opens: { ...OPENS_DEFAULT, lastPerson: "arjun" },
        });
        expect(host.textContent).toContain("Showing Arjun, your last pick");
        draw({ picked: "arjun", opens: { ...OPENS_DEFAULT, showFor: "all" } });
        expect(host.textContent).not.toContain("your last pick");
    });

    it("doesn't call a person a link opened on your last pick", () => {
        draw({
            picked: "arjun",
            opens: { ...OPENS_DEFAULT, lastPerson: "meera" },
        });
        expect(host.textContent).not.toContain("your last pick");
    });
});

describe("Go to a day", () => {
    it("opens from the title with this week, the month, Show as and Go to today", () => {
        draw();
        click(button(/Change the day or the view$/));
        const pop = popover();
        expect(pop?.textContent).toContain("Go to a day");
        expect(pop?.textContent).toContain("This week · 19 to 25 Oct");
        expect(pop?.textContent).toContain("October 2026");
        expect(pop?.textContent).toContain("Show as");
        expect(pop?.textContent).toContain("Go to today");
        expect(pop?.textContent).toContain(
            "The arrows beside the date go a day back or on.",
        );
        expect(pop?.textContent).toContain(
            "Bookings opens on the view you leave it on, on this computer.",
        );
    });

    it("picking Thu 22 goes there in the view shown, and closes", () => {
        draw();
        click(button(/Change the day or the view$/));
        const thu = popover()?.querySelector(
            '[role="group"][aria-label="Pick a day"] [aria-label="Thu 22 Oct, 3 sessions · 3 people"]',
        );
        click(thu);
        expect(push).toHaveBeenCalledWith(
            "/bookings?date=2026-10-22&layout=day&person=all",
            { scroll: false },
        );
        expect(popover()).toBeNull();
    });

    it("a closed day in the month says Closed, not a count", () => {
        draw();
        click(button(/Change the day or the view$/));
        const sun = popover()?.querySelector(
            '[role="group"][aria-label="October 2026"] [aria-label="Sun 25 Oct, closed"]',
        );
        expect(sun?.textContent).toBe("25Closed");
    });

    it("Show as Week keeps the day and whose bookings", () => {
        draw({ picked: "arjun" });
        click(button(/Change the day or the view$/));
        const views = popover()?.querySelector('nav[aria-label="Show as"]');
        const links = Array.from(views?.querySelectorAll("a") ?? []);
        expect(links.map((a) => a.textContent)).toEqual([
            "Day",
            "Week",
            "Agenda",
        ]);
        expect(links[1]?.getAttribute("href")).toBe(
            "/bookings?date=2026-10-19&layout=week&person=arjun",
        );
        expect(links[0]?.getAttribute("aria-current")).toBe("page");
    });

    it("says a fixed start view applies", () => {
        draw({ opens: { ...OPENS_DEFAULT, start: "week" } });
        click(button(/Change the day or the view$/));
        expect(popover()?.textContent).toContain(
            "Bookings always opens on Week for you. Change it under ⋯.",
        );
    });

    it("Go to today goes to today", () => {
        draw({ date: "2026-10-22" });
        click(button(/Change the day or the view$/));
        click(button(/^Go to today$/));
        expect(push).toHaveBeenCalledWith(
            "/bookings?date=2026-10-19&layout=day&person=all",
            { scroll: false },
        );
    });

    it("the month steps on its own", () => {
        draw();
        click(button(/Change the day or the view$/));
        click(button(/^Next month$/));
        expect(popover()?.textContent).toContain("November 2026");
        // A day outside what was read knows only its date.
        expect(
            popover()?.querySelector('[aria-label="Mon 2 Nov"]'),
        ).not.toBeNull();
    });

    it("closes with Escape and gives focus back to the title", async () => {
        draw();
        const title = button(/Change the day or the view$/);
        title.focus();
        click(title);
        expect(popover()).not.toBeNull();
        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(popover()).toBeNull();
        await act(() => new Promise((r) => setTimeout(r, 0)));
        expect(document.activeElement).toBe(title);
    });
});

describe("Whose bookings", () => {
    it("lists Everyone and each person with their count, and Add someone", () => {
        draw();
        click(button(/^Whose bookings/));
        const pop = popover();
        expect(pop?.textContent).toContain("Whose bookings");
        expect(pop?.textContent).toContain("Mon 19 Oct · today");
        const rows = Array.from(
            pop?.querySelectorAll(
                '[aria-label="Whose bookings"] [role="radio"]',
            ) ?? [],
        );
        expect(rows.map((r) => r.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
            "false",
            "false",
        ]);
        expect(rows[0]?.textContent).toContain("A column for each person");
        expect(rows[2]?.textContent).toContain("3sessions today");
        expect(pop?.textContent).toContain("Add someone who takes bookings");
        expect(pop?.textContent).toContain(
            "Bookings remembers who you pick here",
        );
    });

    it("picking Arjun shows his and keeps him as the last pick", async () => {
        draw();
        click(button(/^Whose bookings/));
        click(
            popover()?.querySelectorAll(
                '[aria-label="Whose bookings"] [role="radio"]',
            )[2],
        );
        await flush();
        expect(push).toHaveBeenCalledWith(
            "/bookings?date=2026-10-19&layout=day&person=arjun",
            { scroll: false },
        );
        expect(save).toHaveBeenCalledWith({ lastPerson: "arjun" });
    });

    it("picking Everyone forgets the last pick", async () => {
        draw({ picked: "arjun" });
        click(button(/^Whose bookings/));
        click(
            popover()?.querySelectorAll(
                '[aria-label="Whose bookings"] [role="radio"]',
            )[0],
        );
        await flush();
        expect(save).toHaveBeenCalledWith({ lastPerson: null });
    });

    it("finds someone by name", () => {
        draw();
        click(button(/^Whose bookings/));
        const find = popover()?.querySelector<HTMLInputElement>(
            'input[aria-label="Find someone"]',
        );
        act(() => {
            Reflect.set(
                HTMLInputElement.prototype,
                "value",
                "neh",
                find ?? undefined,
            );
            find?.dispatchEvent(new Event("input", { bubbles: true }));
        });
        const rows = Array.from(
            popover()?.querySelectorAll(
                '[aria-label="Whose bookings"] [role="radio"]',
            ) ?? [],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]?.textContent).toContain("Neha Kapoor");
    });

    it("Add someone opens the add dialog", () => {
        const props = draw();
        click(button(/^Whose bookings/));
        click(button(/^Add someone who takes bookings$/));
        expect(props.onAddPerson).toHaveBeenCalled();
    });
});

describe("Calendar | List, Today and the view's name (BKVCalendarB)", () => {
    it("has the Calendar | List switch beside ⋯, and List is the register", () => {
        draw();
        const nav = host.querySelector('nav[aria-label="Bookings"]');
        expect(nav?.querySelector('a[aria-current="page"]')?.textContent).toBe(
            "Calendar",
        );
        expect(nav?.querySelector('a[href="/bookings/all"]')?.textContent).toBe(
            "List",
        );
    });

    it("has a Today button that goes to today in the view shown", () => {
        draw({ layout: "week", date: "2026-10-28" });
        const today = host.querySelector("a[data-today-button]");
        expect(today?.textContent).toBe("Today");
        expect(today?.getAttribute("href")).toBe(
            "/bookings?date=2026-10-19&layout=week&person=all",
        );
    });

    it("names the view beside the date", () => {
        draw();
        expect(host.querySelector("[data-view-name]")?.textContent).toBe("Day");
        draw({ layout: "agenda" });
        expect(host.querySelector("[data-view-name]")?.textContent).toBe(
            "Agenda",
        );
    });
});

describe("Google busy times in the ⋯ sheet (BKVGoogle)", () => {
    const google = (over = {}) => ({
        show: "all" as const,
        onChange: vi.fn(),
        people: [
            { staffId: "meera", state: "CONNECTED" as const },
            { staffId: "arjun", state: "LAPSED" as const },
        ],
        ...over,
    });
    const openOpts = () => click(button(/^This day:/));

    it("says a connection held back by the plan is paused, not lapsed", () => {
        draw({
            google: google({
                people: [{ staffId: "neha", state: "PAUSED" as const }],
            }),
        });
        openOpts();
        click(button(/^Who's connected: 0 of 3 connected\. Change$/));
        expect(popover()?.textContent).toContain(
            "Paused: your plan's calendar connections are used up",
        );
        expect(popover()?.textContent).not.toContain("only they can");
    });

    it("has no Google part while Google Calendar is off", () => {
        draw({ google: null });
        openOpts();
        expect(popover()?.textContent).not.toContain("Google busy times");
        expect(popover()?.textContent).not.toContain("Who’s connected");
    });

    it("shows a Google layer, busy only, and says who is connected", () => {
        draw({ google: google() });
        openOpts();
        const pop = popover();
        expect(pop?.textContent).toContain("What to show");
        expect(pop?.textContent).toContain("Google busy times");
        expect(pop?.textContent).toContain(
            "Shown as busy, never what the event is",
        );
        // One row that says how many, opening who.
        click(button(/^Who's connected: 1 of 3 connected\. Change$/));
        expect(popover()?.textContent).toContain("You, Meera Iyer");
        expect(popover()?.textContent).toContain("Connected");
        expect(popover()?.textContent).toContain(
            "Needs reconnecting · only they can",
        );
        expect(popover()?.textContent).toContain("Not connected");
        expect(
            popover()?.querySelector(
                'a[href="/settings/integrations/google-calendar"]',
            ),
        ).not.toBeNull();
    });

    it("hides the layer from its switch, and offers Just mine", () => {
        const g = google();
        draw({ google: g });
        openOpts();
        const switches = Array.from(
            popover()?.querySelectorAll('button[role="switch"]') ?? [],
        );
        // The cancelled switch is first; Google's is second.
        click(switches[1]);
        expect(g.onChange).toHaveBeenCalledWith("off");
        click(button(/^Whose busy times: Everyone's\. Change$/));
        click(
            popover()?.querySelectorAll(
                '[role="radiogroup"][aria-label="Whose busy times"] [role="radio"]',
            )[1],
        );
        expect(g.onChange).toHaveBeenCalledWith("mine");
    });
});

describe("the ⋯ options", () => {
    const openOpts = () => click(button(/^This day:/));
    /** A row that opens its choices: "Start Bookings on: Where I left it. Change". */
    const openRow = (name: RegExp) =>
        click(
            Array.from(
                popover()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
            ).find((b) => name.test(b.getAttribute("aria-label") ?? "")),
        );
    const radiosOf = (label: string) =>
        Array.from(
            popover()?.querySelectorAll(
                `[role="radiogroup"][aria-label="${label}"] [role="radio"]`,
            ) ?? [],
        );

    it("holds this day, then your settings as rows saying how each is set", () => {
        draw({ picked: "arjun" });
        openOpts();
        const pop = popover();
        expect(pop?.textContent).toContain("This day");
        expect(pop?.textContent).toContain("1 cancelled today");
        // All bookings is back in the sheet (owner, 22 Nov).
        expect(pop?.querySelector('a[href="/bookings/all"]')?.textContent).toBe(
            "All bookings",
        );
        expect(
            pop?.querySelector('a[href="/bookings/availability?person=arjun"]')
                ?.textContent,
        ).toBe("Arjun’s hours and time off");
        expect(pop?.textContent).toContain("Your settings");
        // Rows with their value, not radio lists.
        expect(pop?.querySelector('[role="radiogroup"]')).toBeNull();
        expect(
            button(/^Start Bookings on: Where I left it\. Change$/),
        ).toBeTruthy();
        expect(
            button(/^Show bookings for: The last person I picked\. Change$/),
        ).toBeTruthy();
        expect(pop?.textContent).toContain("What the colours mean");
        expect(pop?.textContent).not.toContain("Click it to book someone in");
    });

    it("what the colours mean opens in place, with Back", () => {
        draw();
        openOpts();
        openRow(/^What the colours mean$/);
        expect(popover()?.textContent).toContain(
            "Click it to book someone in, or block it.",
        );
        click(button(/^Back$/));
        expect(popover()?.textContent).toContain("Your settings");
    });

    it("the cancelled switch shows them", () => {
        const props = draw();
        openOpts();
        click(popover()?.querySelector('button[role="switch"]'));
        expect(props.cancelled.onChange).toHaveBeenCalledWith(true);
    });

    it("Start Bookings on: Day is kept for the person; List is offered", async () => {
        draw();
        openOpts();
        openRow(/^Start Bookings on/);
        const radios = radiosOf("Start Bookings on");
        expect(radios.map((r) => r.closest("label")?.textContent)).toEqual([
            expect.stringContaining("Where I left it"),
            expect.stringContaining("Day"),
            expect.stringContaining("Week"),
            expect.stringContaining("Agenda"),
            expect.stringContaining("List"),
        ]);
        expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual([
            "true",
            "false",
            "false",
            "false",
            "false",
        ]);
        click(radios[1]);
        await flush();
        expect(save).toHaveBeenCalledWith({ start: "day" });
        // Back on the rows, saying the new value.
        expect(button(/^Start Bookings on: Day\. Change$/)).toBeTruthy();
    });

    it("Show bookings for: Everyone and Just me go there and are kept", async () => {
        draw({ picked: "arjun" });
        openOpts();
        openRow(/^Show bookings for/);
        const radios = radiosOf("Show bookings for");
        expect(radios.map((r) => r.closest("label")?.textContent)).toEqual([
            expect.stringContaining("The last person I picked"),
            expect.stringContaining("Everyone"),
            expect.stringContaining("Just me"),
        ]);
        click(radios[1]);
        await flush();
        expect(save).toHaveBeenCalledWith({ showFor: "all" });
        expect(push).toHaveBeenCalledWith(
            "/bookings?date=2026-10-19&layout=day&person=all",
            { scroll: false },
        );
        openOpts();
        openRow(/^Show bookings for/);
        click(radiosOf("Show bookings for")[2]);
        await flush();
        expect(save).toHaveBeenCalledWith({ showFor: "me" });
        expect(push).toHaveBeenLastCalledWith(
            "/bookings?date=2026-10-19&layout=day&person=meera",
            { scroll: false },
        );
    });

    it("offers no Just me to someone not on the diary", () => {
        draw({ me: null });
        openOpts();
        openRow(/^Show bookings for/);
        expect(popover()?.textContent).not.toContain("Just me");
    });

    it("puts a choice back, and says why, when it can't be kept", async () => {
        save.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't keep that choice",
        } as never);
        draw();
        openOpts();
        openRow(/^Start Bookings on/);
        click(radiosOf("Start Bookings on")[2]);
        await flush();
        expect(
            button(/^Start Bookings on: Where I left it\. Change$/),
        ).toBeTruthy();
    });
});

describe("the header on a phone", () => {
    beforeEach(() => {
        phone = true;
    });

    it("opens its choices as sheets from the foot, with the phone's words", () => {
        draw();
        click(button(/Change the day or the view$/));
        expect(sheet()).not.toBeNull();
        expect(popover()).toBeNull();
        expect(sheet()?.textContent).not.toContain("Swipe");
        expect(sheet()?.getAttribute("data-snap")).toBe("half");
        expect(sheet()?.textContent).toContain("on this phone.");
        // The week strip's days are letters on a phone.
        expect(
            sheet()?.querySelector(
                '[aria-label="Tue 20 Oct, 1 session · 1 person"]',
            )?.textContent,
        ).toContain("T");
    });

    it("keeps the arrows for a keyboard and a screen reader only", () => {
        draw();
        expect(
            host.querySelector('a[aria-label="Previous day"]')?.className,
        ).toContain("max-[759px]:sr-only");
    });

    it("the chip shows one face and the first name", () => {
        draw({ picked: "arjun" });
        const chip = button(/^Whose bookings/);
        expect(chip.getAttribute("aria-label")).toBe(
            "Whose bookings: Arjun Rao. Change",
        );
        expect(chip.textContent).toContain("Arjun");
        click(chip);
        const rows = Array.from(
            sheet()?.querySelectorAll(
                '[aria-label="Whose bookings"] [role="radio"]',
            ) ?? [],
        );
        expect(rows[0]?.textContent).toContain("Everyone’s bookings together");
    });

    it("starts with Calendar | List and ⋯ in one row, as the List does", () => {
        draw();
        const bar = host.querySelector("[data-bookings-bar]");
        expect(bar?.querySelector('nav[aria-label="Bookings"]')).not.toBeNull();
        expect(
            bar?.querySelector('button[aria-label^="This day:"]'),
        ).not.toBeNull();
        // The Calendar | List options are a finger tall.
        expect(
            bar?.querySelector('a[aria-current="page"]')?.className,
        ).toContain("max-[759px]:h-11");
        // "Times in IST" is in the ⋯ sheet, not the header.
        expect(host.textContent).not.toContain("Times in IST");
        click(button(/^This day:/));
        expect(sheet()?.textContent).toContain("Times in IST");
    });

    it("names the view beside a short date; Today only away from today", () => {
        draw();
        const title = button(/Change the day or the view$/);
        expect(title.textContent).toBe("Today, Mon 19Day");
        expect(host.querySelector("[data-today-button]")).toBeNull();
        act(() => root.unmount());
        root = createRoot(host);
        draw({ layout: "week", date: "2026-10-28" });
        expect(button(/Change the day or the view$/).textContent).toBe(
            "26 Oct to 1 NovWeek",
        );
        expect(host.querySelector("[data-today-button]")).not.toBeNull();
        // Week draws the same strip as Day: one style for both.
        expect(host.querySelectorAll("[data-week-strip] a")).toHaveLength(7);
    });

    it("the ⋯ sheet opens half way, and its colours say Tap", () => {
        draw();
        click(button(/^This day:/));
        expect(sheet()?.getAttribute("data-snap")).toBe("half");
        click(button(/^Show all$/));
        expect(sheet()?.getAttribute("data-snap")).toBe("full");
        click(button(/^What the colours mean$/));
        expect(sheet()?.textContent).toContain("Tap it to book someone in.");
    });
});

describe("the first paint (owner, 25 Nov: no layout jump)", () => {
    it("the server draws both frames, the breakpoint shows one", () => {
        const html = renderToString(
            <CalendarHeader
                layout="day"
                date={TODAY}
                today={TODAY}
                summary="1 session · 1 person"
                zone="IST"
                choices={choices}
                picked={EVERYONE}
                facts={() => ({ count: 1, closed: false })}
                cancelled={{ count: 0, shown: false, onChange: vi.fn() }}
                opens={OPENS_DEFAULT}
                me={null}
                hrefFor={(l, d) => calendarHref(l, d)}
                newBooking={null}
                calOnly={false}
            />,
        );
        expect(html).toMatch(
            /data-calendar-header="phone" class="contents min-\[760px\]:hidden"/,
        );
        expect(html).toMatch(
            /data-calendar-header="desk" class="max-\[759px\]:hidden /,
        );
        expect(html).toContain("data-bookings-bar");
    });
});
