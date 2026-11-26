/**
 * A read route or a save whose business is settled reads the person's own
 * row (`GET /organizations/:id/me`), never the whole business list, and
 * once per request however many gates ask (DEC-259).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The person's session cookie, when a test signs one in. */
let session = "";
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => ({ value: "org_a" }) }),
    headers: () =>
        Promise.resolve(new Headers({ cookie: `active_org=org_a${session}` })),
}));
vi.mock("@/lib/edition", async (actual) => ({
    ...(await actual<object>()),
    EDITION: "INDIA",
}));

import { clearGateMemo } from "@/lib/access/gate-memo";
import { inReadScope, setScopedOrg } from "@/lib/api/read-scope";
import { readRoute } from "@/lib/query/route";

import { activeOrganizationOnce, resolveActiveOrganization } from "./service";

const ROW = {
    id: "org_a",
    name: "Northwind",
    slug: "northwind",
    edition: "INDIA",
    role: "MEMBER",
    roleLabel: null,
    actions: ["contact:read"],
};
const LIST = [ROW, { ...ROW, id: "org_b" }];

let asked: string[];
let me: (cookie: string) => Response;
beforeEach(() => {
    asked = [];
    session = "";
    clearGateMemo();
    me = () => Response.json(ROW);
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            const path = new URL(url).pathname;
            asked.push(path);
            if (path === "/organizations") {
                return Promise.resolve(Response.json(LIST));
            }
            if (path.endsWith("/me")) {
                const cookie =
                    (init?.headers as Record<string, string> | undefined)
                        ?.cookie ?? "";
                return Promise.resolve(me(cookie));
            }
            return Promise.resolve(Response.json({ ok: true }));
        }),
    );
});
afterEach(() => vi.unstubAllGlobals());

const settled = <T>(fn: () => Promise<T>) =>
    inReadScope(() => {
        setScopedOrg("org_a");
        return fn();
    });

describe("a settled business", () => {
    it("reads its own row once, never the list", async () => {
        const [a, b, c] = await settled(() =>
            Promise.all([
                activeOrganizationOnce(),
                activeOrganizationOnce(),
                resolveActiveOrganization(),
            ]),
        );
        expect(a).toMatchObject({ id: "org_a", actions: ["contact:read"] });
        expect(b).toEqual(a);
        expect(c).toEqual(a);
        expect(asked).toEqual(["/organizations/org_a/me"]);
    });

    it("a refused row (left, or a paused seat) throws its status", async () => {
        me = () => new Response("{}", { status: 403 });
        await expect(
            settled(() => activeOrganizationOnce()),
        ).rejects.toMatchObject({ status: 403 });
    });

    it.each([404, 405])(
        "an API without /me yet (%i): this business's row of the list",
        async (status) => {
            me = () => new Response("{}", { status });
            await expect(
                settled(() => activeOrganizationOnce()),
            ).resolves.toMatchObject({
                id: "org_a",
                actions: ["contact:read"],
            });
            expect(asked).toContain("/organizations");
        },
    );

    it("the fallback never answers with another business's row", async () => {
        me = () => new Response("{}", { status: 404 });
        const missing = () =>
            inReadScope(() => {
                setScopedOrg("org_gone");
                return activeOrganizationOnce();
            });
        await expect(missing()).resolves.toBe(null);
    });

    it("another edition's business is no business here", async () => {
        me = () => Response.json({ ...ROW, edition: "GLOBAL" });
        await expect(settled(() => activeOrganizationOnce())).resolves.toBe(
            null,
        );
    });

    it("unsettled (a render), the list decides as ever", async () => {
        await expect(resolveActiveOrganization()).resolves.toMatchObject({
            id: "org_a",
        });
        // (Once in a render, where React's cache holds.)
        expect(new Set(asked)).toEqual(new Set(["/organizations"]));
    });
});

describe("a read route with a gate", () => {
    it("asks the API for no business list", async () => {
        const GET = readRoute(
            {
                read: { params: {} } as never,
                service: async () => {
                    await activeOrganizationOnce();
                    return { rows: [] };
                },
            },
            async () =>
                (await activeOrganizationOnce())?.actions?.includes(
                    "contact:read",
                ) ?? false,
        );
        const res = await GET(
            new Request("https://app.example/api/x", {
                headers: {
                    "x-organization-id": "org_a",
                    cookie: "active_org=org_a",
                },
            }),
        );
        expect(res.status).toBe(200);
        expect(asked).not.toContain("/organizations");
        expect(asked).toEqual(["/organizations/org_a/me"]);
    });
});

describe("kept a short while per person and business (gate-memo)", () => {
    const ANN = "; better-auth.session_token=ann";
    const BOB = "; better-auth.session_token=bob";
    const gated = () =>
        readRoute(
            {
                read: { params: {} } as never,
                service: () => Promise.resolve({ ok: true }),
            },
            async () =>
                (await activeOrganizationOnce())?.actions?.includes(
                    "contact:read",
                ) ?? false,
        )(
            new Request("https://app.example/api/x", {
                headers: {
                    "x-organization-id": "org_a",
                    cookie: "active_org=org_a",
                },
            }),
        );
    const mes = () => asked.filter((p) => p.endsWith("/me")).length;

    it("a person's reads one after another ask /me once", async () => {
        session = ANN;
        expect((await gated()).status).toBe(200);
        expect((await gated()).status).toBe(200);
        expect(mes()).toBe(1);
    });

    it("two sessions on the same business never share an entry", async () => {
        // Ann may read contacts; Bob, in the same business, may not.
        me = (cookie) =>
            Response.json(
                cookie.includes("session_token=bob")
                    ? { ...ROW, actions: [] }
                    : ROW,
            );
        session = ANN;
        expect((await gated()).status).toBe(200);
        session = BOB;
        expect((await gated()).status).toBe(403);
        session = ANN;
        expect((await gated()).status).toBe(200);
        expect(mes()).toBe(2);
    });

    it("a refused /me (403) isn't kept: the next read asks again", async () => {
        session = ANN;
        me = () => new Response("{}", { status: 403 });
        expect((await gated()).status).toBe(403);
        me = () => Response.json(ROW);
        expect((await gated()).status).toBe(200);
        expect(mes()).toBe(2);
    });

    it("the document's business list fills it: the reads after ask no /me", async () => {
        session = ANN;
        await resolveActiveOrganization();
        expect((await gated()).status).toBe(200);
        expect(mes()).toBe(0);
    });
});
