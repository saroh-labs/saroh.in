// @vitest-environment jsdom
/**
 * All bookings (U11, BKMAllBookings / BKDAllBookings; BLHB variant B), at a
 * desk and on a phone: the "Showing" picker with counts, search as an icon,
 * one Filters button, cancelled bookings folded under their day, the Money
 * column for those who read money, rows under day headings, "Did they come?" on the row with Undo, the row menu, every
 * cancel asking about the money (in time, late, nothing paid; Refund
 * locked with why for someone who can't refund), a Member, a read-only
 * role, the first run, no matches, an empty view, couldn't load, and the
 * keyboard.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNREACHED } from "@/lib/api/unreached";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { BookingMoney } from "@/lib/services/booking-money";
import { BOOKINGS_FIRST_RUN, shareLink } from "@/lib/sites/share-links";
import type { AllBookingsCan } from "./bookings-view";

import { BookingsCouldntLoad, BookingsView } from "./bookings-view";

const recordBookingOutcome = vi.fn();
const cancelBooking = vi.fn();
const readBookingForCancel = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    recordBookingOutcome: (...a: unknown[]) =>
        recordBookingOutcome(...a) as unknown,
    cancelBooking: (...a: unknown[]) => cancelBooking(...a) as unknown,
    readBookingForCancel: (...a: unknown[]) =>
        readBookingForCancel(...a) as unknown,
    rescheduleBooking: vi.fn(),
    listAvailability: vi.fn(() => Promise.resolve([])),
    takeDeskPayment: vi.fn(),
    createBookingPayLink: vi.fn(),
}));

// Server-only plumbing the desk's Take ₹X reaches (GST rates).
vi.mock("@/lib/api/http", () => ({}));

const refresh = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace }),
    usePathname: () => "/bookings/all",
    useSearchParams: () => new URLSearchParams(),
}));

const showUndo = vi.fn(() => "toast_1");
const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showUndo: (...a: unknown[]) => showUndo(...(a as [])) as unknown,
    showSuccess: (...a: unknown[]) => showSuccess(...a) as unknown,
    showError: (...a: unknown[]) => showError(...a) as unknown,
    dismissToast: vi.fn(),
    settleUndo: (fn: () => unknown) => fn(),
}));

const ZONE = "Asia/Kolkata";
/** Mon 19 Oct 2026, 12:00 pm IST. */
const NOW = Date.parse("2026-10-19T06:30:00.000Z");
const HOUR = 3_600_000;

let n = 0;
function booking(
    startHours: number,
    first: string,
    over: Partial<DiaryBooking> = {},
): DiaryBooking {
    n += 1;
    const start = NOW + startHours * HOUR;
    return {
        id: `bk_${first.toLowerCase()}_${n}`,
        serviceId: "svc_physio",
        startAt: new Date(start).toISOString(),
        endAt: new Date(start + 45 * 60_000).toISOString(),
        timezone: ZONE,
        status: "CONFIRMED",
        outcome: null,
        bookerName: null,
        bookerEmail: null,
        bookerPhone: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        cancelledAt: null,
        cancelledLate: false,
        service: {
            id: "svc_physio",
            name: "Physio assessment",
            timezone: ZONE,
            capacity: 1,
            durationMinutes: 45,
            priceCents: 80000,
            currency: "INR",
        },
        contact: {
            id: `ct_${first.toLowerCase()}`,
            firstName: first,
            lastName: "Singh",
            email: `${first.toLowerCase()}.singh@example.com`,
        },
        staff: { id: "st_meera", name: "Meera" },
        paidWith: "PAID",
        packName: null,
        subscriptionId: null,
        take: null,
        ...over,
    };
}

/** The boards' day, near enough. */
function rows(): DiaryBooking[] {
    n = 0;
    return [
        booking(-3, "Ananya"), // ended this morning, not marked
        booking(-50, "Kavya"), // Saturday, not marked
        booking(-2, "Rohan", { outcome: "ATTENDED" }),
        booking(-0.5, "Kabir", { take: { cents: 40000, byLink: false } }),
        booking(5.5, "Priya", { status: "PENDING" }),
        booking(20, "Dev", {
            staff: { id: "st_arjun", name: "Arjun" },
            service: {
                id: "svc_massage",
                name: "Sports massage",
                timezone: ZONE,
                capacity: 1,
                durationMinutes: 60,
            },
        }),
        booking(44, "Isha", { status: "CANCELLED" }),
    ];
}

