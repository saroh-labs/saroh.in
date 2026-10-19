// @vitest-environment jsdom
/**
 * New and edit service (U16, #1032), at a desk and on a phone.
 *
 * New service:
 * - five plain questions, and a live line saying whether customers could
 *   book it, for each "Who can book it" mix (neither is paused);
 * - pressing Add with gaps says how many and which, each at its field,
 *   and puts the keyboard on the first;
 * - More details keeps every field, a row each opening its own panel; its
 *   own hours use the 12-hour editor of Hours and time off;
 * - a name another service has says so, with the way to it;
 * - Discard asks "Discard what you typed?";
 * - one Add in up to three calls: the service, who does it, its hours.
 *
 * A saved service:
 * - "Who can book it" ticks save as they are pressed, with Undo;
 * - three cards, each opening its panel with one Save; a new length says
 *   what bookings already made keep;
 * - More: Pause, and Delete whose confirm offers "Pause it instead";
 * - a Member reads it, and changes nothing.
 *
 * `react-dom/client` + `act` directly, as the editor's other tests do.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AvailabilityRule, Service } from "@/lib/services/service";
import type { StaffView } from "@/lib/staff/types";

import { ServiceEditor } from "./service-editor";

vi.setConfig({ testTimeout: 20_000 });

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    unstable_rethrow: () => undefined,
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...rest
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));
const guard = { release: vi.fn() };
vi.mock("@/components/shared/use-leave-guard", () => ({
    useLeaveGuard: () => ({ dialog: null, release: guard.release }),
    lostNew: (noun: string) => `The ${noun} isn't created yet.`,
}));
vi.mock("@/lib/hooks/keyboard-save", () => ({
    useSaveShortcut: () => undefined,
    submitOnModEnter: () => undefined,
}));

const api = {
    createService: vi.fn(),
    updateService: vi.fn(),
    replaceRules: vi.fn(),
    archiveService: vi.fn(),
    setStaffServices: vi.fn(),
};
vi.mock("@/lib/services/actions", () => ({
    createService: (...a: unknown[]) => api.createService(...a) as unknown,
    updateService: (...a: unknown[]) => api.updateService(...a) as unknown,
    replaceRules: (...a: unknown[]) => api.replaceRules(...a) as unknown,
    archiveService: (...a: unknown[]) => api.archiveService(...a) as unknown,
}));
vi.mock("@/lib/staff/actions", () => ({
    setStaffServices: (...a: unknown[]) =>
        api.setStaffServices(...a) as unknown,
}));

const toast = { showError: vi.fn(), showSuccess: vi.fn(), showUndo: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
    showUndo: (...a: unknown[]) => toast.showUndo(...a) as unknown,
}));

const OPENING = [
    { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
    { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
];

const service = (over: Partial<Service> = {}): Service => ({
    id: "sv_1",
    organizationId: "org_1",
    siteId: null,
    name: "Physio assessment",
    description: "A first visit.",
    durationMinutes: 45,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    capacity: 1,
    priceCents: 120_000,
    currency: "INR",
    gstRate: null,
    sacCode: null,
    timezone: "Asia/Kolkata",
    status: "ACTIVE",
    locationType: "IN_PERSON",
    meetingUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    visits: 1,
    depositMode: "NONE",
    depositCents: 0,
    showOnBookingPage: true,
    bookableByTeam: true,
    ...over,
});

const person = (over: Partial<StaffView> = {}): StaffView => ({
    id: "st_meera",
    name: "Meera Iyer",
    title: "Physiotherapist",
    status: "ACTIVE",
    membership: null,
    serviceIds: [],
    hours: [],
    weeklyMinutes: 0,
    extraHours: [],
    timeOff: [],
    ...over,
});
const MEERA = person();
const ARJUN = person({ id: "st_arjun", name: "Arjun Rao", title: null });
const NEHA = person({ id: "st_neha", name: "Neha Kapoor", title: null });

let root: Root;
let host: HTMLDivElement;

function size(phone: boolean) {
    window.matchMedia = ((query: string) => ({
        matches: phone && query.includes("max-width: 759px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    size(false);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        ...Object.values(api),
        ...Object.values(toast),
        ...Object.values(router),
        guard.release,
    ]) {
        fn.mockReset();
    }
    api.createService.mockResolvedValue({ ok: true, data: { id: "sv_new" } });
    api.updateService.mockResolvedValue({ ok: true, data: {} });
    api.replaceRules.mockResolvedValue({ ok: true, data: [] });
    api.archiveService.mockResolvedValue({ ok: true, data: {} });
    api.setStaffServices.mockResolvedValue({ ok: true, data: {} });
    Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function open({
    saved = null,
    rules = [],
    staff = [MEERA, ARJUN, NEHA],
    openingHours = OPENING,
    usage = { thisWeek: 6, comingUp: 9 },
    canEdit = true,
    hasPage = true,
    others = [],
}: {
    saved?: Service | null;
    rules?: AvailabilityRule[] | null;
    staff?: StaffView[] | null;
    openingHours?: typeof OPENING | null;
    usage?: { thisWeek: number; comingUp: number };
    canEdit?: boolean;
    hasPage?: boolean | null;
    others?: { id: string; name: string }[];
} = {}) {
    act(() =>
        root.render(
            <ServiceEditor
                service={saved}
                rules={rules}
                staff={staff}
                usage={usage}
                currency="INR"
                timezone="Asia/Kolkata"
                openingHours={openingHours}
                canEdit={canEdit}
                hasPage={hasPage}
                others={others}
            />,
        ),
    );
}

const settle = async () => {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
};

const text = () => document.body.textContent;

/** What a query found, or the test stops there. */
function must<T>(found: T | null | undefined): T {
    if (found === null || found === undefined) throw new Error("Not found");
    return found;
}

