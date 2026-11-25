// @vitest-environment jsdom
/**
 * Hours and time off on React Query (U25): the header is drawn at once and
 * the editor's region is a skeleton until the read lands (no rows); a
 * failed read says so with Try again; a save made on it reads the screen
 * once and only marks the diary, Home and the Business calendar stale; a
 * refusal reads nothing.
 */
import { act } from "react";

import type { BookingSave } from "@/lib/bookings/use-bookings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => ({
    save: null as null | BookingSave,
    props: null as null | Record<string, unknown>,
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/api/http", () => ({}));
// The editor is drawn in its own tests: here, what it is handed, and the
// saves it would use.
vi.mock("./availability-editor", async () => {
    const { useBookingSave } = await import("@/lib/bookings/use-bookings");
    return {
        AvailabilityEditor: (props: Record<string, unknown>) => {
            probe.save = useBookingSave();
            probe.props = props;
            return <p>Weekly hours</p>;
        },
    };
});

import type { AvailabilityView } from "@/lib/bookings/queries";
import { availabilityRead, diaryRead } from "@/lib/bookings/queries";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

import { AvailabilityContainer } from "./availability-container";

const ORG = "org_1";
const VIEW: AvailabilityView = {
    staff: [],
    closures: [],
    openingHours: null,
    timezone: "Asia/Kolkata",
    today: "2026-10-19",
    rules: null,
    serviceHours: null,
    services: [],
    onlineBlocker: null,
    kept: [],
    bookedOn: {},
    requests: [],
    mine: null,
};

const GATES = {
    person: "st_meera",
    business: "Kaya Physio",
    me: "Mohit Mehta",
    meId: "u_mohit",
    canEdit: true,
    canManage: true,
    seatNote: null,
    limitNotice: null,
};

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const reads = (path = "/api/bookings/availability") =>
    fetchMock.mock.calls.filter(
        ([url]) => typeof url === "string" && url.startsWith(path),
    ).length;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    probe.save = null;
    probe.props = null;
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify(VIEW), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Hours and time off before its first read", () => {
    it("draws the header at once and a skeleton where the week goes", async () => {
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        fetchMock.mockImplementation(async () => {
            await gate;
            return new Response(JSON.stringify(VIEW), { status: 200 });
        });
        const { host, unmount } = renderWithQuery(
            <AvailabilityContainer {...GATES} />,
            { orgId: ORG },
        );
        expect(host.querySelector("h1")?.textContent).toBe(
            "Hours and time off",
        );
        expect(host.querySelector('[data-slot="page-loading"]')).not.toBeNull();
        expect(host.textContent).not.toContain("Weekly hours");
        release();
        await tick();
        expect(host.querySelector('[data-slot="page-loading"]')).toBeNull();
        expect(host.textContent).toContain("Weekly hours");
        expect(probe.props).toMatchObject({
            person: "st_meera",
            canEdit: true,
            personRules: { meId: "u_mohit", requests: [], mine: null },
        });
        expect(reads()).toBe(1);
        unmount();
    });

    it("says when everyone's hours couldn't be read, with Try again", async () => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ code: "unavailable" }), {
                status: 503,
            }),
        );
        const { host, unmount } = renderWithQuery(
            <AvailabilityContainer {...GATES} />,
            { orgId: ORG },
        );
        await tick();
        expect(host.textContent).toContain("Couldn't load everyone's hours");
        expect(
            host.querySelector('a[href="/bookings/availability"]'),
        ).not.toBeNull();
        unmount();
    });
});

describe("Hours and time off's saves", () => {
    /** A tab that has seen the diary and the Business calendar earlier. */
    function seen() {
        const client = makeTestClient();
        client.setQueryData(availabilityRead.options(ORG, {}).queryKey, VIEW);
        const diaryKey = diaryRead.options(ORG, {
            from: "2026-10-19",
            to: "2026-11-01",
            week: "2026-10-19",
        }).queryKey;
        client.setQueryData(diaryKey, {} as never);
        const calendarKey = domainKey("calendar", ORG, "range", {});
        client.setQueryData(calendarKey, {});
        return { client, diaryKey, calendarKey };
    }

    it("a save reads the screen once; the diary and calendar are only marked stale", async () => {
        const { client, diaryKey, calendarKey } = seen();
        const { unmount } = renderWithQuery(
            <AvailabilityContainer {...GATES} />,
            { client, orgId: ORG },
        );
        await tick();
        expect(reads()).toBe(0);
        const write = vi.fn((..._org: string[]) =>
            Promise.resolve({ ok: true as const }),
        );
        await act(async () => {
            await probe.save?.save(write);
        });
        await tick();
        // The tab's business goes with the write (writeAsOrg).
        expect(write).toHaveBeenCalledWith(ORG);
        expect(reads()).toBe(1);
        expect(reads("/api/bookings/diary")).toBe(0);
        expect(client.getQueryState(diaryKey)?.isInvalidated).toBe(true);
        expect(client.getQueryState(calendarKey)?.isInvalidated).toBe(true);
        // Hours and time off's own saves made outside `save` (Undo, a
        // queue of hour changes) read it the same way.
        act(() => probe.save?.refresh());
        await tick();
        expect(reads()).toBe(2);
        expect(probe.save?.org).toEqual([ORG]);
        unmount();
    });

    it("a refused save reads nothing and marks nothing stale", async () => {
        const { client, diaryKey } = seen();
        const { unmount } = renderWithQuery(
            <AvailabilityContainer {...GATES} />,
            { client, orgId: ORG },
        );
        await tick();
        await act(async () => {
            await probe.save?.save(() =>
                Promise.resolve({ ok: false as const, error: "Not allowed." }),
            );
        });
        await tick();
        expect(reads()).toBe(0);
        expect(client.getQueryState(diaryKey)?.isInvalidated).toBe(false);
        unmount();
    });
});
