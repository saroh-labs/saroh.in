/**
 * One customer's read route (DEC-259): the page's prefetch and the route
 * answer the same JSON; `contact:read` (never a Reviewer); another
 * business's contact (or none) is a 404; each part only for the role the
 * page shows it to: messages for `message:read`, link and merge offers for
 * `contact:write` or `customer:merge`, the open removal request for
 * `customer:remove`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
// Signed out: null.
const active: { id: string | null } = vi.hoisted(() => ({ id: "org_a" }));
const h = vi.hoisted(() => ({
    business: null as Business,
    detail: vi.fn<(id: string) => Promise<unknown>>(),
    thread: vi.fn<(id: string) => Promise<unknown>>(),
    suggestions: vi.fn<(id: string) => Promise<unknown>>(),
    requests: vi.fn<(status: string) => Promise<unknown>>(),
}));
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(active.id),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/customer-workspace/detail", () => ({
    getCustomerDetail: (id: string) => h.detail(id),
}));
vi.mock("@/lib/customer-workspace/service", () => ({
    getThread: (id: string) => h.thread(id),
    getSuggestions: (id: string) => h.suggestions(id),
}));
vi.mock("@/lib/customer-workspace/data-requests", () => ({
    listDataRequests: (status: string) => h.requests(status),
}));
vi.mock("@/lib/customers/list-service", () => ({ getCustomersPage: vi.fn() }));
vi.mock("@/lib/contacts/service", () => ({ listContacts: vi.fn() }));

import { customerServer } from "@/lib/customers/access-server";
import { prefetchRead } from "@/lib/query/prefetch";
import {
    expectAuthzMatrix,
    makeTestClient,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: [
        "contact:read",
        "contact:write",
        "customer:merge",
        "customer:remove",
        "message:read",
    ],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["contact:read"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };
const DETAIL = {
    contact: { id: "c1", name: "Asha Rao", email: "asha@example.com" },
};
const THREAD = { unread: 0, messages: [] };
const SUGGESTION = { kind: "contact", contactId: "c2" };
const REQUEST = { id: "cdr_1", status: "OPEN", contactId: "c1" };

const as = (who: Business) => () => {
    active.id = "org_a";
    h.business = who;
    for (const f of [h.detail, h.thread, h.suggestions, h.requests]) {
        f.mockReset();
    }
    // The API's read: another business's contact is not found.
    h.detail.mockImplementation((id) =>
        Promise.resolve(id === "c1" ? DETAIL : null),
    );
    h.thread.mockResolvedValue(THREAD);
    h.suggestions.mockResolvedValue([SUGGESTION]);
    h.requests.mockResolvedValue([REQUEST, { ...REQUEST, contactId: "c9" }]);
};

const get = (customerId: string, params: Record<string, string> = {}) =>
    GET(
        readRequest(`/api/customers/${customerId}`, { orgId: "org_a", params }),
        { params: Promise.resolve({ customerId }) },
    );

beforeEach(() => as(OWNER)());

describe("/api/customers/[customerId]", () => {
    it("answers what the page's prefetch holds", async () => {
        const client = makeTestClient();
        await prefetchRead(client, customerServer, "org_a", {
            customerId: "c1",
        });
        const res = await get("c1");
        expect(res.status).toBe(200);
        const body = (await res.json()) as unknown;
        expect(body).toStrictEqual(
            client.getQueryData(
                customerServer.read.key("org_a", { customerId: "c1" }),
            ),
        );
        expect(body).toEqual({
            detail: DETAIL,
            thread: THREAD,
            suggestions: [SUGGESTION],
            // Their own open request, never another customer's.
            dataRequest: REQUEST,
        });
    });

    it("gives a Member only what the page shows them", async () => {
        as(MEMBER)();
        const body = (await (await get("c1")).json()) as unknown;
        expect(body).toEqual({
            detail: DETAIL,
            thread: null,
            suggestions: [],
            dataRequest: null,
        });
        expect(h.thread).not.toHaveBeenCalled();
        expect(h.suggestions).not.toHaveBeenCalled();
        expect(h.requests).not.toHaveBeenCalled();
    });

    it("another business's contact, or none, is a 404 with nothing in it", async () => {
        const res = await get("c_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("is the page's gate: contact:read, never a Reviewer", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 200 },
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
            },
            () => get("c1"),
        );
    });

    it("takes the id from the path only; anything else is a 400 and reads nothing", async () => {
        expect((await get("c1", { customerId: "c2" })).status).toBe(400);
        expect((await get("c1", { tab: "notes" })).status).toBe(400);
        expect((await get("../x")).status).toBe(400);
        expect(h.detail).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});