function buttonIn(scope: ParentNode, name: string): HTMLButtonElement {
    const found = Array.from(
        scope.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!found) throw new Error(`No "${name}" button`);
    return found;
}
const button = (name: string) => buttonIn(document.body, name);

async function press(el: HTMLElement) {
    act(() => el.click());
    await settle();
}

function field(label: string, scope: ParentNode = document.body) {
    const named = Array.from(scope.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === label,
    );
    const el = named
        ? document.querySelector<HTMLInputElement>(`[id="${named.htmlFor}"]`)
        : null;
    if (!el) throw new Error(`No "${label}" field`);
    return el;
}

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    act(() => {
        const proto =
            el instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

/** A tick by its words. */
function tick(words: string, scope: ParentNode = document.body) {
    const label = Array.from(scope.querySelectorAll("label")).find((l) =>
        l.textContent.includes(words),
    );
    const box = label?.querySelector<HTMLButtonElement>('[role="checkbox"]');
    if (!box) throw new Error(`No "${words}" tick`);
    return box;
}

/** On a phone, More details opens under the questions. */
const moreDetails = () => {
    const found = Array.from(
        host.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"),
    ).find((b) => b.textContent.startsWith("More details"));
    if (!found) throw new Error("No More details");
    return found;
};

/** A frame: what `requestAnimationFrame` waits for. */
const frame = () =>
    act(async () => {
        await new Promise((r) => setTimeout(r, 40));
    });

const live = () =>
    document.querySelector("[data-live]")?.textContent.trim() ?? "";

const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');

async function openDetail(label: string) {
    const row = Array.from(
        host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent.startsWith(label));
    if (!row) throw new Error(`No "${label}" row`);
    await press(row);
}

async function openMenu() {
    const trigger = host.querySelector<HTMLButtonElement>(
        '[aria-haspopup="menu"]',
    );
    await act(async () => {
        trigger?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        await new Promise((r) => setTimeout(r, 20));
    });
}

const menuItem = (name: string) => {
    const item = Array.from(
        document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ).find((i) => i.textContent.trim() === name);
    if (!item) throw new Error(`No "${name}" item`);
    return item;
};

function fillNew() {
    type(field("What is it called?"), "Dry needling");
    type(field("Price"), "1200");
    act(() => tick("Meera Iyer").click());
}

describe.each([
    ["desk", false],
    ["phone", true],
] as const)("New service, at a %s", (_size, phone) => {
    beforeEach(() => size(phone));

    it("asks five plain questions, with the usual lengths as chips", () => {
        open();
        for (const q of [
            "What is it called?",
            "Who comes?",
            "How long does it take?",
            "Price",
            "Who does it?",
        ]) {
            expect(text()).toContain(q);
        }
        const kinds = Array.from(host.querySelectorAll('[role="radio"]')).map(
            (r) => r.textContent.trim(),
        );
        expect(kinds).toEqual(
            expect.arrayContaining([
                "One person",
                "A group class",
                "15 min",
                "30 min",
                "45 min",
                "60 min",
                "90 min",
                "Other",
            ]),
        );
        expect(field("Price").getAttribute("placeholder")).toBe(
            "0 if it's free",
        );
        // A group class asks how many places, from 8.
        act(() =>
            Array.from(host.querySelectorAll<HTMLElement>('[role="radio"]'))
                .find((r) => r.textContent.trim() === "A group class")
                ?.click(),
        );
        expect(field("How many places?").value).toBe("8");
        expect(text()).toContain("Add service");
    });

    it("says it is not bookable yet, and what is missing, until it is", () => {
        open();
        expect(live()).toContain(
            "Not bookable yet: add a name and a price, then pick who does it.",
        );
        type(field("What is it called?"), "Dry needling");
        type(field("Price"), "0");
        expect(live()).toContain("Not bookable yet: pick who does it.");
        act(() => tick("Meera Iyer").click());
        expect(live()).toContain(
            "Customers can book this on your booking page, in Meera's free time, as soon as you add it.",
        );
    });

    it("says who can book it for each mix of the two ticks; neither is paused", async () => {
        open();
        fillNew();
        if (phone) await press(moreDetails());
        expect(
            tick("Customers, on your booking page").getAttribute(
                "aria-checked",
            ),
        ).toBe("true");
        expect(
            tick("Your team, from Bookings").getAttribute("aria-checked"),
        ).toBe("true");

        // Customers only.
        act(() => tick("Your team, from Bookings").click());
        expect(live()).toContain(
            "Customers can book this on your booking page, in Meera's free time, as soon as you add it. Your team can't book it from Bookings.",
        );
        expect(text()).toContain("Customers only");

        // Team only.
        act(() => tick("Your team, from Bookings").click());
        act(() => tick("Customers, on your booking page").click());
        expect(live()).toContain(
            "Only your team can book this, from Bookings. It's not on your booking page.",
        );
        expect(text()).toContain("Team only");

        // Neither: paused, with the one line.
        act(() => tick("Your team, from Bookings").click());
        expect(live()).toContain(
            "Paused: nobody can book it until you tick who can.",
        );
        expect(text()).toContain("Paused");
        expect(text()).toContain(
            "Untick both to pause it. Bookings already made stay.",
        );

        await press(button("Add service"));
        expect(api.createService).toHaveBeenCalledWith(
            expect.objectContaining({
                showOnBookingPage: false,
                bookableByTeam: false,
            }),
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Dry needling added, paused. Tick who can book it when you're ready.",
        );
    });

    it("pressing Add with gaps says how many and which, at each field, and goes to the first", async () => {
        open();
        await press(button("Add service"));
        expect(text()).toContain(
            "3 things to fill in before it can be added: a name, a price (0 if it's free), and who does it.",
        );
        expect(text()).toContain("Add a name.");
        expect(text()).toContain("Add a price, or 0 if it's free.");
        expect(text()).toContain("Pick who does it.");
        await frame();
        expect(document.activeElement).toBe(field("What is it called?"));
        expect(api.createService).not.toHaveBeenCalled();
        // The button is never off for it.
        expect(button("Add service").disabled).toBe(false);
    });

    it("keeps every other field under More details, a row each", async () => {
        open();
        if (phone) {
            // On a phone it opens under the questions, in their place.
            const more = moreDetails();
            expect(more.getAttribute("aria-expanded")).toBe("false");
            await press(more);
            expect(more.getAttribute("aria-expanded")).toBe("true");
        }
        for (const row of [
            "What to tell customers",
            "Break after",
            "Break before",
            "Where",
            "Visits in a package",
            "When it can be booked",
            "At booking, they pay",
            "GST and SAC code",
            "Time zone",
        ]) {
            expect(text()).toContain(row);
        }
        await openDetail("Break after");
        expect(panel()?.textContent).toContain("Break after");
        type(field("Break after (min)"), "20");
        await press(buttonIn(must(panel()), "Use this"));
        expect(panel()).toBeNull();
        expect(text()).toContain("20 min kept free after each visit");
    });

    it("gives it hours of its own in the 12-hour editor of Hours and time off", async () => {
        // Nobody does it: its own hours are what give it times, from the
        // business's opening hours.
        open({ staff: [] });
        if (phone) await press(moreDetails());
        await openDetail("When it can be booked");
        const sheet = must(panel());
        expect(sheet.textContent).toContain("When it can be booked");
        expect(sheet.textContent).toContain("9:00 am to 6:00 pm");
        expect(sheet.textContent).toContain(
            "Times are 12-hour, in 15-minute steps",
        );
        // A window opens to its day and two 12-hour pickers.
        await press(buttonIn(sheet, "Monday9:00 am to 6:00 pm"));
        expect(sheet.textContent).toContain("Opens");
        expect(sheet.textContent).toContain("Closes");
        await press(
            must(
                Array.from(
                    sheet.querySelectorAll<HTMLButtonElement>("button"),
                ).find((b) => b.textContent.startsWith("Closes")),
            ),
        );
        await press(buttonIn(sheet, "7 o'clock"));
        expect(sheet.textContent).toContain("9:00 am to 7:00 pm");
        await press(buttonIn(sheet, "Use these hours"));

        type(field("What is it called?"), "Open gym");
        type(field("Price"), "0");
        await press(button("Add service"));
        expect(api.replaceRules).toHaveBeenCalledWith("sv_new", [
            { dayOfWeek: 1, startMinute: 540, endMinute: 1140 },
            { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
        ]);
        expect(router.replace).toHaveBeenCalledWith("/services/sv_new");
    });

    it("says a name another service has, with the way to it, and won't add it", async () => {
        open({ others: [{ id: "sv_9", name: "Physio assessment" }] });
        type(field("What is it called?"), "physio assessment ");
        expect(text()).toContain("You already have Physio assessment. Open it");
        const link = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent === "Open it",
        );
        expect(link?.getAttribute("href")).toBe("/services/sv_9");
        type(field("Price"), "100");
        act(() => tick("Meera Iyer").click());
        await press(button("Add service"));
        expect(api.createService).not.toHaveBeenCalled();
    });

    it("asks 'Discard what you typed?' before dropping what was typed", async () => {
        open();
        type(field("What is it called?"), "Dry needling");
        await press(button("Discard"));
        const ask = document.querySelector('[role="alertdialog"]');
        expect(ask?.textContent).toContain("Discard what you typed?");
        await press(buttonIn(ask as HTMLElement, "Discard"));
        expect(guard.release).toHaveBeenCalled();
        expect(router.push).toHaveBeenCalledWith("/services");
    });
});

describe("New service, adding it", () => {
    it("adds the service, who does it, and opens its own page", async () => {
        open();
        fillNew();
        await press(button("Add service"));
        expect(api.createService).toHaveBeenCalledWith(
            expect.objectContaining({
                name: "Dry needling",
                durationMinutes: 60,
                bufferAfterMinutes: 15,
                priceCents: 120_000,
                showOnBookingPage: true,
                bookableByTeam: true,
            }),
        );
        expect(api.setStaffServices).toHaveBeenCalledWith("st_meera", [
            "sv_new",
        ]);
        // Someone does it: no hours of its own to send.
        expect(api.replaceRules).not.toHaveBeenCalled();
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Dry needling added. Customers can book it in the free time of who does it.",
        );
        expect(router.replace).toHaveBeenCalledWith("/services/sv_new");
    });

    it("says it was added and its hours were not, stays, and Try again sends only the hours", async () => {
        api.replaceRules.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the availability.",
        });
        open({ staff: [] });
        type(field("What is it called?"), "Open gym");
        type(field("Price"), "0");
        await press(button("Add service"));
        expect(text()).toContain(
            "Open gym was added, but its weekly hours were not saved.",
        );
        expect(router.replace).not.toHaveBeenCalled();

        await press(button("Try again"));
        expect(api.createService).toHaveBeenCalledTimes(1);
        expect(api.replaceRules).toHaveBeenCalledTimes(2);
        expect(router.replace).toHaveBeenCalledWith("/services/sv_new");
    });
});

