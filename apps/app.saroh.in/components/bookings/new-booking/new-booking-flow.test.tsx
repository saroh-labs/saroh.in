// @vitest-environment jsdom
/**
 * New booking as a guided journey (U8, #1024; BKMNewBooking…Step6 on a
 * phone, BKDNewBooking and BKDAddCustomer at a desk): each step and
 * jumping back, a caller added by name and phone, an existing customer
 * found by phone, what is missing, Anyone free, no times, a time just
 * taken, a group class with places left, a class pack, a service the team
 * can't book, Paid now with how, the front desk kept from money and told
 * why, the done screen with the payment link and WhatsApp / SMS / Copy
 * message, opening on a given day, Book their next visit, closing with
 * work to lose, and the keyboard. Each at a phone's width and a desk's.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    CustomerSearch,
    CustomerSearchResult,
} from "@/lib/customers/picker";
import type { PickerSlot } from "@/lib/services/time-picker";

import { NewBookingButton, NewBookingHost } from "./new-booking-host";
import type { NewBookingPrefill, NewBookingSetup } from "./setup";

const listAvailability =
    vi.fn<
        (
            serviceId: string,
            from: string,
            to: string,
            staffId?: string,
        ) => Promise<PickerSlot[]>
    >();
const bookByHand = vi.fn();
const createBookingPayLink = vi.fn();
vi.mock("@/lib/services/actions", () => ({
    listAvailability: (...args: Parameters<typeof listAvailability>) =>
        listAvailability(...args),
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

const packsFor = vi.fn();
vi.mock("@/lib/class-packs/actions", () => ({
    packsFor: (...args: unknown[]) => packsFor(...args) as unknown,
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
const replace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace, push: vi.fn() }),
}));

vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
    dismissToast: vi.fn(),
    settleUndo: vi.fn(),
}));

const ZONE = "Asia/Kolkata";
// Mon 19 Oct 2026, 8:30 am in India.
const NOW = Date.parse("2026-10-19T03:00:00.000Z");
const at = (local: string) => new Date(`${local}:00+05:30`).toISOString();
const slot = (
    local: string,
    staffIds: string[],
    placesLeft?: number,
): PickerSlot => ({
    startAt: at(local),
    endAt: at(local),
    staffIds,
    ...(placesLeft === undefined ? {} : { placesLeft }),
});

const ASSESS = {
    id: "svc_assess",
    name: "Physio assessment",
    minutes: 45,
    priceCents: 80000,
    currency: "INR",
    capacity: 1,
};
const PILATES = {
    id: "svc_pilates",
    name: "Mat Pilates",
    minutes: 60,
    priceCents: 50000,
    currency: "INR",
    capacity: 8,
};
const ONLINE_ONLY = {
    id: "svc_online",
    name: "Online facial",
    minutes: 30,
    priceCents: 60000,
    currency: "INR",
    capacity: 1,
    bookableByTeam: false,
};
const WEEKDAYS = [1, 2, 3, 4, 5, 6];
const STAFF = [
    {
        id: "p_meera",
        name: "Meera Iyer",
        title: "Physiotherapist",
        serviceIds: [ASSESS.id],
        workDays: WEEKDAYS,
    },
    {
        id: "p_arjun",
        name: "Arjun Rao",
        title: "Sports therapist",
        serviceIds: [ASSESS.id],
        workDays: WEEKDAYS,
    },
    {
        id: "p_neha",
        name: "Neha Kapoor",
        title: null,
        serviceIds: [PILATES.id],
        workDays: WEEKDAYS,
    },
];

/** Two weeks of times: Meera and Arjun on the assessment, Neha's class. */
function times(serviceId: string, staffId?: string): PickerSlot[] {
    const all =
        serviceId === PILATES.id
            ? [
                  slot("2026-10-20T07:00", ["p_neha"], 4),
                  slot("2026-10-20T18:00", ["p_neha"], 2),
              ]
            : [
                  slot("2026-10-19T12:15", ["p_meera"]),
                  slot("2026-10-20T09:00", ["p_meera", "p_arjun"]),
                  slot("2026-10-20T10:00", ["p_meera"]),
                  slot("2026-10-20T11:00", ["p_arjun"]),
                  slot("2026-10-22T09:30", ["p_meera"]),
                  slot("2026-10-26T09:00", ["p_meera"]),
              ];
    return all.filter((s) => !staffId || s.staffIds?.includes(staffId));
}

