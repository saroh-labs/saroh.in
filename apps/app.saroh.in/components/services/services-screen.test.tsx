// @vitest-environment jsdom
/**
 * Bookings › Services as rows (Bookings audit, 12 Oct 2026).
 *
 * - A service is a row of the shared list: its name, one line of length,
 *   gap, where and kind, its price, who takes it and how it is booked. The
 *   row opens the service.
 * - "Taking bookings" is a switch, not a button: it acts at once, says so
 *   with Undo, and is put back when the save doesn't go through. A paused
 *   service says Paused in words too.
 * - What is true of several services is said once above the list, with
 *   what fixes it; two zeroes are never written out.
 * - One count beside the heading, one line of introduction.
 * - New service is a link, and a menu with New course once Courses is on.
 *   "Also sell" sits under the list.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import type { AnchorHTMLAttributes } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FACT_DOT } from "@/lib/format/join";
import type { Service } from "@/lib/services/service";
import type { ServiceUsage } from "@/lib/services/usage";
import type { BookingPaymentView, StaffView } from "@/lib/staff/types";

import { ServicesScreen } from "./services-screen";

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
// Each has tests of its own; here only where they sit matters.
vi.mock("@/components/gst-rates/missing-rates-notice", () => ({
    MissingRatesNotice: () => null,
}));
vi.mock("@/components/services/also-sell", () => ({
    AlsoSell: () => <div role="group" aria-label="Also sell" />,
}));

const api = { updateService: vi.fn() };
vi.mock("@/lib/services/actions", () => ({
    updateService: (...a: unknown[]) => api.updateService(...a) as unknown,
}));

const toast = { showError: vi.fn(), showUndo: vi.fn() };
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => toast.showError(...a) as unknown,
    showUndo: (...a: unknown[]) => toast.showUndo(...a) as unknown,
}));

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

const person = (over: Partial<StaffView> = {}): StaffView => ({
    id: "st_1",
    name: "Asha Rao",
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

const FACIAL = service();
const YOGA = service({
    id: "sv_2",
    name: "Morning yoga",
    capacity: 12,
    priceCents: 0,
    bufferAfterMinutes: 0,
    locationType: "ONLINE",
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
    for (const fn of [
        ...Object.values(api),
        ...Object.values(toast),
        ...Object.values(router),
    ]) {
        fn.mockReset();
    }
    api.updateService.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

interface Shown {
    services?: Service[];
    staff?: StaffView[] | null;
    usage?: Record<string, ServiceUsage> | null;
    canEdit?: boolean;
    hasPage?: boolean | null;
    payment?: BookingPaymentView | null;
    alsoSell?: boolean;
    canNewCourse?: boolean;
}

function show({
    services = [FACIAL, YOGA],
    staff = [person({ serviceIds: ["sv_1", "sv_2"] })],
    usage = {
        sv_1: { thisWeek: 3, comingUp: 5 },
        sv_2: { thisWeek: 0, comingUp: 0 },
    },
    canEdit = true,
    hasPage = true,
    payment = null,
    alsoSell = false,
    canNewCourse = false,
}: Shown = {}) {
    act(() =>
        root.render(
            <ServicesScreen
                services={services}
                staff={staff}
                usage={usage}
                currency="INR"
                canEdit={canEdit}
                hasPage={hasPage}
                payment={payment}
                alsoSell={alsoSell ? [] : null}
                canNewCourse={canNewCourse}
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

const text = () => host.textContent;

/** The table's rows, by the service's name. */
function rowOf(name: string): HTMLTableRowElement {
    const found = Array.from(host.querySelectorAll("tbody tr")).find((r) =>
        r.textContent.includes(name),
    );
    if (!found) throw new Error(`No row for "${name}"`);
    return found as HTMLTableRowElement;
}

function switchOf(name: string): HTMLButtonElement {
    const found =
        rowOf(name).querySelector<HTMLButtonElement>('[role="switch"]');
    if (!found) throw new Error(`No switch for "${name}"`);
    return found;
}

