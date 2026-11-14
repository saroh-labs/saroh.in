/**
 * The reads Ask AI's 85-question test needed (14 Nov) against a real
 * Postgres: orders by store and by size or colour, a store filter on the
 * orders list, stock per variant per store with the Stock screen's need,
 * how full classes are, the waitlist, and class packs by use-by date.
 * Tool calls go through `McpToolRegistry.call`, as an AI app's.
 */
// better-auth is ESM, which ts-jest can't load; no session is read here.
jest.mock("../../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({ isTrustedOrigin: () => false }));

import { prisma } from "@saroh/database";

import { AuditService } from "../../audit/audit.service";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { ordersPage } from "../../public-api/v1-reads";
import { McpActivityService } from "../activity.service";
import type { McpCall } from "../tool-registry";
import { McpToolRegistry } from "../tool-registry";
import { shelvesOf } from "./catalogue.tools";
import { classTools } from "./class.tools";
import { periodSummaryTools } from "./period-summary.tools";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

const registry = new McpToolRegistry(
    new McpActivityService(new AuditService()),
);
registry.register(...periodSummaryTools(), ...classTools());

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
        data: { name: "Threadline", slug: uniq("thread"), currency: "INR" },
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
    const store = (name: string) =>
        prisma.store.create({
            data: { organizationId: org.id, name, slug: uniq("s") },
        });
    const main = await store("Navrangpura");
    const second = await store("Satellite");
    const ctx = await new OrganizationContextService().resolve(
        owner.id,
        org.id,
    );
    const call: McpCall = {
        ctx,
        connection: {
            kind: "oauth",
            id: uniq("grant"),
            clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
            clientName: "Claude",
            scopes: ["saroh:read"],
            userId: owner.id,
            businesses: [org.id],
        },
    };
    return { id: org.id, main: main.id, second: second.id, call };
}

async function kurta(orgId: string) {
    const product = await prisma.product.create({
        data: {
            organizationId: orgId,
            name: "Cotton kurta",
            slug: uniq("kurta"),
            price: 1299,
            currency: "INR",
            stockTracked: true,
        },
    });
    const variant = (title: string, position: number) =>
        prisma.productVariant.create({
            data: {
                productId: product.id,
                sku: uniq(title),
                title,
                position,
            },
        });
    return {
        id: product.id,
        m: (await variant("M", 0)).id,
        l: (await variant("L", 1)).id,
    };
}

describe("orders by store and by size or colour", () => {
    it("splits today's orders by store and names the best variant", async () => {
        const b = await business();
        const k = await kurta(b.id);
        let n = 0;
        const order = (
            storeId: string,
            lines: [string, number][],
            status = "DELIVERED",
        ) =>
            prisma.order.create({
                data: {
                    storeId,
                    organizationId: b.id,
                    orderId: `ORD-${tag}-${++n}`,
                    subtotal: 100,
                    total: 100,
                    currency: "INR",
                    status,
                    paymentStatus: "PAID",
                    items: {
                        create: lines.map(([variantId, quantity]) => ({
                            productId: k.id,
                            variantId,
                            quantity,
                            price: 1299,
                        })),
                    },
                },
            });
        await order(b.main, [[k.m, 2]]);
        await order(b.main, [[k.l, 1]]);
        await order(b.second, [[k.m, 3]]);
        // Counted as placed at its store, never as sold.
        await order(b.second, [[k.l, 9]], "CANCELLED");

        const r = await use(b.call, "summarise_orders", { period: "today" });
        expect(r.data.top_variants).toEqual([
            {
                product_id: k.id,
                variant_id: k.m,
                name: "Cotton kurta",
                variant: "M",
                sold: 5,
            },
            {
                product_id: k.id,
                variant_id: k.l,
                name: "Cotton kurta",
                variant: "L",
                sold: 1,
            },
        ]);
        expect(r.data.by_location).toEqual(
            expect.arrayContaining([
                {
                    location_id: b.main,
                    name: "Navrangpura",
                    orders: 2,
                    standing: 2,
                },
                {
                    location_id: b.second,
                    name: "Satellite",
                    orders: 2,
                    standing: 1,
                },
            ]),
        );
        expect(r.text).toMatch(/By store: /);

        const page = await ordersPage(
            b.id,
            { limit: 20, storeId: b.second },
            b.call.ctx,
        );
        expect(page.data).toHaveLength(2);
    });
});

describe("stock per variant per store", () => {
    it("gives each shelf with the Stock screen's need, in get_product and the summary", async () => {
        const b = await business();
        const k = await kurta(b.id);
        const shelf = (
            storeId: string,
            variantId: string,
            onHand: number,
            lowStockAlert = 3,
        ) =>
            prisma.stockLevel.create({
                data: {
                    organizationId: b.id,
                    storeId,
                    productId: k.id,
                    variantId,
                    onHand,
                    lowStockAlert,
                },
            });
        await shelf(b.main, k.m, 12);
        await shelf(b.second, k.m, 1);
        await shelf(b.main, k.l, 0);
        await shelf(b.second, k.l, 6);

        const shelves = await shelvesOf(b.id, k.id);
        expect(shelves).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    variant: "M",
                    location: "Satellite",
                    on_hand: 1,
                    need: "low",
                }),
                expect.objectContaining({
                    variant: "M",
                    location: "Navrangpura",
                    on_hand: 12,
                    need: null,
                }),
                expect.objectContaining({
                    variant: "L",
                    location: "Navrangpura",
                    need: "out",
                }),
            ]),
        );
        expect(shelves).toHaveLength(4);

        const r = await use(b.call, "summarise_stock", {});
        expect(r.data).toMatchObject({ low: 1, out: 1 });
        expect(r.data.needs).toEqual([
            expect.objectContaining({
                variant: "L",
                location_id: b.main,
                need: "out",
            }),
            expect.objectContaining({
                variant: "M",
                location_id: b.second,
                on_hand: 1,
                alert_at: 3,
                need: "low",
            }),
        ]);
    });
});

