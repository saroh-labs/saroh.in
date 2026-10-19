// @vitest-environment jsdom
/**
 * The Service Editor's one Save, which goes in more than one call: the
 * service, then its own weekly hours (`PUT …/rules`).
 *
 * - A new service starts from the business's opening hours where its own
 *   hours are what gives it times, and they are sent with Add service.
 * - When the service is saved and its hours are not, the page says exactly
 *   that, keeps the hours on screen and stays put, and Try again sends
 *   only the hours.
 * - A field says what is wrong once it is left, and Save puts the keyboard
 *   on the first field in error.
 *
 * And what the Bookings audit (12 Oct 2026) changed on the page:
 *
 * - "When it can be booked" is a card of its own after Time, not a "more"
 *   setting: the service's own hours, or whose hours it books in.
 * - The length is picked from chips, with Custom for any other.
 * - "Taking bookings" is a switch beside Save that acts at once, with Undo.
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

// The first test loads the whole page, which takes several seconds on a
// loaded machine (CI, 12 Oct 2026): past the default five, a timeout there
// fails it and leaves the page mounted for every test after.
vi.setConfig({ testTimeout: 20_000 });

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
    useRouter: () => router,
    // `runAction` passes Next's own interrupts on; a plain failure is not one.
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
vi.mock("@/components/shared/use-leave-guard", () => ({
    useLeaveGuard: () => ({ dialog: null }),
}));
vi.mock("@/lib/hooks/keyboard-save", () => ({
    useSaveShortcut: () => undefined,
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
const OPENING_RULES = [
    { dayOfWeek: 1, startMinute: 540, endMinute: 1080 },
    { dayOfWeek: 2, startMinute: 540, endMinute: 1080 },
];

const service = (over: Partial<Service> = {}): Service => ({
    id: "sv_1",
    organizationId: "org_1",
    siteId: null,
    name: "Glow facial",
    description: "",
    durationMinutes: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 10,
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

const rule = (dayOfWeek: number): AvailabilityRule => ({
    id: `r_${dayOfWeek}`,
    serviceId: "sv_1",
    dayOfWeek,
    startMinute: 600,
    endMinute: 960,
});

const person = (over: Partial<StaffView> = {}): StaffView => ({
    id: "st_1",
    name: "Asha",
    title: null,
    status: "ACTIVE",
    membership: null,
    serviceIds: [],
    hours: [],
    weeklyMinutes: 0,
    extraHours: [],
    timeOff: [],
    ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [...Object.values(api), ...Object.values(toast)]) {
        fn.mockReset();
    }
    for (const fn of Object.values(router)) fn.mockReset();
    api.createService.mockResolvedValue({ ok: true, data: { id: "sv_new" } });
    api.updateService.mockResolvedValue({ ok: true, data: {} });
    api.replaceRules.mockResolvedValue({ ok: true, data: [] });
    api.setStaffServices.mockResolvedValue({ ok: true, data: {} });
    // jsdom draws nothing, so there is nothing to scroll.
    Element.prototype.scrollIntoView = () => undefined;
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function open({
    saved = null,
    rules = [],
    staff = [],
    openingHours = OPENING,
    usage = { thisWeek: 0, comingUp: 0 },
    canEdit = true,
}: {
    saved?: Service | null;
    rules?: AvailabilityRule[] | null;
    staff?: StaffView[];
    openingHours?: typeof OPENING | null;
    usage?: { thisWeek: number; comingUp: number };
    canEdit?: boolean;
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
                hasPage
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

function button(name: string): HTMLButtonElement {
    const found = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!found) throw new Error(`No "${name}" button`);
    return found;
}

async function press(name: string) {
    act(() => button(name).click());
    await settle();
}

function field(label: string): HTMLInputElement {
    const named = Array.from(host.querySelectorAll("label")).find(
        (l) => l.textContent.trim() === label,
    );
    const el = named
        ? host.querySelector<HTMLInputElement>(`[id="${named.htmlFor}"]`)
        : null;
    if (!el) throw new Error(`No "${label}" field`);
    return el;
}

function type(el: HTMLInputElement, value: string) {
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
        )?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function leave(el: HTMLElement) {
    act(() => {
        el.focus();
        el.blur();
    });
}

/** The hours' rows, as the sentence their Remove button is named by. */
const windows = () =>
    Array.from(host.querySelectorAll("button"))
        .map((b) => b.getAttribute("aria-label") ?? "")
        .filter((name) => name.startsWith("Remove "));

