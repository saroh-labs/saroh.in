// @vitest-environment jsdom
/**
 * Home on React Query (DEC-259), in the browser: the first load reads Home
 * once (nothing comes with the page's HTML), a Home already read is
 * mounted over without a read, a save that changes Home reads it once and
 * stays busy until it is back, a refusal reads nothing, and a part drawn
 * on its own saves as before.
 */
import { dehydrate, hydrate } from "@tanstack/react-query";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@saroh/ui/toast", () => ({ showError: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));

import { homeRead, homeSetupRead } from "@/lib/home/queries";
import type { HomeSave } from "@/lib/home/use-home";
import {
    useHome,
    useHomeSave,
    useHomeSaveWithQuery,
} from "@/lib/home/use-home";
import { getBrowserQueryClient } from "@/lib/query/client";
import { clearAll } from "@/lib/query/invalidate";
import { makeTestClient, renderWithQuery } from "@/lib/query/test-utils";

const ORG = "org_1";
const HOME = { view: "business", needs: [{ id: "n1" }] };

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const reads = (path: string) =>
    fetchMock.mock.calls.filter(([url]) => url === path).length;

beforeEach(() => {
    fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(
            new Response(JSON.stringify({ ...HOME, needs: [] }), {
                status: 200,
            }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** A browser client that has already read Home (an earlier visit). */
function hydrated() {
    const server = makeTestClient();
    server.setQueryData(homeRead.options(ORG, {}).queryKey, HOME as never);
    server.setQueryData(homeSetupRead.options(ORG, {}).queryKey, {} as never);
    const client = makeTestClient();
    hydrate(client, dehydrate(server));
    return client;
}

describe("Home's reads", () => {
    it("first load has nothing, then Home from one read in the browser", async () => {
        const seen: unknown[] = [];
        function Probe() {
            seen.push(useHome().data);
            return null;
        }
        const { unmount } = renderWithQuery(<Probe />, {
            client: makeTestClient(),
            orgId: ORG,
        });
        expect(seen[0]).toBeUndefined();
        await act(() => new Promise((r) => setTimeout(r, 20)));
        expect(seen.at(-1)).toEqual({ ...HOME, needs: [] });
        expect(reads("/api/home")).toBe(1);
        unmount();
    });

    it("a Home already read is mounted over without a read", async () => {
        let shown: unknown;
        function Probe() {
            shown = useHome().data;
            return null;
        }
        const { unmount } = renderWithQuery(<Probe />, {
            client: hydrated(),
            orgId: ORG,
        });
        await act(() => new Promise((r) => setTimeout(r, 20)));
        expect(shown).toEqual(HOME);
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });
});

describe("a save from Home", () => {
    let save: HomeSave;
    let unmount: () => void;
    let client: ReturnType<typeof hydrated>;
    beforeEach(() => {
        client = hydrated();
        function Probe() {
            useHome();
            save = useHomeSaveWithQuery();
            return null;
        }
        ({ unmount } = renderWithQuery(<Probe />, { client, orgId: ORG }));
    });
    afterEach(() => unmount());

    it("hands the action the tab's business, reads Home once, busy until it is back", async () => {
        const busy: boolean[] = [];
        const write = vi.fn((...org: [] | [string]) =>
            Promise.resolve({ ok: true, org: org[0] }),
        );
        let done: unknown;
        await act(async () => {
            done = await save(write, {
                reread: true,
                setBusy: (on) => {
                    // Off only once the read has come back.
                    busy.push(on);
                    if (!on) expect(reads("/api/home")).toBe(1);
                },
            });
        });
        expect(done).toEqual({ ok: true, org: ORG });
        expect(busy).toEqual([true, false]);
        expect(reads("/api/home")).toBe(1);
        // "Finish setup" isn't what a Needs you write changes.
        expect(reads("/api/home/setup")).toBe(0);
        expect(client.getQueryData(homeRead.options(ORG, {}).queryKey)).toEqual(
            { ...HOME, needs: [] },
        );
    });

    it("a refusal, or a write that doesn't change Home, reads nothing", async () => {
        await act(async () => {
            await save(() => Promise.resolve({ ok: false, error: "No" }), {
                reread: true,
            });
            await save(() => Promise.resolve({ ok: true }), { reread: false });
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("a switch or sign-out", () => {
    it("drops Home's cache in this tab", () => {
        const browser = getBrowserQueryClient();
        hydrate(browser, dehydrate(hydrated()));
        expect(
            browser.getQueryData(homeRead.options(ORG, {}).queryKey),
        ).toEqual(HOME);
        clearAll();
        expect(
            browser.getQueryData(homeRead.options(ORG, {}).queryKey),
        ).toBeUndefined();
    });
});

describe("a part drawn on its own", () => {
    it("saves without a business id or a read", async () => {
        let save: HomeSave | undefined;
        function Probe() {
            save = useHomeSave();
            return null;
        }
        const { unmount } = renderWithQuery(<Probe />, { orgId: ORG });
        const write = vi.fn((...org: [] | [string]) =>
            Promise.resolve({ ok: true, n: org.length }),
        );
        let done: unknown;
        await act(async () => {
            done = await save?.(write, { reread: true });
        });
        expect(done).toEqual({ ok: true, n: 0 });
        expect(fetchMock).not.toHaveBeenCalled();
        unmount();
    });
});
