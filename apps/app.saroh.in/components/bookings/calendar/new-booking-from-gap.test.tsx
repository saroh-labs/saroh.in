// @vitest-environment jsdom
/**
 * Book from a free time (U9, #1025; BKMNewFromGap on a phone, BKDFromGap
 * at a desk): the Book someone · Block this time switch, the three steps
 * and back, services that fit, are too long or that the team can't book,
 * an existing customer and a new one by name and phone, Paid now, the
 * front desk kept from money and told why, the booked state with
 * WhatsApp / SMS / Copy message, Close these extra hours only on extra
 * hours, a time just taken, and the keyboard. Each at a phone's width and
 * a desk's.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CustomerSearch,
    CustomerSearchResult,
} from "@/lib/customers/picker";
import { CANT_TAKE_PAYMENTS } from "@/lib/organizations/permits";
import type { BookingPeople } from "@/lib/services/booking-pay";
import type { Service } from "@/lib/services/service";
import type { StaffView } from "@/lib/staff/types";

import type { GapTarget } from "./new-booking-from-gap";
import { NewBookingFromGap } from "./new-booking-from-gap";

const listAvailability = vi.fn();
const bookByHand = vi.fn();
const createBookingPayLink = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    listAvailability: (...args: unknown[]) =>
        listAvailability(...args) as unknown,
    bookByHand: (...args: unknown[]) => bookByHand(...args) as unknown,
    createBookingPayLink: (...args: unknown[]) =>
        createBookingPayLink(...args) as unknown,
}));

const findCustomers = vi.fn<(q: string) => Promise<CustomerSearch>>();
const readCustomerAttention = vi.fn();
vi.mock("@/lib/customers/actions", () => ({
    findCustomers: (q: string) => findCustomers(q),
    readCustomerAttention: (id: string) => readCustomerAttention(id) as unknown,
}));

const addTimeOff = vi.fn();
const removeTimeOff = vi.fn();
const addExtraHours = vi.fn();
const removeExtraHours = vi.fn();
vi.mock("@/lib/staff/actions", () => ({
    addTimeOff: (...args: unknown[]) => addTimeOff(...args) as unknown,
    removeTimeOff: (...args: unknown[]) => removeTimeOff(...args) as unknown,
    addExtraHours: (...args: unknown[]) => addExtraHours(...args) as unknown,
    removeExtraHours: (...args: unknown[]) =>
        removeExtraHours(...args) as unknown,
}));

vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
vi.mock("@/components/gst-rates/use-gst-rate-step", () => ({
    useGstRateStep: () => ({
        run: (make: () => Promise<unknown>) => make(),
        step: null,
    }),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const showUndo = vi.fn();
const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showUndo: (...args: unknown[]) => showUndo(...args) as unknown,
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));

const ZONE = "Asia/Kolkata";
const DAY = "2026-10-19";
/** An instant at a local wall-clock time on the day, in India. */
const at = (hhmm: string, day = DAY) =>
    new Date(`${day}T${hhmm}:00+05:30`).toISOString();

const service = (over: Partial<Service>): Service => ({
    id: "svc",
    organizationId: "org",
    siteId: null,
    name: "Service",
    description: null,
    durationMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    capacity: 1,
    priceCents: 80000,
    currency: "INR",
    payCents: 80000,
    timezone: ZONE,
    status: "ACTIVE",
    locationType: "IN_PERSON",
    meetingUrl: null,
    createdAt: at("09:00"),
    updatedAt: at("09:00"),
    visits: 1,
    depositMode: "NONE",
    depositCents: null,
    showOnBookingPage: true,
    bookableByTeam: true,
    ...over,
});
const ASSESS = service({
    id: "svc_assess",
    name: "Physio assessment",
    durationMinutes: 45,
});
const FOLLOW = service({
    id: "svc_follow",
    name: "Follow-up session",
    durationMinutes: 30,
    priceCents: 60000,
    payCents: 60000,
});
const REHAB = service({
    id: "svc_rehab",
    name: "Hip and back rehab",
    durationMinutes: 90,
});
const ONLINE_ONLY = service({
    id: "svc_online",
    name: "Online review",
    durationMinutes: 30,
    bookableByTeam: false,
});
const SERVICES = [ASSESS, FOLLOW, REHAB, ONLINE_ONLY];

const meera = (over: Partial<StaffView> = {}): StaffView => ({
    id: "p_meera",
    name: "Meera Iyer",
    title: "Physiotherapist",
    status: "ACTIVE",
    membership: null,
    serviceIds: SERVICES.map((s) => s.id),
    hours: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1140 }],
    weeklyMinutes: 600,
    extraHours: [],
    timeOff: [],
    ...over,
});

