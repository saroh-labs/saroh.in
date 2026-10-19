// @vitest-environment jsdom
/**
 * Bookings › Services, phone and desk (U15, #1031; boards BKMServices and
 * BKDStates).
 *
 * - Built once for both sizes: a table at the desk (Service, How long ·
 *   price · who, This week, Who can book it, Taking bookings) and a row a
 *   service on a phone. Both are in the markup; CSS shows one, so each
 *   test reads the one it is about.
 * - "Who can book it" is a tag for all four mixes of the two boxes;
 *   neither is Paused (DEC-170, Q5).
 * - "Taking bookings" is a quick pause: off unticks both boxes, on ticks
 *   both back; it acts at once, with Undo, and is put back when the save
 *   doesn't go through.
 * - A search past 8 services; a Member reads, with one note; the
 *   Payments-off line and the nobody-to-take-it line; none yet.
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
    name: "Physio assessment",
    description: "",
    durationMinutes: 45,
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
    name: "Meera Iyer",
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

/** All four mixes of "Who can book it". */
const BOTH = service();
const CUSTOMERS = service({
    id: "sv_2",
    name: "Sports massage",
    bookableByTeam: false,
});
const TEAM = service({
    id: "sv_3",
    name: "Online review call",
    showOnBookingPage: false,
    locationType: "ONLINE",
});
const NEITHER = service({
    id: "sv_4",
    name: "Hip and back rehab",
    showOnBookingPage: false,
    bookableByTeam: false,
});
const FOUR = [BOTH, CUSTOMERS, TEAM, NEITHER];

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
    canNewCourse?: boolean;
}

function show({
    services = FOUR,
    staff = [person({ serviceIds: FOUR.map((s) => s.id) })],
    usage = {
        sv_1: { thisWeek: 6, comingUp: 9 },
        sv_2: { thisWeek: 5, comingUp: 7 },
        sv_3: { thisWeek: 2, comingUp: 3 },
        sv_4: { thisWeek: 0, comingUp: 2 },
    },
    canEdit = true,
    hasPage = true,
    payment = null,
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
                alsoSell={[]}
                canNewCourse={canNewCourse}
            />,
        ),
    );
}

const settle = async (ms = 0) => {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, ms));
        });
    }
};

const text = () => host.textContent;
const facts = (...parts: string[]) => parts.join(FACT_DOT);

type Size = "desk" | "phone";
const SCOPE: Record<Size, string> = {
    desk: "[data-services-table]",
    phone: "[data-services-list]",
};
const ROW: Record<Size, string> = { desk: "[data-service-row]", phone: "li" };

function rowOf(name: string, size: Size = "desk"): HTMLElement {
    const found = Array.from(
        host.querySelectorAll<HTMLElement>(`${SCOPE[size]} ${ROW[size]}`),
    ).find((r) => r.textContent.includes(name));
    if (!found) throw new Error(`No ${size} row for "${name}"`);
    return found;
}

function switchOf(name: string, size: Size = "desk"): HTMLButtonElement {
    const found = rowOf(name, size).querySelector<HTMLButtonElement>(
        '[role="switch"]',
    );
    if (!found) throw new Error(`No switch for "${name}"`);
    return found;
}

async function flip(name: string, size: Size = "desk") {
    act(() => switchOf(name, size).click());
    await settle();
}

const checked = (name: string, size: Size) =>
    switchOf(name, size).getAttribute("aria-checked");

describe("one list, drawn for the desk and for a phone", () => {
    it("is a table at the desk, with the board's five columns", () => {
        show();
        const heads = Array.from(
            host.querySelectorAll(`${SCOPE.desk} [role="columnheader"]`),
        ).map((th) => th.textContent.trim());
        expect(heads).toEqual([
            "Service",
            "How long · price · who",
            "This week",
            "Who can book it",
            "Taking bookings",
        ]);
        expect(
            host.querySelectorAll(`${SCOPE.desk} [data-service-row]`),
        ).toHaveLength(4);
    });

    it("is a row a service on a phone, shown only at a phone's width", () => {
        show();
        expect(host.querySelectorAll(`${SCOPE.phone} li`)).toHaveLength(4);
        expect(
            host.querySelector(SCOPE.phone)?.parentElement?.className,
        ).toContain("min-[760px]:hidden");
        expect(
            host
                .querySelector(SCOPE.desk)
                ?.closest(".max-\\[759px\\]\\:hidden"),
        ).not.toBeNull();
    });

    it("says how long, the price and who on one line, and what is booked", () => {
        show();
        expect(rowOf("Physio assessment").textContent).toContain(
            facts("45 min", "₹1,200", "Meera"),
        );
        expect(rowOf("Physio assessment").textContent).toContain(
            facts("6 booked", "9 to come"),
        );
        expect(rowOf("Physio assessment", "phone").textContent).toContain(
            facts("6 booked this week", "9 to come"),
        );
        expect(rowOf("Online review call").textContent).toContain(
            facts("45 min", "online", "₹1,200", "Meera"),
        );
    });

    it("opens the service from its name, at both sizes", () => {
        show();
        for (const size of ["desk", "phone"] as const) {
            const link = rowOf("Physio assessment", size).querySelector("a");
            expect(link?.getAttribute("href")).toBe("/services/sv_1");
            expect(link?.textContent).toContain("Physio assessment");
        }
    });

    it("says None booked, never two zeroes, and a failed read as such", () => {
        show({ usage: { sv_1: { thisWeek: 0, comingUp: 0 } } });
        expect(rowOf("Physio assessment").textContent).toContain("None booked");
        show({ staff: null, usage: null });
        expect(rowOf("Physio assessment").textContent).toContain(
            "Bookings couldn't be counted",
        );
        expect(text()).not.toContain("nobody yet");
        expect(text()).not.toContain("Nobody takes");
    });
});