const alerts = () =>
    Array.from(host.querySelectorAll('[role="alert"]')).map((a) =>
        a.textContent.trim(),
    );

function fillNew() {
    type(field("Name"), "Glow facial");
    type(field("Price"), "1200");
}

describe("a new service starts from the opening hours", () => {
    it("with nobody on the diary, its own hours are the business's opening hours, and say so", () => {
        open();
        expect(windows()).toEqual([
            "Remove Monday, 09:00 to 18:00",
            "Remove Tuesday, 09:00 to 18:00",
        ]);
        expect(host.textContent).toContain(
            "They start from your opening hours: change them if this runs at other times.",
        );
        // No button of their own: they go with the page's Save.
        expect(host.textContent).not.toContain("Save availability");
    });

    it("with someone to take it, a one-to-one starts with none, and a class takes the opening hours", async () => {
        open({ staff: [person()] });
        expect(windows()).toEqual([]);
        await press("A group class");
        expect(windows()).toHaveLength(2);
        await press("One person");
        expect(windows()).toEqual([]);
    });

    it("starts with none when the business has no opening hours", () => {
        open({ openingHours: null });
        expect(windows()).toEqual([]);
    });
});

describe("one Save, in two calls", () => {
    it("adds the service, then sends its hours, and opens the service's own page", async () => {
        open();
        fillNew();
        await press("Add service");

        expect(api.createService).toHaveBeenCalledTimes(1);
        expect(api.replaceRules).toHaveBeenCalledTimes(1);
        expect(api.replaceRules).toHaveBeenCalledWith("sv_new", OPENING_RULES);
        // The service first: its hours need its id.
        expect(api.createService.mock.invocationCallOrder[0]).toBeLessThan(
            api.replaceRules.mock.invocationCallOrder[0] ?? 0,
        );
        expect(toast.showSuccess).toHaveBeenCalledWith(
            "Glow facial added. Customers can book it in its weekly hours.",
        );
        expect(router.replace).toHaveBeenCalledWith("/services/sv_new");
    });

    it("says the service was added and its hours were not, keeps them, and stays on the page", async () => {
        api.replaceRules.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the availability.",
        });
        open();
        fillNew();
        await press("Add service");

        expect(alerts()).toContain(
            "Glow facial was added, but its weekly hours were not saved.Couldn't save the availability. The hours you chose are still here. Try again, or change them and save.Try again",
        );
        // What was chosen is still there, and nothing sent them away.
        expect(windows()).toHaveLength(2);
        expect(field("Name").value).toBe("Glow facial");
        expect(router.replace).not.toHaveBeenCalled();
        expect(toast.showSuccess).not.toHaveBeenCalled();
    });

    it("Try again sends only the hours: the service is not added twice", async () => {
        api.replaceRules.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the availability.",
        });
        open();
        fillNew();
        await press("Add service");
        await press("Try again");

        expect(api.createService).toHaveBeenCalledTimes(1);
        expect(api.updateService).not.toHaveBeenCalled();
        expect(api.replaceRules).toHaveBeenCalledTimes(2);
        expect(api.replaceRules).toHaveBeenLastCalledWith(
            "sv_new",
            OPENING_RULES,
        );
        expect(alerts()).toEqual([]);
        expect(router.replace).toHaveBeenCalledWith("/services/sv_new");
    });

    it("says so when the hours never got an answer at all", async () => {
        api.replaceRules.mockRejectedValueOnce(new Error("offline"));
        open();
        fillNew();
        await press("Add service");
        expect(alerts().join(" ")).toContain(
            "We couldn't confirm that was saved.",
        );
        expect(alerts().join(" ")).toContain(
            "The hours you chose are still here.",
        );
        expect(router.replace).not.toHaveBeenCalled();
    });

    it("a saved service whose hours alone changed sends only the hours", async () => {
        open({ saved: service(), rules: [rule(1), rule(3)] });
        act(() =>
            host
                .querySelector<HTMLButtonElement>(
                    '[aria-label="Remove Wednesday, 10:00 to 16:00"]',
                )
                ?.click(),
        );
        await press("Save");

        expect(api.updateService).not.toHaveBeenCalled();
        expect(api.replaceRules).toHaveBeenCalledWith("sv_1", [
            { dayOfWeek: 1, startMinute: 600, endMinute: 960 },
        ]);
        expect(router.replace).not.toHaveBeenCalled();
        expect(router.refresh).toHaveBeenCalled();
    });

    it("on an edit, says the other changes were saved and the hours were not, then sends only the hours", async () => {
        api.replaceRules.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the availability.",
        });
        open({ saved: service(), rules: [rule(1), rule(3)] });
        type(field("Name"), "Glow facial plus");
        act(() =>
            host
                .querySelector<HTMLButtonElement>(
                    '[aria-label="Remove Wednesday, 10:00 to 16:00"]',
                )
                ?.click(),
        );
        await press("Save");

        expect(api.updateService).toHaveBeenCalledTimes(1);
        expect(alerts().join(" ")).toContain(
            "Your other changes were saved, but its weekly hours were not.",
        );
        expect(windows()).toEqual(["Remove Monday, 10:00 to 16:00"]);

        await press("Try again");
        expect(api.updateService).toHaveBeenCalledTimes(1);
        expect(api.replaceRules).toHaveBeenCalledTimes(2);
        expect(alerts()).toEqual([]);
    });

    it("leaves hours it couldn't read alone", async () => {
        open({ saved: service(), rules: null });
        type(field("Name"), "Glow facial plus");
        await press("Save");
        expect(api.updateService).toHaveBeenCalledTimes(1);
        expect(api.replaceRules).not.toHaveBeenCalled();
    });
});

