// @vitest-environment jsdom
/**
 * The Business Calendar on React Query (DEC-259), in the browser: the
 * first load shows the route's loader, then the month from one read
 * (nothing comes with the page's HTML); a month already read is mounted
 * over without a read; a new month is one read,
 * the old one kept and greyed meanwhile; Back opens a month seen from the
 * cache; a failed read is the segment's failed state; a switch or sign-out
 * drops it all.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { act, Component } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The address as Next reads it: the browser's own, read again on a change.
vi.mock("next/navigation", async () => {
    const { useSyncExternalStore } = await import("react");
    const subscribe = (onChange: () => void) => {
        window.addEventListener("popstate", onChange);
        return () => window.removeEventListener("popstate", onChange);
    };
    return {
        useSearchParams: () =>
            new URLSearchParams(
                useSyncExternalStore(subscribe, () => window.location.search),
            ),
        useRouter: () => ({
            push: vi.fn(),
            replace: vi.fn(),
            refresh: vi.fn(),
        }),
        usePathname: () => "/calendar",
    };
});
vi.mock("@/components/ask-ai/ask-ai-page", () => ({ AskAiPageIs: () => null }));
// The parts are props-in and tested on their own: here, what they're given.
const shown = vi.hoisted(() => ({
    props: null as null | Record<string, unknown>,
}));
vi.mock("@/components/calendar/business-calendar", async () => {
    const { useScreenPending } =
        await import("@/components/shared/page/screen-pending");
    return {
        BusinessCalendar: (props: Record<string, unknown>) => {
            shown.props = {
                ...props,
                pending: useScreenPending(),
                view: "month",
            };
            return null;
        },
    };
});
vi.mock("@/components/calendar/business-week", () => ({
    BusinessWeek: (props: Record<string, unknown>) => {
        shown.props = { ...props, view: "week" };
        return null;
    },
}));
vi.mock("@/components/calendar/calendar-nothing", () => ({
    CalendarLocked: () => {
        shown.props = { locked: true };
        return null;
    },
    CalendarNothing: () => {
        shown.props = { nothing: true };
        return null;
    },
}));

import { CalendarContainer } from "@/components/calendar/calendar-container";
import { calendarRead } from "@/lib/calendar/queries";
import { getBrowserQueryClient } from "@/lib/query/client";
import { clearAll } from "@/lib/query/invalidate";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const NOW = {
    today: "2026-11-24",
    thisMonth: "2026-11",
    joinedAt: "2026-03-10",
};
const CAN = { order: true, book: true, remind: true, retry: true, money: true };

const days = (month: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
        date: `${month}-${String(i + 1).padStart(2, "0")}`,
        layers: {},
        toActOn: 0,
    }));
const month = (m: string) => ({
    kind: "month",
    data: {
        month: m,
        timezone: "Asia/Kolkata",
        layers: ["orders"],
        totals: {},
        days: days(m, 30),
        unavailable: [],
    },
});
const NOV = { from: "2026-11-01", to: "2026-11-30" };

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let answer: (url: string) => Promise<Response>;
const reads = () => fetchMock.mock.calls.map(([url]) => url as string);
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    window.history.replaceState(null, "", "/calendar");
    shown.props = null;
    answer = (url) => {
        const from = new URL(url, "https://x").searchParams.get("from") ?? "";
        return Promise.resolve(
            new Response(JSON.stringify(month(from.slice(0, 7))), {
                status: 200,
            }),
        );
    };
    fetchMock = vi.fn<typeof fetch>((url) => answer(url as string));
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A browser client that has already read November (an earlier visit). */
function hydrated() {
    const server = makeTestClient();
    server.setQueryData(
        calendarRead.options(ORG, NOV).queryKey,
        month("2026-11") as never,
    );
    const client = makeTestClient();
    hydrate(client, dehydrate(server));
    return client;
}

const SKELETON = <p>loading</p>;

function open(client = hydrated()) {
    return renderWithQuery(
        <CalendarContainer now={NOW} can={CAN} skeleton={SKELETON} />,
        { client, orgId: ORG },
    );
}

/** The address changed in place (a link's `pushState`, or Back). */
const go = (search: string) =>
    act(() => {
        window.history.pushState(
            null,
            "",
            `/calendar${search ? `?${search}` : ""}`,
        );
        window.dispatchEvent(new PopStateEvent("popstate"));
    });
const drawn = () => (shown.props?.data as { month: string } | undefined)?.month;