describe("Who can book it", () => {
    it("tags every row at the desk, for all four mixes", () => {
        show();
        const tag = (name: string) =>
            rowOf(name).querySelectorAll('[role="cell"]').item(3).textContent;
        expect(tag("Physio assessment")).toBe("Customers and team");
        expect(tag("Sports massage")).toBe("Customers only");
        expect(tag("Online review call")).toBe("Team only");
        expect(tag("Hip and back rehab")).toBe("Paused");
        expect(
            rowOf("Hip and back rehab").querySelector('[data-status="paused"]'),
        ).not.toBeNull();
    });

    it("tags a phone row only when it isn't both", () => {
        show();
        expect(rowOf("Physio assessment", "phone").textContent).not.toContain(
            "Customers and team",
        );
        expect(rowOf("Sports massage", "phone").textContent).toContain(
            "Customers only",
        );
        expect(rowOf("Online review call", "phone").textContent).toContain(
            "Team only",
        );
        expect(rowOf("Hip and back rehab", "phone").textContent).toContain(
            "Paused",
        );
    });

    it("says a paused one can't be booked, and that what's to come happens", () => {
        show();
        expect(rowOf("Hip and back rehab").textContent).toContain(
            facts("Nobody can book it", "2 still to come will happen"),
        );
        expect(rowOf("Hip and back rehab", "phone").textContent).toContain(
            facts("Nobody can book it", "2 bookings still to come will happen"),
        );
    });

    it("reads a service paused the old way as Paused", () => {
        show({ services: [service({ status: "ARCHIVED" })] });
        expect(rowOf("Physio assessment").textContent).toContain("Paused");
        expect(checked("Physio assessment", "desk")).toBe("false");
    });

    it("counts what your booking page offers beside the heading", () => {
        show();
        expect(
            host.querySelector('[data-slot="page-count"]')?.textContent,
        ).toBe(facts("4 services", "2 on your booking page"));
        expect(text()).toContain(
            "What customers can book, how long it takes, and who does it.",
        );
    });
});