describe.each([
    ["desk", false],
    ["phone", true],
] as const)("A saved service, at a %s", (_size, phone) => {
    beforeEach(() => size(phone));
    const saved = service();
    const staff = [person({ serviceIds: ["sv_1"] }), ARJUN];

    it("leads with Who can book it; each tick saves at once, with Undo", async () => {
        open({ saved, staff });
        expect(text()).toContain("Customers and team");
        expect(text()).toContain(
            "Customers book it on your booking page, and your team books it from Bookings. 9 bookings to come.",
        );
        await press(tick("Your team, from Bookings"));
        expect(api.updateService).toHaveBeenCalledWith("sv_1", {
            status: "ACTIVE",
            showOnBookingPage: true,
            bookableByTeam: false,
        });
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Physio assessment: only customers can book it now, on your booking page.",
            expect.any(Function),
        );
        expect(text()).toContain("Your team can't book it from Bookings.");
        expect(text()).toContain("Customers only");
    });

    it("reads as three cards, each opening its own panel", async () => {
        open({ saved, staff });
        for (const card of ["What it is", "Time and place", "Money"]) {
            expect(text()).toContain(card);
        }
        if (phone) {
            // A row's pencil opens its card's panel.
            const row = Array.from(
                host.querySelectorAll<HTMLButtonElement>("button"),
            ).find((b) =>
                (b.getAttribute("aria-label") ?? "").startsWith("How long:"),
            );
            await press(must(row));
        } else {
            await press(button("Edit Time and place"));
        }
        const sheet = must(panel());
        expect(sheet.textContent).toContain("Time and place");
        expect(sheet.textContent).toContain("Physio assessment");
        // Keyboard: it starts in the panel's first field.
        expect(sheet.contains(document.activeElement)).toBe(true);
    });

    it("a new length says what bookings already made keep, and saves", async () => {
        open({ saved, staff });
        if (phone) {
            await press(
                must(
                    Array.from(
                        host.querySelectorAll<HTMLButtonElement>("button"),
                    ).find((b) =>
                        (b.getAttribute("aria-label") ?? "").startsWith(
                            "How long:",
                        ),
                    ),
                ),
            );
        } else {
            await press(button("Edit Time and place"));
        }
        const sheet = must(panel());
        await press(
            must(
                Array.from(
                    sheet.querySelectorAll<HTMLElement>('[role="radio"]'),
                ).find((r) => r.textContent.trim() === "60 min"),
            ),
        );
        expect(sheet.textContent).toContain(
            "With the 15 min break after, each visit takes 60 min + 15 min break of Meera's time. 9 bookings already made keep 45 min.",
        );
        await press(buttonIn(sheet, "Save"));
        expect(api.updateService).toHaveBeenCalledWith(
            "sv_1",
            expect.objectContaining({ durationMinutes: 60 }),
        );
        expect(api.updateService.mock.calls[0]?.[1]).not.toHaveProperty(
            "showOnBookingPage",
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Saved: 60 min. New bookings use it, and 9 already made keep 45 min.",
        );
        expect(panel()).toBeNull();
    });

    it("More pauses it: both ticks off, with Undo", async () => {
        open({ saved, staff });
        await openMenu();
        await press(menuItem("Pause: untick both, nobody can book it"));
        expect(api.updateService).toHaveBeenCalledWith("sv_1", {
            showOnBookingPage: false,
            bookableByTeam: false,
        });
        expect(text()).toContain(
            "Untick both to pause it. Bookings already made stay.",
        );
    });

    it("Delete asks first, and offers Pause it instead", async () => {
        open({ saved, staff });
        await openMenu();
        await press(menuItem("Delete service"));
        const ask = must(document.querySelector('[role="alertdialog"]'));
        expect(ask.textContent).toContain("Delete Physio assessment?");
        expect(ask.textContent).toContain(
            "To stop bookings for a while, untick both under Who can book it instead.",
        );
        await press(buttonIn(ask, "Pause it instead"));
        expect(api.archiveService).not.toHaveBeenCalled();
        expect(api.updateService).toHaveBeenCalledWith("sv_1", {
            showOnBookingPage: false,
            bookableByTeam: false,
        });

        await openMenu();
        await press(menuItem("Delete service"));
        await press(
            buttonIn(
                must(document.querySelector('[role="alertdialog"]')),
                "Delete service",
            ),
        );
        expect(api.archiveService).toHaveBeenCalledWith("sv_1");
        expect(router.push).toHaveBeenCalledWith("/services");
    });

    it("a Member reads it and changes nothing", async () => {
        open({ saved, staff, canEdit: false });
        expect(text()).toContain(
            "Your role can see services but not change them.",
        );
        expect(tick("Your team, from Bookings").disabled).toBe(true);
        expect(
            Array.from(host.querySelectorAll("button")).some((b) =>
                (b.getAttribute("aria-label") ?? "").startsWith("Edit "),
            ),
        ).toBe(false);
        await openMenu();
        expect(
            Array.from(document.querySelectorAll('[role="menuitem"]')).map(
                (i) => i.textContent.trim(),
            ),
        ).toEqual(["See its bookings"]);
    });
});