const person = (
    id: string,
    name: string,
    phone: string,
    over: Partial<CustomerSearchResult> = {},
): CustomerSearchResult => ({
    id,
    name,
    email: null,
    phone,
    lastSeenAt: null,
    exactOn: [],
    ...over,
});
const KABIR = person("c_kabir", "Kabir Singh", "+91 90000 12345");
const FARAH = person("c_farah", "Farah Khan", "+91 90000 56789");
const RECENT = [KABIR, person("c_ananya", "Ananya Desai", "+91 90000 23456")];

const PEOPLE = {
    canSearch: true,
    payLink: true,
    canTakePayment: true,
    onlinePay: true,
};

function setupWith(over: Partial<NewBookingSetup> = {}): NewBookingSetup {
    return {
        services: [ASSESS, PILATES],
        staff: STAFF,
        people: PEOPLE,
        canUsePacks: true,
        timezone: ZONE,
        showMoney: true,
        business: "Kaya Physio",
        now: NOW,
        ...over,
    };
}

let root: Root;
let host: HTMLDivElement;

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
        packsFor,
        refresh,
        replace,
    ]) {
        fn.mockReset();
    }
    listAvailability.mockImplementation((serviceId, _f, _t, staffId) =>
        Promise.resolve(times(serviceId, staffId)),
    );
    findCustomers.mockImplementation((q) =>
        Promise.resolve({
            ok: true,
            results: q
                ? RECENT.concat(FARAH).filter(
                      (r) =>
                          (r.name ?? "")
                              .toLowerCase()
                              .includes(q.toLowerCase()) ||
                          (r.phone ?? "")
                              .replace(/\D/g, "")
                              .endsWith(q.replace(/\D/g, "")),
                  )
                : RECENT,
        }),
    );
    readCustomerAttention.mockResolvedValue(null);
    packsFor.mockResolvedValue([]);
    bookByHand.mockResolvedValue({ ok: true, data: { id: "bk_1" } });
    createBookingPayLink.mockResolvedValue({
        ok: true,
        data: { url: "https://pay.example.com/l/kaya-7Q2X9" },
    });
    size(false);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

/** Let the search settle (200ms) and its promises land. */
async function settle(ms = 260) {
    await act(async () => {
        await new Promise((r) => setTimeout(r, ms));
    });
}

async function open(
    over: Partial<NewBookingSetup> = {},
    arrival: NewBookingPrefill | null = null,
) {
    act(() =>
        root.render(
            <NewBookingHost setup={setupWith(over)} arrival={arrival}>
                <NewBookingButton />
            </NewBookingHost>,
        ),
    );
    if (!arrival) {
        await press(
            Array.from(host.querySelectorAll("button")).find(
                (b) => b.textContent.trim() === "New booking",
            ) ?? null,
        );
    }
    await settle();
}

const sheet = () => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) throw new Error("New booking is not open");
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

/** The sticky foot's one button. */
const foot = () => {
    const el = sheet().querySelector(
        '[data-overlay-foot] button[type="submit"]',
    );
    if (!(el instanceof HTMLButtonElement)) throw new Error("No foot button");
    return el;
};

