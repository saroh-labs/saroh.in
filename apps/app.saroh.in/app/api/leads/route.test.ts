/**
 * The Leads read routes (DEC-259): `/api/leads`, `/api/pipeline` and
 * `/api/leads/[leadId]` answer what their services hold, behind the
 * pages' gate (CRM reachable, `lead:read`); a role the API refuses leads
 * is a 403 too; a read that failed is a failure, never an empty list;
 * Add a lead is read only for `lead:write`; a message crosses without its
 * provider or provider id; another business's lead is a 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({
    business: null as Business,
    crm: "available",
    leadsRefused: false,
    leadsDown: false,
    lead: vi.fn<(id: string) => Promise<unknown>>(),
    addLead: vi.fn(),
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/modules/guard", () => ({
    moduleAccess: () => Promise.resolve({ state: h.crm }),
    modulesOrUnknown: () => Promise.resolve(null),
}));
const LEAD_ROW = {
    id: "l1",
    title: "Wedding",
    status: "OPEN",
    value: null,
    pipelineId: "p1",
    stageId: "s1",
    createdAt: "2026-11-01T00:00:00.000Z",
    contact: null,
    stage: null,
};
vi.mock("@/lib/leads/service", () => ({
    listLeads: () => {
        // The API's 403 is `forbidden()`: Next's interrupt.
        if (h.leadsDown) return Promise.reject(new Error("down"));
        if (h.leadsRefused) {
            throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;403"), {
                digest: "NEXT_HTTP_ERROR_FALLBACK;403",
            });
        }
        return Promise.resolve([LEAD_ROW]);
    },
    listOpenTasks: () => Promise.reject(new Error("down")),
    getLead: (id: string) => h.lead(id),
}));
vi.mock("@/lib/leads/add-lead-data", () => ({
    loadAddLead: () => {
        h.addLead();
        return Promise.resolve({ contacts: [], stages: [], currency: "INR" });
    },
}));
vi.mock("@/lib/pipelines/service", () => ({
    listPipelines: () =>
        Promise.resolve([
            {
                id: "p1",
                name: "Sales",
                isDefault: true,
                stages: [],
                createdAt: "2026-11-01T00:00:00.000Z",
            },
        ]),
}));
vi.mock("@/lib/messages/service", () => ({
    listLeadMessages: () =>
        Promise.resolve([
            {
                id: "m1",
                channel: "EMAIL",
                body: "Hi",
                status: "SENT",
                deliveries: [
                    {
                        id: "d1",
                        provider: "ses",
                        providerMessageId: "secret-ish",
                        status: "DELIVERED",
                        error: null,
                        attempts: 1,
                        createdAt: "2026-11-01T00:00:00.000Z",
                        updatedAt: "2026-11-01T00:01:00.000Z",
                    },
                ],
            },
        ]),
    listContactConsents: () =>
        Promise.resolve([
            { id: "k1", channel: "EMAIL", status: "REVOKED", source: "x" },
        ]),
}));

import {
    leadServer,
    leadsListServer,
    pipelineServer,
} from "@/lib/leads/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as GET_PIPELINE } from "../pipeline/route";
import { GET as GET_LEAD } from "./[leadId]/route";
import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["lead:read", "lead:write"],
};
const READER = { id: "org_a", role: "MEMBER", actions: ["lead:read"] };
const NO_LEADS = { id: "org_a", role: "MEMBER", actions: ["contact:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };
const LEAD = {
    ...LEAD_ROW,
    contact: { id: "c1", email: "a@example.com" },
    pipeline: null,
    activities: [],
};

const as =
    (who: Business, crm = "available", refused = false) =>
    () => {
        active.id = "org_a";
        h.business = who;
        h.crm = crm;
        h.leadsRefused = refused;
        h.leadsDown = false;
        h.lead.mockReset();
        h.lead.mockResolvedValue(LEAD);
        h.addLead.mockReset();
    };

const list = () => GET(readRequest("/api/leads", { orgId: "org_a" }));
const lead = (leadId: string) =>
    GET_LEAD(readRequest(`/api/leads/${leadId}`, { orgId: "org_a" }), {
        params: Promise.resolve({ leadId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/leads", () => {
    it("answers what its service holds", async () => {
        await expectReadContract(leadsListServer, GET, "org_a", {});
        await expectReadContract(pipelineServer, GET_PIPELINE, "org_a", {});
    });

    it("is the pages' gate; the API's no to the role is a 403", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "reads leads": { as: as(READER), status: 200 },
                "a role without lead:read": { as: as(NO_LEADS), status: 403 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "CRM off": { as: as(OWNER, "unavailable"), status: 403 },
                "a role without leads": {
                    as: as(READER, "available", true),
                    status: 403,
                },
                "signed out": {
                    as: () => {
                        as(null)();
                        active.id = null;
                    },
                    status: 401,
                },
                "another business open in this tab": {
                    as: () => {
                        as(OWNER)();
                        active.id = "org_b";
                    },
                    status: 409,
                },
            },
            list,
        );
    });

    it("reads Add a lead only for lead:write; unread follow-ups are null", async () => {
        expect(await (await list()).json()).toMatchObject({ tasks: null });
        expect(h.addLead).toHaveBeenCalledTimes(1);
        as(READER)();
        const body = (await (await list()).json()) as { addLead: unknown };
        expect(body.addLead).toBeNull();
        expect(h.addLead).not.toHaveBeenCalled();
    });

    it("the board is the default pipeline's", async () => {
        const res = await GET_PIPELINE(
            readRequest("/api/pipeline", { orgId: "org_a" }),
        );
        expect(await res.json()).toMatchObject({
            pipeline: { id: "p1" },
            leads: [{ id: "l1" }],
        });
    });

    it("a read that failed is a failure, never no leads", async () => {
        h.leadsDown = true;
        expect((await list()).status).toBe(503);
    });

    it("takes no params and only GET", async () => {
        const res = await GET(
            readRequest("/api/leads", { orgId: "org_a", params: { a: "1" } }),
        );
        expect(res.status).toBe(400);
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/leads/[leadId]", () => {
    it("is the pages' gate", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "a role without lead:read": { as: as(NO_LEADS), status: 403 },
                "CRM off": { as: as(OWNER, "unavailable"), status: 403 },
            },
            () => lead("l1"),
        );
    });

    it("answers what its service holds", async () => {
        await expectReadContract(
            leadServer,
            (req) =>
                GET_LEAD(req, { params: Promise.resolve({ leadId: "l1" }) }),
            "org_a",
            { leadId: "l1" },
        );
    });

    it("sends a message without its provider, and consent per channel", async () => {
        const body = (await (await lead("l1")).json()) as {
            messages: { deliveries: object[] }[];
            consent: object;
        };
        // No provider or provider message id anywhere in the answer.
        expect(JSON.stringify(body)).not.toMatch(/provider|secret-ish/);
        expect(body.messages[0]?.deliveries).toEqual([
            {
                status: "DELIVERED",
                error: null,
                updatedAt: "2026-11-01T00:01:00.000Z",
            },
        ]);
        expect(body.consent).toEqual({ EMAIL: "REVOKED" });
    });

    it("another business's lead, or none, is a 404; a failed read is not", async () => {
        h.lead.mockResolvedValue(null);
        expect((await lead("l2")).status).toBe(404);
        h.lead.mockRejectedValue(new Error("down"));
        expect((await lead("l1")).status).toBe(503);
    });

    it("refuses an id that isn't one", async () => {
        expect((await lead("../x")).status).toBe(400);
        expect(h.lead).not.toHaveBeenCalled();
    });
});
