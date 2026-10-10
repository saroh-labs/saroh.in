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

const toast = { showError: vi.fn(), showSuccess: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showSuccess: (...a: unknown[]) => toast.showSuccess(...a) as unknown,
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
}: {
    saved?: Service | null;
    rules?: AvailabilityRule[] | null;
    staff?: StaffView[];
    openingHours?: typeof OPENING | null;
} = {}) {
    act(() =>
        root.render(
            <ServiceEditor
                service={saved}
                rules={rules}
                staff={staff}
                usage={{ thisWeek: 0, comingUp: 0 }}
                currency="INR"
                timezone="Asia/Kolkata"
                openingHours={openingHours}
                canEdit
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
        await press("Class");
        expect(windows()).toHaveLength(2);
        await press("One-to-one");
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