describe("what is wrong is said on leaving a field, and on Save", () => {
    it("says nothing about a field until it has been left", () => {
        open();
        expect(alerts()).toEqual([]);
        leave(field("Name"));
        expect(alerts()).toEqual(["Add a name."]);
        expect(field("Name").getAttribute("aria-invalid")).toBe("true");
        // It clears as it is fixed.
        type(field("Name"), "Glow facial");
        expect(alerts()).toEqual([]);
    });

    it("keeps Add service on, and pressing it says the rest and goes to the first field in error", async () => {
        open();
        expect(button("Add service").disabled).toBe(false);
        await press("Add service");

        expect(api.createService).not.toHaveBeenCalled();
        expect(alerts()).toContain("Add a name.");
        expect(alerts()).toContain("Add a price (0 if it's free).");
        expect(document.activeElement).toBe(field("Name"));
        // Still on: fixing and pressing again is the way through.
        expect(button("Add service").disabled).toBe(false);
    });

    it("opens More settings when what is wrong is in there", async () => {
        open();
        fillNew();
        type(field("SAC code"), "12");
        expect(button("Show more settings")).toBeTruthy();
        await press("Add service");
        expect(alerts()).toContain("A SAC code is 4 to 8 digits.");
        expect(button("Hide more settings")).toBeTruthy();
        expect(document.activeElement).toBe(field("SAC code"));
    });
});

/** A card of the page, by its heading. */
function card(title: string): HTMLElement {
    const heading = Array.from(host.querySelectorAll("h2")).find(
        (h) => h.textContent.trim() === title,
    );
    const section = heading?.closest("section");
    if (!section) throw new Error(`No "${title}" card`);
    return section;
}

const cards = () =>
    Array.from(host.querySelectorAll("h2")).map((h) => h.textContent.trim());

