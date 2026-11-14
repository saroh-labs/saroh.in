/**
 * Ask AI's drafts against a real Postgres (plan 2026-11-13-001 U5): the AI
 * never saves; the person does. A write tool in a turn writes nothing (row
 * counts, activity and audit unchanged) and keeps a draft; Confirm saves it
 * once, through the normal tool, audited "via Ask AI"; Undo puts an edit
 * back through the normal services while it is untouched and on the same
 * day; Confirm and Undo take only the asker's own draft id in the business
 * they have open.
 *
 * Runs in the integration project (TEST_DATABASE_URL). The Origin check on
 * the routes is `OriginGuard`'s, covered in `origin.guard.spec.ts`.
 */
// better-auth is ESM, which ts-jest can't load; no session is read here.
jest.mock("../../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({ isTrustedOrigin: () => false }));

import { randomBytes, randomUUID } from "node:crypto";

import { NotFoundException } from "@nestjs/common";
import type { AskAiDraftCard } from "@saroh/api-contract";
import { prisma, writeCatalogueVersion } from "@saroh/database";
import { planRows } from "@saroh/pricing-catalog";

import { giveBusinessDetails } from "../../../../test/business-details";
import { fakeMeteredCatalog } from "../../../../test/fixtures/pricing-catalog";
import { IdempotencyService } from "../../../common/idempotency/idempotency.service";
import type { OrganizationContext } from "../../../common/types/organization-context";
import { env } from "../../../env";
import { AuditService } from "../../audit/audit.service";
import type { CatalogueAccessService } from "../../billing/catalogue-access.service";
import { BookingsService } from "../../bookings/bookings.service";
import { ContactsService } from "../../contacts/contacts.service";
import { PostsService } from "../../content/posts.service";
import { CustomerAddService } from "../../customer-workspace/customer-add.service";
import type { FeatureFlagService } from "../../feature-flags/feature-flags.service";
import { FlagKey } from "../../feature-flags/flags";
import { McpActivityService } from "../../mcp/activity.service";
import { McpToolRegistry } from "../../mcp/tool-registry";
import { blogTools } from "../../mcp/tools/blog.tools";
import { catalogueTools } from "../../mcp/tools/catalogue.tools";
import { dayTools } from "../../mcp/tools/day.tools";
import { OrderKitchenService } from "../../orders/order-kitchen.service";
import { OrdersService } from "../../orders/orders.service";
import { OrganizationContextService } from "../../organizations/organization-context.service";
import { PaymentsService } from "../../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../../payments/providers/fake.provider";
import { InventoryService } from "../../products/inventory.service";
import { ProductsService } from "../../products/products.service";
import { VariantsService } from "../../products/variants.service";
import { BookingsV1Controller } from "../../public-api/bookings.v1.controller";
import { CatalogueV1Controller } from "../../public-api/catalogue.v1.controller";
import { CustomersV1Controller } from "../../public-api/customers.v1.controller";
import { OrdersV1Controller } from "../../public-api/orders.v1.controller";
import { StoresService } from "../../stores/stores.service";
import { AskAiAccess } from "../access/ask-ai-access";
import { ASK_AI_AGENT } from "../agents/ask-ai.agent";
import { ConversationsService } from "../conversations.service";
import { AiSettingsService } from "../settings/ai-settings.service";
import { ToolBridge } from "../tools/tool-bridge";
import { TurnStore } from "../turn/turn-store";
import { DraftsService } from "./drafts.service";

const mutableEnv = env as { AI_TEXT_ENC_KEY?: string };
const keyBefore = mutableEnv.AI_TEXT_ENC_KEY;

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;
const V = 830_000 + Math.floor(Math.random() * 9_000);
const DAY = 86_400_000;

let askAiOn = true;
const flags = {
    isEnabled: jest.fn((key: string) =>
        Promise.resolve(key === "ASK_AI" ? askAiOn : true),
    ),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const bookings = new BookingsService(
    undefined,
    new PaymentsService(
        new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
    ),
);
const idempotency = new IdempotencyService();
const kitchen = new OrderKitchenService();
const activity = new McpActivityService(new AuditService());

const registry = new McpToolRegistry(activity);
registry.register(
    ...catalogueTools(
        new CatalogueV1Controller(
            products,
            new VariantsService(products),
            new InventoryService(products),
            bookings,
            idempotency,
        ),
    ),
    ...dayTools({
        bookingsV1: new BookingsV1Controller(bookings, idempotency),
        ordersV1: new OrdersV1Controller(
            new OrdersService(stores),
            idempotency,
        ),
        customersV1: new CustomersV1Controller(
            new CustomerAddService(),
            new ContactsService(),
            idempotency,
        ),
        bookings,
        kitchen,
    }),
    ...blogTools({ posts: new PostsService(), idempotency }),
);
const organizations = new OrganizationContextService();
const settings = new AiSettingsService();
const store = new TurnStore(new ConversationsService());
// Ask AI on the plan: the plan's part is `ask-ai-access.db.spec.ts`.
const access = new AskAiAccess(settings, flags, store, {
    resolve: () =>
        Promise.resolve({
            source: "catalogue",
            modules: [{ moduleId: "ask-ai", state: "on", limit: null }],
        }),
} as unknown as CatalogueAccessService);
const drafts = new DraftsService(registry, settings, access, kitchen, activity);
const bridge = new ToolBridge(registry, organizations, [ASK_AI_AGENT], drafts);
const live = new AbortController().signal;

beforeAll(async () => {
    // A throwaway key for this run only, never a value in the repo.
    mutableEnv.AI_TEXT_ENC_KEY = randomBytes(32).toString("base64");
    const catalog = fakeMeteredCatalog();
    await writeCatalogueVersion(prisma, {
        version: V,
        catalog,
        goLiveAt: new Date(Date.now() - DAY),
        policy: "keep",
        planRows: planRows(catalog, V),
    });
});
afterAll(() => {
    mutableEnv.AI_TEXT_ENC_KEY = keyBefore;
});
beforeEach(() => {
    askAiOn = true;
});

interface Business {
    id: string;
    ownerId: string;
    storeId: string;
}

/** A bakery with one storefront and its owner; on the fake catalogue's free plan when asked. */
async function business(onFreePlan = false): Promise<Business> {
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
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    const store = await stores.createForUser(owner.id, org.id, {
        name: "Hill Road",
        slug: uniq("hill"),
    });
    await prisma.storeSettings.upsert({
        where: { storeId: store.id },
        create: {
            storeId: store.id,
            currency: "INR",
            fulfilmentTypes: ["PICKUP"],
            collectionEnabled: true,
        },
        update: { currency: "INR", fulfilmentTypes: ["PICKUP"] },
    });
    if (onFreePlan) {
        const plan = await prisma.plan.findUniqueOrThrow({
            where: {
                key_version_interval: {
                    key: "catalog.free",
                    version: V,
                    interval: "month",
                },
            },
        });
        await prisma.subscription.create({
            data: { organizationId: org.id, planId: plan.id, status: "ACTIVE" },
        });
        await prisma.featureFlag.upsert({
            where: { key: FlagKey.PLAN_ENFORCEMENT },
            create: { key: FlagKey.PLAN_ENFORCEMENT, enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: {
                flagKey: FlagKey.PLAN_ENFORCEMENT,
                organizationId: org.id,
                enabled: true,
            },
        });
    }
    return { id: org.id, ownerId: owner.id, storeId: store.id };
}

async function person(orgId: string, role: string): Promise<string> {
    const user = await prisma.user.create({
        data: { email: `${uniq(role.toLowerCase())}@example.com`, name: role },
    });
    await prisma.membership.create({
        data: { organizationId: orgId, userId: user.id, role },
    });
    return user.id;
}

/** The context a request carries: the person's live role in the business they have open. */
const asIn = (orgId: string, userId: string) =>
    organizations.resolve(userId, orgId);

/** A conversation of the person's, and the turn a tool call is made in. */
async function turnOf(ctx: OrganizationContext) {
    const conversation = await store.createConversation(ctx, {
        agent: "ask-ai",
        agentVersion: "drafts-spec",
        model: "claude-haiku-5-5",
        effort: "low",
    });
    return { conversationId: conversation.id, turnId: randomUUID() };
}

/** A write tool called in an Ask AI turn: a card, or the model's refusal. */
async function draft(
    ctx: OrganizationContext,
    name: string,
    input: Record<string, unknown>,
    turn?: { conversationId: string; turnId: string },
) {
    const run = await bridge.run(
        ctx,
        { id: uniq("call"), name, input },
        live,
        turn ?? (await turnOf(ctx)),
    );
    return { run, card: run.card?.data as AskAiDraftCard | undefined };
}

/** A write made as an outside app would, to set the scene. */
async function make(
    ctx: OrganizationContext,
    name: string,
    input: Record<string, unknown>,
): Promise<Record<string, Record<string, unknown>>> {
    const tool = registry.get(name);
    if (!tool) throw new Error(`no tool ${name}`);
    const out = await registry.callInProcess(tool, input, {
        ctx,
        connection: {
            kind: "oauth",
            id: uniq("grant"),
            clientId: "spec",
            clientName: "Spec",
            scopes: ["saroh:read", "saroh:write"],
            userId: ctx.userId,
            businesses: [ctx.organizationId],
        },
    });
    if ("isError" in out) throw new Error(out.content[0].text);
    return out.structuredContent as Record<string, Record<string, unknown>>;
}

async function productIn(ctx: OrganizationContext, name = "Sourdough") {
    const made = await make(ctx, "create_product", {
        request_id: uniq("p"),
        name,
        price: 180,
        status: "published",
    });
    return made.product.product_id as string;
}

/** Every row a draft could touch, counted for one business. */
async function counts(organizationId: string) {
    const where = { organizationId };
    return {
        products: await prisma.product.count({ where }),
        services: await prisma.service.count({ where }),
        rules: await prisma.availabilityRule.count({
            where: { service: where },
        }),
        bookings: await prisma.booking.count({ where }),
        orders: await prisma.order.count({ where }),
        orderEvents: await prisma.orderEvent.count({ where }),
        contacts: await prisma.contact.count({ where }),
        jobs: await prisma.job.count({ where }),
        activity: await prisma.mcpActivity.count({ where }),
        audit: await prisma.auditEvent.count({ where }),
        idempotency: await prisma.idempotencyRecord.count({ where }),
    };
}

const nextDayAt = (hour: number) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return new Date(d.getTime() + 3 * DAY + hour * 3_600_000).toISOString();
};

describe("drafting writes nothing", () => {
    it("every draft tool leaves the business's rows, activity and audit as they were", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const productId = await productIn(owner);
        const service = (
            await make(owner, "create_service", {
                request_id: uniq("s"),
                name: "Haircut",
                duration_minutes: 60,
                price: 500,
            })
        ).service.service_id as string;
        const week = ["monday", "tuesday", "wednesday", "thursday"].map(
            (day) => ({ day, opens: "09:00", closes: "17:00" }),
        );
        await make(owner, "set_hours", {
            service_id: service,
            hours: [
                ...week,
                ...["friday", "saturday", "sunday"].map((day) => ({
                    day,
                    opens: "09:00",
                    closes: "17:00",
                })),
            ],
        });
        const booking = (
            await make(owner, "create_booking", {
                request_id: uniq("b"),
                service_id: service,
                starts_at: nextDayAt(10),
                customer_email: `${uniq("priya")}@example.com`,
                customer_name: "Priya",
            })
        ).booking.booking_id as string;
        const order = (
            await make(owner, "create_order", {
                request_id: uniq("o"),
                items: [{ product_id: productId, quantity: 1 }],
                customer_email: `${uniq("ravi")}@example.com`,
            })
        ).order.order_id as string;
        await prisma.order.update({
            where: { id: order },
            data: { paymentStatus: "PAID" },
        });
        const customer = (
            await make(owner, "create_customer", {
                request_id: uniq("c"),
                email: `${uniq("meera")}@example.com`,
                first_name: "Meera",
            })
        ).customer.customer_id as string;

        const before = await counts(org.id);
        const priceBefore = await prisma.product.findUniqueOrThrow({
            where: { id: productId },
            select: { price: true, updatedAt: true },
        });
        const calls: [string, Record<string, unknown>][] = [
            ["create_product", { name: "Rye", price: 90 }],
            ["update_product", { product_id: productId, price: 1, stock: 9 }],
            [
                "create_service",
                { name: "Shave", duration_minutes: 30, price: 200 },
            ],
            ["update_service", { service_id: service, duration_minutes: 45 }],
            ["set_hours", { service_id: service, hours: week }],
            [
                "create_booking",
                {
                    service_id: service,
                    starts_at: nextDayAt(12),
                    customer_email: `${uniq("asha")}@example.com`,
                },
            ],
            ["move_booking", { booking_id: booking, starts_at: nextDayAt(14) }],
            [
                "create_order",
                {
                    items: [{ product_id: productId, quantity: 2 }],
                    customer_email: `${uniq("ravi")}@example.com`,
                },
            ],
            ["update_order_status", { order_id: order, stage: "preparing" }],
            ["create_customer", { email: `${uniq("new")}@example.com` }],
            ["update_customer", { customer_id: customer, company: "Hill Co" }],
        ];
        for (const [name, input] of calls) {
            const { run, card } = await draft(owner, name, input);
            expect({ name, refused: run.isError ?? false }).toEqual({
                name,
                refused: false,
            });
            expect(card).toMatchObject({ tool: name, status: "drafted" });
            expect(card?.fields.length).toBeGreaterThan(0);
        }

        // Nothing saved, no AI activity, no audit: only the drafts are new.
        expect(await counts(org.id)).toEqual(before);
        expect(
            await prisma.product.findUniqueOrThrow({
                where: { id: productId },
                select: { price: true, updatedAt: true },
            }),
        ).toEqual(priceBefore);
        expect(
            await prisma.askAiDraft.count({
                where: { organizationId: org.id, status: "DRAFTED" },
            }),
        ).toBe(calls.length);
        // The draft's input and values are sealed, not in the clear.
        const row = await prisma.askAiDraft.findFirstOrThrow({
            where: { organizationId: org.id, tool: "update_customer" },
        });
        expect(JSON.stringify(row)).not.toContain("Hill Co");
    });
});

describe("Confirm", () => {
    it("saves a create once, audited via Ask AI; a second Confirm is refused", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Rye loaf",
            price: 120,
        });
        expect(card).toMatchObject({
            kind: "product",
            action: "create",
            targetName: "Rye loaf",
        });
        expect(card?.fields).toEqual(
            expect.arrayContaining([
                { field: "price", label: "Price (INR)", old: null, new: 120 },
            ]),
        );
        const id = card?.draftId ?? "";

        const done = await drafts.confirm(owner, id, {});
        expect(done).toMatchObject({
            outcome: "added",
            canUndo: false,
            open: { kind: "product" },
        });
        const made = await prisma.product.findMany({
            where: { organizationId: org.id, name: "Rye loaf" },
        });
        expect(made).toHaveLength(1);
        expect(done.open?.id).toBe(made[0].id);

        const again = await drafts.confirm(owner, id, {});
        expect(again).toMatchObject({
            outcome: "refused",
            words: "This was already saved.",
        });
        expect(
            await prisma.product.count({
                where: { organizationId: org.id, name: "Rye loaf" },
            }),
        ).toBe(1);

        // Audited as Ask AI's, through the activity path an app's writes take.
        expect(
            await prisma.mcpActivity.findMany({
                where: { organizationId: org.id, tool: "create_product" },
                select: { clientName: true, userId: true },
            }),
        ).toEqual([{ clientName: "Ask AI", userId: org.ownerId }]);
        expect(
            await prisma.auditEvent.count({
                where: {
                    organizationId: org.id,
                    action: "ai_connection.tool_write",
                    targetType: "ai_agent",
                    targetId: "ask-ai",
                },
            }),
        ).toBe(1);
    });

    it("a blog post: drafting saves nothing; Confirm saves exactly one DRAFT post, audited; a second Confirm is refused", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const site = await prisma.site.create({
            data: { organizationId: org.id, name: "Rye", slug: uniq("site") },
        });
        const body = `## Paper, not plastic\n\n${"Every order now ships in recycled paper. ".repeat(20)}`;
        const { card } = await draft(owner, "draft_blog_post", {
            title: "Our new eco packing range",
            body,
        });
        expect(card).toMatchObject({
            kind: "blog_post",
            action: "create",
            targetName: "Our new eco packing range",
            note: "It's saved as a draft; nothing is published.",
        });
        const preview = card?.fields.find((f) => f.field === "body")?.new;
        expect(typeof preview).toBe("string");
        expect(
            (preview as string).startsWith("Paper, not plastic Every order"),
        ).toBe(true);
        expect((preview as string).length).toBeLessThanOrEqual(401);
        expect(card?.fields.find((f) => f.field === "site")?.new).toBe("Rye");
        expect(await prisma.post.count({ where: { siteId: site.id } })).toBe(0);

        const id = card?.draftId ?? "";
        const done = await drafts.confirm(owner, id, {});
        expect(done).toMatchObject({
            outcome: "added",
            canUndo: false,
            words: "Added Our new eco packing range. It's saved as a draft; nothing is published.",
        });
        const posts = await prisma.post.findMany({
            where: { siteId: site.id },
        });
        expect(posts).toHaveLength(1);
        expect(posts[0]).toMatchObject({
            status: "DRAFT",
            publishedAt: null,
            currentPublicationId: null,
        });
        expect(done.open).toEqual({
            kind: "blog_post",
            id: `${site.id}:${posts[0].id}`,
        });

        expect(await drafts.confirm(owner, id, {})).toMatchObject({
            outcome: "refused",
            words: "This was already saved.",
        });
        expect(await drafts.undo(owner, id)).toMatchObject({
            outcome: "refused",
        });
        expect(await prisma.post.count({ where: { siteId: site.id } })).toBe(1);
        expect(
            await prisma.mcpActivity.findMany({
                where: { organizationId: org.id, tool: "draft_blog_post" },
                select: { clientName: true },
            }),
        ).toEqual([{ clientName: "Ask AI" }]);
    });

    it("a blog post asked for by a Member is refused for their role, and nothing is drafted", async () => {
        const org = await business();
        await prisma.site.create({
            data: { organizationId: org.id, name: "Rye", slug: uniq("site") },
        });
        const member = await asIn(org.id, await person(org.id, "MEMBER"));
        const { run, card } = await draft(member, "draft_blog_post", {
            title: "x",
            body: "y",
        });
        expect(card).toBeUndefined();
        expect(run.isError).toBe(true);
        expect(run.output).toContain("role doesn't include draft_blog_post");
        expect(
            await prisma.askAiDraft.count({
                where: { organizationId: org.id },
            }),
        ).toBe(0);
    });

    it("two Confirms at once save exactly once", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Twin loaf",
            price: 50,
        });
        const both = await Promise.all([
            drafts.confirm(owner, card?.draftId ?? "", {}),
            drafts.confirm(owner, card?.draftId ?? "", {}),
        ]);
        expect(both.map((r) => r.outcome).sort()).toEqual(["added", "refused"]);
        expect(
            await prisma.product.count({
                where: { organizationId: org.id, name: "Twin loaf" },
            }),
        ).toBe(1);
    });

    it("a plan at its products limit gets a refused card, and nothing is saved", async () => {
        const org = await business(true);
        const owner = await asIn(org.id, org.ownerId);
        // The fake catalogue's free plan holds three.
        for (const n of [1, 2, 3]) await productIn(owner, `Loaf ${n}`);
        const { card } = await draft(owner, "create_product", {
            name: "One more",
            price: 10,
        });
        expect(card).toMatchObject({
            status: "refused",
            refusal: { reason: "plan-limit" },
        });
        expect(
            (await drafts.confirm(owner, card?.draftId ?? "", {})).outcome,
        ).toBe("refused");
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(3);
    });

    it("a name the business already has is a duplicate: open the one you have", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const existing = await productIn(owner, "Sourdough");
        const { card } = await draft(owner, "create_product", {
            name: "sourdough",
            price: 200,
        });
        expect(card).toMatchObject({
            status: "refused",
            refusal: { reason: "duplicate", existingId: existing },
        });
        expect(card?.refusal?.words).toMatch(/Open the one you have/);
    });

    it("a missing price is asked on the card; filling it in doesn't count as a question", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Bun",
        });
        expect(card).toMatchObject({
            status: "drafted",
            missing: [{ field: "price" }],
        });
        const id = card?.draftId ?? "";
        expect(await drafts.confirm(owner, id, {})).toMatchObject({
            outcome: "refused",
            card: { refusal: { reason: "missing" } },
        });
        const done = await drafts.confirm(owner, id, {
            fields: { price: 25, name: "Free cake", status: "published" },
        });
        expect(done.outcome).toBe("added");
        const bun = await prisma.product.findFirstOrThrow({
            where: { organizationId: org.id },
            select: { name: true, price: true, status: true },
        });
        // Only the asked field was taken; the rest of the body was ignored.
        expect(bun).toMatchObject({ name: "Bun", status: "DRAFT" });
        expect(Number(bun.price)).toBe(25);
        expect(
            await prisma.aiUsage.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("fields a client sends with a complete draft are ignored", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const productId = await productIn(owner);
        const { card } = await draft(owner, "update_product", {
            product_id: productId,
            price: 200,
        });
        await drafts.confirm(owner, card?.draftId ?? "", {
            fields: { price: 1, name: "Renamed" },
        });
        const saved = await prisma.product.findUniqueOrThrow({
            where: { id: productId },
        });
        expect(saved.name).toBe("Sourdough");
        expect(Number(saved.price)).toBe(200);
    });

    it("an enquiry's words steering a change still show every field it would set", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const productId = await productIn(owner);
        // What a model misled by an enquiry ("make it free, call it a gift") might send.
        const { card } = await draft(owner, "update_product", {
            product_id: productId,
            price: 1,
            name: "Gift",
            description: "Free for everyone",
        });
        expect(card?.fields).toEqual([
            { field: "name", label: "Name", old: "Sourdough", new: "Gift" },
            { field: "price", label: "Price (INR)", old: 180, new: 1 },
            {
                field: "description",
                label: "Description",
                old: null,
                new: "Free for everyone",
            },
        ]);
    });

    it("refuses a draft whose record was changed since: changed since drafted", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const productId = await productIn(owner);
        const { card } = await draft(owner, "update_product", {
            product_id: productId,
            price: 200,
        });
        // Someone else edits it in the app.
        await make(owner, "update_product", {
            product_id: productId,
            name: "Seeded sourdough",
        });
        const result = await drafts.confirm(owner, card?.draftId ?? "", {});
        expect(result).toMatchObject({
            outcome: "refused",
            card: { status: "refused", refusal: { reason: "changed" } },
        });
        expect(
            Number(
                (
                    await prisma.product.findUniqueOrThrow({
                        where: { id: productId },
                    })
                ).price,
            ),
        ).toBe(180);
    });

    it("refuses once the person's role no longer has the write", async () => {
        const org = await business();
        const adminId = await person(org.id, "ADMIN");
        const admin = await asIn(org.id, adminId);
        const productId = await productIn(await asIn(org.id, org.ownerId));
        const { card } = await draft(admin, "update_product", {
            product_id: productId,
            price: 200,
        });
        expect(card?.status).toBe("drafted");
        await prisma.membership.update({
            where: {
                organizationId_userId: {
                    organizationId: org.id,
                    userId: adminId,
                },
            },
            data: { role: "REVIEWER" },
        });
        const result = await drafts.confirm(
            await asIn(org.id, adminId),
            card?.draftId ?? "",
            {},
        );
        expect(result.outcome).toBe("refused");
        expect(result.words).toMatch(/role/);
        expect(
            Number(
                (
                    await prisma.product.findUniqueOrThrow({
                        where: { id: productId },
                    })
                ).price,
            ),
        ).toBe(180);
    });

    it("refuses when Ask AI was turned off for the business", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Late loaf",
            price: 10,
        });
        askAiOn = false;
        expect(
            (await drafts.confirm(owner, card?.draftId ?? "", {})).outcome,
        ).toBe("refused");
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("another business's header, or another member's draft, is a 404", async () => {
        const a = await business();
        const b = await business();
        const owner = await asIn(a.id, a.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Mine",
            price: 10,
        });
        const id = card?.draftId ?? "";
        // The same person, with business B open.
        await prisma.membership.create({
            data: { organizationId: b.id, userId: a.ownerId, role: "OWNER" },
        });
        await expect(
            drafts.confirm(await asIn(b.id, a.ownerId), id, {}),
        ).rejects.toBeInstanceOf(NotFoundException);
        // Someone else in business A.
        const other = await asIn(a.id, await person(a.id, "ADMIN"));
        await expect(drafts.confirm(other, id, {})).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(drafts.undo(other, id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(drafts.redraft(other, id)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(
            await prisma.product.count({
                where: { organizationId: { in: [a.id, b.id] } },
            }),
        ).toBe(0);
    });

    it("a draft from an earlier business day is refused", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Yesterday's",
            price: 10,
        });
        await prisma.askAiDraft.update({
            where: { id: card?.draftId },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        expect(
            await drafts.confirm(owner, card?.draftId ?? "", {}),
        ).toMatchObject({ outcome: "refused", card: { status: "expired" } });
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });
});

