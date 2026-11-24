/**
 * One read, two paths (DEC-259): the page's prefetch asks the service and
 * the browser asks the route, and both give the same JSON, Dates and
 * `undefined` fields included. A prefetch that fails never throws from the
 * page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const active = vi.hoisted(() => ({ id: "org_a" }));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));

import { ApiError } from "@/lib/api/errors";
import { defineRead, toWire } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";
import { prefetchRead } from "@/lib/query/prefetch";
import { readRoute, searchText } from "@/lib/query/route";
import { expectReadContract, makeTestClient } from "@/lib/query/test-utils";

interface Row {
    id: string;
    at: Date;
    note?: string;
    tags: string[];
}
const read = defineRead<Row[]>()({
    key: (orgId, p) => domainKey("probe", orgId, "list", p),
    route: { path: "/api/probe", params: { q: searchText } },
});
const service = vi.fn<(p: { q?: string }) => Promise<Row[] | null>>();
const def = { read, service };
const GET = readRoute(def);

beforeEach(() => {
    service.mockReset();
    service.mockResolvedValue([
        {
            id: "r1",
            at: new Date("2026-11-24T10:00:00Z"),
            note: undefined,
            tags: [],
        },
    ]);
});

describe("defineRead", () => {
    it("prefetch and route answer the same JSON", async () => {
        await expectReadContract(def, GET, "org_a", { q: "tea" }, { q: "tea" });
    });

    it("the key carries the business; the browser asks the route with it", async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response("[]", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        try {
            const opts = read.options("org_a", { q: "tea" });
            expect(opts.queryKey).toEqual([
                "probe",
                "org_a",
                "list",
                { q: "tea" },
            ]);
            await makeTestClient().fetchQuery(opts);
            expect(fetchMock.mock.calls[0][0]).toBe("/api/probe?q=tea");
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("a failed prefetch, or a missing record, doesn't throw and holds no data", async () => {
        for (const fail of [
            () => service.mockRejectedValueOnce(new ApiError(500, "GET /x")),
            () => service.mockResolvedValueOnce(null),
        ]) {
            fail();
            const client = makeTestClient();
            await expect(
                prefetchRead(client, def, "org_a", {}),
            ).resolves.toBeUndefined();
            const state = client.getQueryState(read.key("org_a", {}));
            expect(state?.status).toBe("error");
            expect(state?.data).toBeUndefined();
        }
    });
});

describe("toWire", () => {
    afterEach(() => vi.restoreAllMocks());
    it("a Date is its ISO string, undefined is dropped, a Map or Set throws", () => {
        expect(toWire({ at: new Date(0), gone: undefined })).toStrictEqual({
            at: "1970-01-01T00:00:00.000Z",
        });
        expect(() => toWire({ m: new Map() })).toThrow(/Map or Set/);
        expect(() => toWire([new Set()])).toThrow(/Map or Set/);
    });
});
