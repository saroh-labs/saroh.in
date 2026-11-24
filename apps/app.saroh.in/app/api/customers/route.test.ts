/**
 * The Customers list and removal-request read routes (DEC-259): the page's
 * prefetch and the route answer the same JSON; the list has the page's gate
 * (`contact:read`, which a Reviewer lacks), the requests `customer:remove`
 * too; the list asks the API only what the role may (`allowedQuery`), and
 * an unknown param is a 400 that reads nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
// Signed out: null.
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({
    business: null as Business,
    page: vi.fn<(query: object) => Promise<unknown>>(),
    requests: vi.fn<(status: string) => Promise<unknown>>(),
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/customers/list-service", () => ({
    getCustomersPage: (query: object) => h.page(query),
}));
vi.mock("@/lib/contacts/service", () => ({
    listContacts: () => Promise.resolve([{ id: "c1" }, { id: "c2" }]),
}));
vi.mock("@/lib/customer-workspace/data-requests", () => ({
    listDataRequests: (status: string) => h.requests(status),
}));
vi.mock("@/lib/customer-workspace/detail", () => ({
    getCustomerDetail: vi.fn(),
}));
vi.mock("@/lib/customer-workspace/service", () => ({
    getSuggestions: vi.fn(),
    getThread: vi.fn(),
}));

import {
    customerRequestsServer,
    customersListServer,
} from "@/lib/customers/access-server";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET as GET_REQUESTS } from "./requests/route";
import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["contact:read", "contact:write", "customer:remove", "order:read"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["contact:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };
const PAGE = { everyone: 3, total: 3, rows: [], chip: "all", sort: "last" };
const ROW = { id: "cdr_1", status: "OPEN", contactId: "c1" };

const as = (who: Business) => () => {
    active.id = "org_a";
    h.business = who;
    h.page.mockReset();
    h.page.mockResolvedValue(PAGE);
    h.requests.mockReset();
    h.requests.mockResolvedValue([ROW]);
};
const matrix = (owner: number, member: number) => ({
    owner: { as: as(OWNER), status: owner },
    member: { as: as(MEMBER), status: member },
    reviewer: { as: as(REVIEWER), status: 403 },
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
});
const list = (params: Record<string, string>) =>
    GET(readRequest("/api/customers", { orgId: "org_a", params }));

beforeEach(() => as(OWNER)());

describe("/api/customers", () => {
    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(
            customersListServer,
            GET,
            "org_a",
            { q: "asha", size: "50" },
            { q: "asha", size: "50" },
        );
    });

    it("asks the API the address's page, as the role may", async () => {
        as(MEMBER)();
        // A Member reads no orders: "Bought at" isn't theirs to ask.
        await list({ q: "asha", store: "st_1", page: "2", size: "25" });
        expect(h.page).toHaveBeenCalledWith(
            expect.objectContaining({
                q: "asha",
                store: null,
                page: 2,
                size: 25,
            }),
        );
    });

    it("counts contacts only for a business with no customers", async () => {
        h.page.mockResolvedValue({ ...PAGE, everyone: 0 });
        const res = await list({ size: "50" });
        expect(await res.json()).toMatchObject({ contacts: 2 });
    });

    it("is the page's gate: contact:read, never a Reviewer", async () => {
        await expectAuthzMatrix(matrix(200, 200), () => list({ size: "50" }));
    });

    it("anything the list doesn't ask is a 400 and reads nothing", async () => {
        expect((await list({ size: "50", contactId: "c1" })).status).toBe(400);
        expect((await list({})).status).toBe(400);
        expect((await list({ size: "50", q: "a".repeat(101) })).status).toBe(
            400,
        );
        expect(h.page).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/customers/requests", () => {
    const requests = (params: Record<string, string>) =>
        GET_REQUESTS(
            readRequest("/api/customers/requests", { orgId: "org_a", params }),
        );

    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(
            customerRequestsServer,
            GET_REQUESTS,
            "org_a",
            { status: "open" },
            { status: "open" },
        );
    });

    it("needs customer:remove: a Member who reads customers gets a 403", async () => {
        await expectAuthzMatrix(matrix(200, 403), () =>
            requests({ status: "open" }),
        );
    });

    it("a read that failed is said, never an empty list", async () => {
        h.requests.mockResolvedValue(null);
        expect(await (await requests({ status: "all" })).json()).toEqual({
            rows: null,
        });
    });

    it("takes only a known status", async () => {
        expect((await requests({ status: "everything" })).status).toBe(400);
        expect(h.requests).not.toHaveBeenCalled();
    });
});