describe("When it can be booked is its own card", () => {
    it("sits after Time, and More settings no longer holds the hours", () => {
        open();
        expect(cards().slice(0, 5)).toEqual([
            "What it is",
            "Time",
            "When it can be booked",
            "Price",
            "Who does it",
        ]);
        // On the page without opening anything.
        expect(
            card("When it can be booked").querySelectorAll(
                '[aria-label^="Remove "]',
            ),
        ).toHaveLength(2);
        const more = card("More settings").textContent;
        expect(more).toContain("and deleting it.");
        expect(more).not.toContain("weekly hours");
        // Nothing sends anyone under More settings for the hours.
        expect(host.textContent).not.toContain("under More settings");
    });

    it("with nobody to take it, says it books in its own hours and shows them", () => {
        open({ saved: service(), rules: [rule(1)] });
        const when = card("When it can be booked");
        expect(when.textContent).toContain(
            "Nobody takes it yet, so customers book it in its own weekly hours.",
        );
        expect(windows()).toEqual(["Remove Monday, 10:00 to 16:00"]);
        // And the way to put someone on the diary is a plain link.
        const link = card("Who does it").querySelector("a");
        expect(link?.getAttribute("href")).toBe("/bookings/availability");
        expect(link?.textContent).toBe(
            "Add yourself or your team in Hours and time off",
        );
    });

    it("when someone takes it, says the times come from their hours, with the way to Availability", async () => {
        open({
            saved: service(),
            rules: [],
            staff: [person({ serviceIds: ["sv_1"] })],
        });
        const when = card("When it can be booked");
        expect(when.textContent).toContain("Its times come from Asha's hours.");
        const link = when.querySelector("a");
        expect(link?.getAttribute("href")).toBe("/bookings/availability");
        expect(link?.textContent).toBe("Change them in Hours and time off");
        // Its own hours only narrow theirs: asked for, not shown.
        expect(windows()).toEqual([]);
        expect(when.textContent).not.toContain("No hours of its own");

        await press("Give it its own hours");
        expect(when.textContent).toContain("Its own weekly hours");
        expect(when.textContent).toContain(
            "Only the free time inside these windows is offered.",
        );
        await press("Add a window");
        expect(windows()).toHaveLength(1);
    });

    it("keeps showing own hours a service someone takes already has", () => {
        open({
            saved: service(),
            rules: [rule(1)],
            staff: [person({ serviceIds: ["sv_1"] })],
        });
        expect(windows()).toEqual(["Remove Monday, 10:00 to 16:00"]);
        expect(card("When it can be booked").textContent).toContain(
            "Its times come from Asha's hours, inside its own weekly hours below.",
        );
    });

    it("a class runs at its own times, whoever takes it", () => {
        open({
            saved: service({ capacity: 8 }),
            rules: [rule(2)],
            staff: [person({ serviceIds: ["sv_1"] })],
        });
        const when = card("When it can be booked");
        expect(when.textContent).toContain(
            "A class runs at its own weekly times.",
        );
        expect(when.textContent).not.toContain("Its times come from");
        expect(windows()).toEqual(["Remove Tuesday, 10:00 to 16:00"]);
    });

    it("says hours it couldn't read as such, in the card", () => {
        open({ saved: service(), rules: null });
        expect(card("When it can be booked").textContent).toContain(
            "Couldn't load its weekly hours",
        );
    });

    it("says a row that can't be saved where it is, with nothing to open first", async () => {
        open({
            saved: service(),
            rules: [{ ...rule(1), startMinute: 960, endMinute: 600 }],
        });
        type(field("Name"), "Glow facial plus");
        await press("Save");
        expect(api.updateService).not.toHaveBeenCalled();
        expect(
            Array.from(
                card("When it can be booked").querySelectorAll(
                    '[role="alert"]',
                ),
            ).map((a) => a.textContent.trim()),
        ).toEqual([
            "Monday's hours end before they start. Choose a later end.",
        ]);
        // Nothing was wrong under More settings: it stays closed.
        expect(button("Show more settings")).toBeTruthy();
    });
});

describe("the length is picked from chips", () => {
    const chips = () =>
        Array.from(
            card("Time")
                .querySelector('[role="radiogroup"]')
                ?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        );
    const chosen = () =>
        chips()
            .filter((c) => c.getAttribute("aria-checked") === "true")
            .map((c) => c.textContent.trim());

    it("offers the usual lengths and Custom, with a new service on 30 min", () => {
        open();
        expect(chips().map((c) => c.textContent.trim())).toEqual([
            "15 min",
            "30 min",
            "45 min",
            "60 min",
            "90 min",
            "Custom",
        ]);
        expect(chosen()).toEqual(["30 min"]);
        // No number to type until Custom asks for one.
        expect(host.textContent).not.toContain("Each visit (min)");
        expect(host.textContent).not.toContain("Custom length (min)");
        // Gap after and Visits stay fields.
        expect(field("Break after (min)").value).toBe("10");
        expect(field("Visits").value).toBe("1");
    });

    it("a chip sets the same value Save sends", async () => {
        open();
        fillNew();
        await press("90 min");
        expect(chosen()).toEqual(["90 min"]);
        await press("Add service");
        expect(api.createService).toHaveBeenCalledWith(
            expect.objectContaining({ durationMinutes: 90 }),
        );
    });

    it("Custom shows the number field with the minutes there were, and takes any length", async () => {
        open();
        fillNew();
        await press("Custom");
        expect(chosen()).toEqual(["Custom"]);
        expect(field("Custom length (min)").value).toBe("30");
        type(field("Custom length (min)"), "75");
        await press("Add service");
        expect(api.createService).toHaveBeenCalledWith(
            expect.objectContaining({ durationMinutes: 75 }),
        );
    });

    it("a saved length that is none of the chips opens on Custom", () => {
        open({ saved: service({ durationMinutes: 20 }) });
        expect(chosen()).toEqual(["Custom"]);
        expect(field("Custom length (min)").value).toBe("20");
    });

    it("keeps the length's own rule: under 5 minutes is said under the field", () => {
        open();
        act(() => button("Custom").click());
        type(field("Custom length (min)"), "2");
        leave(field("Custom length (min)"));
        expect(alerts()).toEqual([
            "Each visit needs a length of at least 5 minutes.",
        ]);
        // Back on a chip, there is nothing to fix.
        act(() => button("45 min").click());
        expect(alerts()).toEqual([]);
    });
});

