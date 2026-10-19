// @vitest-environment jsdom
/**
 * The Calendar month (bookings U13, #1029), on the desk and on a phone, on
 * a month shaped like the boards' Kaya Physio: three people, bookings,
 * classes and invoices, and a busy Monday the 19th — 8 bookings, 2 classes
 * and a paid invoice. One filter button, What to show; the money on one
 * line with Export; the picked day in a side panel (desk) or a sheet from
 * the foot (phone) with "Book on this day" and "3 more"; no amounts for
 * someone without the money permission; the empty month, the loader and
 * the failed read.
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

const push = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/calendar",
}));
vi.mock("@saroh/ui/toast", () => ({ showSuccess: toast }));

import CalendarError from "@/app/(shell)/calendar/error";
import CalendarLoading from "@/app/(shell)/calendar/loading";
import { BusinessCalendar } from "@/components/calendar/business-calendar";

const TODAY = "2026-10-19"; // a Monday
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

/** "09:00" on the 19th in India, as the API sends it. */
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

function layer(items: CalendarItem[]) {
    return {
        count: items.length,
        kinds: Object.fromEntries(items.map((i) => [i.kind, 1])),
        items,
    };
}

function days(empty: boolean): CalendarDay[] {
    return Array.from({ length: 31 }, (_, i) => {
        const date = `2026-10-${String(i + 1).padStart(2, "0")}`;
        if (empty) return { date, toActOn: 0, layers: {} };
        if (date === TODAY) {
            return {
                date,
                toActOn: 0,
                layers: {
                    bookings: layer(BOOKERS.map((_, n) => booking(n, date))),
                    classes: layer([
                        {
                            id: "c1",
                            kind: "scheduled",
                            title: "Mat Pilates",
                            subtitle: "With Neha Kapoor",
                            at: ist(date, "07:00"),
                            link: { type: "service", id: "pilates" },
                            staffId: "neha",
                        },
                        {
                            id: "c2",
                            kind: "full",
                            title: "Mat Pilates",
                            subtitle: "With Neha Kapoor",
                            at: ist(date, "18:00"),
                            link: { type: "service", id: "pilates" },
                            staffId: "neha",
                        },
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
        if (date === "2026-10-20") {
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
        from: "2026-10-01",
        to: "2026-10-31",
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
    // A phone is under 760px: the phone's own query matches, the desk's
    // in-between sheet widths don't.
    window.matchMedia = ((query: string) => ({
        matches: phone && query === "(max-width: 759.98px)",
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.history.replaceState(null, "", "/calendar");
    push.mockReset();
    toast.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

type Can = React.ComponentProps<typeof BusinessCalendar>["can"];
const OWNER: Can = { order: false, book: true, remind: true, money: true };
const MEMBER: Can = { order: false, book: true, remind: false, money: false };

function render(data: CalendarMonth, can: Can = OWNER) {
    act(() => {
        root.render(
            <BusinessCalendar
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
const whatToShow = () =>
    host.querySelector<HTMLButtonElement>('button[aria-label^="What to show"]');
const overlay = () =>
    document.querySelector(
        phone ? "[data-header-sheet]" : "[data-header-popover]",
    );
const cell = (date: string) =>
    host.querySelector<HTMLButtonElement>(`[data-day="${date}"]`);
/** The picked day: the desk's side panel, or the phone's sheet. */
const day = () =>
    phone
        ? document.querySelector('[data-day-sheet="bottom"]')
        : host.querySelector("#calendar-day");
const click = (el: Element | null | undefined) => {
    if (!el) throw new Error("Nothing to click");
    act(() => (el as HTMLElement).click());
};

/** Open the 19th: already picked on the desk, tapped on a phone. */
function openToday() {
    if (phone) click(cell(TODAY));
}

for (const size of ["desk", "phone"] as const) {
    describe(`the Calendar month on the ${size}`, () => {
        beforeEach(() => {
            phone = size === "phone";
        });

        it("has one filter button that says whose and what", () => {
            render(kaya());
            expect(whatToShow()?.textContent).toBe(
                "Everyone · bookings, classes and invoices",
            );
            // The old wall of switches and the select are gone.
            expect(
                host.querySelector('[aria-label="Show on the calendar"]'),
            ).toBeNull();
            expect(host.querySelector("select")).toBeNull();
            expect(host.querySelector("h1")?.textContent).toBe("October 2026");
        });

        it("What to show lists Whose and each layer with this month's total", () => {
            render(kaya());
            click(whatToShow());
            const box = overlay();
            expect(box).not.toBeNull();
            expect(box?.textContent).toContain("What to show");
            const people = Array.from(
                box?.querySelectorAll('[aria-label="Whose"] [role="radio"]') ??
                    [],
            ).map((r) => r.textContent);
            expect(people).toEqual(
                phone
                    ? ["Everyone", "Meera", "Arjun", "Neha"]
                    : ["Everyone", "Meera Iyer", "Arjun Rao", "Neha Kapoor"],
            );
            expect(box?.textContent).toContain("9 this month");
            expect(box?.textContent).toContain("2 this month");
            expect(box?.textContent).toContain("1 this month");
            expect(
                button(/^Show all 3$|^Show everything$/, box)?.textContent,
            ).toBe(phone ? "Show all 3" : "Show everything");
        });

        it("hiding Invoices drops them from the dots, the totals and the day", () => {
            render(kaya());
            openToday();
            expect(day()?.textContent).toContain("Invoices · 1");
            if (phone) {
                // Close the day to reach the filter.
                click(button(/^Close$/, day()));
            }
            click(whatToShow());
            const invoices = phone
                ? overlay()?.querySelector(
                      '[role="switch"][aria-label="Show Invoices"]',
                  )
                : Array.from(
                      overlay()?.querySelectorAll('[role="checkbox"]') ?? [],
                  ).find((b) => b.textContent.startsWith("Invoices"));
            expect(invoices?.getAttribute("aria-checked")).toBe("true");
            click(invoices);
            expect(invoices?.getAttribute("aria-checked")).toBe("false");
            expect(whatToShow()?.textContent).toBe(
                "Everyone · bookings and classes",
            );
            // The footer's button, not a layer's "Show Invoices" switch.
            const show = Array.from(
                overlay()?.querySelectorAll("button") ?? [],
            ).find(
                (b) =>
                    !b.getAttribute("role") &&
                    b.textContent.startsWith("Show "),
            );
            expect(show?.textContent).toBe(
                phone ? "Show 2" : "Show bookings and classes",
            );
            click(show);
            expect(overlay()).toBeNull();
            // The day counts 10 now, not 11.
            expect(cell(TODAY)?.getAttribute("aria-label")).toContain(
                "10 things",
            );
            openToday();
            expect(day()?.textContent).not.toContain("Invoices · 1");
            expect(day()?.textContent).toContain("Bookings · 8");
        });

        it("says the month's money on one line, with Export the month", () => {
            render(kaya());
            const strip = host.querySelector(
                '[role="group"][aria-label="This month\'s money"]',
            );
            const parts = Array.from(
                strip?.querySelectorAll("button[aria-expanded]") ?? [],
            ).map((b) => b.firstElementChild?.textContent);
            expect(parts).toEqual([
                "In so far",
                "Out so far",
                "Net",
                "Still due",
            ]);
            // One Export per width: a link at the line's end on the desk, a
            // full button at the foot on a phone.
            const exports = Array.from(
                host.querySelectorAll<HTMLButtonElement>("button"),
            ).filter((b) => b.textContent === "Export the month");
            expect(exports).toHaveLength(2);
            const mine = exports.find((b) =>
                b.className.includes(
                    phone ? "min-[760px]:hidden" : "max-[759px]:hidden",
                ),
            );
            expect(strip?.contains(mine ?? null)).toBe(!phone);
            URL.createObjectURL = vi.fn(() => "blob:x");
            URL.revokeObjectURL = vi.fn();
            click(mine);
            expect(toast).toHaveBeenCalledWith(
                "Exported 3 lines for October 2026 as a spreadsheet file.",
            );
            // A figure opens its breakdown by kind.
            click(button(/^In so far/, strip));
            expect(host.textContent).toContain("Money in by kind:");
        });

        it("opens the picked day with its things, Book on this day and 3 more", () => {
            render(kaya());
            openToday();
            const box = day();
            expect(box?.textContent).toContain("19 Oct · today");
            expect(box?.textContent).toMatch(/11 things · In ₹.* · Out ₹/);
            // Something went out today, so Out is drawn as a loss; at ₹0
            // it is not (dayMoney's hasOut, money.test.ts).
            const out = Array.from(
                box?.querySelectorAll("[data-day-line] > span") ?? [],
            ).find((s) => s.textContent.startsWith("Out "));
            expect(out?.textContent).toBe("Out ₹200");
            expect(out?.className).toContain("destructive");
            expect(box?.textContent).toContain("Bookings · 8");
            const rows = Array.from(
                box?.querySelectorAll<HTMLAnchorElement>(
                    'a[href^="/bookings/b"]',
                ) ?? [],
            );
            // Five listed, then where the rest are.
            expect(rows).toHaveLength(5);
            expect(rows[0].textContent).toContain("9:00 am");
            expect(rows[0].textContent).toContain("Ananya Desai");
            expect(rows[0].textContent).toContain("Physio assessment · Meera");
            expect(rows[2].textContent).toContain("Didn't come");
            const more = button(/^3 more · open the day in Bookings$/, box);
            expect(more?.getAttribute("href")).toBe(
                "/bookings?date=2026-10-19&layout=day",
            );
            expect(box?.textContent).toContain("Classes · 2");
            expect(box?.textContent).toContain("Full");
            expect(box?.textContent).toContain("Paid · Rohan Mehta");
            const book = button(/^Book on this day$/, box);
            expect(book?.getAttribute("href")).toBe(
                "/bookings?date=2026-10-19&new=1",
            );
        });

        it("shows no amount anywhere to someone without the money permission", () => {
            // The API sends a Member no money, but a booking's price rides
            // with `booking:read`: the screen still draws none (DEC-098).
            render(kaya({ money: undefined }), MEMBER);
            expect(
                host.querySelector('[aria-label="This month\'s money"]'),
            ).toBeNull();
            expect(
                Array.from(host.querySelectorAll("button")).some(
                    (b) => b.textContent === "Export the month",
                ),
            ).toBe(false);
            openToday();
            expect(day()?.textContent).toContain("Bookings · 8");
            expect(document.body.textContent).not.toContain("₹");
            click(whatToShow());
            expect(document.body.textContent).not.toContain("₹");
        });

        it("says an empty month is empty, and the day too", () => {
            render(kaya({ empty: true }));
            expect(host.textContent).toContain(
                "Nothing on the calendar in October 2026 yet.",
            );
            openToday();
            expect(day()?.textContent).toContain("Nothing on this day yet");
        });

        it("names a layer that couldn't load, and it can't be switched", () => {
            render(
                kaya({
                    unavailable: [{ source: "invoices", label: "Invoices" }],
                }),
            );
            expect(host.textContent).toContain("Invoices");
            click(whatToShow());
            expect(overlay()?.textContent).toContain("Couldn't load");
            const broken = phone
                ? overlay()?.querySelector('[aria-label="Show Invoices"]')
                : Array.from(
                      overlay()?.querySelectorAll('[role="checkbox"]') ?? [],
                  ).find((b) => b.textContent.startsWith("Invoices"));
            expect(broken?.hasAttribute("disabled")).toBe(true);
        });
    });
}

describe("the keyboard", () => {
    it("moves the picked day with the arrows on the desk", () => {
        render(kaya());
        const today = cell(TODAY);
        expect(today?.tabIndex).toBe(0);
        act(() => {
            today?.focus();
            today?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "ArrowRight",
                    bubbles: true,
                }),
            );
        });
        expect(document.activeElement).toBe(cell("2026-10-20"));
        expect(host.querySelector("#calendar-day")?.textContent).toContain(
            "20 Oct",
        );
    });

    it("opens a phone's day sheet on its title and gives focus back on Escape", async () => {
        phone = true;
        render(kaya());
        const today = cell(TODAY);
        act(() => today?.focus());
        click(today);
        expect(document.activeElement?.id).toBe("calendar-sheet-title");
        act(() => {
            document.activeElement?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
            );
        });
        expect(day()).toBeNull();
        await act(() => new Promise((r) => setTimeout(r, 0)));
        expect(document.activeElement).toBe(today);
    });

    it("What to show is a dialog its button says it opens", () => {
        render(kaya());
        const trigger = whatToShow();
        expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
        click(trigger);
        expect(trigger?.getAttribute("aria-expanded")).toBe("true");
        expect(overlay()?.getAttribute("role")).toBe("dialog");
    });
});

describe("loading and a failed read", () => {
    it("stands in for the month while it loads", () => {
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