/** Holds the next read until `release()`. */
function held() {
    let release = () => undefined as unknown;
    const prev = answer;
    answer = (url) =>
        new Promise((resolve) => {
            release = () => void prev(url).then(resolve);
        });
    return () => release();
}

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
    state = { error: null as unknown };
    static getDerivedStateFromError(error: unknown) {
        return { error };
    }
    render() {
        return this.state.error ? <p>failed</p> : this.props.children;
    }
}

describe("the calendar's reads", () => {
    it("first load shows the loader, then this month from one read", async () => {
        const release = held();
        const { host, unmount } = open(makeTestClient());
        expect(host.textContent).toBe("loading");
        expect(shown.props).toBeNull();
        release();
        await tick();
        expect(host.textContent).toBe("");
        expect(drawn()).toBe("2026-11");
        expect(reads()).toEqual([
            "/api/calendar?from=2026-11-01&to=2026-11-30",
        ]);
        unmount();
    });

    it("no business found is the nothing state", async () => {
        answer = () =>
            Promise.resolve(
                new Response(JSON.stringify({ code: "not_found" }), {
                    status: 404,
                }),
            );
        const { unmount } = open(makeTestClient());
        await tick();
        expect(shown.props).toEqual({ nothing: true });
        unmount();
    });

    it("a month already read is mounted over without a read", async () => {
        const { unmount } = open();
        await tick();
        expect(shown.props).toMatchObject({ view: "month", pending: false });
        expect(drawn()).toBe("2026-11");
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });

    it("a new month is one read, the old one kept and greyed until it lands", async () => {
        const { unmount } = open();
        const release = held();
        go("month=2026-10");
        await tick();
        expect(drawn()).toBe("2026-11");
        expect(shown.props?.pending).toBe(true);
        release();
        await tick();
        expect(drawn()).toBe("2026-10");
        expect(shown.props?.pending).toBe(false);
        expect(reads()).toEqual([
            "/api/calendar?from=2026-10-01&to=2026-10-31",
        ]);
        unmount();
    });

    it("Back opens a month seen from the cache, not greyed", async () => {
        const { unmount } = open();
        go("month=2026-10");
        await tick();
        fetchMock.mockClear();
        held();
        go("");
        expect(drawn()).toBe("2026-11");
        expect(shown.props?.pending).toBe(false);
        // Fresh from a moment ago: nothing read again.
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });

    it("a switch to the week keeps the month drawn as a month until the week lands", async () => {
        const { unmount } = open();
        const release = held();
        go("view=week&day=2026-11-10");
        await tick();
        expect(shown.props).toMatchObject({ view: "month", pending: true });
        release();
        await tick();
        expect(reads()).toEqual([
            "/api/calendar?from=2026-11-09&to=2026-11-15",
        ]);
        unmount();
    });

    it("a range out of reach keys on the clamped range and fixes the address", async () => {
        const replace = vi.spyOn(window.history, "replaceState");
        const { unmount } = open();
        go("month=2030-01&team=st_1");
        await tick();
        expect(reads()).toEqual([
            "/api/calendar?from=2027-02-01&to=2027-02-28",
        ]);
        expect(replace).toHaveBeenCalledWith(
            null,
            "",
            "/calendar?month=2027-02",
        );
        replace.mockRestore();
        unmount();
    });

    it("a failed read is the segment's failed state; a locked answer the locked one", async () => {
        answer = () =>
            Promise.resolve(
                new Response(JSON.stringify({ code: "unavailable" }), {
                    status: 503,
                }),
            );
        const client = hydrated();
        const { host, unmount } = renderWithQuery(
            <Boundary>
                <CalendarContainer now={NOW} can={CAN} skeleton={SKELETON} />
            </Boundary>,
            { client, orgId: ORG },
        );
        go("month=2026-10");
        await tick();
        expect(host.textContent).toBe("failed");
        unmount();

        answer = () =>
            Promise.resolve(
                new Response(JSON.stringify({ kind: "locked" }), {
                    status: 200,
                }),
            );
        const again = open();
        go("month=2026-10");
        await tick();
        expect(shown.props).toEqual({ locked: true });
        again.unmount();
    });
});

describe("a switch or sign-out", () => {
    it("drops the calendar's cache in this tab", () => {
        const browser = getBrowserQueryClient();
        hydrate(browser, dehydrate(hydrated()));
        const key = calendarRead.options(ORG, NOV).queryKey;
        expect(browser.getQueryData(key)).toEqual(month("2026-11"));
        clearAll();
        expect(browser.getQueryData(key)).toBeUndefined();
    });
});
