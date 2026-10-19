// @vitest-environment jsdom
/**
 * The Calendar week (bookings U14, #1030; was Overview week), on the desk
 * and on a phone, on the boards' Kaya Physio: three people, bookings,
 * classes and invoices; a busy Monday the 19th (today) — 8 bookings, 2
 * classes and a paid invoice; one booking on Tuesday; and Sunday, when
 * nobody works. One filter button, What to show; the week's totals on one
 * line; Book on each open day; "Closed on Sundays" with "Open hours on
 * this day"; the picked day in a side panel (desk) or listed under the
 * strip (phone); no amounts for someone without the money permission; the
 * empty week, the loader and the failed read; the keyboard.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CalendarDay,
    CalendarItem,
    CalendarMonth,
    LayerKey,
    MoneyEntry,
} from "@/lib/calendar/types";
import { weekDates } from "@/lib/calendar/week";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/calendar",
}));

import CalendarError from "@/app/(shell)/calendar/error";
import CalendarLoading from "@/app/(shell)/calendar/loading";
import { BusinessWeek } from "@/components/calendar/business-week";

const TODAY = "2026-10-19"; // a Monday
const TUESDAY = "2026-10-20";
const SUNDAY = "2026-10-25";
const DATES = weekDates(TODAY);
const STAFF = [
    { id: "meera", name: "Meera Iyer", title: "Physiotherapist" },
    { id: "arjun", name: "Arjun Rao", title: "Sports therapist" },
    { id: "neha", name: "Neha Kapoor", title: "Pilates teacher" },
];

const BOOKERS = [
    ["09:00", "Physio assessment", "Ananya Desai", "meera"],
    ["10:00", "Follow-up session", "Rohan Mehta", "meera"],
    ["10:00", "Sports massage", "Vikram Nair", "arjun"],
    ["11:30", "Physio assessment", "Kabir Singh", "meera"],
    ["12:00", "Sports massage", "Farah Khan", "arjun"],
    ["14:00", "Follow-up session", "Isha Rao", "meera"],
    ["15:00", "Sports massage", "Dev Patel", "arjun"],
    ["16:30", "Physio assessment", "Tara Shah", "meera"],
] as const;

const ist = (date: string, clock: string) =>
    new Date(`${date}T${clock}:00+05:30`).toISOString();

function booking(i: number, date: string): CalendarItem {
    const [clock, service, who, staff] = BOOKERS[i];
    return {
        id: `b${date}-${i}`,
        kind: i === 2 ? "no_show" : "booked",
        title: `${service} · ${who}`,
        subtitle: `With ${STAFF.find((s) => s.id === staff)?.name} · Paid online`,
        at: ist(date, clock),
        amount: "1500.00",
        currency: "INR",
        link: { type: "booking", id: `b${date}-${i}` },
        staffId: staff,
        durationMinutes: 45,
    };
}

function pilates(id: string, clock: string, kind: string): CalendarItem {
    return {
        id,
        kind,
        title: "Mat Pilates",
        subtitle: "With Neha Kapoor",
        at: ist(TODAY, clock),
        link: { type: "service", id: "pilates" },
        staffId: "neha",
        durationMinutes: 60,
    };
}

function layer(items: CalendarItem[]) {
    return {
        count: items.length,
        kinds: Object.fromEntries(items.map((i) => [i.kind, 1])),
        items,
    };
}

function days(empty: boolean): CalendarDay[] {
    return DATES.map((date): CalendarDay => {
        if (empty) return { date, toActOn: 0, layers: {} };
        if (date === TODAY) {
            return {
                date,
                toActOn: 0,
                layers: {
                    bookings: layer(BOOKERS.map((_, n) => booking(n, date))),
                    classes: layer([
                        pilates("c1", "07:00", "scheduled"),
                        pilates("c2", "18:00", "full"),
                    ]),
                    invoices: layer([
                        {
                            id: "inv1",
                            kind: "paid",
                            title: "INV-0118",
                            subtitle: "Rohan Mehta",
                            at: ist(date, "10:30"),
                            amount: "2400.00",
                            currency: "INR",
                            link: { type: "invoice", id: "inv1" },
                        },
                    ]),
                },
            };
        }
        if (date === TUESDAY) {
            return {
                date,
                toActOn: 0,
                layers: { bookings: layer([booking(0, date)]) },
            };
        }
        return { date, toActOn: 0, layers: {} };
    });
}

function entry(
    layerKey: LayerKey,
    over: Partial<MoneyEntry> & Pick<MoneyEntry, "kind">,
): MoneyEntry {
    return {
        date: TODAY,
        layer: layerKey,
        title: "x",
        subtitle: null,
        currency: "INR",
        in: 0,
        out: 0,
        due: 0,
        failed: 0,
        link: { type: "invoice", id: "x" },
        itemId: null,
        ...over,
    };
}

function kaya(
    over: Partial<CalendarMonth> & { empty?: boolean } = {},
): CalendarMonth {
    const { empty = false, ...rest } = over;
    return {
        month: "2026-10",
        timezone: "Asia/Kolkata",
        timezoneSource: "business",
        from: "2026-10-18T18:30:00.000Z",
        to: "2026-10-25T18:30:00.000Z",
        layers: ["bookings", "classes", "invoices"],
        totals: empty
            ? { bookings: 0, classes: 0, invoices: 0 }
            : { bookings: 9, classes: 2, invoices: 1 },
        days: days(empty),
        toActOn: [],
        unavailable: [],
        joinedAt: "2026-01-01",
        daysOff: [],
        hasStaff: true,
        staff: STAFF,
        // Everyone works Monday to Saturday, nobody on Sunday.
        hours: DATES.slice(0, 6).flatMap((date) =>
            STAFF.map((s) => ({
                date,
                startMinute: 420,
                endMinute: 1200,
                staffId: s.id,
            })),
        ),
        money: {
            total: [
                {
                    currency: "INR",
                    in: 360_000,
                    out: 20_000,
                    net: 340_000,
                    due: 0,
                    failed: 0,
                },
            ],
            entries: empty
                ? []
                : [
                      entry("bookings", { kind: "booking_due", in: 120_000 }),
                      entry("invoices", { kind: "invoice_paid", in: 240_000 }),
                      entry("invoices", { kind: "refund", out: 20_000 }),
                  ],
        },
        ...rest,
    };
}

let root: Root;
let host: HTMLDivElement;
let phone = false;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    phone = false;
    window.matchMedia = ((query: string) => ({
        matches: phone && query === "(max-width: 759.98px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.history.replaceState(null, "", "/calendar?view=week");
    push.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

type Can = React.ComponentProps<typeof BusinessWeek>["can"];
const OWNER: Can = {
    order: false,
    book: true,
    remind: true,
    money: true,
    hours: true,
};
const MEMBER: Can = {
    order: false,
    book: true,
    remind: false,
    money: false,
    hours: true,
};

function render(data: CalendarMonth, can: Can = OWNER) {
    act(() => {
        root.render(
            <BusinessWeek
                data={data}
                today={TODAY}
                thisMonth="2026-10"
                can={can}
            />,
        );
    });
}

const button = (
    name: RegExp,
    within: ParentNode | null | undefined = document,
) =>
    Array.from(within?.querySelectorAll<HTMLElement>("button, a") ?? []).find(
        (b) => name.test(b.getAttribute("aria-label") ?? b.textContent),
    );
const click = (el: Element | null | undefined) => {
    if (!el) throw new Error("Nothing to click");
    act(() => (el as HTMLElement).click());
};
const whatToShow = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label^="What to show"]');
const overlay = () =>
    document.querySelector(
        phone ? "[data-header-sheet]" : "[data-header-popover]",
    );
const totals = () =>
    host.querySelector(`[data-week-totals="${phone ? "phone" : "desk"}"]`)
        ?.textContent;
const head = (date: string) =>
    host.querySelector<HTMLButtonElement>(
        `#calendar-week [data-day="${date}"]`,
    );
/** The desk's column for a day: its head and its hours. */
const headCell = (date: string) => head(date)?.parentElement ?? null;
const strip = (date: string) =>
    host.querySelector<HTMLButtonElement>(
        `#calendar-strip [data-strip-day="${date}"]`,
    );