/** Meera, free 4:00 to 5:00 pm today. */
const GAP: GapTarget = { staff: meera(), date: DAY, free: [960, 1020] };
/** Meera's one-off extra hours, 2:00 to 5:00 pm, all free. */
const EXTRA: GapTarget = {
    staff: meera({
        extraHours: [
            {
                id: "xh_1",
                date: `${DAY}T00:00:00.000Z`,
                startMinute: 840,
                endMinute: 1020,
            },
        ],
    }),
    date: DAY,
    free: [840, 1020],
};

const person = (
    id: string,
    name: string,
    phone: string,
): CustomerSearchResult => ({
    id,
    name,
    email: null,
    phone,
    lastSeenAt: null,
    exactOn: [],
});
const KABIR = person("c_kabir", "Kabir Singh", "+91 90000 12345");
const RECENT = [KABIR, person("c_ananya", "Ananya Desai", "+91 90000 23456")];

const PEOPLE: BookingPeople = {
    canSearch: true,
    payLink: true,
    canTakePayment: true,
    onlinePay: true,
};

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();
const writeText = vi.fn<(t: string) => Promise<void>>();

function size(phone: boolean) {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (query: string) => ({
            matches: phone && query.includes("max-width: 759px"),
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
        }),
    });
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        listAvailability,
        bookByHand,
        createBookingPayLink,
        findCustomers,
        readCustomerAttention,
        addTimeOff,
        removeTimeOff,
        addExtraHours,
        removeExtraHours,
        refresh,
        showUndo,
        showError,
        onClose,
        writeText,
    ]) {
        fn.mockReset();
    }
    // Every quarter hour from 9 am to 7 pm is a start, wherever it fits.
    listAvailability.mockResolvedValue(
        Array.from({ length: 40 }, (_, i) => {
            const m = 540 + i * 15;
            const hhmm = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
            return { startAt: at(hhmm), endAt: at(hhmm) };
        }),
    );
    findCustomers.mockImplementation((q) =>
        Promise.resolve({
            ok: true,
            results: q
                ? RECENT.filter((r) =>
                      (r.name ?? "").toLowerCase().includes(q.toLowerCase()),
                  )
                : RECENT,
        }),
    );
    readCustomerAttention.mockResolvedValue(null);
    bookByHand.mockResolvedValue({ ok: true, data: { id: "bk_1" } });
    createBookingPayLink.mockResolvedValue({
        ok: true,
        data: { url: "https://pay.example.com/l/kaya-7Q2X9" },
    });
    addTimeOff.mockResolvedValue({
        ok: true,
        data: {
            staff: {
                timeOff: [
                    {
                        id: "off_1",
                        startAt: at("16:00"),
                        endAt: at("16:30"),
                        allDay: false,
                        reason: null,
                    },
                ],
            },
        },
    });
    removeExtraHours.mockResolvedValue({ ok: true, data: {} });
    writeText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    size(false);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle(ms = 260) {
    await act(async () => {
        await new Promise((r) => setTimeout(r, ms));
    });
}

async function open(
    target: GapTarget = GAP,
    over: { people?: BookingPeople; canHours?: boolean } = {},
) {
    act(() =>
        root.render(
            <NewBookingFromGap
                target={target}
                services={SERVICES}
                people={over.people ?? PEOPLE}
                timezone={ZONE}
                today={DAY}
                money
                canHours={over.canHours ?? true}
                business="Kaya Physio"
                onClose={onClose}
            />,
        ),
    );
    await settle();
}

const sheet = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("The free-time sheet is not open");
    return el as HTMLElement;
};
const text = () => sheet().textContent;

function button(name: string | RegExp, within: Element = sheet()) {
    const hit = Array.from(within.querySelectorAll("button")).find((b) =>
        typeof name === "string"
            ? b.textContent.trim() === name ||
              b.getAttribute("aria-label") === name
            : name.test(b.textContent),
    );
    if (!hit) throw new Error(`No button ${String(name)}`);
    return hit;
}
const maybeButton = (name: string) => {
    try {
        return button(name);
    } catch {
        return null;
    }
};

/** The foot's one button. */
const foot = () => {
    const el = sheet().querySelector(
        '[data-overlay-foot] button[type="submit"]',
    );
    if (!(el instanceof HTMLButtonElement)) throw new Error("No foot button");
    return el;
};

