/**
 * The read route helper (DEC-259), on a route made here for the test: the
 * business is the active one and must match the tab's, params pass an
 * allowlist, every answer is private and generic, only GET answers, and
 * nothing from another site gets in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const active = vi.hoisted((): { id: string | null } => ({ id: "org_a" }));
const listAsked = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => {
        listAsked.n += 1;
        return Promise.resolve(active.id);
    },
}));

import { ApiError } from "@/lib/api/errors";
import { scopedOrg } from "@/lib/api/read-scope";
import { defineRead } from "@/lib/query/define-read";
import { domainKey } from "@/lib/query/keys";
import {
    NOT_ALLOWED,
    pageSize,
    readRoute,
    searchText,
} from "@/lib/query/route";
import {
    expectAuthzMatrix,
    expectLockedDown,
    readRequest,
} from "@/lib/query/test-utils";

interface Row {
    id: string;
    at: Date;
    note?: string;
}

const rows = defineRead<Row[]>()({
    key: (orgId, p) => domainKey("probe", orgId, "list", p),
    route: { path: "/api/probe", params: { q: searchText, size: pageSize } },
});

const service =
    vi.fn<(p: { q?: string; size?: number }) => Promise<Row[] | null>>();
const access = vi.fn<(orgId: string) => Promise<boolean>>();
const GET = readRoute({ read: rows, service }, access);
const ask = (opts: Parameters<typeof readRequest>[1] = { orgId: "org_a" }) =>
    GET(readRequest("/api/probe", opts));

beforeEach(() => {
    active.id = "org_a";
    service.mockReset();
    service.mockResolvedValue([
        { id: "r1", at: new Date("2026-11-24T10:00:00Z"), note: undefined },
    ]);
    access.mockReset();
    access.mockResolvedValue(true);
    listAsked.n = 0;
});

describe("readRoute", () => {
    it("the tab's business matching the cookie settles it without the business list", async () => {
        let seen: string | undefined;
        service.mockImplementation(() => {
            seen = scopedOrg();
            return Promise.resolve([]);
        });
        const res = await ask({
            orgId: "org_a",
            headers: { cookie: "x=1; active_org=org_a" },
        });
        expect(res.status).toBe(200);
        expect(listAsked.n).toBe(0);
        // The service's API calls carry it (getActiveOrgId reads the scope).
        expect(seen).toBe("org_a");
        expect(access).toHaveBeenCalledWith("org_a");
    });

    it("a cookie the tab doesn't claim still goes through the business list", async () => {
        const res = await ask({
            orgId: "org_b",
            headers: { cookie: "active_org=org_a" },
        });
        expect(res.status).toBe(409);
        expect(listAsked.n).toBe(1);
        expect(service).not.toHaveBeenCalled();
    });

    it("an API refusal of the business (not a member, paused seat) is a 403", async () => {
        service.mockRejectedValueOnce(new ApiError(403, "MEMBER_PAUSED"));
        const res = await ask({
            orgId: "org_a",
            headers: { cookie: "active_org=org_a" },
        });
        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ code: "forbidden" });
    });

    it("an API 400 stays a 400, not a 503", async () => {
        service.mockRejectedValueOnce(new ApiError(400, "Bad range"));
        const res = await ask();
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ code: "bad_request" });
    });

    it("answers the active business's rows, private, with no CORS", async () => {
        const res = await ask({
            orgId: "org_a",
            params: { q: "tea", size: "20" },
        });
        expect(res.status).toBe(200);
        await expectLockedDown(res);
        expect(await res.json()).toEqual([
            { id: "r1", at: "2026-11-24T10:00:00.000Z" },
        ]);
        expect(service).toHaveBeenCalledWith({ q: "tea", size: 20 });
        expect(access).toHaveBeenCalledWith("org_a");
    });

    it("no active business: 401", async () => {
        active.id = null;
        const res = await ask();
        expect(res.status).toBe(401);
        await expectLockedDown(res);
        expect(service).not.toHaveBeenCalled();
    });

    it("the tab's business isn't the open one, or not said: 409 org_mismatch, no data", async () => {
        for (const orgId of ["org_b", undefined]) {
            const res = await ask({ orgId });
            expect(res.status).toBe(409);
            expect(await res.json()).toEqual({ code: "org_mismatch" });
        }
        expect(service).not.toHaveBeenCalled();
    });

    it("the page's gate says no: 403, before the service", async () => {
        access.mockResolvedValue(false);
        const res = await ask();
        expect(res.status).toBe(403);
        await expectLockedDown(res);
        expect(await res.json()).toEqual({ code: "ROLE_DENIED" });
        expect(service).not.toHaveBeenCalled();
    });

    it("missing or another business's record: 404", async () => {
        service.mockResolvedValue(null);
        const res = await ask();
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("the API's failures pass as generic statuses, never their words", async () => {
        const cases: [unknown, number][] = [
            [new ApiError(401, "GET /x", "secret"), 401],
            [new ApiError(403, "GET /x", "secret"), 403],
            [new ApiError(404, "GET /x", "secret"), 404],
            [new ApiError(429, "GET /x", "secret"), 429],
            [new ApiError(500, "GET /x", "secret"), 503],
            [new TypeError("fetch failed: secret"), 503],
            [
                Object.assign(new Error("x"), {
                    digest: "NEXT_HTTP_ERROR_FALLBACK;403",
                }),
                403,
            ],
            [
                Object.assign(new Error("x"), {
                    digest: "NEXT_HTTP_ERROR_FALLBACK;404",
                }),
                404,
            ],
            [
                Object.assign(new Error("x"), {
                    digest: "NEXT_REDIRECT;replace;/;307;",
                }),
                403,
            ],
        ];
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        for (const [error, status] of cases) {
            service.mockRejectedValueOnce(error);
            const res = await ask();
            expect(res.status).toBe(status);
            await expectLockedDown(res);
            expect(await res.text()).not.toContain("secret");
        }
        log.mockRestore();
    });

    it("a Map in the answer is a failure, not an empty object", async () => {
        service.mockResolvedValue([{ id: "r1", at: new Map() as never }]);
        const log = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        expect((await ask()).status).toBe(503);
        log.mockRestore();
    });

    it("refuses an unknown, repeated or oversized param: 400", async () => {
        for (const url of [
            "/api/probe?status=all",
            "/api/probe?q=a&q=b",
            "/api/probe?size=101",
            "/api/probe?size=0",
            `/api/probe?q=${"a".repeat(101)}`,
            `/api/probe?q=${"a".repeat(2000)}`,
        ]) {
            const res = await GET(readRequest(url, { orgId: "org_a" }));
            expect(res.status, url).toBe(400);
            await expectLockedDown(res);
        }
        expect(service).not.toHaveBeenCalled();
    });

    it("refuses another site: Sec-Fetch-Site or a foreign Origin", async () => {
        for (const headers of [
            { "sec-fetch-site": "cross-site" } as Record<string, string>,
            { "sec-fetch-site": "same-site" },
            { origin: "https://evil.example" },
            { origin: "not a url" },
        ]) {
            const res = await ask({ orgId: "org_a", headers });
            expect(res.status, JSON.stringify(headers)).toBe(403);
            await expectLockedDown(res);
        }
        const own = await ask({
            orgId: "org_a",
            headers: { origin: "https://app.saroh.localhost" },
        });
        expect(own.status).toBe(200);
        expect(service).toHaveBeenCalledTimes(1);
    });

    it("every other method: 405, with the same headers", async () => {
        for (const handler of Object.values(NOT_ALLOWED)) {
            const res = await handler();
            expect(res.status).toBe(405);
            await expectLockedDown(res);
        }
    });

    it("the authz matrix helper compares the whole table", async () => {
        await expectAuthzMatrix(
            {
                owner: {
                    as: () => access.mockResolvedValue(true),
                    status: 200,
                },
                reviewer: {
                    as: () => access.mockResolvedValue(false),
                    status: 403,
                },
                signedOut: {
                    as: () => {
                        access.mockResolvedValue(true);
                        active.id = null;
                    },
                    status: 401,
                },
            },
            () => ask(),
        );
    });
});