/** A radio row (RadioCards) or chip (ChoiceGroup) by its words. */
function choice(label: string | RegExp): HTMLButtonElement {
    const radios = Array.from(
        sheet().querySelectorAll<HTMLButtonElement>('button[role="radio"]'),
    );
    const words = (b: HTMLButtonElement) =>
        sheet().querySelector(`label[for="${b.id}"]`)?.textContent ??
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

/** The confirm over the sheet. */
function alertDialog(): Element {
    const el = document.querySelector('[role="alertdialog"]');
    if (!el) throw new Error("Nothing is asked");
    return el;
}

/** A customer's row in the list, by name. */
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

/** Kabir, the assessment, Meera, Tue 20 at 10:00: at Check and book. */
async function toCheck() {
    await press(customer("Kabir Singh"));
    await press(choice("Physio assessment"));
    await press(foot());
    await press(choice("Meera Iyer"));
    await press(foot());
    await press(choice(/^Tue 20 Oct/));
    await press(choice(/^10:00 am/));
    await press(foot());
}

// Each test walks the whole sheet in jsdom: about a second locally, past
// 5s on a busy CI runner. A timed-out test leaves its act() running and
// fails every test after it, so the whole file gets the same headroom.
describe.each([
    ["a phone", true],
    ["a desk", false],
])("New booking on %s", { timeout: 15_000 }, (_where, phone) => {
    beforeEach(() => size(phone));

    it("opens on Who is it for?, as the screen on a phone and a wide panel at a desk", async () => {
        await open();
        const frame = sheet();
        expect(frame.className).toContain(phone ? "h-dvh" : "max-w-[820px]");
        expect(text()).toContain("Step 1 of 5 · Customer");
        expect(text()).toContain("Who is it for?");
        // The desk's step list doubles as the check card.
        const steps = frame.querySelector('nav[aria-label="Steps"]');
        expect(steps?.textContent).toContain("Who");
        expect(steps?.textContent).toContain("Pay and book");
        expect(foot().textContent).toBe("Next: service");
        expect(text()).toContain("Recent customers");
        expect(text()).toContain("Kabir Singh");
    });

    it("books a caller by name and phone, step by step, and says what is next", async () => {
        await open();
        typeInto(search(), "Zara Ahmed");
        await settle();
        expect(text()).toContain("Just a name and phone number");
        await press(button(/Add “Zara Ahmed” as a new customer/));
        expect(text()).toContain("New customer");
        // The foot drives the card (U3): "Add and use".
        expect(foot().textContent).toBe("Add and use");
        typeInto(field("Phone"), "90000 54321");
        await press(foot());
        await settle();
        expect(text()).toContain("Step 2 of 5 · Service");
        expect(text()).toContain("What are they booking?");
        expect(text()).toContain("45 min · one person");
        expect(text()).toContain("60 min · group class, 8 places");
        expect(text()).toContain("₹800");

        await press(choice("Physio assessment"));
        expect(foot().textContent).toBe("Next: who they'll see");
        await press(foot());
        await settle();
        expect(text()).toContain("Who will they see?");
        expect(choice("Anyone free").getAttribute("aria-checked")).toBe("true");
        expect(text()).toContain("Physiotherapist · next free today, 12:15 pm");
        expect(text()).toContain(
            "Only people who do Physio assessment are shown.",
        );
        await press(choice("Meera Iyer"));
        await press(foot());
        await settle();

        expect(text()).toContain("Step 4 of 5 · Day and time");
        await press(choice(/^Tue 20 Oct/));
        await settle();
        await press(choice(/^10:00 am/));
        expect(foot().textContent).toBe("Next: check and book");
        await press(foot());

        expect(text()).toContain("Step 5 of 5 · Check and book");
        expect(text()).toContain("Zara Ahmed");
        expect(text()).toContain("+91 90000 54321");
        expect(text()).toContain("Tue 20 Oct, 10:00 am");
        expect(text()).toContain("Ends 10:45 am");
        expect(choice("Pays at the visit").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(text()).toContain(
            "Zara Ahmed · Physio assessment · with Meera Iyer · pays at the visit",
        );
        expect(foot().textContent).toBe("Book Zara · Tue 20, 10:00 am");

        await press(foot());
        expect(bookByHand).toHaveBeenCalledWith(
            ASSESS.id,
            expect.objectContaining({
                startAt: at("2026-10-20T10:00"),
                staffId: "p_meera",
                paidWith: "DESK",
                bookerName: "Zara Ahmed",
                bookerPhone: "+91 90000 54321",
            }),
        );
        expect(text()).toContain("Zara is booked");
        // The keyboard starts at what happened.
        expect(document.activeElement?.textContent).toBe("Zara is booked");
        expect(text()).toContain("With Meera on Tue 20 Oct at 10:00 am");
        expect(text()).toContain("Tue 20 Oct, 10:00 to 10:45 am · IST");
        expect(text()).toContain("Pays at the visit · ₹800");
        const wa = sheet().querySelector<HTMLAnchorElement>(
            'a[href^="https://wa.me/"]',
        );
        expect(wa?.textContent).toContain("Send confirmation on WhatsApp");
        expect(wa?.getAttribute("href")).toContain("wa.me/919000054321?text=");
        expect(decodeURIComponent(wa?.getAttribute("href") ?? "")).toContain(
            "Hi Zara, you're booked for Physio assessment with Meera on Tue 20 Oct at 10:00 am (IST) at Kaya Physio. Pay ₹800 at the visit.",
        );
        const sms = sheet().querySelector<HTMLAnchorElement>('a[href^="sms:"]');
        expect(sms?.textContent).toContain("Send it by SMS");
        expect(sms?.getAttribute("href")).toContain("sms:+919000054321?&body=");
        expect(button(/Copy message/)).toBeTruthy();
        expect(
            sheet().querySelector('a[href="/bookings/bk_1"]')?.textContent,
        ).toContain("View booking");
        expect(refresh).toHaveBeenCalled();
    });

    it("the front desk books, with money out of reach and why (DEC-170)", async () => {
        await open({
            people: {
                canSearch: true,
                payLink: false,
                canTakePayment: false,
                onlinePay: true,
            },
        });
        expect(text()).toContain("You're booking as front desk.");
        await toCheck();
        expect(choice("Paid now").disabled).toBe(true);
        expect(choice("Send a payment link").disabled).toBe(true);
        expect(text()).toContain("Your role can't take payments.");
        await press(foot());
        expect(bookByHand).toHaveBeenCalledWith(
            ASSESS.id,
            expect.objectContaining({ paidWith: "DESK" }),
        );
        expect(text()).toContain("Kabir is booked");
    });
});

describe("New booking, each state", { timeout: 15_000 }, () => {
    it("finds an existing customer by phone and shows their Needs attention", async () => {
        readCustomerAttention.mockResolvedValue({
            entries: [
                {
                    id: "a1",
                    kind: "ALLERGY",
                    label: "Latex",
                    sensitive: false,
                },
            ],
            hiddenSensitiveCount: 0,
        });
        await open();
        typeInto(search(), "12345");
        await settle();
        expect(findCustomers).toHaveBeenLastCalledWith("12345");
        await press(customer("Kabir Singh"));
        await settle();
        expect(text()).toContain("Step 2 of 5");
        // The choices so far, as chips that change them (phone header).
        expect(button("Change Kabir Singh")).toBeTruthy();
        await press(choice("Physio assessment"));
        await press(foot());
        await press(foot());
        await press(choice(/^Tue 20 Oct/));
        await press(choice(/^10:00 am/));
        await press(foot());
        expect(text()).toContain("Needs attention: Allergy: Latex");
        expect(text()).toContain("+91 90000 12345");
    });

    it("says what is missing on each step, and adds nobody without a phone", async () => {
        await open({ services: [ASSESS] });
        await press(foot());
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Pick who it's for, or add them.",
        );
        typeInto(search(), "Zara");
        await settle();
        await press(button(/Add “Zara” as a new customer/));
        await press(foot());
        await settle();
        expect(text()).toContain("Add their phone number.");
        expect(text()).toContain("Step 1 of 5");
        expect(bookByHand).not.toHaveBeenCalled();
    });

    it("the only service is picked; one person needs no choosing", async () => {
        await open({
            services: [ASSESS],
            staff: STAFF.slice(0, 1),
        });
        await press(customer("Kabir Singh"));
        expect(choice("Physio assessment").getAttribute("aria-checked")).toBe(
            "true",
        );
        // Who they'll see is skipped: Meera is the only one.
        expect(foot().textContent).toBe("Next: day and time");
        await press(foot());
        expect(text()).toContain("Step 4 of 5");
    });

    it("Anyone free names who each time is with, and books them", async () => {
        await open();
        await press(customer("Kabir Singh"));
        await press(choice("Physio assessment"));
        await press(foot());
        await press(foot());
        await press(choice(/^Tue 20 Oct/));
        await settle();
        const eleven = choice(/^11:00 am/);
        expect(eleven.textContent).toContain("Arjun");
        await press(eleven);
        await press(foot());
        expect(text()).toContain("Arjun Rao (anyone free)");
        await press(foot());
        expect(bookByHand).toHaveBeenCalledWith(
            ASSESS.id,
            expect.objectContaining({ staffId: "p_arjun" }),
        );
        expect(text()).toContain("With Arjun on Tue 20 Oct at 11:00 am");
    });

    it("a closed day has no times, says why, and offers the next free day", async () => {
        await open();
        await press(customer("Kabir Singh"));
        await press(choice("Physio assessment"));
        await press(foot());
        await press(foot());
        await press(choice(/^Sun 25 Oct/));
        await settle();
        expect(text()).toContain("No free times on Sun 25 Oct");
        expect(text()).toContain("You're closed on Sundays.");
        expect(button(/Next free day/).textContent).toContain("Mon 26 Oct");
        await press(foot());
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Pick a time.",
        );
    });

    it("a time taken meanwhile brings it back to the times, saying so", async () => {
        bookByHand.mockResolvedValueOnce({
            ok: false,
            error: "That time is no longer available. Pick another time.",
            field: "startAt",
        });
        await open();
        await toCheck();
        const reads = listAvailability.mock.calls.length;
        await press(foot());
        await settle();
        expect(text()).toContain("Step 4 of 5 · Day and time");
        expect(text()).toContain(
            "10:00 am was just booked by someone else. Pick another time.",
        );
        expect(listAvailability.mock.calls.length).toBeGreaterThan(reads);
        // A new attempt: a fresh key, so the next Book isn't a replay.
        const first = (
            bookByHand.mock.calls[0]?.[1] as { idempotencyKey: string }
        ).idempotencyKey;
        await press(choice(/^Tue 20 Oct/));
        await press(choice(/^9:00 am/));
        await press(foot());
        await press(foot());
        const second = (
            bookByHand.mock.calls[1]?.[1] as { idempotencyKey: string }
        ).idempotencyKey;
        expect(second).not.toBe(first);
        expect(text()).toContain("Kabir is booked");
    });

    it("a group class skips With, shows places left, and books its teacher", async () => {
        await open();
        await press(customer("Kabir Singh"));
        await press(choice("Mat Pilates"));
        expect(foot().textContent).toBe("Next: day and time");
        await press(foot());
        await settle();
        await press(choice(/^Tue 20 Oct/));
        await settle();
        expect(choice(/^7:00 am/).textContent).toContain("4 places left");
        expect(choice(/^6:00 pm/).textContent).toContain("2 places left");
        await press(choice(/^7:00 am/));
        await press(foot());
        expect(text()).toContain("Neha Kapoor");
        expect(text()).toContain("Teaches this class");
        await press(foot());
        const sent = bookByHand.mock.calls[0]?.[1] as Record<string, unknown>;
        expect(sent).not.toHaveProperty("staffId");
        expect(text()).toContain("With Neha on Tue 20 Oct at 7:00 am");
    });

    it("offers the customer's class pack, ticked, and spends it", async () => {
        packsFor.mockResolvedValue([
            {
                id: "pp_1",
                pack: { id: "pk_1", name: "Pilates 10" },
                contact: { id: FARAH.id, name: "Farah Khan", email: "" },
                credits: 10,
                used: 6,
                left: 4,
                standing: "ACTIVE",
                price: "5000",
                currency: "INR",
                expiresAt: "2027-01-01T00:00:00.000Z",
                invoiceId: null,
                createdAt: "2026-09-01T00:00:00.000Z",
            },
        ]);
        await open();
        typeInto(search(), "Farah");
        await settle();
        await press(customer("Farah Khan"));
        await press(choice("Mat Pilates"));
        await press(foot());
        await press(choice(/^Tue 20 Oct/));
        await press(choice(/^7:00 am/));
        await press(foot());
        await settle();
        expect(text()).toContain("Use Farah's class pack");
        expect(text()).toContain("Pilates 10 · 4 left");
        expect(text()).toContain("3 after this. Cancelling gives it back.");
        expect(text()).not.toContain("How will they pay?");
        await press(foot());
        expect(bookByHand).toHaveBeenCalledWith(
            PILATES.id,
            expect.objectContaining({ packPurchaseId: "pp_1" }),
        );
        expect(text()).toContain("From Farah's class pack");
    });

    it("says when the customer's class packs couldn't be read, and reads again", async () => {
        packsFor.mockRejectedValueOnce(new Error("offline"));
        await open();
        typeInto(search(), "Farah");
        await settle();
        await press(customer("Farah Khan"));
        await press(choice("Mat Pilates"));
        await press(foot());
        await press(choice(/^Tue 20 Oct/));
        await press(choice(/^7:00 am/));
        await press(foot());
        await settle();
        expect(text()).toContain("Couldn't check Farah's class packs.");
        const again = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent === "Try again",
        );
        await press(again ?? null);
        await settle();
        expect(packsFor).toHaveBeenCalledTimes(2);
        expect(text()).not.toContain("Couldn't check Farah's class packs.");
    });

    it("leaves off a service only customers book, and says so when that is all", async () => {
        await open({ services: [ONLINE_ONLY] });
        await press(customer("Kabir Singh"));
        expect(text()).toContain("No service your team can book");
        expect(text()).toContain("Tick Your team under Who can book it");
        expect(sheet().querySelector('a[href="/services"]')?.textContent).toBe(
            "Open Services",
        );
    });

    it("says the API's refusal where the choice is (the team can't book it)", async () => {
        bookByHand.mockResolvedValueOnce({
            ok: false,
            error: "Your team can't book Physio assessment. Tick Your team under Who can book it on the service to book it here.",
        });
        await open();
        await toCheck();
        await press(foot());
        expect(text()).toContain("Step 5 of 5");
        expect(text()).toContain("Your team can't book Physio assessment.");
    });

    it("no services yet: Add a service first, never a greyed button", async () => {
        await open({ services: [] });
        await press(customer("Kabir Singh"));
        expect(text()).toContain("Add a service first");
        expect(
            sheet().querySelector('a[href="/services/new"]')?.textContent,
        ).toBe("Add a service");
        await press(foot());
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Add a service first.",
        );
    });

    it("Paid now asks how, then records it (Cash, UPI, Card)", async () => {
        await open();
        await toCheck();
        await press(choice("Paid now"));
        await press(foot());
        expect(text()).toContain("Say how they paid: Cash, UPI or Card.");
        expect(bookByHand).not.toHaveBeenCalled();
        await press(choice(/^UPI$/));
        expect(text()).toContain("Record it once ₹800 shows on your UPI app.");
        await press(foot());
        expect(bookByHand).toHaveBeenCalledWith(
            ASSESS.id,
            expect.objectContaining({ paidWith: "PAID", paidBy: "UPI" }),
        );
        expect(text()).toContain("Paid by UPI · ₹800");
    });

    it("a payment link: the done screen has it to copy, and the message carries it", async () => {
        await open();
        await toCheck();
        await press(choice("Send a payment link"));
        await press(foot());
        await settle();
        expect(createBookingPayLink).toHaveBeenCalledWith("bk_1");
        expect(text()).toContain("Awaiting payment · ₹800");
        const link = sheet().querySelector<HTMLInputElement>(
            "[data-pay-link] input",
        );
        expect(link?.value).toBe("https://pay.example.com/l/kaya-7Q2X9");
        expect(text()).toContain("Send it to Kabir however you talk.");
        expect(button(/Copy link/)).toBeTruthy();
        const wa = sheet().querySelector('a[href^="https://wa.me/"]');
        expect(decodeURIComponent(wa?.getAttribute("href") ?? "")).toContain(
            "Pay ₹800 here: https://pay.example.com/l/kaya-7Q2X9",
        );
    });

    it("opens on the day it was asked for (Book on this day)", async () => {
        await open({}, { date: "2026-10-22" });
        expect(text()).toContain("Step 1 of 5");
        await press(customer("Kabir Singh"));
        await press(choice("Physio assessment"));
        await press(foot());
        await press(foot());
        await settle();
        expect(choice(/^Thu 22 Oct/).getAttribute("aria-checked")).toBe("true");
        expect(choice(/^9:30 am/)).toBeTruthy();
    });

    it("someone it can't be booked for is said at Book, never a Book that does nothing", async () => {
        await open({}, { who: { kind: "walk-in", name: "Ravi", phone: "" } });
        await press(choice("Physio assessment"));
        await press(foot());
        await press(foot());
        await settle();
        await press(choice(/^Tue 20 Oct/));
        await settle();
        await press(choice(/^9:00 am/));
        await press(foot());
        await settle();
        await press(foot());
        await settle();
        expect(bookByHand).not.toHaveBeenCalled();
        expect(text()).toContain("Pick who it's for, or add them.");
    });

    it("from a customer's page, starts at what they are booking", async () => {
        await open(
            {},
            {
                who: {
                    kind: "contact",
                    id: KABIR.id,
                    name: "Kabir Singh",
                    email: null,
                    phone: KABIR.phone,
                },
            },
        );
        expect(text()).toContain("Step 2 of 5 · Service");
    });

    it("Book their next visit: the day and time, the rest set, no day picked (Q16)", async () => {
        await open(
            {},
            {
                who: {
                    kind: "contact",
                    id: KABIR.id,
                    name: "Kabir Singh",
                    email: null,
                    phone: KABIR.phone,
                },
                serviceId: ASSESS.id,
                staffId: "p_meera",
                nextVisit: true,
            },
        );
        expect(text()).toContain("Step 4 of 5 · Day and time");
        expect(button("Change Kabir Singh")).toBeTruthy();
        expect(button("Change Physio assessment")).toBeTruthy();
        expect(button("Change Meera")).toBeTruthy();
        expect(choice("Tomorrow · Tue 20")).toBeTruthy();
        expect(choice("Next week · Mon 26")).toBeTruthy();
        expect(choice("Pick a date")).toBeTruthy();
        expect(text()).toContain("Same service and person as today.");
        await press(foot());
        expect(sheet().querySelector('[role="alert"]')?.textContent).toBe(
            "Pick a day.",
        );
        await press(choice("Tomorrow · Tue 20"));
        await settle();
        await press(choice(/^10:00 am/));
        await press(foot());
        expect(text()).toContain("Tue 20 Oct, 10:00 am");
        expect(text()).toContain("Meera Iyer");
    });

    it("jumps back from the check card, the step list and Back", async () => {
        await open();
        await toCheck();
        await press(button("Change who"));
        expect(text()).toContain("Step 1 of 5");
        await press(customer("Kabir Singh"));
        expect(text()).toContain("Step 2 of 5");
        // The desk's step list: an earlier step is a way back to it.
        await press(button("Who: Kabir Singh. Change"));
        expect(text()).toContain("Step 1 of 5");
        await press(foot());
        await press(foot());
        expect(text()).toContain("Step 3 of 5");
        await press(button("Back"));
        expect(text()).toContain("Step 2 of 5");
    });

    it("Enter in the new customer's card adds and uses them", async () => {
        await open();
        typeInto(search(), "Zara Ahmed");
        await settle();
        await press(button(/Add “Zara Ahmed” as a new customer/));
        typeInto(field("Phone"), "90000 54321");
        // Enter in a field submits the sheet's form: its one button.
        await act(async () => {
            sheet().querySelector("form")?.requestSubmit();
            await Promise.resolve();
        });
        await settle();
        expect(text()).toContain("Step 2 of 5 · Service");
    });

    it("the keyboard follows the question as the steps move", async () => {
        await open();
        // Open, it starts in the search.
        expect(document.activeElement?.getAttribute("aria-label")).toBe(
            "Find the customer",
        );
        await press(customer("Kabir Singh"));
        expect(document.activeElement?.textContent).toBe(
            "What are they booking?",
        );
    });

    it("closing with something chosen asks first; Keep booking keeps it", async () => {
        await open();
        await press(customer("Kabir Singh"));
        await press(button("Close"));
        const ask = document.querySelector('[role="alertdialog"]');
        expect(ask?.textContent).toContain("Discard what you typed?");
        await press(button("Keep booking", alertDialog()));
        expect(text()).toContain("Step 2 of 5");
        await press(button("Close"));
        await press(button("Discard", alertDialog()));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it("closing with nothing chosen just closes", async () => {
        await open();
        await press(button("Close"));
        expect(document.querySelector('[role="alertdialog"]')).toBeNull();
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it("Add another booking starts again, and Done closes", async () => {
        await open();
        await toCheck();
        await press(foot());
        await press(button(/Add another booking/));
        await settle();
        expect(text()).toContain("Step 1 of 5 · Customer");
        await press(customer("Kabir Singh"));
        await press(button("Close"));
        await press(button("Discard", alertDialog()));
        expect(document.querySelector('[role="dialog"]')).toBeNull();
    });

    it("opened by the address, closing leaves the address", async () => {
        await open({}, { date: "2026-10-22" });
        await press(button("Close"));
        expect(replace).toHaveBeenCalled();
    });
});