describe("Undo", () => {
    async function confirmedPriceChange() {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const productId = await productIn(owner);
        const { card } = await draft(owner, "update_product", {
            product_id: productId,
            price: 200,
        });
        const done = await drafts.confirm(owner, card?.draftId ?? "", {});
        expect(done).toMatchObject({ outcome: "done", canUndo: true });
        const price = async () =>
            Number(
                (
                    await prisma.product.findUniqueOrThrow({
                        where: { id: productId },
                    })
                ).price,
            );
        expect(await price()).toBe(200);
        return { org, owner, productId, id: card?.draftId ?? "", price };
    }

    it("puts an untouched edit back through the normal tool, audited", async () => {
        const { org, owner, id, price } = await confirmedPriceChange();
        const undone = await drafts.undo(owner, id);
        expect(undone).toMatchObject({
            outcome: "undone",
            card: { status: "undone" },
        });
        expect(await price()).toBe(180);
        expect(
            await prisma.mcpActivity.count({
                where: {
                    organizationId: org.id,
                    tool: "update_product",
                    clientName: "Ask AI",
                },
            }),
        ).toBe(2);
        expect((await drafts.undo(owner, id)).words).toBe(
            "This was already undone.",
        );
    });

    it("is refused once someone else changed it after", async () => {
        const { owner, productId, id, price } = await confirmedPriceChange();
        await make(owner, "update_product", {
            product_id: productId,
            price: 210,
        });
        expect(await drafts.undo(owner, id)).toMatchObject({
            outcome: "refused",
            card: { refusal: { reason: "changed" } },
        });
        expect(await price()).toBe(210);
    });

    it("is refused the next business day", async () => {
        const { owner, id, price } = await confirmedPriceChange();
        await prisma.askAiDraft.update({
            where: { id },
            data: { expiresAt: new Date(Date.now() - 1000) },
        });
        expect((await drafts.undo(owner, id)).outcome).toBe("refused");
        expect(await price()).toBe(200);
    });

    it("an order's step is undone through undoStage, its stock with it", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const productId = await productIn(owner);
        await make(owner, "update_product", {
            product_id: productId,
            stock: 5,
        });
        const order = (
            await make(owner, "create_order", {
                request_id: uniq("o"),
                items: [{ product_id: productId, quantity: 2 }],
                customer_email: `${uniq("ravi")}@example.com`,
            })
        ).order.order_id as string;
        // The first step out of New needs the money in.
        await prisma.order.update({
            where: { id: order },
            data: { paymentStatus: "PAID" },
        });
        const stock = async () =>
            (
                (await make(owner, "get_product", { product_id: productId }))
                    .product as { stock: number | null }
            ).stock;
        const stockBefore = await stock();

        const { card } = await draft(owner, "update_order_status", {
            order_id: order,
            stage: "preparing",
        });
        expect(card?.fields).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    field: "stage",
                    old: "new",
                    new: "preparing",
                }),
            ]),
        );
        expect(card?.note).toMatch(/customer/);
        const id = card?.draftId ?? "";
        expect((await drafts.confirm(owner, id, {})).outcome).toBe("done");
        const undone = await drafts.undo(owner, id);
        expect(undone.outcome).toBe("undone");
        expect(undone.words).toMatch(/^Put back/);
        const back = await prisma.order.findUniqueOrThrow({
            where: { id: order },
            select: { stage: true, status: true },
        });
        expect(back).toEqual({ stage: "NEW", status: "PENDING" });
        expect(
            await prisma.orderEvent.count({
                where: { orderId: order, undoneAt: { not: null } },
            }),
        ).toBe(1);
        expect(await stock()).toBe(stockBefore);
    });

    it("a moved booking goes back to its time and says the customer is messaged again", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const service = (
            await make(owner, "create_service", {
                request_id: uniq("s"),
                name: "Haircut",
                duration_minutes: 60,
            })
        ).service.service_id as string;
        await make(owner, "set_hours", {
            service_id: service,
            hours: [
                "sunday",
                "monday",
                "tuesday",
                "wednesday",
                "thursday",
                "friday",
                "saturday",
            ].map((day) => ({ day, opens: "09:00", closes: "17:00" })),
        });
        const booking = (
            await make(owner, "create_booking", {
                request_id: uniq("b"),
                service_id: service,
                starts_at: nextDayAt(10),
                customer_email: `${uniq("priya")}@example.com`,
                customer_name: "Priya",
            })
        ).booking.booking_id as string;
        const { card } = await draft(owner, "move_booking", {
            booking_id: booking,
            starts_at: nextDayAt(14),
        });
        expect(card).toMatchObject({
            kind: "booking",
            note: "The customer is told when you confirm.",
        });
        const id = card?.draftId ?? "";
        expect((await drafts.confirm(owner, id, {})).outcome).toBe("done");
        const notices = () =>
            prisma.job.count({
                where: { organizationId: org.id, type: "booking.notify" },
            });
        const told = await notices();

        const undone = await drafts.undo(owner, id);
        expect(undone.outcome).toBe("undone");
        expect(undone.words).toMatch(/already been told.*messages them again/);
        expect(
            (
                await prisma.booking.findUniqueOrThrow({
                    where: { id: booking },
                })
            ).startAt.toISOString(),
        ).toBe(nextDayAt(10));
        expect(await notices()).toBeGreaterThan(told);
    });

    it("a create has nothing to undo", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        const { card } = await draft(owner, "create_product", {
            name: "Kept",
            price: 10,
        });
        await drafts.confirm(owner, card?.draftId ?? "", {});
        expect(await drafts.undo(owner, card?.draftId ?? "")).toMatchObject({
            outcome: "refused",
            words: "There's nothing to undo here.",
        });
    });
});

