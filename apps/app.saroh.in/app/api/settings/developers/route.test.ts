/**
 * Settings' read routes for Share, Your data, Activity and API and AI apps
 * (DEC-259, U35); Team, Your profile and Business are `../route.test.ts`. Each answers what its service reads, to whoever may open
 * that tab and nobody else. A key crosses as its start (`prefix`) and
 * facts, a webhook address without its signing secret, an AI app's
 * connection without a token, a download without a link: whatever the API
 * sends, no secret reaches the route's JSON or the browser's cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = {
    id: string;
    name?: string;
    role?: string;
    actions?: string[];
} | null;
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const fn = () => vi.fn<(...a: unknown[]) => Promise<unknown>>();
const h = vi.hoisted(() => ({
    active: "org_a" as string | null, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    business: null as Business,
    keys: null as unknown as Fn,
    usage: null as unknown as Fn,
    webhooks: null as unknown as Fn,
    connections: null as unknown as Fn,
    exports: null as unknown as Fn,
    audit: null as unknown as Fn,
    askState: null as unknown as Fn,
    qr: null as unknown as Fn,
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/settings/api-area-switch", () => ({ apiAreaOn: () => true }));
vi.mock("@/lib/ask-ai/ask-ai-switch", () => ({ askAiOn: () => true }));
vi.mock("@/lib/api-keys/service", () => ({
    listApiKeys: () => h.keys(),
    readApiUsage: () => h.usage(),
}));
vi.mock("@/lib/webhooks/service", () => ({
    listWebhooks: () => h.webhooks(),
}));
vi.mock("@/lib/ai-connections/service", () => ({
    listAiConnections: () => h.connections(),
}));
vi.mock("@/lib/data-export/service", () => ({
    listDataExports: () => h.exports(),
}));
vi.mock("@/lib/settings/activity-service", () => ({
    listSettingsActivity: () => h.audit(),
}));
vi.mock("@/lib/organizations/roles", () => ({
    listRoles: () => Promise.resolve([]),
}));
vi.mock("@/lib/organizations/settings-service", () => ({
    getOrganizationSettings: () =>
        Promise.resolve({ profile: { timezone: "Asia/Kolkata" } }),
}));
vi.mock("@/lib/saroh-billing/service", () => ({
    billingAccessOrNull: () => Promise.resolve(null),
}));
vi.mock("@/lib/ask-ai/service", () => ({
    getAskAiState: () => h.askState(),
}));
vi.mock("@/lib/settings/ask-ai-usage", () => ({
    getAskAiSettingsWithUsage: () =>
        Promise.resolve({
            on: false,
            usage: { used: 7, limit: 50, resetsAt: "2031-12-01" },
        }),
    getAskAiPeopleUsage: () => Promise.resolve(null),
}));
vi.mock("@/lib/qr/screen", () => ({ readQrScreen: () => h.qr() }));

import { aiAppsServer } from "@/lib/ai-connections/access";
import { keysServer, usageServer } from "@/lib/api-keys/access";
import { dataExportsServer } from "@/lib/data-export/access";
import { shareServer } from "@/lib/qr/access";
import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    expectReadContract,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";
import { activityServer } from "@/lib/settings/activity-access";
import { askAiSettingsServer } from "@/lib/settings/ask-ai-access";
import { webhooksServer } from "@/lib/webhooks/access";

import * as activityRoute from "../activity/route";
import * as dataRoute from "../data/route";
import * as shareRoute from "../share/route";
import * as aiRoute from "./ai/route";
import * as askAiRoute from "./ask-ai/route";
import * as keysRoute from "./keys/route";
import * as usageRoute from "./usage/route";
import * as webhooksRoute from "./webhooks/route";

const biz = (role: string, actions: string[]) => ({
    id: "org_a",
    name: "Rye",
    role,
    actions,
});
const OWNER = biz("OWNER", [
    "site:read",
    "audit:read",
    "apikey:manage",
    "webhook:manage",
    "module:manage",
]);
const ADMIN = biz("ADMIN", ["site:read", "audit:read", "module:manage"]);
const MEMBER = biz("MEMBER", ["site:read"]);
const REVIEWER = biz("REVIEWER", ["site:review"]);

const KEY = {
    id: "k1",
    kind: "SECRET",
    name: "Order sync",
    prefix: "saroh_fake_Ab3d",
    scope: ["product:read"],
    allowedOrigins: [],
    aiEnabled: false,
    createdByUserId: "u1",
    rolledFromId: null,
    expiresAt: null,
    revokedAt: null,
    graceUntil: null,
    lastUsedAt: null,
    createdAt: "2031-11-01",
    madeBy: { id: "u1", name: "Asha", stillHere: true },
};
const ENDPOINT = {
    id: "w1",
    name: "Orders",
    url: "https://example.com/hook",
    events: ["order.created"],
    enabled: true,
    disabledAt: null,
    failureStreak: 0,
    createdByUserId: "u1",
    previousSecretUntil: null,
    lastSent: null,
    createdAt: "2031-11-01",
};
const CONNECTION = {
    id: "c1",
    app: { name: "Claude", known: true },
    person: { id: "u1", name: "Asha" },
    scopes: ["catalog:read"],
    otherBusinesses: 0,
    connectedAt: "2031-11-01",
    lastUsedAt: null,
};
const EXPORT = {
    id: "e1",
    status: "READY",
    requestedAt: "2031-11-01",
    readyAt: "2031-11-01",
    expiresAt: "2031-11-08",
    sizeBytes: 1024,
    counts: null,
    failure: null,
};
const USAGE = {
    at: "2031-11-01T10:00:00Z",
    minute: [{ scope: "mcp", used: 0, cap: 60 }],
    keys: { kinds: ["SECRET"], open: ["SECRET"], count: 1, cap: 5 },
    webhooks: { open: true, count: 1, cap: 5 },
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    // A leaky API: every secret a careless answer might carry.
    h.keys = fn().mockResolvedValue([
        { ...KEY, token: "saroh_fake_Ab3dSECRETSECRET", tokenHash: "hash1" },
    ]);
    h.usage = fn().mockResolvedValue(USAGE);
    h.webhooks = fn().mockResolvedValue([
        { ...ENDPOINT, secret: "whsec_SECRET", previousSecret: "whsec_OLD" },
    ]);
    h.connections = fn().mockResolvedValue([
        {
            ...CONNECTION,
            accessToken: "oat_SECRET",
            refreshToken: "ort_SECRET",
            client: { clientSecret: "ocs_SECRET" },
        },
    ]);
    h.exports = fn().mockResolvedValue({
        exports: [
            {
                ...EXPORT,
                url: "https://files.example.com/e1?sig=SECRET",
                fileKey: "exports/e1.zip",
            },
        ],
        inProgress: false,
    });
    h.audit = fn().mockResolvedValue({ status: "ok", events: [] });
    h.askState = fn().mockResolvedValue({ reason: null, usage: null });
    h.qr = fn().mockResolvedValue({ state: "no-site" });
};

beforeEach(() => as(OWNER)());

const ROUTES = {
    share: shareRoute.GET,
    data: dataRoute.GET,
    activity: activityRoute.GET,
    ai: aiRoute.GET,
    "ask-ai": askAiRoute.GET,
    keys: keysRoute.GET,
    webhooks: webhooksRoute.GET,
    usage: usageRoute.GET,
} as const;
const PATHS: Record<keyof typeof ROUTES, string> = {
    share: "/api/settings/share",
    data: "/api/settings/data",
    activity: "/api/settings/activity",
    ai: "/api/settings/developers/ai",
    "ask-ai": "/api/settings/developers/ask-ai",
    keys: "/api/settings/developers/keys",
    webhooks: "/api/settings/developers/webhooks",
    usage: "/api/settings/developers/usage",
};
const get = (tab: keyof typeof ROUTES) =>
    ROUTES[tab](readRequest(PATHS[tab], { orgId: "org_a" }));

function keysOf(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(keysOf);
    if (value && typeof value === "object") {
        return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
    }
    return [];
}
const SECRET_KEY = /token|secret|hash|password|credential|url$|fileKey/i;
/** What the rows draw on purpose: an address's own URL, and until when an old secret signs. */
const SHOWN = new Set(["url", "previousSecretUntil"]);