describe("Taking bookings is a switch with Undo", () => {
    it("is on unless paused, named for its service, at both sizes", () => {
        show();
        for (const size of ["desk", "phone"] as const) {
            expect(checked("Physio assessment", size)).toBe("true");
            expect(checked("Online review call", size)).toBe("true");
            expect(checked("Hip and back rehab", size)).toBe("false");
            expect(
                switchOf("Physio assessment", size).getAttribute("aria-label"),
            ).toBe("Taking bookings, Physio assessment");
        }
        expect(rowOf("Physio assessment").textContent).toContain("On");
        expect(rowOf("Hip and back rehab", "phone").textContent).toContain(
            "Off",
        );
    });

    it("pauses at once: unticks both boxes, says so, offers Undo, asks nothing", async () => {
        show();
        await flip("Physio assessment");
        expect(api.updateService).toHaveBeenCalledWith("sv_1", {
            showOnBookingPage: false,
            bookableByTeam: false,
        });
        expect(host.querySelector('[role="alertdialog"]')).toBeNull();
        for (const size of ["desk", "phone"] as const) {
            expect(checked("Physio assessment", size)).toBe("false");
            expect(rowOf("Physio assessment", size).textContent).toContain(
                "Paused",
            );
        }
        expect(router.refresh).toHaveBeenCalled();
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Physio assessment paused. Nobody can book it, and bookings already made stay.",
        );
    });

    it("Undo puts back exactly the boxes it had", async () => {
        show();
        await flip("Online review call", "phone");
        expect(api.updateService).toHaveBeenCalledWith("sv_3", {
            showOnBookingPage: false,
            bookableByTeam: false,
        });
        const undo = toast.showUndo.mock.calls[0]?.[1] as () => Promise<{
            ok: boolean;
        }>;
        let result: { ok: boolean } | undefined;
        await act(async () => {
            result = await undo();
        });
        expect(result?.ok).toBe(true);
        // Team only again: only the team's box comes back.
        expect(api.updateService).toHaveBeenLastCalledWith("sv_3", {
            bookableByTeam: true,
        });
        expect(checked("Online review call", "phone")).toBe("true");
        expect(rowOf("Online review call", "phone").textContent).toContain(
            "Team only",
        );
    });

    it("takes bookings again by ticking both boxes", async () => {
        show();
        await flip("Hip and back rehab");
        expect(api.updateService).toHaveBeenCalledWith("sv_4", {
            status: "ACTIVE",
            showOnBookingPage: true,
            bookableByTeam: true,
        });
        expect(toast.showUndo.mock.calls[0]?.[0]).toBe(
            "Hip and back rehab is taking bookings again.",
        );
        expect(rowOf("Hip and back rehab").textContent).toContain(
            "Customers and team",
        );
    });

    it("is put back, and says why, when the save is refused", async () => {
        api.updateService.mockResolvedValueOnce({
            ok: false,
            error: "Couldn't save the service.",
        });
        show();
        await flip("Physio assessment");
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save the service.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(checked("Physio assessment", "desk")).toBe("true");
    });

    it("is put back when the save never got an answer", async () => {
        api.updateService.mockRejectedValueOnce(new Error("offline"));
        show();
        await flip("Physio assessment");
        expect(toast.showError).toHaveBeenCalledTimes(1);
        expect(checked("Physio assessment", "desk")).toBe("true");
    });

    it("gives way to a fresh read of the list", async () => {
        show();
        await flip("Physio assessment");
        show({
            services: [
                { ...BOTH, updatedAt: "2026-10-19T09:00:00.000Z" },
                CUSTOMERS,
            ],
        });
        expect(checked("Physio assessment", "desk")).toBe("true");
    });

    it("explains the switch once, under the list", () => {
        show();
        expect(text()).toContain(
            "The switch on each row is Taking bookings. Off pauses it: neither customers nor your team can book it, and bookings already made stay. Open a service to choose who can book it.",
        );
    });
});