const OWNER: AllBookingsCan = {
    money: true,
    book: true,
    take: true,
    people: true,
    refund: true,
    readOrder: true,
    link: false,
    online: true,
};
const MEMBER: AllBookingsCan = {
    ...OWNER,
    money: false,
    take: false,
    refund: false,
};
const READ_ONLY: AllBookingsCan = {
    money: false,
    book: false,
    take: false,
    people: false,
    refund: false,
    readOrder: false,
    link: false,
    online: false,
};

let root: Root;
let host: HTMLDivElement;

function phone(narrow: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: narrow && query.includes("max-width: 759"),
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
        }),
    });
}

function draw(props: Partial<Parameters<typeof BookingsView>[0]> = {}): void {
    act(() =>
        root.render(
            <BookingsView
                bookings={rows()}
                timezone={ZONE}
                now={NOW}
                can={OWNER}
                {...props}
            />,
        ),
    );
}

const text = () => document.body.textContent;
const all = <T extends Element = HTMLElement>(sel: string) =>
    Array.from(document.querySelectorAll<T>(sel));
const byText = <T extends HTMLElement = HTMLElement>(
    sel: string,
    words: string | RegExp,
): T | undefined =>
    all<T>(sel).find((el) =>
        typeof words === "string"
            ? el.textContent.trim() === words
            : words.test(el.textContent),
    );
const press = (el: Element | undefined) => {
    if (!el) throw new Error("nothing to press");
    act(() => (el as HTMLElement).click());
};
const showing = () =>
    document.querySelector<HTMLButtonElement>("[data-showing]");
/** The picker's choice by name: a radio inside its label. */
const choice = (label: string) =>
    byText<HTMLLabelElement>(
        "label",
        new RegExp(`^${label}\\d+$`),
    )?.querySelector<HTMLElement>('[role="radio"]');
async function pickView(label: string) {
    press(showing() ?? undefined);
    await flush();
    press(choice(label) ?? undefined);
    await flush();
}
const filtersButton = () =>
    document.querySelector<HTMLButtonElement>("[data-filters]");
async function openFilters() {
    press(filtersButton() ?? undefined);
    await flush();
}
const rowOf = (first: string) =>
    all("[data-booking-row]").find((r) =>
        r.getAttribute("data-booking-row")?.includes(first.toLowerCase()),
    );
/** A money choice's radio, by the words on its card. */
const money = (words: RegExp) =>
    byText<HTMLLabelElement>("label", words)?.querySelector<HTMLElement>(
        '[role="radio"]',
    );
const flush = async () => {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        await Promise.resolve();
    });
};

/** Opens a row's ⋯: a menu at a desk, a sheet on a phone. */
async function openMenu(first: string) {
    const trigger =
        rowOf(first)?.querySelector<HTMLButtonElement>("[data-row-menu]");
    if (!trigger) throw new Error(`no menu for ${first}`);
    act(() => {
        trigger.focus();
        trigger.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        trigger.click();
    });
    await flush();
    return trigger;
}
const menuItems = () =>
    all('[role="menuitem"], [data-row-sheet] a, [data-row-sheet] button').map(
        (el) => el.textContent.trim(),
    );

function search(term: string) {
    const input = document.querySelector<HTMLInputElement>(
        'input[placeholder="Search bookings"]',
    );
    if (!input) throw new Error("no search");
    act(() => {
        // React reads the value it didn't set itself from the prototype.
        const value = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        );
        value?.set?.call(input, term);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        // Enter settles the term at once (the pause is timed by the clock,
        // which these tests hold still).
        input.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
    });
}

const LATE_DEPOSIT: BookingMoney = {
    priceCents: 80000,
    currency: "INR",
    paidOnlineCents: 40000,
    deposit: true,
    dueCents: 40000,
    refund: null,
    refundableCents: 40000,
    refundInTimeCancels: true,
};

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        recordBookingOutcome,
        cancelBooking,
        readBookingForCancel,
        refresh,
        replace,
        showUndo,
        showSuccess,
        showError,
    ]) {
        fn.mockReset();
    }
    showUndo.mockReturnValue("toast_1");
    recordBookingOutcome.mockResolvedValue({ ok: true, data: {} });
    window.history.replaceState(null, "", "/bookings/all");
    phone(false);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
});

