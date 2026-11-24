/**
 * One invoice's read route (DEC-259): the page's prefetch and the route
 * answer the same JSON (the side sheet reads it too); it has the Invoices
 * gate; another business's invoice (or none) is a 404, never a 403.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        invoice: ReturnType<typeof vi.fn<(id: string) => Promise<unknown>>>;
    } => ({
        active: "org_a",
        business: null,
        invoice: vi.fn<(id: string) => Promise<unknown>>(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
    resolveActiveOrganization: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/invoices/service", () => ({
    getInvoice: (id: string) => h.invoice(id),
    listInvoicesFor: () => Promise.resolve([]),
    listInvoices: vi.fn(),
    listInvoicesBy: vi.fn(),
    listInvoicesPaidSince: vi.fn(),
    readInvoiceSummary: vi.fn(),
}));
vi.mock("@/lib/invoices/scope", () => ({
    listInvoicesIn: vi.fn(),
    scopeFromQuery: () => null,
    scopeWithName: vi.fn(),
}));
vi.mock("@/lib/invoices/tax", () => ({
    getInvoiceBusiness: () => Promise.resolve(null),
}));
vi.mock("@/lib/invoices/payments-on", () => ({
    paymentsModuleOn: () => Promise.resolve(true),
}));
vi.mock("@/lib/modules/guard", () => ({
    modulesOrUnknown: () => Promise.resolve(null),
}));
vi.mock("@/lib/communications/email-setup-service", () => ({
    readEmailSetup: () => Promise.resolve(null),
}));

import { invoiceServer } from "@/lib/invoices/access-server";
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
    actions: ["invoice:read", "invoice:write"],
};
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["order:stage"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const INVOICE = {
    id: "inv_1",
    number: "INV-0001",
    status: "ISSUED",
    standing: "ISSUED",
    kind: "INVOICE",
    total: "100.00",
    currency: "INR",
    contact: null,
    gst: null,
    updatedAt: "2026-11-20T04:00:00.000Z",
};

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.invoice.mockReset();
    // The API's read: another business's invoice is not found.
    h.invoice.mockImplementation((id: string) =>
        Promise.resolve(id === "inv_1" ? INVOICE : null),
    );
};

const get = (invoiceId: string, params: Record<string, string> = {}) =>
    GET(readRequest(`/api/invoices/${invoiceId}`, { orgId: "org_a", params }), {
        params: Promise.resolve({ invoiceId }),
    });

beforeEach(() => as(OWNER)());

describe("/api/invoices/[invoiceId]", () => {
    it("answers what the page's prefetch holds", async () => {
        const client = makeTestClient();
        await prefetchRead(client, invoiceServer, "org_a", {
            invoiceId: "inv_1",
        });
        const res = await get("inv_1");
        expect(res.status).toBe(200);
        const body = (await res.json()) as Record<string, unknown>;
        expect(body).toStrictEqual(
            client.getQueryData(
                invoiceServer.read.key("org_a", { invoiceId: "inv_1" }),
            ),
        );
        expect(body.invoice).toEqual(INVOICE);
        // What the owner may do comes with it; the API still decides.
        expect(body.can).toMatchObject({ write: true });
    });

    it("another business's invoice, or none, is a 404 with nothing in it", async () => {
        const res = await get("inv_other");
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ code: "not_found" });
    });

    it("is the Invoices gate: no money for a Reviewer or a Member without invoice:read", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                member: { as: as(MEMBER), status: 403 },
                reviewer: { as: as(REVIEWER), status: 403 },
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
            () => get("inv_1"),
        );
        expect(h.invoice).not.toHaveBeenCalledWith("inv_other");
    });

    it("takes the id from the path only; anything else is a 400 and reads nothing", async () => {
        expect((await get("inv_1", { invoiceId: "inv_2" })).status).toBe(400);
        expect((await get("inv_1", { view: "x" })).status).toBe(400);
        expect((await get("../x")).status).toBe(400);
        expect(h.invoice).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});
