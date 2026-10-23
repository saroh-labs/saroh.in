// @vitest-environment jsdom
/**
 * A booking's page, by permission (UX audit, 10 Oct 2026). A Member reads
 * bookings without `booking:write` and was shown Move, Cancel and "how did
 * it go?" as live buttons the API then refused. Without it none is drawn,
 * and the page says it is read-only and who can change that.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { permits } from "@/lib/organizations/permits";
import type { BookingDetail } from "@/lib/services/service";

import { BookingDetailView } from "./booking-detail";

vi.mock("@/lib/services/actions", () => ({
    takeDeskPayment: vi.fn(),
    createBookingPayLink: vi.fn(),
    listAvailability: vi.fn(() => Promise.resolve([])),
    rescheduleBooking: vi.fn(),
    cancelBooking: vi.fn(),
    recordBookingOutcome: vi.fn(),
}));
vi.mock("@/lib/api/http", () => ({}));
vi.mock("@/lib/class-packs/actions", () => ({
    payBookingWithPack: vi.fn(),
    takePackOffBooking: vi.fn(),
    packsFor: vi.fn(() => Promise.resolve([])),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showInfo: vi.fn(),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

function booking(over: Partial<BookingDetail> = {}): BookingDetail {
    return {
        id: "bk_1",
        serviceId: "svc_1",
        status: "CONFIRMED",
        outcome: null,
        startAt: "2099-10-01T05:30:00.000Z",
        endAt: "2099-10-01T06:00:00.000Z",
        timezone: "Asia/Kolkata",
        bookerName: "Priya Raman",
        bookerEmail: "priya@example.com",
        bookerPhone: null,
        contact: null,
        events: [],
        snapshot: {},
        packRedemption: null,
        freeCancelUntil: null,
        service: {
            id: "svc_1",
            name: "Check-up",
            status: "ACTIVE",
            capacity: 1,
            timezone: "Asia/Kolkata",
        },
        money: null,
        ...over,
    } as unknown as BookingDetail;
}

const buttons = () =>
    Array.from(host.querySelectorAll("button")).map((b) =>
        b.textContent.trim(),
    );

const NOTE =
    "Your role can read this booking but not change it. An owner or admin can change this in Settings › Team.";

function draw(props: { canWrite?: boolean; past?: boolean }, b = booking()) {
    act(() => {
        root.render(
            <BookingDetailView
                booking={b}
                past={props.past ?? false}
                canWrite={props.canWrite}
            />,
        );
    });
}

describe("a booking still to come", () => {
    it("offers Move, and Cancel under More, to someone with booking:write", () => {
        draw({ canWrite: true });
        expect(buttons()).toEqual(expect.arrayContaining(["Move", "More"]));
        expect(host.textContent).not.toContain(NOTE);
    });

    it("offers a reader neither, and says the page is read-only", () => {
        draw({ canWrite: false });
        expect(buttons()).not.toContain("Move");
        expect(buttons()).not.toContain("Cancel");
        expect(host.querySelector('[role="note"]')?.textContent).toBe(NOTE);
        // Still the whole booking: who, when, and the way back.
        expect(host.textContent).toContain("Priya Raman");
        expect(host.textContent).toContain("Check-up");
    });

    it("is read-only unless the page says otherwise", () => {
        draw({});
        expect(buttons()).not.toContain("Move");
        expect(host.textContent).toContain(NOTE);
    });
});

describe("a booking that has happened", () => {
    it("asks how it went of someone with booking:write", () => {
        draw({ canWrite: true, past: true });
        expect(buttons()).toEqual(
            expect.arrayContaining(["Came", "Didn't come"]),
        );
    });

    it("doesn't ask a reader, who is still told it is not marked yet", () => {
        draw({ canWrite: false, past: true });
        expect(buttons()).not.toContain("Came");
        expect(buttons()).not.toContain("Didn't come");
        expect(host.textContent).toContain("Not marked yet");
        expect(host.textContent).toContain(NOTE);
    });
});

describe("an archived service's booking", () => {
    const retired = booking({
        service: {
            id: "svc_1",
            name: "Check-up",
            status: "ARCHIVED",
            capacity: 1,
            timezone: "Asia/Kolkata",
        },
    } as Partial<BookingDetail>);

    it("tells someone who could move it why they can't", () => {
        draw({ canWrite: true }, retired);
        expect(host.textContent).toContain("so this booking cannot be moved");
    });

    it("doesn't tell a reader to cancel it instead", () => {
        draw({ canWrite: false }, retired);
        expect(host.textContent).not.toContain("or cancel the booking");
    });
});

describe("who holds booking:write (`booking-access.ts`)", () => {
    const can = (actions: string[]) => permits({ actions }, "booking:write");

    it("a Member reads bookings and doesn't change them", () => {
        expect(can(["booking:read", "service:read", "contact:read"])).toBe(
            false,
        );
    });

    it("a calendar-only person changes theirs: the API sends them no other", () => {
        expect(
            can([
                "org:read",
                "module:read",
                "booking:read",
                "booking:write",
                "service:read",
            ]),
        ).toBe(true);
    });

    it("nobody does when the permissions didn't arrive", () => {
        expect(permits({}, "booking:write")).toBe(false);
        expect(permits(null, "booking:write")).toBe(false);
    });
});