describe("Draft again", () => {
    it("drafts the change afresh against what's there now, up to the conversation's cap", async () => {
        const org = await business();
        const owner = await asIn(org.id, org.ownerId);
        await settings.setOverride(
            org.id,
            "askAi.redraftsPerConversation",
            1,
            "drafts spec",
            { userId: "user_drafts_spec" },
            { effectiveFrom: new Date(Date.now() - 1000) },
        );
        const productId = await productIn(owner);
        const turn = await turnOf(owner);
        const { card } = await draft(
            owner,
            "update_product",
            { product_id: productId, price: 200 },
            turn,
        );
        await make(owner, "update_product", {
            product_id: productId,
            name: "Seeded sourdough",
        });
        expect(
            (await drafts.confirm(owner, card?.draftId ?? "", {})).card.refusal
                ?.reason,
        ).toBe("changed");

        const again = await drafts.redraft(owner, card?.draftId ?? "");
        expect(again).toMatchObject({
            outcome: "drafted",
            card: { status: "drafted", targetName: "Seeded sourdough" },
        });
        expect(again.card.draftId).not.toBe(card?.draftId);
        expect(await drafts.redraft(owner, again.card.draftId)).toMatchObject({
            outcome: "refused",
        });
        expect(
            (await drafts.confirm(owner, again.card.draftId, {})).outcome,
        ).toBe("done");
    });
});