async function flip(name: string) {
    act(() => switchOf(name).click());
    await settle();
}

describe("services are rows", () => {
    it("draws the shared list: a table with a head, a row a service, and no cards", () => {
        show();
        expect(host.querySelector("[data-list-table]")).not.toBeNull();
        expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
        const heads = Array.from(host.querySelectorAll("thead th")).map((th) =>
            th.textContent.trim(),
        );
        expect(heads).toEqual([
            "Service",
            "Price",
            "Who does it",
            "Bookings",
            "Actions",
        ]);
        // A list this small draws no search, filter or view switch.
        expect(host.querySelector('input[type="search"]')).toBeNull();
        expect(host.querySelector('[role="combobox"]')).toBeNull();
    });

    it("says each service on one line, with its price, who takes it and how it is booked", () => {
        show();
        const facial = rowOf("Glow facial").textContent;
        expect(facial).toContain(
            ["60 min", "10 min break after", "In person", "One person"].join(
                FACT_DOT,
            ),
        );
        expect(facial).toContain("₹1,200");
        expect(facial).toContain("Asha");
        expect(facial).toContain(
            ["3 booked this week", "5 still to come"].join(FACT_DOT),
        );

        const yoga = rowOf("Morning yoga").textContent;
        expect(yoga).toContain(
            ["60 min", "Online", "A group class", "12 places"].join(FACT_DOT),
        );
        expect(yoga).toContain("Free");
    });

    it("never writes out two zeroes: nothing booked is the absent mark", () => {
        show();
        const yoga = rowOf("Morning yoga");
        expect(yoga.textContent).not.toContain("0 booked this week");
        expect(yoga.querySelector("[data-absent]")?.textContent).toContain(
            "None",
        );
    });

    it("opens the service from its row", () => {
        show();
        const link = rowOf("Glow facial").querySelector("a");
        expect(link?.getAttribute("href")).toBe("/services/sv_1");
        expect(link?.textContent).toContain("Glow facial");
        // The full-size Edit and Stop buttons are gone from every item.
        const names = Array.from(host.querySelectorAll("button, a")).map((b) =>
            b.textContent.trim(),
        );
        expect(names).not.toContain("Edit");
        expect(names).not.toContain("Stop taking bookings");
        expect(names).not.toContain("Take bookings again");
    });

    it("says a failed read as such, never as a zero or as nobody", () => {
        show({ staff: null, usage: null });
        const facial = rowOf("Glow facial").textContent;
        expect(facial).toContain("Couldn't load");
        expect(facial).toContain("Bookings couldn't be counted");
        expect(text()).not.toContain("Nobody");
    });
});

describe("one count, one line of introduction", () => {
    it("says how many services, once", () => {
        show();
        const count = host.querySelector('[data-slot="page-count"]');
        expect(count?.textContent).toBe("2 services");
        expect(text()).not.toContain("on the booking page");
        expect(text()).toContain("What people can book, and who takes it.");
        expect(text()).not.toContain("Changing a price only affects");
    });

    it("adds what the booking page offers only when it differs", () => {
        show({ services: [FACIAL, { ...YOGA, showOnBookingPage: false }] });
        expect(
            host.querySelector('[data-slot="page-count"]')?.textContent,
        ).toBe(["2 services", "1 on the booking page"].join(FACT_DOT));
    });
});