/** A radio row (RadioCards, Segmented, chips) by its words. */
function choice(label: string | RegExp): HTMLButtonElement {
    const radios = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>('[role="radio"]'),
    );
    const words = (b: HTMLButtonElement) =>
        (b.id
            ? sheet().querySelector(`label[for="${b.id}"]`)?.textContent
            : null) ??
        b.getAttribute("aria-label") ??
        b.textContent;
    const hit = radios.find((b) =>
        typeof label === "string"
            ? words(b).includes(label)
            : label.test(words(b)),
    );
    if (!hit) throw new Error(`No choice ${String(label)}`);
    return hit;
}
const rowOf = (label: string) =>
    sheet().querySelector(`label[for="${choice(label).id}"]`);

function customer(name: string): HTMLButtonElement {
    const hit = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>("ul button"),
    ).find((b) => b.textContent.includes(name));
    if (!hit) throw new Error(`No customer ${name}`);
    return hit;
}

async function press(el: HTMLElement | null) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await Promise.resolve();
        await Promise.resolve();
    });
    await settle(20);
}

function typeInto(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

const search = () => {
    const el = sheet().querySelector<HTMLInputElement>(
        'input[aria-label="Find the customer"]',
    );
    if (!el) throw new Error("No search");
    return el;
};

function field(label: string): HTMLInputElement {
    const lab = Array.from(sheet().querySelectorAll("label")).find((l) =>
        l.textContent.startsWith(label),
    );
    const el = document.getElementById(lab?.getAttribute("for") ?? "");
    if (!(el instanceof HTMLInputElement)) throw new Error(`No ${label}`);
    return el;
}

/** Follow-up session, then Kabir: at Check and book. */
async function toCheck() {
    await press(choice("Follow-up session"));
    await press(foot());
    await settle();
    await press(customer("Kabir Singh"));
    await settle();
}

describe.each([
    ["a phone", true],
    ["a desk", false],
])("A free time on %s", (_where, phone) => {
    beforeEach(() => size(phone));

    it("says whose time it is, when, and how long it is free", async () => {
        await open();
        expect(text()).toContain("Book Meera, today at 4:00 pm");
        expect(text()).toContain("Free until 5:00 pm · 1 hour");
        expect(text()).toContain(
            phone ? "Step 1 of 3 · Pick a service" : "Meera Iyer · free time",
        );
        expect(choice("Book someone").getAttribute("aria-checked")).toBe(
            "true",
        );
    });

    it("lists the services: which fit and end when, which are too long, which the team can't book", async () => {
        await open();
        expect(rowOf("Physio assessment")?.textContent).toContain(
            "45 min · fits, ends 4:45 pm",
        );
        expect(rowOf("Follow-up session")?.textContent).toContain(
            "30 min · fits, ends 4:30 pm",
        );
        expect(rowOf("Hip and back rehab")?.textContent).toContain(
            "90 min · too long for this 60 min gap",
        );
        expect(choice("Hip and back rehab").disabled).toBe(true);
        expect(rowOf("Online review")?.textContent).toContain(
            "only customers book it, on your booking page",
        );
        expect(choice("Online review").disabled).toBe(true);
        expect(rowOf("Physio assessment")?.textContent).toContain("₹800");
    });

    it("says what is missing on each step instead of moving on", async () => {
        await open();
        expect(foot().textContent).toBe("Next: who it’s for");
        await press(foot());
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Pick a service.",
        );
        await press(choice("Physio assessment"));
        await press(foot());
        await settle();
        expect(foot().textContent).toBe("Next: check and book");
        await press(foot());
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Pick who it’s for, or add them.",
        );
    });

    it("books Follow-up with Kabir at 4:00, paying at the visit, and offers WhatsApp, SMS and Copy message", async () => {
        await open();
        await toCheck();
        expect(text()).toContain(
            phone ? "Step 3 of 3 · Check and book" : "Step 3 of 3",
        );
        expect(text()).toContain("Kabir Singh");
        expect(text()).toContain("Today, 4:00 to 4:30 pm");
        expect(text()).toContain("With Meera Iyer · IST");
        expect(choice("Pays at the visit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(foot().textContent).toBe(
            phone ? "Book Kabir for 4:00 pm" : "Book",
        );
        await press(foot());
        await settle();
        expect(bookByHand).toHaveBeenCalledWith(
            FOLLOW.id,
            expect.objectContaining({
                startAt: at("16:00"),
                staffId: "p_meera",
                contactId: "c_kabir",
                paidWith: "DESK",
            }),
        );
        expect(text()).toContain("Kabir Singh is booked");
        expect(text()).toContain(
            "Follow-up session with Meera, today, 4:00 to 4:30 pm. Pays at the visit.",
        );
        expect(text()).toContain("Let Kabir know");
        const links = Array.from(sheet().querySelectorAll("a"));
        const wa = links.find((a) => a.textContent.includes("WhatsApp"));
        expect(wa?.getAttribute("href")).toMatch(
            /^https:\/\/wa\.me\/919000012345\?text=Hi%20Kabir/,
        );
        const sms = links.find((a) => a.textContent.trim() === "SMS");
        expect(sms?.getAttribute("href")).toMatch(
            /^sms:\+919000012345\?&body=/,
        );
        await press(button("Copy message"));
        expect(writeText).toHaveBeenCalledWith(
            expect.stringContaining(
                "Hi Kabir, you're booked for Follow-up session with Meera",
            ),
        );
        expect(button("Copied")).toBeTruthy();
        expect(
            links
                .find((a) => a.textContent.includes("View booking"))
                ?.getAttribute("href"),
        ).toBe("/bookings/bk_1");
        expect(refresh).toHaveBeenCalled();
        await press(button("Done"));
        expect(onClose).toHaveBeenCalled();
    });

    it("goes back a step, and Change returns to the service or the customer", async () => {
        await open();
        await toCheck();
        await press(button("Back"));
        expect(text()).toContain("Kabir Singh");
        expect(search()).toBeTruthy();
        await press(customer("Kabir Singh"));
        await settle();
        await press(button("Change the service"));
        expect(choice("Follow-up session").getAttribute("aria-checked")).toBe(
            "true",
        );
        await press(foot());
        await press(customer("Kabir Singh"));
        await settle();
        await press(button("Change who it’s for"));
        expect(search()).toBeTruthy();
    });

    it("adds someone new by name and phone, and books them by both", async () => {
        await open();
        await press(choice("Physio assessment"));
        await press(foot());
        await settle();
        typeInto(search(), "Zara Ahmed");
        await settle();
        await press(button(/Add “Zara Ahmed” as a new customer/));
        typeInto(field("Phone"), "90000 11223");
        await press(button("Add and use"));
        await settle();
        expect(text()).toContain("Zara Ahmed");
        await press(foot());
        await settle();
        expect(bookByHand).toHaveBeenCalledWith(
            ASSESS.id,
            expect.objectContaining({
                bookerName: "Zara Ahmed",
                bookerPhone: "+91 90000 11223",
            }),
        );
        expect(text()).toContain("Zara Ahmed is booked");
    });

    it("Paid now asks how, then books it paid by UPI", async () => {
        await open();
        await toCheck();
        await press(choice("Paid now"));
        await press(foot());
        expect(text()).toContain("Say how they paid: Cash, UPI or Card.");
        expect(bookByHand).not.toHaveBeenCalled();
        await press(choice(/^UPI$/));
        await press(foot());
        await settle();
        expect(bookByHand).toHaveBeenCalledWith(
            FOLLOW.id,
            expect.objectContaining({ paidWith: "PAID", paidBy: "UPI" }),
        );
        expect(text()).toContain("Paid by UPI.");
    });

    it("keeps the front desk from money, saying why", async () => {
        await open(GAP, {
            people: { ...PEOPLE, payLink: false, canTakePayment: false },
        });
        await toCheck();
        expect(choice("Paid now").disabled).toBe(true);
        expect(rowOf("Paid now")?.textContent).toContain(CANT_TAKE_PAYMENTS);
        expect(choice("Pays at the visit").disabled).toBe(false);
    });

    it("says the team can't book a service when the API refuses it, and stays", async () => {
        bookByHand.mockResolvedValue({
            ok: false,
            error: "Your team can't book Follow-up session. Tick Your team under Who can book it on the service to book it here.",
        });
        await open();
        await toCheck();
        await press(foot());
        await settle();
        expect(text()).toContain("Your team can't book Follow-up session.");
        expect(text()).not.toContain("is booked");
        expect(foot().textContent).toBe(
            phone ? "Book Kabir for 4:00 pm" : "Book",
        );
    });

    it("a time just taken says so, keeps the sheet and reads the calendar again", async () => {
        bookByHand.mockResolvedValue({
            ok: false,
            error: "Meera is already booked then.",
            field: "startAt",
        });
        await open();
        await toCheck();
        await press(foot());
        await settle();
        expect(text()).toContain(
            "4:00 pm was just booked by someone else. Close this to see the free times again.",
        );
        expect(refresh).toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(sheet()).toBeTruthy();
    });

    it("Block this time: how long, then blocks it as time off with Undo", async () => {
        await open();
        await press(choice("Block this time"));
        expect(text()).toContain("Block Meera, today from 4:00 pm");
        expect(text()).toContain("How long, from 4:00 pm");
        expect(
            choice("The whole gap · 1 hour").getAttribute("aria-checked"),
        ).toBe("true");
        expect(foot().textContent).toBe("Block 4:00 to 5:00 pm");
        await press(choice("30 min"));
        expect(text()).toContain("Blocked · 4:00 to 4:30 pm");
        expect(foot().textContent).toBe("Block 4:00 to 4:30 pm");
        await press(foot());
        await settle();
        expect(addTimeOff).toHaveBeenCalledWith("p_meera", {
            startAt: at("16:00"),
            endAt: at("16:30"),
            reason: "Blocked from the calendar",
        });
        expect(onClose).toHaveBeenCalled();
        expect(showUndo).toHaveBeenCalledWith(
            "Blocked 4:00 to 4:30 pm for Meera. Customers won’t be offered it.",
            expect.any(Function),
        );
        removeTimeOff.mockResolvedValue({ ok: true, data: {} });
        const undo = showUndo.mock.calls[0]?.[1] as () => Promise<unknown>;
        await act(async () => {
            await undo();
        });
        expect(removeTimeOff).toHaveBeenCalledWith("p_meera", "off_1");
    });

    it("switches back from Block to Book where it was", async () => {
        await open();
        await press(choice("Physio assessment"));
        await press(choice("Block this time"));
        await press(choice("Book someone"));
        expect(choice("Physio assessment").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(foot().textContent).toBe("Next: who it’s for");
    });

    it("offers Close these extra hours only on extra hours, and keeps their bookings", async () => {
        await open();
        expect(maybeButton("Close these extra hours")).toBeNull();
        await open(EXTRA);
        expect(text()).toContain(
            "Free until 5:00 pm · 3 hours, in extra hours",
        );
        expect(text()).toContain(
            "Today, 2:00 to 5:00 pm. Bookings already in them are kept.",
        );
        await press(button("Close these extra hours"));
        await settle();
        expect(removeExtraHours).toHaveBeenCalledWith("p_meera", "xh_1");
        expect(onClose).toHaveBeenCalled();
        expect(showUndo).toHaveBeenCalledWith(
            "Closed Meera’s extra hours today, 2:00 to 5:00 pm. Bookings already in them are kept.",
            expect.any(Function),
        );
    });

    it("in extra hours, a longer service fits and Block offers the whole three hours", async () => {
        await open(EXTRA);
        expect(rowOf("Hip and back rehab")?.textContent).toContain(
            "90 min · fits, ends 3:30 pm",
        );
        await press(choice("Block this time"));
        expect(choice("The whole gap · 3 hours")).toBeTruthy();
        expect(choice("1 hour")).toBeTruthy();
        expect(button("Close these extra hours")).toBeTruthy();
    });

    it("without hours permission: no Block switch and no Close these extra hours", async () => {
        await open(EXTRA, { canHours: false });
        expect(
            sheet().querySelector('[role="radio"][aria-checked]'),
        ).toBeTruthy();
        expect(() => choice("Block this time")).toThrow();
        expect(maybeButton("Close these extra hours")).toBeNull();
    });

    it("someone who takes no one-to-one services is sent to Services", async () => {
        await open({ ...GAP, staff: meera({ serviceIds: [] }) });
        expect(text()).toContain("Meera takes no one-to-one services yet");
        const link = Array.from(sheet().querySelectorAll("a")).find(
            (a) => a.textContent === "Open Services",
        );
        expect(link?.getAttribute("href")).toBe("/services");
    });

    it("Send a payment link books it unpaid and shows the link", async () => {
        await open();
        await toCheck();
        await press(choice("Send a payment link"));
        await press(foot());
        await settle();
        const call = bookByHand.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(call.paidWith).toBeUndefined();
        expect(createBookingPayLink).toHaveBeenCalledWith("bk_1");
        expect(text()).toContain("Awaiting payment.");
        expect(sheet().innerHTML).toContain(
            "https://pay.example.com/l/kaya-7Q2X9",
        );
    });

    it("Enter runs the step's button, and a new step takes the keyboard", async () => {
        await open();
        await press(choice("Physio assessment"));
        const form = sheet().querySelector("form");
        await act(async () => {
            form?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
            await Promise.resolve();
        });
        await settle();
        expect(document.activeElement).toBe(search());
        await press(customer("Kabir Singh"));
        await settle();
        expect(
            (document.activeElement as HTMLElement | null)?.textContent,
        ).toContain("Step 3 of 3");
    });
});
