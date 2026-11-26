/**
 * API and AI apps' sheets' read routes (DEC-259, U18): an address's latest
 * messages (to `webhook:manage`, as the tab) and what an AI app changed (to
 * anyone in the business; the API lets its owner or `apikey:manage` read
 * it). Each crosses as its sheet draws it: never the receiver's answer or
 * the tool's name. Another business's address or connection is a 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Fn = ReturnType<typeof vi.fn<(...a: unknown[]) => Promise<unknown>>>;
const h = vi.hoisted(() => ({
    active: "org_a" as string | null, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    business: null as unknown, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
    deliveries: null as unknown as Fn,
    activity: null as unknown as Fn,
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/settings/api-area-switch", () => ({ apiAreaOn: () => true }));
vi.mock("@/lib/webhooks/service", () => ({
    listWebhooks: () => Promise.resolve([]),
    listDeliveries: (...a: unknown[]) => h.deliveries(...a),
}));
vi.mock("@/lib/ai-connections/service", () => ({
    listAiConnections: () => Promise.resolve([]),
    readAiActivity: (...a: unknown[]) => h.activity(...a),
}));

import { aiActivityServer } from "@/lib/ai-connections/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";
import { webhookDeliveriesServer } from "@/lib/webhooks/access";

import * as activityRoute from "../../ai/activity/route";
import * as deliveriesRoute from "./route";

const biz = (role: string, actions: string[]) => ({
    id: "org_a",
    name: "Rye",
    role,
    actions,
});
const OWNER = biz("OWNER", ["webhook:manage", "apikey:manage"]);
const MEMBER = biz("MEMBER", ["site:read"]);

const DELIVERY = {
    id: "d1",
    event: "order.created",
    status: "FAILED",
    attempts: 2,
    lastStatusCode: 500,
    lastError: null,
    lastAttemptAt: "2031-11-01T10:00:00Z",
    createdAt: "2031-11-01T09:00:00Z",
};
const PAGE = {
    data: [{ id: "a1", summary: "Changed Sunday's hours", at: "2031-11-01" }],
    nextCursor: "a1",
    siteDrafts: [{ siteId: "s1", siteName: "Rye", since: "2031-11-01" }],
};

const as = (who: unknown) => () => {
    h.active = "org_a";
    h.business = who;
    h.deliveries = vi.fn().mockResolvedValue([
        {
            ...DELIVERY,
            endpointId: "w1",
            deliveredAt: null,
            responseSnippet: '{"customer":"SECRET"}',
        },
    ]);
    h.activity = vi.fn().mockResolvedValue({
        ...PAGE,
        data: [{ ...PAGE.data[0], tool: "set_hours" }],
    });
};
const deliveries = (params: Record<string, string> = { endpoint: "w1" }) =>
    deliveriesRoute.GET(
        readRequest("/api/settings/developers/webhooks/deliveries", {
            orgId: "org_a",
            params,
        }),
    );
const activity = (params: Record<string, string> = { connection: "c1" }) =>
    activityRoute.GET(
        readRequest("/api/settings/developers/ai/activity", {
            orgId: "org_a",
            params,
        }),
    );

beforeEach(() => as(OWNER)());

describe("the developer sheets' read routes", () => {
    it("answer what their services read, as the sheets draw it", async () => {
        await expectReadContract(
            webhookDeliveriesServer,
            deliveriesRoute.GET,
            "org_a",
            { endpoint: "w1" },
            { endpoint: "w1" },
        );
        await expectReadContract(
            aiActivityServer,
            activityRoute.GET,
            "org_a",
            { connection: "c1" },
            { connection: "c1" },
        );
        const log = (await (await deliveries()).json()) as unknown;
        expect(log).toEqual({ deliveries: [DELIVERY] });
        expect(JSON.stringify(log)).not.toContain("SECRET");
        expect(await (await activity()).json()).toEqual(PAGE);
        // A later page asks the API for it.
        await activity({ connection: "c1", cursor: "a1" });
        expect(h.activity).toHaveBeenLastCalledWith("c1", "a1");
    });

    it("are each tab's gate", async () => {
        const rows = (owner: number, member: number) => ({
            owner: { as: as(OWNER), status: owner },
            member: { as: as(MEMBER), status: member },
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
        });
        await expectAuthzMatrix(rows(200, 403), () => deliveries());
        await expectAuthzMatrix(rows(200, 200), () => activity());
    });

    it("say another business's address or connection is not found", async () => {
        h.deliveries.mockResolvedValue(null);
        h.activity.mockResolvedValue(null);
        expect((await deliveries()).status).toBe(404);
        expect((await activity()).status).toBe(404);
    });

    it("take only their own params; a failed read is a generic failure", async () => {
        expect((await deliveries({})).status).toBe(400);
        expect((await deliveries({ endpoint: "../x" })).status).toBe(400);
        expect((await activity({ connection: "c1", reveal: "1" })).status).toBe(
            400,
        );
        h.deliveries.mockRejectedValue(new Error("down: SECRET"));
        const failed = await deliveries();
        expect(failed.status).toBe(503);
        expect(await failed.json()).toEqual({ code: "unavailable" });
        expect((await deliveriesRoute.POST()).status).toBe(405);
    });
});