describe("nobody takes it yet is said once", () => {
    it("with nobody on the diary: one line above the list, and the way to Availability", () => {
        show({ staff: [] });
        const notes = Array.from(host.querySelectorAll('[role="note"]'));
        expect(notes).toHaveLength(1);
        expect(notes[0]?.textContent).toContain(
            "Nobody takes bookings yet, so each service books in its own hours.",
        );
        const link = notes[0]?.querySelector("a");
        expect(link?.getAttribute("href")).toBe("/bookings/availability");
        expect(link?.textContent).toBe(
            "Add yourself or your team in Hours and time off",
        );
        // Not once a row: each row says two words.
        expect(text()).not.toContain("It books in its own hours");
        expect(rowOf("Glow facial").textContent).toContain("Nobody yet");
        // And it sits above the list.
        const list = host.querySelector("[data-list-table]");
        expect(
            notes[0] && list
                ? notes[0].compareDocumentPosition(list) &
                      Node.DOCUMENT_POSITION_FOLLOWING
                : 0,
        ).toBeTruthy();
    });

    it("with people on the diary: counts the services nobody takes, and each opens to choose", () => {
        show({ staff: [person({ serviceIds: ["sv_1"] })] });
        const note = host.querySelector('[role="note"]');
        expect(note?.textContent).toContain(
            "1 service has nobody to take it yet, so it books in its own hours. Open it to choose who takes it.",
        );
        expect(note?.querySelector("a")).toBeNull();
    });

    it("says nothing when every service has someone, or who takes them couldn't be read", () => {
        show();
        expect(host.querySelector('[role="note"]')).toBeNull();
        show({ staff: null });
        expect(host.querySelector('[role="note"]')).toBeNull();
    });
});

describe("Taking bookings is a switch", () => {
    it("is on for a live service and off for a paused one, which says Paused in words", () => {
        show({ services: [FACIAL, { ...YOGA, status: "ARCHIVED" }] });
        expect(switchOf("Glow facial").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(switchOf("Glow facial").getAttribute("aria-label")).toBe(
            "Taking bookings, Glow facial",
        );
        expect(rowOf("Glow facial").textContent).toContain("Taking bookings");
        expect(rowOf("Glow facial").textContent).not.toContain("Paused");

        const yoga = rowOf("Morning yoga");
        expect(switchOf("Morning yoga").getAttribute("aria-checked")).toBe(
            "false",
        );
        expect(yoga.querySelector('[data-status="paused"]')?.textContent).toBe(
            "Paused",
        );
        expect(yoga.textContent).toContain("Hidden from the booking page");
    });

    it("pauses at once, with a toast and Undo, and asks nothing", async () => {
        show();
        await flip("Glow facial");

        expect(api.updateService).toHaveBeenCalledWith("sv_1", {
            status: "ARCHIVED",
        });
        expect(host.querySelector('[role="alertdialog"]')).toBeNull();
        expect(switchOf("Glow facial").getAttribute("aria-checked")).toBe(
            "false",
        );
        expect(rowOf("Glow facial").textContent).toContain("Paused");
        expect(router.refresh).toHaveBeenCalled();
        expect(toast.showUndo).toHaveBeenCalledTimes(1);
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Glow facial paused. It's off the booking page. Bookings already made still happen.",
        );
    });

    it("Undo takes bookings again", async () => {
        show();
        await flip("Glow facial");
        const undo = toast.showUndo.mock.calls[0]?.[1] as () => Promise<{
            ok: boolean;
        }>;
        let result: { ok: boolean } | undefined;
        await act(async () => {
            result = await undo();
        });
        expect(result?.ok).toBe(true);
        expect(api.updateService).toHaveBeenLastCalledWith("sv_1", {
            status: "ACTIVE",
        });
        expect(switchOf("Glow facial").getAttribute("aria-checked")).toBe(
            "true",
        );
    });

    it("takes bookings again for a paused service", async () => {
        show({ services: [{ ...YOGA, status: "ARCHIVED" }] });
        await flip("Morning yoga");
        expect(api.updateService).toHaveBeenCalledWith("sv_2", {
            status: "ACTIVE",
        });
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Morning yoga is bookable again.",
        );
    });

    it("is put back, and says why, when the save is refused", async () => {
        api.updateService.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the service.",
        });
        show();
        await flip("Glow facial");
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save the service.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(switchOf("Glow facial").getAttribute("aria-checked")).toBe(
            "true",
        );
        expect(rowOf("Glow facial").textContent).not.toContain("Paused");
    });

    it("is put back when the save never got an answer", async () => {
        api.updateService.mockRejectedValueOnce(new Error("offline"));
        show();
        await flip("Glow facial");
        expect(toast.showError).toHaveBeenCalledTimes(1);
        expect(switchOf("Glow facial").getAttribute("aria-checked")).toBe(
            "true",
        );
    });

    it("gives way to a fresh read of the list", async () => {
        show();
        await flip("Glow facial");
        // Someone else took bookings for it again since: the list wins.
        show({
            services: [
                { ...FACIAL, updatedAt: "2026-10-12T09:00:00.000Z" },
                YOGA,
            ],
        });
        expect(switchOf("Glow facial").getAttribute("aria-checked")).toBe(
            "true",
        );
    });

    it("isn't offered to a role that can't change services, which still reads Paused", () => {
        show({
            canEdit: false,
            services: [FACIAL, { ...YOGA, status: "ARCHIVED" }],
        });
        expect(host.querySelector('[role="switch"]')).toBeNull();
        expect(rowOf("Morning yoga").textContent).toContain("Paused");
        expect(text()).toContain(
            "Your role can see these services but not change them.",
        );
        expect(
            rowOf("Glow facial").querySelector("a")?.getAttribute("href"),
        ).toBe("/services/sv_1");
    });
});

