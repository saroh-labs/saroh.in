/**
 * The Invoices list and money strip read routes (DEC-259): the page's
 * prefetch and the route answer the same JSON; both have the Invoices gate
 * (`invoice:read`, no module); the list asks the API only what its address
 * names, and anything else is a 400 that reads nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
type Business = { id: string; role: string; actions?: string[] } | null;
type Fn<A extends unknown[] = []> = ReturnType<
    typeof vi.fn<(...a: A) => Promise<unknown>>
>;
const h = vi.hoisted(
    (): {
        active: string | null;
        business: Business;
        list: Fn;
        by: Fn<[object]>;
        paid: Fn<[Date]>;
        summary: Fn;
        scoped: Fn<[object]>;
    } => ({
        active: "org_a",
        business: null,
        list: vi.fn<() => Promise<unknown>>(),
        by: vi.fn<(ask: object) => Promise<unknown>>(),
        paid: vi.fn<(since: Date) => Promise<unknown>>(),
        summary: vi.fn<() => Promise<unknown>>(),
        scoped: vi.fn<(scope: object) => Promise<unknown>>(),
    }),
);
vi.mock("@/lib/api/http", () => ({
    ACTIVE_ORG_COOKIE: "active_org",
    getActiveOrgId: () => Promise.resolve(h.active),
}));
vi.mock("@/lib/organizations/service", () => ({
    activeOrganizationOnce: () => Promise.resolve(h.business),
}));
vi.mock("@/lib/invoices/service", () => ({
    listInvoices: () => h.list(),
    listInvoicesBy: (ask: object) => h.by(ask),
    listInvoicesPaidSince: (since: Date) => h.paid(since),
    readInvoiceSummary: () => h.summary(),
    getInvoice: vi.fn(),
}));
vi.mock("@/lib/invoices/scope", async (real) => ({
    ...(await real<object>()),
    listInvoicesIn: (scope: object) => h.scoped(scope),
    scopeWithName: (scope: object) =>
        Promise.resolve({ ...scope, name: "Ten classes" }),
}));
vi.mock("@/lib/invoices/details", () => ({ readInvoiceDetails: vi.fn() }));

import {
    invoicesListServer,
    invoicesSummaryServer,
} from "@/lib/invoices/access-server";
import {
    expectAuthzMatrix,
    expectReadContract,
    readRequest,
} from "@/lib/query/test-utils";

import { GET, POST } from "./route";
import { GET as SUMMARY } from "./summary/route";

const OWNER = {
    id: "org_a",
    role: "OWNER",
    actions: ["invoice:read", "invoice:write"],
};
const VIEWER = { id: "org_a", role: "MEMBER", actions: ["invoice:read"] };
const MEMBER = { id: "org_a", role: "MEMBER", actions: ["order:stage"] };
const REVIEWER = { id: "org_a", role: "REVIEWER", actions: ["site:review"] };

const INVOICE = {
    id: "inv_1",
    number: "INV-0001",
    total: "100.00",
    issuedAt: "2026-11-20T04:00:00.000Z",
    note: undefined,
};
const STRIP = { owed: { total: "100.00", count: 1 } };

const as = (who: Business) => () => {
    h.active = "org_a";
    h.business = who;
    h.list.mockReset();
    h.list.mockResolvedValue({ rows: [INVOICE], truncated: false });
    h.by.mockReset();
    h.by.mockResolvedValue({ rows: [INVOICE], truncated: false });
    h.paid.mockReset();
    h.paid.mockResolvedValue([INVOICE]);
    h.summary.mockReset();
    h.summary.mockResolvedValue(STRIP);
    h.scoped.mockReset();
    h.scoped.mockResolvedValue({ rows: [], truncated: false });
};

const list = (params: Record<string, string> = {}) =>
    GET(readRequest("/api/invoices", { orgId: "org_a", params }));
const strip = () =>
    SUMMARY(readRequest("/api/invoices/summary", { orgId: "org_a" }));

beforeEach(() => as(OWNER)());

describe("/api/invoices", () => {
    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(invoicesListServer, GET, "org_a", {});
        await expectReadContract(
            invoicesListServer,
            GET,
            "org_a",
            { q: "0001", pack: "p1" },
            { q: "0001", pack: "p1" },
        );
    });

    it("the newest and the unpaid, unless the address asks the API", async () => {
        const { note: _dropped, ...wire } = INVOICE;
        expect(await (await list()).json()).toEqual({
            // An undefined field is dropped on the wire, as on the page.
            invoices: [wire],
            truncated: false,
            paid: null,
            scope: null,
        });
        expect(h.list).toHaveBeenCalledTimes(1);
        expect(h.by).not.toHaveBeenCalled();

        await list({ view: "cheques", date: "7d" });
        expect(h.by).toHaveBeenCalledWith(
            expect.objectContaining({ view: "cheques", date: "7d" }),
        );
    });

    it("a pack's invoices, with its name, and Home's paid since", async () => {
        const body = (await (
            await list({ pack: "p1", since: "2026-11-20T00:00:00.000Z" })
        ).json()) as Record<string, unknown>;
        expect(h.scoped).toHaveBeenCalledWith({ kind: "pack", id: "p1" });
        expect(body.scope).toEqual({
            kind: "pack",
            id: "p1",
            name: "Ten classes",
        });
        expect(h.paid).toHaveBeenCalledTimes(1);
    });

    it("is the Invoices gate: invoice:read, whatever the role is called", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                "a role given invoice:read": { as: as(VIEWER), status: 200 },
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
            () => list(),
        );
    });

    it("anything the address can't say is a 400 that reads nothing", async () => {
        expect((await list({ tab: "paid" })).status).toBe(400);
        expect((await list({ view: "owed" })).status).toBe(400);
        expect((await list({ q: "x".repeat(101) })).status).toBe(400);
        expect(h.list).not.toHaveBeenCalled();
        expect(h.by).not.toHaveBeenCalled();
        expect((await POST()).status).toBe(405);
    });
});

describe("/api/invoices/summary", () => {
    it("answers what the page's prefetch holds", async () => {
        await expectReadContract(invoicesSummaryServer, SUMMARY, "org_a", {});
    });

    it("a strip that couldn't be read is a failed read, never zeros", async () => {
        h.summary.mockResolvedValue(null);
        const res = await strip();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ code: "unavailable" });
    });

    it("has the same gate as the list", async () => {
        await expectAuthzMatrix(
            {
                owner: { as: as(OWNER), status: 200 },
                reviewer: { as: as(REVIEWER), status: 403 },
                member: { as: as(MEMBER), status: 403 },
            },
            strip,
        );
    });
});
