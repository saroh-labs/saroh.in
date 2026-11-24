/**
 * A read route or a save whose business is settled reads the person's own
 * row (`GET /organizations/:id/me`), never the whole business list, and
 * once per request however many gates ask (DEC-259).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => ({ value: "org_a" }) }),
    headers: () => Promise.resolve(new Headers({ cookie: "active_org=org_a" })),
}));
vi.mock("@/lib/edition", async (actual) => ({
    ...(await actual<object>()),
    EDITION: "INDIA",
}));

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
let me: () => Response;
beforeEach(() => {
    asked = [];
    me = () => Response.json(ROW);
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string) => {
            const path = new URL(url).pathname;
            asked.push(path);
            if (path === "/organizations") {
                return Promise.resolve(Response.json(LIST));
            }
            if (path.endsWith("/me")) return Promise.resolve(me());
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
