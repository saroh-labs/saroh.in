// @vitest-environment jsdom
/**
 * The bookings list on React Query (DEC-259), in the browser: the page's
 * prefetch is mounted over without a read, a date filter is a new key with
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
import type {
    BookingsAsk,
    BookingsDiary,
    BookingsList,
} from "@/lib/bookings/queries";
import { bookingsRead, diaryAsk, diaryRead } from "@/lib/bookings/queries";
import type { BookingSave } from "@/lib/bookings/use-bookings";
import {
    useBookingSave,
    useBookingSaveWithQuery,
    useBookingsDiary,
    useBookingsList,
} from "@/lib/bookings/use-bookings";
import { domainKey } from "@/lib/query/keys";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const LIST: BookingsList = { bookings: [], timezone: "Asia/Kolkata", now: 1 };
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

/** A browser client holding what the page's server render sent. */
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
    it("first load draws the hydrated rows with no read of its own", async () => {
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

describe("off React Query (a booking's page, Hours)", () => {
    it("saves as before, with no business, and refreshes the page after", async () => {
        let save: BookingSave = {
            save: vi.fn(),
            saved: vi.fn(),
            refresh: vi.fn(),
            org: [],
        };
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
        save.refresh();
        expect(refresh).toHaveBeenCalledTimes(2);
        expect(save.org).toEqual([]);
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });
});

const DIARY = {
    calendar: { timezone: "Asia/Kolkata", money: true, diaries: [] },
    staff: [],
    serviceHours: null,
    googleBusy: null,
    zone: "Asia/Kolkata",
    now: 1,
} as unknown as BookingsDiary;

describe("the diary", () => {
    const ask = diaryAsk("2026-11-25");
    let diary: BookingSave;
    let client: ReturnType<typeof hydrated>;
    let unmount: () => void;
    let setDate: (d: string) => void = () => undefined;
    let placeholder = false;
    const diaryReads = () =>
        fetchMock.mock.calls.filter(
            ([url]) =>
                typeof url === "string" &&
                url.startsWith("/api/bookings/diary"),
        ).length;
    beforeEach(async () => {
        client = hydrated();
        client.setQueryData(diaryRead.options(ORG, ask).queryKey, DIARY);
        type Report = (
            s: BookingSave,
            set: (d: string) => void,
            pending: boolean,
        ) => void;
        function Probe({ report }: { report: Report }) {
            const [date, set] = useState("2026-11-25");
            const q = useBookingsDiary(diaryAsk(date));
            report(useBookingSaveWithQuery(), set, q.isPlaceholderData);
            return null;
        }
        const report: Report = (s, set, pending) => {
            diary = s;
            setDate = set;
            placeholder = pending;
        };
        ({ unmount } = renderWithQuery(<Probe report={report} />, {
            client,
            orgId: ORG,
        }));
        await tick();
    });
    afterEach(() => unmount());

    it("reads a day's week and month once: another day in them reads nothing", async () => {
        expect(ask).toEqual({
            from: "2026-11-01",
            to: "2026-11-30",
            week: "2026-11-23",
        });
        act(() => setDate("2026-11-27"));
        await tick();
        expect(fetchMock).not.toHaveBeenCalled();
        // Another week: one read, the last one kept meanwhile.
        act(() => setDate("2026-12-02"));
        expect(placeholder).toBe(true);
        await tick();
        expect(diaryReads()).toBe(1);
        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "/api/bookings/diary?from=2026-11-30&to=2026-12-31&week=2026-11-30",
        );
    });

    it("a save reads the diary once and marks the list stale", async () => {
        fetchMock.mockImplementation(() =>
            Promise.resolve(
                new Response(JSON.stringify(DIARY), { status: 200 }),
            ),
        );
        const action = vi.fn((..._org: [] | [string]) =>
            Promise.resolve({ ok: true as const }),
        );
        await act(() => diary.save(action));
        expect(action).toHaveBeenCalledWith(ORG);
        expect(diaryReads()).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(
            client.getQueryState(bookingsRead.options(ORG, {}).queryKey)
                ?.isInvalidated,
        ).toBe(true);
        diary.saved();
        await tick();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("a write made some other way reads the diary once, never the page", async () => {
        expect(diary.org).toEqual([ORG]);
        diary.refresh();
        await tick();
        expect(diaryReads()).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(refresh).not.toHaveBeenCalled();
    });
});

interface Seen {
    data: unknown;
    placeholder: boolean;
}

function useStateAsk() {
    return useState<BookingsAsk>({});
}