describe("Taking bookings is a switch beside Save", () => {
    const toggle = () => {
        const found = host.querySelector<HTMLButtonElement>('[role="switch"]');
        if (!found) throw new Error("No switch");
        return found;
    };
    const flip = async () => {
        act(() => toggle().click());
        await settle();
    };
    const names = () =>
        Array.from(host.querySelectorAll("button")).map((b) =>
            b.textContent.trim(),
        );

    /** The pill beside the title: whether it takes bookings, in a word. */
    const pill = () =>
        ["Live", "Paused", "New"].find((word) =>
            Array.from(host.querySelectorAll("*")).some(
                (el) =>
                    el.children.length === 0 && el.textContent.trim() === word,
            ),
        );

    it("replaces the Stop taking bookings button, and a new service has none", () => {
        open({ saved: service() });
        expect(toggle().getAttribute("aria-checked")).toBe("true");
        expect(
            host.querySelector(`label[for="${toggle().id}"]`)?.textContent,
        ).toBe("Taking bookings");
        expect(names()).not.toContain("Stop taking bookings");
        expect(names()).not.toContain("Take bookings again");

        open();
        expect(host.querySelector('[role="switch"]')).toBeNull();
    });

    it("pauses at once with Undo, says Paused, and leaves nothing unsaved", async () => {
        open({ saved: service() });
        await flip();

        expect(api.updateService).toHaveBeenCalledWith("sv_1", {
            status: "ARCHIVED",
        });
        expect(toggle().getAttribute("aria-checked")).toBe("false");
        expect(pill()).toBe("Paused");
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Glow facial paused. It's off the booking page. Bookings already made still happen.",
        );
        // It is saved: Save has nothing to send, and leaving asks nothing.
        expect(host.textContent).not.toContain("Unsaved changes");
        expect(button("Save").disabled).toBe(true);
        expect(names()).not.toContain("Discard changes");
    });

    it("Undo takes bookings again", async () => {
        open({ saved: service() });
        await flip();
        const undo = toast.showUndo.mock.calls[0]?.[1] as () => Promise<{
            ok: boolean;
        }>;
        await act(async () => {
            await undo();
        });
        expect(api.updateService).toHaveBeenLastCalledWith("sv_1", {
            status: "ACTIVE",
        });
        expect(toggle().getAttribute("aria-checked")).toBe("true");
        expect(pill()).toBe("Live");
    });

    it("keeps what else is typed, and Save still sends it with the new state", async () => {
        open({ saved: service(), rules: [] });
        type(field("Name"), "Glow facial plus");
        await flip();
        expect(field("Name").value).toBe("Glow facial plus");
        expect(host.textContent).toContain("Unsaved changes");

        await press("Save");
        expect(api.updateService).toHaveBeenLastCalledWith(
            "sv_1",
            expect.objectContaining({
                name: "Glow facial plus",
                status: "ARCHIVED",
            }),
        );
    });

    it("is put back, and says why, when the save is refused", async () => {
        api.updateService.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the service.",
        });
        open({ saved: service() });
        await flip();
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save the service.",
        );
        expect(toggle().getAttribute("aria-checked")).toBe("true");
        expect(pill()).toBe("Live");
    });

    it("isn't offered to a role that can't change services", () => {
        open({ saved: service(), canEdit: false });
        expect(host.querySelector('[role="switch"]')).toBeNull();
    });
});

describe("true words under the title", () => {
    it("says Nothing coming up, never Nothing booked yet, for a service with none to come", () => {
        // Booked this week, all of it past: it has been booked before.
        open({ saved: service(), usage: { thisWeek: 5, comingUp: 0 } });
        const status = host.querySelector('[role="status"]');
        expect(status?.textContent).toBe("Nothing coming up");
        expect(host.textContent).not.toContain("Nothing booked yet");
    });

    it("counts what is still to come", () => {
        open({ saved: service(), usage: { thisWeek: 1, comingUp: 2 } });
        expect(host.querySelector('[role="status"]')?.textContent).toBe(
            "2 bookings still to come",
        );
    });
});