describe("classes", () => {
    async function hatha(orgId: string) {
        const service = await prisma.service.create({
            data: {
                organizationId: orgId,
                name: "7 AM Hatha",
                durationMinutes: 60,
                capacity: 5,
                timezone: "Asia/Kolkata",
            },
        });
        await prisma.availabilityRule.createMany({
            data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                organizationId: orgId,
                serviceId: service.id,
                dayOfWeek,
                startMinute: 420,
                endMinute: 480,
            })),
        });
        return service.id;
    }

    const contact = (orgId: string, first: string) =>
        prisma.contact.create({
            data: {
                organizationId: orgId,
                email: `${uniq(first)}@example.com`,
                firstName: first,
                lastName: "Sen",
            },
        });

    const booking = (
        orgId: string,
        serviceId: string,
        startAt: Date,
        status = "CONFIRMED",
    ) =>
        prisma.booking.create({
            data: {
                organizationId: orgId,
                serviceId,
                startAt,
                endAt: new Date(startAt.getTime() + 3_600_000),
                timezone: "Asia/Kolkata",
                status,
                snapshot: {},
            },
        });

    it("get_class_fill: places booked of places offered, every day of the week", async () => {
        const b = await business();
        const svc = await hatha(b.id);
        // Monday 9 Nov 2026, 07:00 in Kolkata.
        const monday = new Date("2026-11-09T01:30:00Z");
        for (let i = 0; i < 3; i++) await booking(b.id, svc, monday);
        await booking(b.id, svc, monday, "CANCELLED");
        const r = await use(b.call, "get_class_fill", {
            from: "2026-11-09",
            to: "2026-11-15",
        });
        expect(r.data).toMatchObject({
            booked: 3,
            places: 35,
            classes: [{ service_id: svc, sessions: 7, booked: 3 }],
        });
    });

    it("list_waitlist: the live line for a day, in order", async () => {
        const b = await business();
        const svc = await hatha(b.id);
        const startAt = new Date("2030-01-05T01:30:00Z");
        const entry = async (
            first: string,
            position: number,
            status: "WAITING" | "OFFERED" | "LEFT",
        ) =>
            prisma.classWaitlistEntry.create({
                data: {
                    organizationId: b.id,
                    serviceId: svc,
                    startAt,
                    endAt: new Date(startAt.getTime() + 3_600_000),
                    contactId: (await contact(b.id, first)).id,
                    position,
                    status,
                },
            });
        await entry("Ira", 1, "WAITING");
        await entry("Gone", 2, "LEFT");
        await entry("Kunal", 3, "OFFERED");
        const r = await use(b.call, "list_waitlist", { date: "2030-01-05" });
        const sessions = r.data.sessions as {
            waiting: { name: { text: string }; status: string }[];
        }[];
        expect(sessions).toHaveLength(1);
        expect(sessions[0].waiting.map((w) => [w.name.text, w.status])).toEqual(
            [
                ["Ira Sen", "waiting"],
                ["Kunal Sen", "offered"],
            ],
        );
        const none = await use(b.call, "list_waitlist", {
            date: "2030-01-06",
        });
        expect(none.data.people).toBe(0);
    });

    it("list_class_packs: the packs whose use-by date falls in the period, used and left", async () => {
        const b = await business();
        const svc = await hatha(b.id);
        const pack = await prisma.classPack.create({
            data: {
                organizationId: b.id,
                name: "4-class pack",
                credits: 4,
                validityDays: 30,
                price: 1900,
                currency: "INR",
            },
        });
        const buy = async (first: string, expiresAt: string) =>
            prisma.packPurchase.create({
                data: {
                    organizationId: b.id,
                    packId: pack.id,
                    contactId: (await contact(b.id, first)).id,
                    credits: 4,
                    price: 1900,
                    currency: "INR",
                    expiresAt: new Date(expiresAt),
                },
            });
        const meera = await buy("Meera", "2030-01-31T14:30:00Z");
        await buy("Ira", "2030-01-10T14:30:00Z");
        await buy("Later", "2030-02-10T14:30:00Z");
        const used = await booking(b.id, svc, new Date("2030-01-02T01:30:00Z"));
        const given = await booking(
            b.id,
            svc,
            new Date("2030-01-03T01:30:00Z"),
        );
        await prisma.packRedemption.createMany({
            data: [
                {
                    organizationId: b.id,
                    purchaseId: meera.id,
                    bookingId: used.id,
                },
                {
                    organizationId: b.id,
                    purchaseId: meera.id,
                    bookingId: given.id,
                    reversedAt: new Date(),
                },
            ],
        });
        const r = await use(b.call, "list_class_packs", {
            from: "2030-01-01",
            to: "2030-01-31",
        });
        expect(r.data).toMatchObject({ total: 2, active: 2 });
        expect(r.data.packs).toEqual([
            expect.objectContaining({ use_by: "2030-01-10", left: 4 }),
            expect.objectContaining({
                use_by: "2030-01-31",
                used: 1,
                left: 3,
                customer: { untrusted: true, text: "Meera Sen" },
            }),
        ]);
    });
});