describe.each([
    ["at a desk", false],
    ["on a phone", true],
])("All bookings %s", (_size, narrow) => {
    beforeEach(() => phone(narrow));

    it("shows one picker, Showing: Upcoming, with every view and its count inside", async () => {
        draw();
        // Six chips became one button: no row of them.
        expect(all('[role="radiogroup"][aria-label="Show"]')).toHaveLength(0);
        expect(showing()?.textContent).toBe("Showing:Upcoming3");
        press(showing() ?? undefined);
        await flush();
        expect(
            all('[role="radiogroup"][aria-label="Show"] label').map(
                (l) => l.textContent,
            ),
        ).toEqual([
            "Upcoming3",
            "Needs an outcome2",
            "Awaiting payment1",
            "Today4",
            "Next 7 days3",
            "All7",
        ]);
        expect(choice("Upcoming")?.getAttribute("aria-checked")).toBe("true");
    });

    it("counts only bookings still on, and folds each day's cancelled ones under it", async () => {
        draw();
        // Isha's cancelled booking is not among Upcoming's 3, nor in the rows.
        expect(rowOf("Isha")).toBeUndefined();
        expect(text()).toContain("1 cancelled");
        expect(text()).not.toContain("Isha Singh");
        press(byText("[data-fold] button", "Show"));
        expect(rowOf("Isha")?.textContent).toContain("Cancelled");
        press(byText("[data-fold] button", "Hide"));
        expect(rowOf("Isha")).toBeUndefined();
        // All lists them whole, with no fold.
        await pickView("All");
        expect(rowOf("Isha")).toBeDefined();
        expect(document.querySelector("[data-fold]")).toBeNull();
    });

    it("sets rows under day headings, in the business's zone", () => {
        draw();
        expect(all("section > h2").map((h) => h.textContent)).toEqual([
            "Today · Mon 19 Oct2 sessions · 2 people",
            "Tomorrow · Tue 20 Oct1 session · 1 person",
            "Wed 21 Oct",
        ]);
        expect(text()).toContain("When · IST");
        expect(rowOf("Priya")?.textContent).toContain("5:30 pm");
        expect(rowOf("Priya")?.textContent).toContain("Awaiting payment");
        expect(rowOf("Dev")?.textContent).toContain("Sports massage · Arjun");
    });

    it("keeps the view in the address", async () => {
        draw();
        await pickView("Needs an outcome");
        expect(window.location.search).toBe("?view=outcome");
        await pickView("Upcoming");
        expect(window.location.search).toBe("");
    });

    it("searches by name, phone or service, from an icon that opens the field", () => {
        draw();
        expect(
            document.querySelector('input[placeholder="Search bookings"]'),
        ).toBeNull();
        press(document.querySelector("[data-search-open]") ?? undefined);
        search("massage");
        expect(all("[data-booking-row]")).toHaveLength(1);
        expect(rowOf("Dev")).toBeDefined();
        expect(text()).toContain("1 of 7 shown");
        expect(text()).toContain("Search: massage");
        expect(showing()?.textContent).toBe("Showing:Upcoming1");
    });

    it("says when a search finds nothing, with Clear search", () => {
        draw();
        press(document.querySelector("[data-search-open]") ?? undefined);
        search("zzz");
        expect(text()).toContain("No bookings match “zzz”");
        press(byText("button, a", "Clear search"));
        expect(all("[data-booking-row]").length).toBeGreaterThan(0);
    });

    it("holds sort, dates, who, service and status in one Filters button, and Show closes it", async () => {
        draw({ initialView: "all", me: { id: "st_meera", name: "Meera" } });
        await openFilters();
        for (const word of [
            "Sort by",
            "Most recent first",
            "Dates",
            "Any date",
            "Tomorrow",
            "Next 7 days",
            "This month",
            "Pick dates",
            "Whose bookings",
            "Everyone",
            "Just me",
            "Service",
            "Status",
            "Came",
            "Didn't come",
            "Not marked",
        ]) {
            expect(text()).toContain(word);
        }
        // The two cuts: Today is the view's job, and so is Awaiting payment.
        const group = (name: string) =>
            all(`[role="radiogroup"][aria-label="${name}"], [role="group"]`)
                .map((g) => g.textContent)
                .join("|");
        expect(group("Dates")).not.toMatch(/Today/);
        expect(all("[aria-pressed]").map((b) => b.textContent)).not.toContain(
            "Awaiting payment",
        );
        press(byText("[aria-pressed]", "Cancelled"));
        expect(all("[data-booking-row]")).toHaveLength(1);
        expect(rowOf("Isha")).toBeDefined();
        expect(filtersButton()?.getAttribute("aria-label")).toBe(
            "Filters, 1 on",
        );
        press(byText("button", "Show 1 booking"));
        await flush();
        expect(text()).not.toContain("Show 1 booking");
        expect(text()).toContain("Status: Cancelled");
        press(byText("button", "Clear all"));
        expect(all("[data-booking-row]")).toHaveLength(7);
    });

    it("narrows to Just me, and says so in a removable pill", async () => {
        draw({
            initialView: "all",
            me: { id: "st_arjun", name: "Arjun" },
        });
        await openFilters();
        press(byText('[role="radio"]', "Just me"));
        expect(all("[data-booking-row]")).toHaveLength(1);
        expect(rowOf("Dev")).toBeDefined();
        press(byText("button", "Show 1 booking"));
        await flush();
        expect(text()).toContain("With: Just me");
        press(
            document.querySelector(
                'button[aria-label="Remove With: Just me"]',
            ) ?? undefined,
        );
        expect(all("[data-booking-row]")).toHaveLength(7);
    });

    it("sets the sort in Filters, for this view", async () => {
        draw();
        expect(all("section > h2")[0]?.textContent).toContain("Today");
        await openFilters();
        expect(text()).toContain("for this view");
        press(byText('[role="radio"]', "Most recent first"));
        expect(all("section > h2")[0]?.textContent).toContain("Tomorrow");
    });

    it("sends a forward date pick to the address as a custom range", async () => {
        draw();
        await openFilters();
        press(byText('[role="radio"]', "Tomorrow"));
        expect(replace).toHaveBeenCalledWith(
            "/bookings/all?date=custom&from=2026-10-20&to=2026-10-20",
            { scroll: false },
        );
    });

    it("asks 'Did they come?' in Status on a finished row, held with Undo", () => {
        draw({ initialView: "outcome" });
        // No column of its own: it is the Status.
        expect(
            all("span").filter(
                (el) =>
                    el.textContent === "Did they come?" &&
                    !el.closest("[data-booking-row]"),
            ),
        ).toHaveLength(0);
        expect(
            all("[data-booking-row]").every(
                (r) => !r.textContent.includes("Booked"),
            ),
        ).toBe(true);
        // The latest first.
        expect(all("section > h2").map((h) => h.textContent)).toEqual([
            "Today · Mon 19 Oct1 session · 1 person",
            "Sat 17 Oct1 session · 1 person",
        ]);
        const row = rowOf("Ananya");
        expect(
            row?.querySelector('[role="group"]')?.getAttribute("aria-label"),
        ).toBe("Did Ananya Singh come?");
        press(byText("[data-booking-row] button", "Came"));
        expect(showUndo).toHaveBeenCalledWith(
            "Ananya came.",
            expect.any(Function),
            expect.anything(),
        );
        expect(rowOf("Ananya")?.textContent).toContain("Undo");
        expect(recordBookingOutcome).not.toHaveBeenCalled();
        press(byText("[data-booking-row] button", "Undo"));
        expect(rowOf("Ananya")?.textContent).toContain("Didn't come");
        expect(rowOf("Ananya")?.textContent).not.toContain("Undo");
    });

    it("puts the row back, and says so, when Came never got there", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        recordBookingOutcome.mockRejectedValue(new Error("offline"));
        draw({ initialView: "outcome" });
        press(byText("[data-booking-row] button", "Came"));
        expect(
            rowOf("Ananya")?.querySelector(
                '[aria-label="Did Ananya Singh come?"]',
            ),
        ).toBeNull();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(recordBookingOutcome).toHaveBeenCalledTimes(1);
        expect(showError).toHaveBeenCalledWith(UNREACHED);
        expect(
            rowOf("Ananya")?.querySelector(
                '[aria-label="Did Ananya Singh come?"]',
            ),
        ).not.toBeNull();
    });

    it("offers the boards' row menu, in order", async () => {
        draw();
        await openMenu("Kabir");
        expect(menuItems()).toEqual([
            "Mark arrived",
            "Take ₹400",
            "Move to another time",
            "Open the booking",
            "Open Kabir's page",
            "Cancel booking",
        ]);
        if (narrow) {
            // A sheet from the foot, titled with who and when.
            expect(text()).toContain(
                "Today, 11:30 am · Physio assessment with Meera",
            );
        } else {
            expect(text()).toContain("Kabir Singh · today, 11:30 am");
        }
    });

    it("marks someone arrived from the menu", async () => {
        draw();
        await openMenu("Kabir");
        press(
            byText(
                '[role="menuitem"], [data-row-sheet] button',
                /Mark arrived/,
            ),
        );
        await flush();
        expect(showUndo).toHaveBeenCalledWith(
            "Kabir came.",
            expect.any(Function),
            expect.anything(),
        );
        expect(rowOf("Kabir")?.textContent).toContain("Came");
    });

    it("cancels late: the policy keeps the deposit, Refund still there for someone who may refund", async () => {
        readBookingForCancel.mockResolvedValue({
            money: LATE_DEPOSIT,
            freeCancelUntil: new Date(NOW - 24 * HOUR).toISOString(),
            timezone: ZONE,
        });
        draw();
        await openMenu("Kabir");
        press(
            byText(
                '[role="menuitem"], [data-row-sheet] button',
                /Cancel booking/,
            ),
        );
        await flush();
        await flush();
        expect(text()).toContain("Cancel Kabir's booking?");
        expect(text()).toContain(
            "so your policy keeps the deposit. You can still refund it.",
        );
        expect(money(/^Keep the deposit/)?.getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(money(/^Refund ₹400/)?.hasAttribute("disabled")).toBe(false);
        expect(byText("button", "Cancel, keep the deposit")).toBeDefined();
    });

    it("cancels late without refund permission: Refund locked, saying why", async () => {
        readBookingForCancel.mockResolvedValue({
            money: LATE_DEPOSIT,
            freeCancelUntil: new Date(NOW - 24 * HOUR).toISOString(),
            timezone: ZONE,
        });
        draw({ can: MEMBER });
        await openMenu("Kabir");
        press(
            byText(
                '[role="menuitem"], [data-row-sheet] button',
                /Cancel booking/,
            ),
        );
        await flush();
        await flush();
        expect(money(/^Refund ₹400/)?.hasAttribute("disabled")).toBe(true);
        expect(byText("label", /^Refund ₹400/)?.textContent).toContain(
            "Only someone who can refund payments can give it back.",
        );
        expect(money(/^Keep the deposit/)?.getAttribute("aria-checked")).toBe(
            "true",
        );
    });

    it("cancels in time: the policy refunds the deposit", async () => {
        readBookingForCancel.mockResolvedValue({
            money: LATE_DEPOSIT,
            freeCancelUntil: new Date(NOW + 24 * HOUR).toISOString(),
            timezone: ZONE,
        });
        draw();
        await openMenu("Priya");
        press(
            byText(
                '[role="menuitem"], [data-row-sheet] button',
                /Cancel booking/,
            ),
        );
        await flush();
        await flush();
        expect(text()).toContain("so your policy refunds the deposit.");
        expect(money(/^Refund ₹400/)?.getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(byText("button", "Cancel and refund ₹400")).toBeDefined();
    });

    it("cancels with nothing paid: a plain question, held with Undo", async () => {
        readBookingForCancel.mockResolvedValue({
            money: null,
            freeCancelUntil: null,
            timezone: ZONE,
        });
        draw();
        await openMenu("Dev");
        press(
            byText(
                '[role="menuitem"], [data-row-sheet] button',
                /Cancel booking/,
            ),
        );
        await flush();
        await flush();
        expect(text()).toContain(
            "Dev is told, and the time opens up for someone else.",
        );
        expect(money(/^Refund/)).toBeUndefined();
        act(() => byText("button", "Cancel booking")?.click());
        await flush();
        expect(showUndo).toHaveBeenCalledWith(
            "Cancelling in 10 seconds",
            expect.any(Function),
            expect.anything(),
        );
        expect(cancelBooking).not.toHaveBeenCalled();
    });

    it("a Member marks and cancels, and takes no money", async () => {
        draw({ can: MEMBER });
        await openMenu("Kabir");
        expect(menuItems()).toEqual([
            "Mark arrived",
            "Move to another time",
            "Open the booking",
            "Open Kabir's page",
            "Cancel booking",
        ]);
    });

    it("a role that only reads sees the rows, and no way to change them", async () => {
        draw({ can: READ_ONLY, initialView: "outcome" });
        expect(byText("[data-booking-row] button", "Came")).toBeUndefined();
        expect(rowOf("Ananya")?.textContent).toContain("Not marked yet");
        await openMenu("Ananya");
        expect(menuItems()).toEqual(["Open the booking"]);
    });

    it("says an empty view plainly, with Show all bookings", async () => {
        draw({
            bookings: rows().filter((b) => b.status !== "PENDING"),
            initialView: "unconfirmed",
        });
        expect(text()).toContain("Nothing awaiting payment");
        expect(text()).toContain(
            "Nobody owes you for a booking. Anyone sent a payment link shows here until they pay.",
        );
        press(byText("button, a", "Show all bookings"));
        await flush();
        expect(showing()?.textContent).toBe("Showing:All6");
        expect(all("[data-booking-row]")).toHaveLength(6);
    });

    it("shows a custom range of dates as a pill, with its two days in Filters", async () => {
        draw({
            dates: { date: "custom", from: "2026-08-01", to: "2026-10-31" },
        });
        expect(text()).toContain("Dates: 1 Aug to 31 Oct");
        await openFilters();
        expect(
            all<HTMLInputElement>('[aria-label="From"], [aria-label="To"]')
                .length,
        ).toBeGreaterThanOrEqual(2);
    });

    it("says days with no bookings as a filter, and Clear filters drops the dates", () => {
        window.history.replaceState(
            null,
            "",
            "/bookings/all?view=all&date=custom&from=2026-08-01&to=2026-08-31",
        );
        draw({
            bookings: [],
            initialView: "all",
            dates: { date: "custom", from: "2026-08-01", to: "2026-08-31" },
        });
        expect(text()).not.toContain("No bookings yet");
        press(byText("button", /^Clear (?:all|filters)$/));
        expect(replace).toHaveBeenCalledWith("/bookings/all?view=all", {
            scroll: false,
        });
    });

    it("says Nobody else today when only today's cancelled bookings are left", () => {
        n = 0;
        draw({
            bookings: [
                booking(3, "Zed", { status: "CANCELLED" }),
                booking(30, "Dev"),
            ],
        });
        expect(all("section > h2")[0]?.textContent).toContain(
            "Nobody else today",
        );
        expect(text()).toContain("1 cancelled");
    });

    it("shows the Money column to those who read money, never to a Member", () => {
        draw({ initialView: "all" });
        expect(byText("span", "Money")).toBeDefined();
        expect(rowOf("Priya")?.textContent).toContain("₹800");
        expect(rowOf("Priya")?.textContent).toContain("Awaiting payment");
        expect(rowOf("Kabir")?.textContent).toContain("₹400");
        expect(rowOf("Rohan")?.textContent).toContain("Paid");
        act(() => root.unmount());
        root = createRoot(host);
        draw({ can: MEMBER, initialView: "all" });
        expect(byText("span", "Money")).toBeUndefined();
        expect(document.querySelector("[data-money]")).toBeNull();
        expect(document.querySelector("[data-money-line]")).toBeNull();
        expect(text()).not.toContain("₹");
    });

    it("says how long each booking runs, not when it ends", () => {
        draw();
        expect(rowOf("Dev")?.textContent).toContain("45 min");
        expect(rowOf("Dev")?.textContent).not.toMatch(/\bto \d/);
    });

    it("gives the keyboard back to the row's ⋯ when the cancel sheet closes", async () => {
        readBookingForCancel.mockResolvedValue({
            money: null,
            freeCancelUntil: null,
            timezone: ZONE,
        });
        draw();
        const trigger = await openMenu("Dev");
        expect(trigger.getAttribute("aria-label")).toBe("More for Dev Singh");
        press(
            byText(
                '[role="menuitem"], [data-row-sheet] button',
                /Cancel booking/,
            ),
        );
        await flush();
        act(() => byText("button", "Keep booking")?.click());
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(document.activeElement).toBe(
            rowOf("Dev")?.querySelector("[data-row-menu]"),
        );
    });
});

describe("All bookings, first run and failure", () => {
    it("says none yet, and offers the booking page while it is live", () => {
        const html = renderToStaticMarkup(
            <BookingsView
                bookings={[]}
                timezone={ZONE}
                now={NOW}
                can={OWNER}
                share={shareLink(
                    {
                        links: {
                            site: null,
                            shop: null,
                            book: "https://rye.saroh.app/book",
                        },
                    },
                    BOOKINGS_FIRST_RUN,
                )}
            />,
        );
        expect(html).toContain("No bookings yet");
        expect(html).toContain(
            "They show here when a customer books from your booking page, or when you add one.",
        );
        expect(html).toContain("Share your booking page");
        // No search or views over nothing.
        expect(html).not.toContain("Search bookings");
    });

    it("offers nothing to share when the booking page isn't live", () => {
        const html = renderToStaticMarkup(
            <BookingsView
                bookings={[]}
                timezone={ZONE}
                now={NOW}
                can={OWNER}
            />,
        );
        expect(html).toContain("No bookings yet");
        expect(html).not.toContain("Share your booking page");
    });

    it("says it couldn't load, never that there are none", () => {
        const html = renderToStaticMarkup(<BookingsCouldntLoad />);
        expect(html).toMatch(/Couldn(?:'|&#x27;)t load your bookings/);
        expect(html).toContain("Try again");
        expect(html).toContain('role="alert"');
        expect(html).not.toContain("No bookings yet");
    });

    it("draws a list-shaped loader at the page's width", () => {
        const loader = readFileSync(
            path.resolve(
                __dirname,
                "../../../app/(shell)/bookings/all/loading.tsx",
            ),
            "utf8",
        );
        expect(loader).toMatch(
            /<PageLoading[\s\S]*shape="list"[\s\S]*width="full"/,
        );
    });
});

describe("a class on the List (DEC-260)", () => {
    beforeEach(() => phone(true));

    it("is one row, 'Yoga flow · 2 of 15', that opens to its people", () => {
        const yoga = {
            serviceId: "svc_yoga",
            service: {
                id: "svc_yoga",
                name: "Yoga flow",
                timezone: ZONE,
                capacity: 15,
                durationMinutes: 60,
            },
        };
        n = 0;
        act(() =>
            root.render(
                <BookingsView
                    bookings={[
                        booking(2, "Asha", yoga),
                        booking(2, "Ravi", yoga),
                        booking(3, "Kabir"),
                    ]}
                    timezone={ZONE}
                    now={NOW}
                    can={OWNER}
                />,
            ),
        );
        const head = all("section > h2").at(0);
        expect(head?.textContent).toContain("2 sessions · 3 people");
        const klass = document.querySelector("[data-class-row]");
        expect(klass?.textContent).toContain("Yoga flow · 2 of 15");
        expect(klass?.textContent).toContain("13 places left");
        expect(rowOf("Asha")).toBeUndefined();
        const open = klass?.querySelector<HTMLButtonElement>("button");
        expect(open?.getAttribute("aria-expanded")).toBe("false");
        press(open ?? undefined);
        expect(rowOf("Asha")).toBeDefined();
        expect(rowOf("Ravi")).toBeDefined();
    });
});

describe("every cancel on All bookings asks about the money (BA-01)", () => {
    const files = [
        "bookings-view.tsx",
        "booking-row.tsx",
        "row-menu.tsx",
        "more-filters.tsx",
        "list-header.tsx",
        "move-sheet.tsx",
    ].map((f) => readFileSync(path.resolve(__dirname, f), "utf8"));

    it("never cancels around the one cancel sheet", () => {
        for (const code of files) expect(code).not.toMatch(/cancelBooking\(/);
        expect(files[0]).toMatch(/<CancelSheet\b/);
    });
});
