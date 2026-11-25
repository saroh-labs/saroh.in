/**
 * The shell's read routes (owner, 25 Nov 2026): what the chrome draws,
 * read in the browser once per load (`/api/shell`) and on the live refresh
 * (`/api/shell/live`). Anyone still in the business may read them; the
 * answer is exactly what the shell draws, and nothing a part couldn't read
 * stops the rest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
    active: null as string | null,
    member: vi.fn<() => Promise<unknown>>(),
    modules: vi.fn<() => Promise<unknown>>(),
    sites: vi.fn<() => Promise<unknown>>(),
    askAi: vi.fn<() => Promise<unknown>>(),
    unread: vi.fn<() => Promise<number>>(),
    rail: vi.fn<() => Promise<unknown>>(),
    askAiOn: true,
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => h.member(),
    accountManagerOrNull: () =>
        Promise.resolve({ name: "Asha", workEmail: "asha@example.com" }),
}));
vi.mock("@/lib/modules/guard", () => ({ modulesOrUnknown: () => h.modules() }));
vi.mock("@/lib/sites/service", () => ({ listSites: () => h.sites() }));
vi.mock("@/lib/stores/storefronts", () => ({
    getStorefrontAllowance: () => Promise.resolve({ used: 2, limit: 3 }),
}));
vi.mock("@/lib/stock/access", () => ({
    stockTrackingOnce: () =>
        Promise.resolve({ tracked: true, canChange: true }),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
    pausedOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/saroh-billing/plans-shown", () => ({ plansShown: () => false }));
vi.mock("@/lib/sites/website-area-switch", () => ({
    websiteAreaOn: () => Promise.resolve(true),
}));
vi.mock("@/lib/ask-ai/ask-ai-switch", () => ({ askAiOn: () => h.askAiOn }));
vi.mock("@/lib/ask-ai/service", () => ({ getAskAiState: () => h.askAi() }));
vi.mock("@/lib/notifications/service", () => ({
    unreadNotificationCount: () => h.unread(),
}));
vi.mock("@/lib/home/rail", () => ({ getHomeRail: () => h.rail() }));

import { ApiError } from "@/lib/api/errors";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import { shellLiveServer, shellSettingsServer } from "@/lib/shell/access";

import { GET as liveGET } from "./live/route";
import { GET, POST } from "./route";

const OWNER = { id: "org_a", role: "OWNER" };
const REVIEWER = { id: "org_a", role: "REVIEWER" };
const ASK = { available: true, reason: null, upgradeTo: null };

const as = (who: typeof OWNER | null | "refused") => () => {
    h.active = "org_a";
    h.member.mockReset();
    if (who === "refused") {
        h.member.mockRejectedValue(new ApiError(403, "GET /me"));
    } else h.member.mockResolvedValue(who);
};

beforeEach(() => {
    as(OWNER)();
    h.askAiOn = true;
    h.modules.mockResolvedValue([
        { key: "COMMERCE", readiness: "READY", blockers: [] },
        { key: "BOOKINGS", readiness: "DISABLED", blockers: [] },
    ]);
    h.sites.mockResolvedValue([
        {
            id: "s1",
            name: "Rye",
            style: { secret: "x" },
            publication: { id: "p" },
        },
    ]);
    h.askAi.mockResolvedValue(ASK);
    h.unread.mockResolvedValue(3);
    h.rail.mockResolvedValue({
        actions: [
            { href: "/commerce/orders", severity: "OVERDUE", count: 2 },
            { href: "/commerce/products", severity: "SETUP", count: 1 },
            { href: "/leads", severity: "OVERDUE", count: 0 },
        ],
        unavailable: [],
    });
});

const call = () => GET(readRequest("/api/shell", { orgId: "org_a" }));
const body = async () =>
    (await (await call()).json()) as Record<string, unknown>;

describe("/api/shell", () => {
    it("answers exactly what the shell draws, the same on both paths", async () => {
        await expectReadContract(shellSettingsServer, GET, "org_a", {});
        const got = await body();
        expect(Object.keys(got).sort()).toEqual([
            "accountManager",
            "askAi",
            "locked",
            "moduleKeys",
            "paused",
            "paymentDue",
            "planEnding",
            "sites",
            "stockTracked",
            "storefronts",
            "websiteArea",
        ]);
        // A site is its name and id: no style, no publication.
        expect(got.sites).toEqual([{ id: "s1", name: "Rye" }]);
        // Off modules aren't offered.
        expect(got.moduleKeys).toEqual(["COMMERCE"]);
        expect(got).toMatchObject({
            stockTracked: true,
            storefronts: { used: 2, limit: 3 },
            websiteArea: true,
            askAi: { state: ASK },
        });
    });

    it("a Reviewer, or Ask AI switched off, has no Ask AI; a part unread is null", async () => {
        as(REVIEWER)();
        h.askAi.mockClear();
        expect((await body()).askAi).toBeNull();
        expect(h.askAi).not.toHaveBeenCalled();
        as(OWNER)();
        h.askAiOn = false;
        expect((await body()).askAi).toBeNull();
        h.askAiOn = true;
        h.modules.mockResolvedValue(null);
        h.sites.mockRejectedValue(new ApiError(503, "GET sites"));
        h.askAi.mockRejectedValue(new ApiError(503, "GET ask-ai"));
        expect(await body()).toMatchObject({
            moduleKeys: null,
            sites: [],
            askAi: { state: null },
        });
    });

    it("anyone still in the business; never another's, never signed out", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                reviewer: { as: as(REVIEWER), status: 200 },
                // Removed or a paused seat: the API refuses `/me`.
                "no longer a member": { as: as("refused"), status: 403 },
                "no business": {
                    as: () => {
                        as(OWNER)();
                        h.active = null;
                    },
                    status: 401,
                },
                "another business's id": {
                    as: () => {
                        as(OWNER)();
                        h.active = "org_b";
                    },
                    status: 409,
                },
            },
            call,
        );
    });

    it("refuses another site and every method but GET", async () => {
        const res = await GET(
            readRequest("/api/shell", {
                orgId: "org_a",
                headers: { "sec-fetch-site": "cross-site" },
            }),
        );
        expect(res.status).toBe(403);
        expect((await POST()).status).toBe(405);
        // No params at all: anything sent is a 400.
        const extra = await GET(
            readRequest("/api/shell", { orgId: "org_a", params: { x: "1" } }),
        );
        expect(extra.status).toBe(400);
    });
});

describe("/api/shell/live", () => {
    it("the unread count and only OVERDUE work with a count as badges", async () => {
        await expectReadContract(shellLiveServer, liveGET, "org_a", {});
        const res = await liveGET(
            readRequest("/api/shell/live", { orgId: "org_a" }),
        );
        expect(await res.json()).toEqual({
            unread: 3,
            counts: { "/commerce/orders": 2 },
        });
    });

    it("a rail that can't be read is no badges; a removed member a 403", async () => {
        h.rail.mockRejectedValue(new Error("GET home rail failed: 503"));
        const res = await liveGET(
            readRequest("/api/shell/live", { orgId: "org_a" }),
        );
        expect(await res.json()).toEqual({ unread: 3, counts: {} });
        as("refused")();
        const refused = await liveGET(
            readRequest("/api/shell/live", { orgId: "org_a" }),
        );
        expect(refused.status).toBe(403);
    });
});
