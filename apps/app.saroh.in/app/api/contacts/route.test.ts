/**
 * The Contacts read routes (DEC-259): the service and the route answer
 * the same JSON; the list has its layout's gate (CRM reachable), a
 * person's leads and enquiries the person page's (CRM on and `lead:read`,
 * which a Reviewer lacks); a lead crosses with only what the tab shows;
 * another business's contact is a 404 and a read that failed is a failure,
 * never "no leads".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({
    business: null as Business,
    crm: "available",
    contact: vi.fn<(id: string) => Promise<unknown>>(),
    pipelines: vi.fn(),
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
    modulesOrUnknown: () =>
        Promise.resolve([
            {
                key: "CRM",
                readiness: h.crm === "available" ? "ENABLED" : "DISABLED",
            },
        ]),
}));
vi.mock("@/lib/contacts/service", () => ({
    listContacts: () =>
        Promise.resolve([
            { id: "c1", email: "a@example.com", removedAt: undefined },
        ]),
    getContact: (id: string) => h.contact(id),
}));
vi.mock("@/lib/pipelines/service", () => ({
    listPipelines: () => {
        h.pipelines();
        return Promise.resolve([
            {
                id: "p1",
                name: "Sales",
                isDefault: true,
                createdAt: "2026-11-01T00:00:00.000Z",
                stages: [
                    { id: "s2", name: "Won", order: 1, pipelineId: "p1" },
                    { id: "s1", name: "New", order: 0, pipelineId: "p1" },
                ],
            },
        ]);
    },
}));

import { contactsListServer, personCrmServer } from "@/lib/contacts/access";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as GET_PERSON } from "./[contactId]/route";
import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["lead:read", "contact:write"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["lead:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };
const CONTACT = {
    id: "c1",
    email: "a@example.com",
    accountEmail: null,
    removedAt: null,
    phone: "+91 98",
    leads: [
        {
            id: "l1",
            title: "Wedding",
            status: "OPEN",
            value: 5000,
            createdAt: "2026-11-01T00:00:00.000Z",
            stage: { id: "s1", name: "New", order: 0 },
            pipeline: { id: "p1", name: "Sales", stages: [] },
            internal: "x",
        },
    ],
    enquiries: [],
};

const as =
    (who: Business, crm = "available") =>
    () => {
        active.id = "org_a";
        h.business = who;
        h.crm = crm;
        h.contact.mockReset();
        // The API's read: another business's contact is not found.
        h.contact.mockImplementation((id) =>
            Promise.resolve(id === "c1" ? CONTACT : null),
        );
        h.pipelines.mockReset();
    };
const shared = {
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
};

beforeEach(() => as(OWNER)());

describe("/api/contacts", () => {
    const list = () => GET(readRequest("/api/contacts", { orgId: "org_a" }));

    it("answers what its service holds", async () => {
        await expectReadContract(contactsListServer, GET, "org_a", {});
    });

    it("is the layout's gate: CRM reachable", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "CRM off": { as: as(OWNER, "unavailable"), status: 403 },
                ...shared,
            },
            list,
        );
    });

    it("takes no params and only GET", async () => {
        const res = await GET(
            readRequest("/api/contacts", {
                orgId: "org_a",
                params: { q: "a" },
            }),
        );
        expect(res.status).toBe(400);
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/contacts/[contactId]", () => {
    const person = (contactId: string) =>
        GET_PERSON(
            readRequest(`/api/contacts/${contactId}`, { orgId: "org_a" }),
            { params: Promise.resolve({ contactId }) },
        );

    it("answers what its service holds", async () => {
        await expectReadContract(
            personCrmServer,
            (req) =>
                GET_PERSON(req, {
                    params: Promise.resolve({ contactId: "c1" }),
                }),
            "org_a",
            { contactId: "c1" },
        );
    });

    it("is the person page's gate: CRM on and lead:read", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                reviewer: { as: as(REVIEWER), status: 403 },
                "CRM off": { as: as(OWNER, "unavailable"), status: 403 },
                ...shared,
            },
            () => person("c1"),
        );
    });

    it("sends only what the tabs show", async () => {
        const body = (await (await person("c1")).json()) as {
            leads: object[];
            stages: object[] | null;
        };
        expect(Object.keys(body).sort()).toEqual([
            "enquiries",
            "leads",
            "stages",
        ]);
        // Add a lead's stages, in board order.
        expect(body.stages).toEqual([
            { id: "s1", name: "New" },
            { id: "s2", name: "Won" },
        ]);
        expect(body.leads[0]).toEqual({
            id: "l1",
            title: "Wedding",
            status: "OPEN",
            value: 5000,
            createdAt: "2026-11-01T00:00:00.000Z",
            stage: { id: "s1", name: "New" },
            pipeline: { id: "p1", name: "Sales" },
        });
    });

    it("offers Add a lead only to whoever may change contacts, and never for removed details", async () => {
        as(MEMBER)();
        const member = (await (await person("c1")).json()) as {
            stages: unknown;
        };
        expect(member.stages).toBeNull();
        as(OWNER)();
        h.contact.mockResolvedValue({
            ...CONTACT,
            removedAt: "2026-11-02T00:00:00.000Z",
        });
        const removed = (await (await person("c1")).json()) as {
            stages: unknown;
        };
        expect(removed.stages).toBeNull();
        expect(h.pipelines).not.toHaveBeenCalled();
    });

    it("another business's contact, or none, is a 404", async () => {
        expect((await person("c2")).status).toBe(404);
    });

    it("a read that failed is a failure, never no leads", async () => {
        h.contact.mockRejectedValue(new Error("down"));
        expect((await person("c1")).status).toBe(503);
    });

    it("refuses an id that isn't one", async () => {
        expect((await person("../x")).status).toBe(400);
        expect(h.contact).not.toHaveBeenCalled();
    });
});
