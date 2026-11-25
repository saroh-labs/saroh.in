// @vitest-environment jsdom
/**
 * A booking's page on React Query (U26), first paint: nothing of the
 * booking is in the page's HTML; the route's loader shows until its one
 * read lands, then the page draws from it with what the server decided the
 * viewer may do; a payment link is offered only where the booking's money
 * takes one; New booking gets its people from the same read. A first read
 * that fails is the page failing.
 */
import type { ComponentProps, ReactNode } from "react";
import { act, Component } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
    view: vi.fn<(props: Record<string, unknown>) => void>(),
    host: vi.fn<(props: Record<string, unknown>) => void>(),
}));
vi.mock("./booking-detail", () => ({
    BookingDetailView: (props: Record<string, unknown>) => {
        h.view(props);
        return <p>the booking</p>;
    },
}));
vi.mock("@/components/bookings/new-booking/new-booking-host", () => ({
    NewBookingHost: (props: { children: ReactNode }) => {
        h.host(props);
        return props.children;
    },
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

import { renderWithQuery } from "@/lib/query/test-utils";

import { BookingDetailContainer } from "./booking-detail-container";

const BOOKING = {
    id: "bk_1",
    status: "CONFIRMED",
    startAt: "2026-11-30T05:30:00.000Z",
    endAt: "2026-11-30T06:15:00.000Z",
    timezone: "UTC",
    service: { id: "svc_1", timezone: "Asia/Kolkata", capacity: 1 },
    money: { take: { cents: 50000, byLink: true } },
};
const VIEW = {
    booking: BOOKING,
    now: Date.parse("2026-11-25T06:00:00.000Z"),
    person: null,
    staff: [
        {
            id: "p_me",
            name: "Meera",
            status: "ACTIVE",
            paused: false,
            membership: { userId: "u_1" },
            serviceIds: [],
            hours: [],
        },
    ],
    meeting: null,
};

type Props = ComponentProps<typeof BookingDetailContainer>;
const CAN: Props["can"] = {
    write: true,
    refund: false,
    readOrder: false,
    desk: { canTake: true, canLink: true, online: true },
    reassignAny: false,
};

let answer: () => Promise<Response>;
let release: () => void;
beforeEach(() => {
    h.view.mockReset();
    h.host.mockReset();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    release = open;
    answer = () => Promise.resolve(Response.json(VIEW));
    vi.stubGlobal(
        "fetch",
        vi.fn(() => gate.then(() => answer())),
    );
});
afterEach(() => vi.unstubAllGlobals());

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        return this.state.failed ? <p>failed</p> : this.props.children;
    }
}

function render(props: Partial<Props> = {}) {
    return renderWithQuery(
        <Boundary>
            <BookingDetailContainer
                skeleton={<p>Loading the booking</p>}
                ask={{ bookingId: "bk_1" }}
                userId="u_1"
                can={CAN}
                setup={{
                    services: [],
                    people: {
                        canSearch: true,
                        payLink: false,
                        canTakePayment: true,
                        onlinePay: false,
                    },
                    showMoney: true,
                }}
                {...props}
            />
        </Boundary>,
    );
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 20)));

describe("a booking's page, first paint", () => {
    it("shows the loader and no booking until its read lands, then draws from it", async () => {
        const { host, unmount } = render();
        expect(host.textContent).toBe("Loading the booking");
        expect(h.view).not.toHaveBeenCalled();
        release();
        await settle();
        expect(host.textContent).toBe("the booking");
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/bookings/bk_1");
        const props = h.view.mock.calls.at(-1)?.[0];
        expect(props).toMatchObject({
            timezone: "Asia/Kolkata",
            past: false,
            canWrite: true,
            desk: { canTake: true, canLink: true },
            // The viewer's own place on the diary, from the read (#1157).
            reassign: { any: false, me: "p_me" },
        });
        expect(h.host.mock.calls.at(-1)?.[0]).toMatchObject({
            setup: {
                staff: [{ id: "p_me" }],
                timezone: "Asia/Kolkata",
                now: VIEW.now,
            },
        });
        unmount();
    });

    it("offers no link where the booking's money takes none, and no New booking to someone who may not book", async () => {
        answer = () =>
            Promise.resolve(
                Response.json({
                    ...VIEW,
                    booking: {
                        ...BOOKING,
                        money: { take: { cents: 50000, byLink: false } },
                    },
                }),
            );
        const { unmount } = render({
            can: { ...CAN, write: false },
            setup: null,
        });
        release();
        await settle();
        expect(h.view.mock.calls.at(-1)?.[0]).toMatchObject({
            canWrite: false,
            desk: { canLink: false },
        });
        expect(h.host).not.toHaveBeenCalled();
        unmount();
    });

    it("a first read that fails is the page failing", async () => {
        answer = () =>
            Promise.resolve(
                Response.json({ code: "unavailable" }, { status: 503 }),
            );
        const spy = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        const { host, unmount } = render();
        release();
        await settle();
        expect(host.textContent).toBe("failed");
        expect(h.view).not.toHaveBeenCalled();
        spy.mockRestore();
        unmount();
    });
});