/** The picked day: the desk's side panel, or the phone's list. */
const day = () =>
    phone
        ? host.querySelector('section[aria-labelledby="calendar-week-day"]')
        : document.querySelector('[role="dialog"]');
/** Open a day: its head on the desk, its strip day on a phone. */
const openDay = (date: string) => click(phone ? strip(date) : head(date));

for (const size of ["desk", "phone"] as const) {
    describe(`the Calendar week on the ${size}`, () => {
        beforeEach(() => {
            phone = size === "phone";
        });

        it("has one filter button and the week's totals on one line", () => {
            render(kaya());
            expect(host.querySelector("h1")?.textContent).toBe("19 to 25 Oct");
            expect(whatToShow()?.textContent).toBe(
                "Everyone · bookings, classes and invoices",
            );
            // The old team select and wall of layer switches are gone.
            expect(host.querySelector("select")).toBeNull();
            expect(
                host.querySelector('[aria-label="Show on the calendar"]'),
            ).toBeNull();
            expect(totals()).toBe(
                phone
                    ? "This week · 9 bookings · 2 classes · 1 invoice"
                    : "This week · 9 bookings · 2 classes · 1 invoice · In ₹3,600 · Out ₹200 · times in IST",
            );
            // One line: no break inside it.
            expect(
                host.querySelector(
                    `[data-week-totals="${phone ? "phone" : "desk"}"]`,
                )?.children,
            ).toHaveLength(0);
        });

        it("What to show counts this week and switches a layer off", () => {
            render(kaya());
            click(whatToShow());
            expect(overlay()?.textContent).toContain("9 this week");
            expect(overlay()?.textContent).not.toContain("this month");
            const invoices = phone
                ? overlay()?.querySelector(
                      '[role="switch"][aria-label="Show Invoices"]',
                  )
                : Array.from(
                      overlay()?.querySelectorAll('[role="checkbox"]') ?? [],
                  ).find((b) => b.textContent.startsWith("Invoices"));
            click(invoices);
            expect(whatToShow()?.textContent).toBe(
                "Everyone · bookings and classes",
            );
            expect(totals()).toMatch(/^This week · 9 bookings · 2 classes/);
            expect(totals()).not.toContain("invoice");
        });

        it("offers Book on each open day, and says Sunday is closed", () => {
            render(kaya());
            if (phone) {
                expect(strip(TODAY)?.textContent).toBe("Today1911 on");
                expect(strip(SUNDAY)?.textContent).toBe("Sun25Closed");
                // The desk's grid is never drawn on a phone.
                expect(host.querySelector("#calendar-week")).toBeNull();
                openDay(TUESDAY);
                expect(
                    button(/^Book on this day$/, day())?.getAttribute("href"),
                ).toBe(`/bookings?date=${TUESDAY}&new=1`);
                openDay(SUNDAY);
                expect(button(/^Book on this day$/, day())).toBeUndefined();
            } else {
                for (const date of DATES.slice(0, 6)) {
                    const book = headCell(date)?.querySelector("a");
                    expect(book?.textContent).toBe("Book");
                    expect(book?.getAttribute("href")).toBe(
                        `/bookings?date=${date}&new=1`,
                    );
                }
                expect(headCell(SUNDAY)?.querySelector("a")).toBeNull();
                expect(headCell(SUNDAY)?.textContent).toContain("Closed");
                expect(headCell(SUNDAY)?.textContent).toContain(
                    "Closed on Sundays",
                );
                expect(head(TODAY)?.textContent).toContain("11 on");
            }
            const box = phone ? day() : host.querySelector("#calendar-week");
            expect(box?.textContent).toContain("Closed on Sundays");
            expect(box?.textContent).toContain("Nothing is on this day.");
            expect(
                button(/^Open hours on this day$/, box)?.getAttribute("href"),
            ).toBe(`/bookings?date=${SUNDAY}&layout=day`);
        });

        it("Open hours on this day only for whoever may change hours", () => {
            render(kaya(), { ...OWNER, hours: false });
            openDay(SUNDAY);
            const box = phone ? day() : host.querySelector("#calendar-week");
            expect(box?.textContent).toContain("Closed on Sundays");
            expect(button(/^Open hours on this day$/, box)).toBeUndefined();
        });

        it("opens the picked day with its things, money and Book", () => {
            render(kaya());
            openDay(TODAY);
            const box = day();
            expect(box?.textContent).toContain("Mon 19 Oct · today");
            expect(box?.textContent).toContain("11 things");
            expect(
                button(/^Book on this day$/, box)?.getAttribute("href"),
            ).toBe(`/bookings?date=${TODAY}&new=1`);
            if (phone) {
                // One list in time order, the invoice as a chip on top.
                const rows = Array.from(
                    box?.querySelectorAll<HTMLAnchorElement>("ul a") ?? [],
                );
                expect(rows).toHaveLength(10);
                expect(rows[0].textContent).toContain("7:00 am");
                expect(rows[0].textContent).toContain("Mat Pilates");
                expect(rows[1].textContent).toContain("9:00 am");
                expect(rows[1].textContent).toContain("Ananya Desai");
                expect(rows[1].textContent).toContain(
                    "Physio assessment · Meera",
                );
                expect(rows[3].textContent).toContain("Didn't come");
                expect(rows[9].textContent).toContain("Full");
                const chip = box?.querySelector(
                    'a[href="/billing/invoices/inv1"]',
                );
                expect(chip?.closest("ul")).toBeNull();
                expect(box?.textContent).toContain("In +₹3,600");
                expect(box?.textContent).toContain("Out −₹200");
                openDay(TUESDAY);
                expect(day()?.textContent).toContain("Tue 20 Oct");
                expect(day()?.textContent).toContain("1 thing coming up");
                expect(day()?.textContent).not.toContain("In +");
                expect(strip(TUESDAY)?.getAttribute("aria-checked")).toBe(
                    "true",
                );
            } else {
                expect(box?.textContent).toMatch(/In ₹.* · Out ₹/);
                expect(box?.textContent).toContain("Bookings · 8");
                expect(box?.textContent).toContain("Classes · 2");
                expect(box?.textContent).toContain("Paid · Rohan Mehta");
            }
        });

        it("shows no amount anywhere to someone without the money permission", () => {
            render(kaya({ money: undefined }), MEMBER);
            expect(totals()).toBe(
                "This week · 9 bookings · 2 classes · 1 invoice" +
                    (phone ? "" : " · times in IST"),
            );
            openDay(TODAY);
            expect(day()?.textContent).toContain("11 things");
            expect(document.body.textContent).not.toContain("₹");
            // A Member still books (Q13).
            expect(button(/^Book on this day$/, day())).toBeDefined();
        });

        it("says an empty week is empty, and the day too", () => {
            render(kaya({ empty: true }));
            expect(totals()).toBe("Nothing on the calendar this week yet.");
            openDay(TUESDAY);
            expect(day()?.textContent).toContain("Nothing on this day yet");
        });

        it("names a layer that couldn't load", () => {
            render(
                kaya({
                    unavailable: [{ source: "invoices", label: "Invoices" }],
                }),
            );
            click(whatToShow());
            expect(overlay()?.textContent).toContain("Couldn't load");
        });
    });
}

