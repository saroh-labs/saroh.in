/**
 * The period summaries against a real Postgres (14 Nov): the SQL totals,
 * the business's calendar, a cancelled order left out of money, invoices
 * by standing with collected and owed, stock on hand and its log, and a
 * role's omissions. Calls go through `McpToolRegistry.call`, as an AI app's.
 */
// better-auth is ESM, which ts-jest can't load; no session is read here.
jest.mock("../../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({ isTrustedOrigin: () => false }));

import { prisma } from "@saroh/database";

import { AuditService } from "../../audit/audit.service";
import type { OrgAction } from "../../organizations/organization-actions";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { McpActivityService } from "../activity.service";
import type { McpCall } from "../tool-registry";
import { McpToolRegistry } from "../tool-registry";
import { periodSummaryTools } from "./period-summary.tools";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const registry = new McpToolRegistry(
    new McpActivityService(new AuditService()),
);
registry.register(...periodSummaryTools());

async function use(call: McpCall, name: string, args: Record<string, unknown>) {
    const tool = registry.all().find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    const out = (await registry.call(
        tool,
        tool.contract.input.parse(args),
        call,
        null,
    )) as {
        content: { text: string }[];
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
    };
    expect(out.isError).toBeFalsy();
    const data = out.structuredContent ?? {};
    expect(tool.contract.output.parse(data)).toEqual(data);
    return { text: out.content.map((c) => c.text).join("\n"), data };
}

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye"), currency: "INR" },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: owner.id, role: "OWNER" },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "Asia/Kolkata" },
    });
    const store = await prisma.store.create({
        data: { organizationId: org.id, name: "Hill Road", slug: uniq("hill") },
    });
    return { id: org.id, ownerId: owner.id, storeId: store.id };
}

async function connect(
    orgId: string,
    userId: string,
    drop: OrgAction[] = [],
): Promise<McpCall> {
    const person = await new OrganizationContextService().resolve(
        userId,
        orgId,
    );
    const actions = new Set<OrgAction>(
        [...(person.actions ?? [])].filter((a) => !drop.includes(a)),
    );
    return {
        ctx: { ...person, actions },
        connection: {
            kind: "oauth",
            id: uniq("grant"),
            clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
            clientName: "Claude",
            scopes: ["saroh:read"],
            userId,
            businesses: [orgId],
        },
    };
}

/** This many days ago, now. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("summarise_orders", () => {
    it("counts standing and cancelled, totals in SQL, compares with before", async () => {
        const b = await business();
        const order = (
            n: number,
            ago: number,
            total: number,
            status = "DELIVERED",
        ) =>
            prisma.order.create({
                data: {
                    storeId: b.storeId,
                    organizationId: b.id,
                    orderId: `ORD-${tag}-${n}`,
                    subtotal: total,
                    total,
                    currency: "INR",
                    status,
                    paymentStatus: "PAID",
                    createdAt: daysAgo(ago),
                },
            });
        await order(1, 5, 100);
        await order(2, 40, 250);
        await order(3, 10, 999, "CANCELLED");
        // Before the 3 months: the period before.
        await order(4, 120, 70);
        const call = await connect(b.id, b.ownerId);
        const r = await use(call, "summarise_orders", {
            period: "last_3_months",
        });
        expect(r.data).toMatchObject({
            orders: 3,
            standing: 2,
            cancelled: 1,
            amount: ["₹350"],
            before: { orders: 1, amount: ["₹70"] },
            by: "month",
        });
        expect((r.data.first as unknown[]).length).toBe(3);
        expect(r.text).toMatch(/up 100% on before \(1\)/);

        const blind = await use(
            await connect(b.id, b.ownerId, ["payment:read"]),
            "summarise_orders",
            { period: "last_3_months" },
        );
        expect(blind.data).toMatchObject({
            amount: null,
            not_shown: ["payments"],
        });
    });
});

describe("summarise_invoices", () => {
    it("totals issued invoices by standing, collected and owed", async () => {
        const b = await business();
        const invoice = (
            n: number,
            status: string,
            total: number,
            paidCents: number,
            dueAgo: number,
        ) =>
            prisma.invoice.create({
                data: {
                    organizationId: b.id,
                    number: `INV-${tag}-${n}`,
                    status,
                    currency: "INR",
                    subtotal: total,
                    total,
                    paidCents,
                    issuedAt: daysAgo(20),
                    dueAt: daysAgo(dueAgo),
                },
            });
        await invoice(1, "PAID", 300, 30000, 10);
        await invoice(2, "ISSUED", 50, 1000, 5);
        await invoice(3, "ISSUED", 80, 0, -5);
        await invoice(4, "VOID", 70, 0, 10);
        const call = await connect(b.id, b.ownerId);
        const r = await use(call, "summarise_invoices", {
            period: "last_3_months",
        });
        expect(r.data).toMatchObject({
            invoices: 4,
            collected: ["₹310"],
            owed: ["₹120"],
        });
        const by = Object.fromEntries(
            (r.data.by_status as { status: string; count: number }[]).map(
                (g) => [g.status, g.count],
            ),
        );
        expect(by).toEqual({ paid: 1, overdue: 1, unpaid: 1, cancelled: 1 });
        const overdue = await use(call, "summarise_invoices", {
            period: "last_3_months",
            status: "overdue",
        });
        expect(overdue.data).toMatchObject({ invoices: 1 });
        expect((overdue.data.first as { number: string }[])[0].number).toBe(
            `INV-${tag}-2`,
        );
    });
});

describe("summarise_stock", () => {
    it("gives units on hand, low and out, and the period's log", async () => {
        const b = await business();
        const product = (name: string, price: number) =>
            prisma.product.create({
                data: {
                    organizationId: b.id,
                    name,
                    slug: uniq("p"),
                    price,
                    currency: "INR",
                    stockTracked: true,
                },
            });
        const loaf = await product("Loaf", 50);
        const bun = await product("Bun", 10);
        const shelf = (
            productId: string,
            onHand: number,
            lowStockAlert: number,
        ) =>
            prisma.stockLevel.create({
                data: {
                    organizationId: b.id,
                    storeId: b.storeId,
                    productId,
                    onHand,
                    lowStockAlert,
                },
            });
        const loafShelf = await shelf(loaf.id, 12, 5);
        await shelf(bun.id, 0, 5);
        await prisma.stockEntry.create({
            data: {
                organizationId: b.id,
                stockLevelId: loafShelf.id,
                storeId: b.storeId,
                productId: loaf.id,
                kind: "RECEIVED",
                quantity: 20,
                before: 0,
                after: 20,
                createdAt: daysAgo(3),
            },
        });
        const call = await connect(b.id, b.ownerId);
        const r = await use(call, "summarise_stock", {
            period: "last_3_months",
        });
        expect(r.data).toMatchObject({
            tracked: true,
            products: 2,
            units: 12,
            value: ["₹600"],
            out: 1,
            low: 0,
            moved: { received: 20 },
        });
        expect((r.data.top as { name: string }[])[0].name).toBe("Loaf");
    });
});
