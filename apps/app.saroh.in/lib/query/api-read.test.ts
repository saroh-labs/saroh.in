/**
 * The browser's read (DEC-259): same origin, the key's business in the
 * header, no following redirects, and a failure is a ReadFailed, never an
 * empty answer. Through a query, the client answers it app-wide: signed
 * out clears and goes to sign-in; another business, or a 403, marks the
 * business list stale.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRead } from "@/lib/query/api-read";
import {
    makeQueryClient,
    ReadFailed,
    resetReadErrorGuard,
    setReadErrorHooks,
} from "@/lib/query/client";
import { domainKey, ORGANIZATIONS_KEY } from "@/lib/query/keys";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status });

describe("apiRead", () => {
    it("asks same-origin, with the key's business, following no redirect", async () => {
        fetchMock.mockResolvedValue(json(200, [{ id: 1 }]));
        const data = await apiRead(
            "/api/probe",
            { q: "tea", size: 20, skip: undefined },
            { orgId: "org_a" },
        );
        expect(data).toEqual([{ id: 1 }]);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/probe?q=tea&size=20");
        expect(init).toMatchObject({
            method: "GET",
            credentials: "same-origin",
            redirect: "manual",
            headers: { "x-organization-id": "org_a" },
        });
    });

    it("a redirect (the sign-in gate) or a 401 is signed out", async () => {
        const redirect = Object.defineProperty(
            new Response(null, { status: 200 }),
            "type",
            {
                value: "opaqueredirect",
            },
        );
        for (const res of [
            redirect,
            new Response(null, { status: 401 }),
            new Response(null, { status: 302, headers: { location: "/" } }),
        ]) {
            fetchMock.mockResolvedValueOnce(res);
            await expect(
                apiRead("/api/probe", {}, { orgId: "org_a" }),
            ).rejects.toMatchObject({ status: 401 });
        }
    });

    it("any other failure throws ReadFailed with its code, never an empty list", async () => {
        fetchMock.mockResolvedValueOnce(json(409, { code: "org_mismatch" }));
        await expect(
            apiRead("/api/probe", {}, { orgId: "org_a" }),
        ).rejects.toEqual(new ReadFailed(409, "org_mismatch"));
        fetchMock.mockResolvedValueOnce(new Response("oops", { status: 503 }));
        const err = await apiRead("/api/probe", {}, { orgId: "org_a" }).catch(
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ReadFailed);
        expect(err).toMatchObject({ status: 503, code: undefined });
    });
});

describe("a failed read, through a query", () => {
    const refresh = vi.fn();
    const signIn = vi.fn();
    beforeEach(() => {
        refresh.mockReset();
        signIn.mockReset();
        resetReadErrorGuard();
        setReadErrorHooks({ refresh, signIn });
    });
    afterEach(() => setReadErrorHooks(null));

    async function readWith(res: Response) {
        const client = makeQueryClient();
        client.setQueryData(ORGANIZATIONS_KEY, [{ id: "org_a" }]);
        fetchMock.mockResolvedValue(res);
        await client
            .fetchQuery({
                queryKey: domainKey("probe", "org_a", "list"),
                queryFn: () => apiRead("/api/probe", {}, { orgId: "org_a" }),
            })
            .catch(() => undefined);
        return client;
    }

    it("org_mismatch marks the business list stale, without reading it", async () => {
        const client = await readWith(json(409, { code: "org_mismatch" }));
        expect(client.getQueryState(ORGANIZATIONS_KEY)?.isInvalidated).toBe(
            true,
        );
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a 403 marks it stale too", async () => {
        const client = await readWith(json(403, { code: "forbidden" }));
        expect(client.getQueryState(ORGANIZATIONS_KEY)?.isInvalidated).toBe(
            true,
        );
    });

    it("signed out clears the cache and goes to sign-in", async () => {
        const client = await readWith(new Response(null, { status: 401 }));
        expect(client.getQueryCache().getAll()).toHaveLength(0);
        expect(signIn).toHaveBeenCalledTimes(1);
    });
});