describe("a search once there are more than 8 services", () => {
    const many = (n: number) =>
        Array.from({ length: n }, (_, i) =>
            service({
                id: `sv_${i + 1}`,
                name: i === 2 ? "Sports massage" : `Service ${i + 1}`,
            }),
        );

    async function search(term: string) {
        const input = host.querySelector<HTMLInputElement>(
            'input[type="search"]',
        );
        if (!input) throw new Error("No search");
        act(() => {
            Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                "value",
            )?.set?.call(input, term);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await settle(40);
    }

    it("isn't there with 8 or fewer", () => {
        show({ services: many(8), staff: [] });
        expect(host.querySelector('input[type="search"]')).toBeNull();
        show({ services: many(6), staff: [] });
        expect(host.querySelector('input[type="search"]')).toBeNull();
    });

    it("finds by name, says how many of how many, and clears", async () => {
        show({ services: many(10), staff: [] });
        const input = host.querySelector('input[type="search"]');
        expect(input?.getAttribute("aria-label")).toBe("Search services");
        await search("mass");
        expect(
            host.querySelectorAll(`${SCOPE.desk} [data-service-row]`),
        ).toHaveLength(1);
        expect(host.querySelectorAll(`${SCOPE.phone} li`)).toHaveLength(1);
        expect(rowOf("Sports massage").textContent).toContain("Sports massage");
        expect(text()).toContain("1 of 10 shown");

        const clear = Array.from(host.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Clear",
        );
        act(() => clear?.click());
        expect(
            host.querySelectorAll(`${SCOPE.desk} [data-service-row]`),
        ).toHaveLength(10);
    });

    it("says nothing matched, with the way back", async () => {
        show({ services: many(10), staff: [] });
        await search("zzz");
        expect(text()).toContain("No services match");
        expect(host.querySelector(SCOPE.desk)).toBeNull();
    });
});

describe("a Member reads the list", () => {
    it("with one note, no switch, no New service, and On or Off in words", () => {
        show({ canEdit: false });
        expect(host.querySelector('[role="switch"]')).toBeNull();
        expect(text()).toContain(
            "Your role can see services but not change them.",
        );
        expect(
            Array.from(host.querySelectorAll("a")).some(
                (a) => a.getAttribute("href") === "/services/new",
            ),
        ).toBe(false);
        expect(
            rowOf("Physio assessment").querySelectorAll('[role="cell"]').item(4)
                .textContent,
        ).toBe("On");
        expect(rowOf("Hip and back rehab").textContent).toContain("Paused");
        expect(text()).not.toContain("The switch on each row");
        // Each row still opens to read.
        expect(
            rowOf("Physio assessment", "phone")
                .querySelector("a")
                ?.getAttribute("href"),
        ).toBe("/services/sv_1");
    });
});

describe("what is said once above or in a row", () => {
    it("Payments off: a row customers book online says it can't be, with the fix", () => {
        show({
            payment: {
                bookingPayment: "ONLINE",
                onlineBlocker: "PAYMENTS_OFF",
            },
        });
        for (const size of ["desk", "phone"] as const) {
            const row = rowOf("Sports massage", size);
            expect(row.textContent).toContain("Can't be booked online");
            const fix = Array.from(row.querySelectorAll("a")).find(
                (a) => a.textContent.trim() === "Turn on Payments",
            );
            expect(fix?.getAttribute("href")).toBe("/settings/modules");
        }
        // Only the team books it, and nobody books a paused one.
        expect(rowOf("Online review call").textContent).not.toContain(
            "Can't be booked online",
        );
        expect(rowOf("Hip and back rehab").textContent).not.toContain(
            "Can't be booked online",
        );
    });

    it("nobody on the diary: one line, and Add who takes bookings", () => {
        show({ staff: [] });
        expect(text()).toContain(
            "Nobody takes bookings yet, so each service is booked in its own hours.",
        );
        const links = Array.from(host.querySelectorAll("a")).filter(
            (a) => a.textContent.trim() === "Add who takes bookings",
        );
        // The phone's inline link and the desk's button.
        expect(links).toHaveLength(2);
        expect(links.map((a) => a.getAttribute("href"))).toEqual([
            "/bookings/availability",
            "/bookings/availability",
        ]);
        expect(rowOf("Physio assessment").textContent).toContain("nobody yet");
    });

    it("one service nobody takes: named, and Choose who opens it", () => {
        show({ staff: [person({ serviceIds: ["sv_1", "sv_2", "sv_4"] })] });
        expect(text()).toContain(
            "Online review call has nobody to take it, so it's booked in its own hours.",
        );
        const choose = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent.trim() === "Choose who",
        );
        expect(choose?.getAttribute("href")).toBe("/services/sv_3");
    });

    it("a Member is told, with no way to change it", () => {
        show({ staff: [], canEdit: false });
        expect(text()).toContain("Nobody takes bookings yet");
        expect(text()).not.toContain("Add who takes bookings");
    });

    it("says nothing when everyone is taken, or who couldn't be read", () => {
        show();
        expect(text()).not.toContain("nobody to take");
        show({ staff: null });
        expect(text()).not.toContain("Nobody takes");
    });
});

describe("New service, none yet, and Also sell", () => {
    const newLinks = () =>
        Array.from(host.querySelectorAll("a")).filter(
            (a) => a.getAttribute("href") === "/services/new",
        );

    it("is a header button at the desk and a floating button on a phone", () => {
        show();
        const links = newLinks();
        expect(links).toHaveLength(2);
        expect(links.every((a) => a.textContent.trim() === "New service")).toBe(
            true,
        );
        expect(links[1]?.closest(".fixed")?.className).toContain(
            "min-[760px]:hidden",
        );
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

    it("says there are none yet, with the one way to add one", () => {
        show({ services: [] });
        expect(text()).toContain("No services yet");
        expect(text()).toContain(
            "A service is what customers book: a one-to-one session or a group class.",
        );
        const links = newLinks();
        expect(links.map((a) => a.textContent.trim())).toEqual([
            "Add your first service",
        ]);
        expect(host.querySelector(SCOPE.desk)).toBeNull();
        expect(host.querySelector('[data-slot="page-count"]')).toBeNull();
    });

    it("says none yet to a Member with nothing to press", () => {
        show({ services: [], canEdit: false });
        expect(text()).toContain("No services yet");
        expect(newLinks()).toEqual([]);
    });

    it("puts Also sell under the list", () => {
        show();
        const group = host.querySelector('[aria-label="Also sell"]');
        const list = host.querySelector(SCOPE.desk);
        expect(
            group && list
                ? list.compareDocumentPosition(group) &
                      Node.DOCUMENT_POSITION_FOLLOWING
                : 0,
        ).toBeTruthy();
    });
});
