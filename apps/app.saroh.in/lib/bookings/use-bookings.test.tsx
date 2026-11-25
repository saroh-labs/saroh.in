// @vitest-environment jsdom
/**
 * The bookings list on React Query (DEC-259), in the browser: the first
 * load reads the list once (nothing comes with the page's HTML), a list
 * already read is mounted over without a read, a date filter is a new key with
 * the old rows kept meanwhile, a save reads the list once (Home and the
 * calendar only marked stale), a refusal reads nothing, and a part drawn
 * outside the list saves and refreshes as before.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { showError, refresh } = vi.hoisted(() => ({
    showError: vi.fn(),
    refresh: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => ({ showError }));
vi.mock("next/navigation", () => ({
    unstable_rethrow: () => undefined,
    useRouter: () => ({ refresh }),
}));

import { UNREACHED } from "@/lib/api/unreached";
import type { BookingsAsk, BookingsList } from "@/lib/bookings/queries";
import { bookingsRead } from "@/lib/bookings/queries";
import type { BookingSave } from "@/lib/bookings/use-bookings";
import {
    useBookingSave,
    useBookingSaveWithQuery,
    useBookingsList,
} from "@/lib/bookings/use-bookings";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const LIST: BookingsList = {
    bookings: [],
    timezone: "Asia/Kolkata",
    now: 1,
    moment: null,
    share: null,
};
const WEEK: BookingsList = { ...LIST, now: 2 };

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const reads = () =>
    fetchMock.mock.calls.filter(
        ([url]) => typeof url === "string" && url.startsWith("/api/bookings"),
    ).length;
const tick = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

beforeEach(() => {
    showError.mockReset();
    refresh.mockReset();
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(JSON.stringify(WEEK), { status: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A browser client that has already read the list (an earlier visit). */
function hydrated() {
    const server = makeTestClient();
    server.setQueryData(bookingsRead.options(ORG, {}).queryKey, LIST);
    const client = makeTestClient();
    hydrate(client, dehydrate(server));
    // Home and the calendar, seen earlier in this tab.
    client.setQueryData(domainKey("home", ORG, "home"), {});
    client.setQueryData(domainKey("calendar", ORG, "range", {}), {});
    return client;
}

describe("the list's reads", () => {
    it("first load has no rows, then the list from one read in the browser", async () => {
        const seen: unknown[] = [];
        function Probe() {
            seen.push(useBookingsList({}).data);
            return null;
        }
        const { unmount } = renderWithQuery(<Probe />, {
            client: makeTestClient(),
            orgId: ORG,
        });
        expect(seen[0]).toBeUndefined();
        await tick();
        expect(seen.at(-1)).toEqual(WEEK);
        expect(reads()).toBe(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/bookings");
        unmount();
    });

    it("a list already read is mounted over without a read", async () => {
        let shown: unknown;
        function Probe({ report }: { report: (data: unknown) => void }) {
            report(useBookingsList({}).data);
            return null;
        }
        const { unmount } = renderWithQuery(
            <Probe report={(d) => (shown = d)} />,
            {
                client: hydrated(),
                orgId: ORG,
            },
        );
        await tick();
        expect(shown).toEqual(LIST);
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });

    it("a date filter is a new key: one read, the old rows kept until it lands", async () => {
        const seen: Seen[] = [];
        let setAsk: (ask: BookingsAsk) => void = () => undefined;
        function Probe({
            report,
        }: {
            report: (set: (ask: BookingsAsk) => void, q: Seen) => void;
        }) {
            const [ask, set] = useStateAsk();
            const q = useBookingsList(ask);
            report(set, { data: q.data, placeholder: q.isPlaceholderData });
            return null;
        }
        const report = (set: (ask: BookingsAsk) => void, q: Seen) => {
            setAsk = set;
            seen.push(q);
        };
        const { unmount } = renderWithQuery(<Probe report={report} />, {
            client: hydrated(),
            orgId: ORG,
        });
        await tick();
        act(() => setAsk({ date: "7d" }));
        // While it is on its way: the register, as a placeholder.
        expect(seen.at(-1)).toEqual({ data: LIST, placeholder: true });
        await tick();
        expect(seen.at(-1)).toEqual({ data: WEEK, placeholder: false });
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/bookings?date=7d");
        expect(
            new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get(
                "x-organization-id",
            ),
        ).toBe(ORG);
        // Back to the register: drawn from the cache at once.
        act(() => setAsk({}));
        expect(seen.at(-1)?.data).toEqual(LIST);
        unmount();
    });
});

describe("a save on the list", () => {
    let list: BookingSave;
    let client: ReturnType<typeof hydrated>;
    let unmount: () => void;
    beforeEach(async () => {
        client = hydrated();
        function Probe({ report }: { report: (s: BookingSave) => void }) {
            useBookingsList({});
            report(useBookingSaveWithQuery());
            return null;
        }
        ({ unmount } = renderWithQuery(<Probe report={(s) => (list = s)} />, {
            client,
            orgId: ORG,
        }));
        await tick();
    });
    afterEach(() => unmount());

    const stale = (key: readonly unknown[]) =>
        client.getQueryState(key)?.isInvalidated;

    it("sends the tab's business, reads the list once, and stays busy until it is back", async () => {
        const action = vi.fn((..._org: [] | [string]) =>
            Promise.resolve({ ok: true as const }),
        );
        const busy: boolean[] = [];
        let done = false;
        const p = list
            .save(action, { setBusy: (b) => busy.push(b) })
            .then((r) => {
                done = true;
                return r;
            });
        await act(() => p);
        expect(done).toBe(true);
        expect(action).toHaveBeenCalledWith(ORG);
        expect(reads()).toBe(1);
        expect(busy).toEqual([true, false]);
        // Not on screen here: marked stale, never read.
        expect(stale(domainKey("home", ORG, "home"))).toBe(true);
        expect(stale(domainKey("calendar", ORG, "range", {}))).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        list.saved();
        expect(refresh).not.toHaveBeenCalled();
    });

    it("a refusal is handed back untouched and reads nothing", async () => {
        const refused = { ok: false as const, error: "That time was taken." };
        const res = await act(() => list.save(() => Promise.resolve(refused)));
        expect(res).toBe(refused);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(stale(domainKey("home", ORG, "home"))).toBe(false);
    });

    it("one that never got there says so once, unless the caller says it", async () => {
        const told = vi.fn();
        const fail = () => Promise.reject(new Error("offline"));
        expect(await act(() => list.save(fail))).toBeUndefined();
        expect(showError).toHaveBeenCalledWith(UNREACHED);
        showError.mockReset();
        await act(() => list.save(fail, { quiet: true, onUnreached: told }));
        expect(showError).not.toHaveBeenCalled();
        expect(told).toHaveBeenCalledWith(UNREACHED);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("outside the list (the diary, a booking's page)", () => {
    it("saves as before, with no business, and refreshes the page after", async () => {
        let save: BookingSave = { save: vi.fn(), saved: vi.fn() };
        function Probe({ report }: { report: (s: BookingSave) => void }) {
            report(useBookingSave());
            return null;
        }
        const { unmount } = renderWithQuery(
            <Probe report={(s) => (save = s)} />,
            { orgId: ORG },
        );
        const action = vi.fn((..._org: [] | [string]) =>
            Promise.resolve({ ok: true as const }),
        );
        await act(() => save.save(action));
        expect(action).toHaveBeenCalledWith();
        save.saved();
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });
});

interface Seen {
    data: unknown;
    placeholder: boolean;
}

function useStateAsk() {
    return useState<BookingsAsk>({});
}
