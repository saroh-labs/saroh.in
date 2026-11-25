/**
 * The React Query client (DEC-259): one for the browser, a new one per
 * server render, the defaults the plan sets, the business list held for the
 * whole visit, and what a failed read does app-wide. A stale list refreshes
 * the page once, never in a loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ROLE_DENIED } from "@/lib/api/role-denied";
import {
    getBrowserQueryClient,
    makeQueryClient,
    onReadError,
    ReadFailed,
    resetReadErrorGuard,
    setReadErrorHooks,
} from "@/lib/query/client";
import { domainKey, ORGANIZATIONS_KEY } from "@/lib/query/keys";

describe("which client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("on the server, a new one every time: no request sees another's", () => {
        expect(getBrowserQueryClient()).not.toBe(getBrowserQueryClient());
    });

    it("in the browser, the same one for the visit", () => {
        vi.stubGlobal("window", {});
        expect(getBrowserQueryClient()).toBe(getBrowserQueryClient());
    });
});

describe("defaults", () => {
    it("read every visit, no retries, no refetch on focus or reconnect", () => {
        const q = makeQueryClient().getDefaultOptions().queries;
        expect(q).toMatchObject({
            staleTime: 0,
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
        });
    });

    it("keeps the business list for the visit", () => {
        const q = makeQueryClient().getQueryDefaults(ORGANIZATIONS_KEY);
        expect(q.staleTime).toBe(Infinity);
        expect(q.gcTime).toBe(Infinity);
    });
});

describe("a failed read", () => {
    const refresh = vi.fn();
    const signIn = vi.fn();
    let client: ReturnType<typeof makeQueryClient>;

    beforeEach(() => {
        refresh.mockReset();
        signIn.mockReset();
        resetReadErrorGuard();
        setReadErrorHooks({ refresh, signIn });
        client = makeQueryClient();
        client.setQueryData(ORGANIZATIONS_KEY, [{ id: "o1" }]);
    });
    afterEach(() => setReadErrorHooks(null));

    const listStale = () =>
        client.getQueryState(ORGANIZATIONS_KEY)?.isInvalidated;

    it("in another business: the list is marked stale and the page drawn again, once", () => {
        onReadError(client, new ReadFailed(409, "org_mismatch"));
        onReadError(client, new ReadFailed(409, "org_mismatch"));
        expect(listStale()).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("refused, not for the role (removed elsewhere): the same", () => {
        onReadError(client, new ReadFailed(403));
        expect(listStale()).toBe(true);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("refused for the role: the screen says so; nothing app-wide", () => {
        onReadError(client, new ReadFailed(403, ROLE_DENIED));
        expect(listStale()).toBe(false);
        expect(refresh).not.toHaveBeenCalled();
    });

    it("signed out: the cache is dropped and sign-in follows", () => {
        onReadError(client, new ReadFailed(401));
        expect(client.getQueryData(ORGANIZATIONS_KEY)).toBeUndefined();
        expect(signIn).toHaveBeenCalledTimes(1);
    });

    it("any refusal marks the settings reads stale, at most once in 10 s", () => {
        const settings = domainKey("shell", "o1", "settings");
        const records = domainKey("products", "o1", "list");
        client.getQueryCache().build(client, {
            queryKey: settings,
            meta: { tier: "settings" },
        });
        client.setQueryData(settings, { moduleKeys: ["COMMERCE"] });
        client.setQueryData(records, [1]);
        const stale = () => client.getQueryState(settings)?.isInvalidated;
        // A module turned off elsewhere: the gate's no is the role's.
        onReadError(client, new ReadFailed(403, ROLE_DENIED));
        expect(stale()).toBe(true);
        expect(client.getQueryState(records)?.isInvalidated).toBe(false);
        // Read again, then refused again within 10 s: not again.
        client.setQueryData(settings, { moduleKeys: [] });
        onReadError(client, new ReadFailed(403));
        expect(stale()).toBe(false);
        // A failure that isn't a refusal never does.
        resetReadErrorGuard();
        onReadError(client, new ReadFailed(503));
        expect(stale()).toBe(false);
    });

    it("anything else is the screen's failed state", () => {
        onReadError(client, new ReadFailed(503));
        onReadError(client, new Error("network"));
        expect(listStale()).toBe(false);
        expect(refresh).not.toHaveBeenCalled();
        expect(signIn).not.toHaveBeenCalled();
    });
});