describe("the keyboard", () => {
    it("moves the phone's picked day with the arrows", () => {
        phone = true;
        render(kaya());
        const today = strip(TODAY);
        expect(today?.tabIndex).toBe(0);
        expect(strip(TUESDAY)?.tabIndex).toBe(-1);
        act(() => {
            today?.focus();
            today?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        expect(document.activeElement).toBe(strip(TUESDAY));
        expect(day()?.textContent).toContain("Tue 20 Oct");
        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "End", bubbles: true }),
            );
        });
        expect(document.activeElement).toBe(strip(SUNDAY));
    });

    it("opens the desk's day on its title and gives focus back on Escape", async () => {
        render(kaya());
        const monday = head(TODAY);
        act(() => monday?.focus());
        click(monday);
        expect(document.activeElement?.id).toBe("calendar-sheet-title");
        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        await act(() => new Promise((r) => setTimeout(r, 0)));
        expect(document.activeElement).toBe(monday);
    });
});

describe("loading and a failed read", () => {
    it("stands in for the week while it loads", () => {
        act(() => root.render(<CalendarLoading />));
        expect(host.querySelector('[role="status"]')?.textContent).toContain(
            "Loading the calendar",
        );
    });

    it("says the calendar couldn't load, with Try again", () => {
        const retry = vi.fn();
        act(() =>
            root.render(
                <CalendarError error={new Error("boom")} retry={retry} />,
            ),
        );
        expect(host.textContent).toContain("Calendar");
        click(button(/Try again/i, host));
        expect(retry).toHaveBeenCalled();
    });
});