describe("Settings' Share, Your data, Activity and API and AI apps routes", () => {
    it("answer what their services read", async () => {
        await expectReadContract(shareServer, shareRoute.GET, "org_a", {});
        await expectReadContract(dataExportsServer, dataRoute.GET, "org_a", {});
        await expectReadContract(
            activityServer,
            activityRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(aiAppsServer, aiRoute.GET, "org_a", {});
        await expectReadContract(
            askAiSettingsServer,
            askAiRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(keysServer, keysRoute.GET, "org_a", {});
        await expectReadContract(
            webhooksServer,
            webhooksRoute.GET,
            "org_a",
            {},
        );
        await expectReadContract(usageServer, usageRoute.GET, "org_a", {});
    });

    it("carry keys, addresses, connections and downloads as facts: no token, secret or link in the JSON or the cache", async () => {
        const keys = (await (await get("keys")).json()) as {
            keys: unknown[];
        };
        expect(keys.keys).toEqual([KEY]);
        expect(
            ((await (await get("webhooks")).json()) as { endpoints: unknown })
                .endpoints,
        ).toEqual([ENDPOINT]);
        expect(
            ((await (await get("ai")).json()) as { connections: unknown })
                .connections,
        ).toEqual([CONNECTION]);
        expect(
            ((await (await get("data")).json()) as { exports: unknown })
                .exports,
        ).toEqual([EXPORT]);

        const client = makeTestClient();
        await prefetchRead(client, keysServer, "org_a", {});
        await prefetchRead(client, webhooksServer, "org_a", {});
        await prefetchRead(client, aiAppsServer, "org_a", {});
        await prefetchRead(client, dataExportsServer, "org_a", {});
        const held = client
            .getQueryCache()
            .getAll()
            .map((q) => q.state.data);
        expect(held).toHaveLength(4);
        expect(JSON.stringify(held)).not.toMatch(
            /_SECRET|dSECRET|whsec|sig=|hash1|exports\//,
        );
        expect(
            keysOf(held).filter((k) => SECRET_KEY.test(k) && !SHOWN.has(k)),
        ).toEqual([]);
    });

    it("keeps Ask AI's total while its switch is off", async () => {
        const body = (await (await get("ask-ai")).json()) as {
            usage: { used: number };
        };
        expect(body.usage.used).toBe(7);
    });

    it("is each tab's gate", async () => {
        // owner, admin, member, reviewer
        const want: Record<
            keyof typeof ROUTES,
            [number, number, number, number]
        > = {
            share: [200, 200, 200, 403],
            data: [200, 403, 403, 403],
            activity: [200, 200, 403, 403],
            ai: [200, 200, 200, 200],
            "ask-ai": [200, 200, 403, 403],
            keys: [200, 403, 403, 403],
            webhooks: [200, 403, 403, 403],
            usage: [200, 200, 200, 200],
        };
        for (const tab of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
            const [owner, admin, member, reviewer] = want[tab];
            await expectAuthzMatrix(
                {
                    owner: { as: as(OWNER), status: owner },
                    admin: { as: as(ADMIN), status: admin },
                    member: { as: as(MEMBER), status: member },
                    reviewer: { as: as(REVIEWER), status: reviewer },
                    "signed out": {
                        as: () => {
                            as(null)();
                            h.active = null;
                        },
                        status: 401,
                    },
                    "another business open in this tab": {
                        as: () => {
                            as(OWNER)();
                            h.active = "org_b";
                        },
                        status: 409,
                    },
                },
                () => get(tab),
            );
        }
    });

    it("says a refused audit read is a refusal, and a list the API has not got is not found", async () => {
        h.audit.mockResolvedValue({ status: "denied" });
        expect((await get("activity")).status).toBe(403);
        // A list the API hasn't got (the area off for this business).
        h.keys.mockRejectedValue(
            Object.assign(new Error("off"), {
                digest: "NEXT_HTTP_ERROR_FALLBACK;404",
            }),
        );
        expect((await get("keys")).status).toBe(404);
    });

    it("takes no params; a failed read is a generic failure; only GET answers", async () => {
        for (const tab of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
            const res = await ROUTES[tab](
                readRequest(PATHS[tab], {
                    orgId: "org_a",
                    params: { reveal: "1" },
                }),
            );
            expect(res.status, tab).toBe(400);
        }
        h.keys.mockRejectedValue(new Error("down: saroh_fake_SECRET"));
        const failed = await get("keys");
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
        expect((await keysRoute.POST()).status).toBe(405);
    });
});