describe("a service people can't book online says so in its row", () => {
    it("with the way to fix it", () => {
        show({
            payment: {
                bookingPayment: "ONLINE",
                onlineBlocker: "NO_PROVIDER",
            },
        });
        const facial = rowOf("Glow facial");
        expect(facial.textContent).toContain("Can't be booked online");
        expect(
            Array.from(facial.querySelectorAll("a")).map((a) =>
                a.getAttribute("href"),
            ),
        ).toContain("/settings/providers");
        // A free one books with nothing to pay.
        expect(rowOf("Morning yoga").textContent).not.toContain(
            "Can't be booked online",
        );
    });
});

describe("New service, and what else is sold", () => {
    const newLinks = () =>
        Array.from(host.querySelectorAll("a")).filter(
            (a) => a.textContent.trim() === "New service",
        );

    it("is one link while Courses is off", () => {
        show();
        expect(newLinks().map((a) => a.getAttribute("href"))).toEqual([
            "/services/new",
        ]);
        expect(host.querySelector('[aria-haspopup="menu"]')).toBeNull();
    });

    it("is a menu with New course once Courses is on", async () => {
        show({ canNewCourse: true });
        const trigger = host.querySelector<HTMLButtonElement>(
            '[aria-haspopup="menu"]',
        );
        expect(trigger?.textContent.trim()).toBe("New service");
        act(() => {
            trigger?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
        });
        await settle();
        const items = Array.from(
            document.querySelectorAll('[role="menuitem"]'),
        ).map((i) => [i.textContent.trim(), i.getAttribute("href")]);
        expect(items).toEqual([
            ["New service", "/services/new"],
            ["New course", "/courses/new"],
        ]);
    });

    it("isn't offered to a role that can't change services", () => {
        show({ canEdit: false, canNewCourse: true });
        expect(newLinks()).toEqual([]);
        expect(host.querySelector('[aria-haspopup="menu"]')).toBeNull();
    });

    it("puts Also sell under the list, not above it", () => {
        show({ alsoSell: true });
        const group = host.querySelector('[aria-label="Also sell"]');
        const list = host.querySelector("[data-list-table]");
        expect(
            group && list
                ? list.compareDocumentPosition(group) &
                      Node.DOCUMENT_POSITION_FOLLOWING
                : 0,
        ).toBeTruthy();
    });

    it("says there are none yet, with the one way to add one", () => {
        show({ services: [] });
        expect(text()).toContain("No services yet");
        expect(host.querySelector("[data-list-table]")).toBeNull();
        expect(host.querySelector('[data-slot="page-count"]')).toBeNull();
    });
});
