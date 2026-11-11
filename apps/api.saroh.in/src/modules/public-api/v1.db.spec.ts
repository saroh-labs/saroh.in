/**
 * The `/v1` secret routes over HTTP against a real Postgres (plan
 * 2026-11-10-001, U8): a secret key's business only, every write through
 * the workspace's services, `Idempotency-Key`, cursor paging, the contract's
 * errors, and nothing `customer:sensitive` in an answer.
 *
 * The app is built as main.ts builds it where it matters here: OriginGuard,
 * OrgRlsInterceptor and the exception filter. Caps and kill switches are
 * fixtures (obviously fake numbers); the payment provider and the webhook
 * verifier are the network-free fakes. Runs in the integration project,
 * plain and with TEST_RLS=on.
 */
// better-auth is ESM, which ts-jest can't load; no session is read here.
jest.mock("../../common/guards/better-auth.guard", () => ({
    BetterAuthGuard: class BetterAuthGuard {},
}));
jest.mock("@saroh/auth", () => ({
    isTrustedOrigin: (origin: string): boolean => {
        try {
            return new URL(origin).origin.endsWith(".saroh.in");
        } catch {
            return false;
        }
    },
}));

import { createHmac, randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
    bookingView,
    cancelledBookingView,
    customerView,
    enquiryView,
    orderView,
    page,
    productView,
    serviceView,
} from "@saroh/api-contract";
import { prisma } from "@saroh/database";
import type { z } from "zod";

import { giveBusinessDetails } from "../../../test/business-details";
import { AllExceptionsFilter } from "../../common/filters/all-exceptions.filter";
import { OriginGuard } from "../../common/guards/origin.guard";
import { IdempotencyService } from "../../common/idempotency/idempotency.service";
import { OrgRlsInterceptor } from "../../common/interceptors/org-rls.interceptor";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import {
    displayPrefix,
    mintToken,
    tokenDigest,
} from "../api-keys/api-keys.service";
import { keyContextCache } from "../api-keys/key-context.cache";
import { BookingsService } from "../bookings/bookings.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import { ContactsService } from "../contacts/contacts.service";
import { CustomerAddService } from "../customer-workspace/customer-add.service";
import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FeatureFlagService as Flags } from "../feature-flags/feature-flags.service";
import { OrdersService } from "../orders/orders.service";
import { PaymentsService } from "../payments/payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "../payments/providers/fake.provider";
import { PublicInvoicesService } from "../payments/public-invoices.service";
import { InventoryService } from "../products/inventory.service";
import { ProductsService } from "../products/products.service";
import { VariantsService } from "../products/variants.service";
import { CapsService } from "../rate-limits/caps";
import { LimitsService } from "../rate-limits/limits.service";
import { StoresService } from "../stores/stores.service";
import {
    FakeWebhookProvider,
    FakeWebhookProviderFactory,
} from "../webhooks/providers/fake.webhook";
import { WebhooksService } from "../webhooks/webhooks.service";
import { BookingsV1Controller } from "./bookings.v1.controller";
import { CatalogueV1Controller } from "./catalogue.v1.controller";
import { CustomersV1Controller } from "./customers.v1.controller";
import { EnquiriesV1Controller } from "./enquiries.v1.controller";
import { OrdersV1Controller } from "./orders.v1.controller";

const mutableEnv = env as {
    APIKEY_ENC_KEY?: string;
    PAYMENTS_ENC_KEY?: string;
};
const before = { ...mutableEnv };

// Fixture cap: an obviously fake number, never a plan's.
const CAP = 10_000;
const WEBHOOK_SECRET = "whsec_v1_cancel";

const tag = `${process.pid}x${Date.now() % 100000}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** Everything U8's routes ask for, as a key an owner made would hold. */
const FULL_SCOPE = [
    "store:read",
    "store:write",
    "inventory:write",
    "service:read",
    "service:write",
    "site:read",
    "subscription:read",
    "booking:read",
    "booking:write",
    "order:read",
    "order:create",
    "order:edit",
    "order:refund",
    "contact:read",
    "contact:write",
    "lead:read",
    "form:read",
];

const flags = {
    isEnabled: jest.fn(() => Promise.resolve(true)),
} as unknown as FeatureFlagService;
const stores = new StoresService(flags);
const products = new ProductsService(stores);
const fake = new FakeMerchantProvider("RAZORPAY");
const payments = new PaymentsService(new FakeProviderFactory(fake));
const bookings = new BookingsService(undefined, payments);
const publicBookings = new PublicBookingsService(
    new FixedWindowRateLimiter(1_000),
);
const publicInvoices = new PublicInvoicesService(payments);
const webhooks = new WebhooksService(
    new FakeWebhookProviderFactory(new FakeWebhookProvider("RAZORPAY")),
    payments,
);

let app: INestApplication;
let port: number;

beforeAll(async () => {
    // Throwaway keys for this run only, never a value in the repo.
    mutableEnv.APIKEY_ENC_KEY = randomBytes(32).toString("base64");
    mutableEnv.PAYMENTS_ENC_KEY = randomBytes(32).toString("hex");
    const moduleRef = await Test.createTestingModule({
        imports: [ApiKeysModule],
        controllers: [
            CatalogueV1Controller,
            BookingsV1Controller,
            OrdersV1Controller,
            CustomersV1Controller,
            EnquiriesV1Controller,
        ],
        providers: [
            { provide: ProductsService, useValue: products },
            {
                provide: VariantsService,
                useValue: new VariantsService(products),
            },
            {
                provide: InventoryService,
                useValue: new InventoryService(products),
            },
            { provide: BookingsService, useValue: bookings },
            { provide: OrdersService, useValue: new OrdersService(stores) },
            { provide: ContactsService, useValue: new ContactsService() },
            CustomerAddService,
            IdempotencyService,
            // Enforcement is dark here (MODULE_ENFORCEMENT unset): never asked.
            { provide: ModuleAvailabilityService, useValue: {} },
        ],
    })
        .overrideProvider(CapsService)
        .useValue({ rpm: () => Promise.resolve(CAP) })
        .overrideProvider(LimitsService)
        .useValue(new LimitsService(null))
        .overrideProvider(Flags)
        .useValue(flags)
        .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalGuards(new OriginGuard());
    app.useGlobalInterceptors(new OrgRlsInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.listen(0, "127.0.0.1");
    port = (app.getHttpServer().address() as { port: number }).port;
});

afterAll(async () => {
    await app?.close();
    Object.assign(mutableEnv, before);
});

beforeEach(() => keyContextCache.clear());

interface Answer {
    status: number;
    body: Record<string, unknown> & {
        error?: { code?: string; message?: string; requestId?: string };
    };
    text: string;
}

function call(
    token: string,
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
): Promise<Answer> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            {
                host: "127.0.0.1",
                port,
                method,
                path,
                headers: {
                    authorization: `Bearer ${token}`,
                    ...(payload ? { "content-type": "application/json" } : {}),
                    ...headers,
                },
            },
            (res) => {
                let text = "";
                res.on("data", (c: Buffer) => (text += c.toString()));
                res.on("end", () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        body: text ? JSON.parse(text) : {},
                        text,
                    }),
                );
            },
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function business() {
    const org = await prisma.organization.create({
        data: { name: "Rye Bakery", slug: uniq("rye") },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("owner")}@example.com`, name: "Owner" },
    });
    await prisma.membership.create({
        data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });
    await prisma.businessProfile.create({
        data: { organizationId: org.id, timezone: "UTC" },
    });
    await giveBusinessDetails(org.id);
    const store = await stores.createForUser(user.id, org.id, {
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
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    return { id: org.id, owner, storeId: store.id };
}

async function secretKey(
    org: { id: string; owner: OrganizationContext },
    scope: string[] = FULL_SCOPE,
) {
    const token = mintToken("SECRET");
    await prisma.apiKey.create({
        data: {
            organizationId: org.id,
            createdByUserId: org.owner.userId,
            kind: "SECRET",
            edition: "INDIA",
            name: "Fixture key",
            prefix: displayPrefix(token),
            tokenDigest: tokenDigest(token),
            scope,
            allowedOrigins: [],
        },
    });
    return token;
}

const loaf = (name = "Sourdough", amountMinor = 18_000) => ({
    name,
    price: { amountMinor, currency: "INR" },
});

/** A real answer is exactly its contract schema: parsing drops nothing (review #2). */
function exactly(schema: z.ZodType, body: unknown) {
    expect(schema.parse(body)).toEqual(body);
}

describe("/v1 catalogue", () => {
    it("creates a product, then lists and reads it", async () => {
        const org = await business();
        const key = await secretKey(org);
        const made = await call(key, "POST", "/v1/products", loaf());
        expect(made.status).toBe(201);
        exactly(productView, made.body);
        expect(made.body).toMatchObject({
            name: "Sourdough",
            status: "draft",
            price: { amountMinor: 18_000, currency: "INR" },
            variants: [],
        });
        const list = await call(key, "GET", "/v1/products");
        expect(list.status).toBe(200);
        exactly(page(productView), list.body);
        expect((list.body.data as { id: string }[]).map((p) => p.id)).toContain(
            made.body.id,
        );
        const one = await call(
            key,
            "GET",
            `/v1/products/${String(made.body.id)}`,
        );
        expect(one.body).toEqual(made.body);
    });

    it("changes the price, adds a variant and counts stock", async () => {
        const org = await business();
        const key = await secretKey(org);
        const id = String(
            (await call(key, "POST", "/v1/products", loaf())).body.id,
        );
        const patched = await call(key, "PATCH", `/v1/products/${id}`, {
            price: { amountMinor: 20_000, currency: "INR" },
        });
        expect(patched.status).toBe(200);
        expect(patched.body.price).toEqual({
            amountMinor: 20_000,
            currency: "INR",
        });

        const counted = await call(key, "PATCH", `/v1/products/${id}/stock`, {
            quantity: 7,
        });
        expect(counted.status).toBe(200);
        expect(counted.body).toMatchObject({ productId: id, quantity: 7 });

        const variant = await call(key, "POST", `/v1/products/${id}/variants`, {
            sku: uniq("SKU"),
            title: "Large",
            price: { amountMinor: 25_000, currency: "INR" },
        });
        expect(variant.status).toBe(201);
        const [v] = variant.body.variants as { id: string }[];
        const renamed = await call(
            key,
            "PATCH",
            `/v1/products/${id}/variants/${v?.id}`,
            { title: "Extra large" },
        );
        expect(renamed.status).toBe(200);
        expect(renamed.body.variants).toEqual([
            expect.objectContaining({
                title: "Extra large",
                price: { amountMinor: 25_000, currency: "INR" },
            }),
        ]);
    });

    it("refuses a bad price with 400 in the contract's shape", async () => {
        const org = await business();
        const key = await secretKey(org);
        for (const price of [
            { amountMinor: -1, currency: "INR" },
            { amountMinor: 12.5, currency: "INR" },
            { amountMinor: 100, currency: "rupees" },
        ]) {
            const res = await call(key, "POST", "/v1/products", {
                name: "X",
                price,
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatchObject({
                code: "invalid_request",
                requestId: expect.any(String),
            });
            expect(res.body.error?.message).toContain("body.price");
        }
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(0);
    });

    it("makes one product for one Idempotency-Key, and answers the same", async () => {
        const org = await business();
        const key = await secretKey(org);
        const headers = { "idempotency-key": uniq("idem") };
        const first = await call(key, "POST", "/v1/products", loaf(), headers);
        const again = await call(key, "POST", "/v1/products", loaf(), headers);
        expect(first.status).toBe(201);
        expect(again.status).toBe(201);
        expect(again.body).toEqual(first.body);
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(1);

        const different = await call(
            key,
            "POST",
            "/v1/products",
            loaf("Rye"),
            headers,
        );
        expect(different.status).toBe(409);
        expect(different.body.error?.code).toBe("conflict");
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(1);
    });

    it("refuses a write with a read-only key: 403, nothing made", async () => {
        const org = await business();
        const key = await secretKey(org, ["store:read"]);
        const res = await call(key, "POST", "/v1/products", loaf());
        expect(res.status).toBe(403);
        expect(res.body.error).toMatchObject({ code: "forbidden" });
        expect(
            await prisma.product.count({ where: { organizationId: org.id } }),
        ).toBe(0);
        expect((await call(key, "GET", "/v1/products")).status).toBe(200);
    });

    it("never reaches another business's product: 404, nothing leaked", async () => {
        const a = await business();
        const b = await business();
        const keyB = await secretKey(b);
        const theirs = String(
            (await call(keyB, "POST", "/v1/products", loaf())).body.id,
        );
        const keyA = await secretKey(a);
        for (const [method, path, body] of [
            ["GET", `/v1/products/${theirs}`, undefined],
            ["PATCH", `/v1/products/${theirs}`, { name: "Mine now" }],
            ["GET", `/v1/products/${theirs}/stock`, undefined],
        ] as const) {
            const res = await call(keyA, method, path, body);
            expect(res.status).toBe(404);
            expect(res.text).not.toContain(b.id);
        }
        const list = await call(keyA, "GET", "/v1/products");
        expect(list.body.data).toEqual([]);
    });

    it("makes a service, sets its hours, and lists posts and plans", async () => {
        const org = await business();
        const key = await secretKey(org);
        const made = await call(key, "POST", "/v1/services", {
            name: "Haircut",
            durationMinutes: 45,
            price: { amountMinor: 50_000, currency: "INR" },
        });
        expect(made.status).toBe(201);
        exactly(serviceView, made.body);
        expect(made.body).toMatchObject({
            name: "Haircut",
            price: { amountMinor: 50_000, currency: "INR" },
            timezone: "UTC",
            status: "active",
        });
        // What it takes it answers, and null clears what can be cleared.
        const patched = await call(
            key,
            "PATCH",
            `/v1/services/${String(made.body.id)}`,
            { description: "Wash and cut", timezone: "Asia/Kolkata" },
        );
        expect(patched.body).toMatchObject({
            description: "Wash and cut",
            timezone: "Asia/Kolkata",
        });
        const cleared = await call(
            key,
            "PATCH",
            `/v1/services/${String(made.body.id)}`,
            { description: null },
        );
        expect(cleared.body.description).toBeNull();
        const windows = [{ dayOfWeek: 1, startMinute: 540, endMinute: 1080 }];
        const hours = await call(
            key,
            "PUT",
            `/v1/services/${String(made.body.id)}/hours`,
            { windows },
        );
        expect(hours.status).toBe(200);
        expect(hours.body).toEqual({ windows });
        expect((await call(key, "GET", "/v1/posts")).body).toEqual({
            data: [],
            nextCursor: null,
        });
        expect((await call(key, "GET", "/v1/subscription-plans")).status).toBe(
            200,
        );
    });

    it("refuses a service price past its column with 400, making and changing nothing", async () => {
        const org = await business();
        const key = await secretKey(org);
        const tooBig = { amountMinor: 2_147_483_648, currency: "INR" };
        const made = await call(key, "POST", "/v1/services", {
            name: "Haircut",
            durationMinutes: 45,
            price: tooBig,
        });
        expect(made.status).toBe(400);
        expect(made.body.error?.code).toBe("invalid_request");
        expect(
            await prisma.service.count({ where: { organizationId: org.id } }),
        ).toBe(0);
        const ok = await call(key, "POST", "/v1/services", {
            name: "Haircut",
            durationMinutes: 45,
            price: { amountMinor: 2_147_483_647, currency: "INR" },
        });
        expect(ok.status).toBe(201);
        const patched = await call(
            key,
            "PATCH",
            `/v1/services/${String(ok.body.id)}`,
            { price: tooBig },
        );
        expect(patched.status).toBe(400);
        expect(patched.body.error?.code).toBe("invalid_request");
        expect(
            (
                await prisma.service.findUniqueOrThrow({
                    where: { id: String(ok.body.id) },
                })
            ).priceCents,
        ).toBe(2_147_483_647);
    });
});

describe("/v1 paging", () => {
    it("keeps its cursors while rows are added", async () => {
        const org = await business();
        const key = await secretKey(org);
        for (let i = 0; i < 5; i += 1) {
            await call(key, "POST", "/v1/products", loaf(`Loaf ${i}`));
        }
        const seen: string[] = [];
        let cursor: string | null = null;
        let pages = 0;
        do {
            const q: string = cursor ? `&cursor=${cursor}` : "";
            const res = await call(key, "GET", `/v1/products?limit=2${q}`);
            expect(res.status).toBe(200);
            seen.push(
                ...(res.body.data as { name: string }[]).map((p) => p.name),
            );
            cursor = res.body.nextCursor as string | null;
            // Someone adds a product while the pages are read.
            await call(key, "POST", "/v1/products", loaf(`New ${pages}`));
            pages += 1;
        } while (cursor);
        expect(seen).toEqual([
            "Loaf 4",
            "Loaf 3",
            "Loaf 2",
            "Loaf 1",
            "Loaf 0",
        ]);
        expect(pages).toBe(3);

        const bad = await call(
            key,
            "GET",
            "/v1/products?cursor=bm90LWEtY3Vyc29y",
        );
        expect(bad.status).toBe(400);
        expect(bad.body.error?.code).toBe("invalid_request");
    });
});

describe("/v1 customers", () => {
    it("adds, changes and reads a customer, never with anything sensitive", async () => {
        const org = await business();
        // Even a key that may see sensitive notes gets none through /v1.
        const key = await secretKey(org, [...FULL_SCOPE, "customer:sensitive"]);
        const made = await call(key, "POST", "/v1/customers", {
            email: `${uniq("meera")}@example.com`,
            firstName: "Meera",
            company: "Meera Bakes",
            address: {
                line1: "14, 2nd Cross",
                city: "Bengaluru",
                country: "IN",
            },
        });
        expect(made.status).toBe(201);
        exactly(customerView, made.body);
        expect(made.body.address).toEqual({
            line1: "14, 2nd Cross",
            line2: null,
            city: "Bengaluru",
            state: null,
            postalCode: null,
            country: "IN",
        });
        const id = String(made.body.id);
        // What it answers, it takes back: the nested address, null to clear.
        const changed = await call(key, "PATCH", `/v1/customers/${id}`, {
            phone: "+91 98450 00000",
            company: null,
            address: { postalCode: "560038" },
        });
        expect(changed.status).toBe(200);
        expect(changed.body).toMatchObject({
            firstName: "Meera",
            phone: "+91 98450 00000",
            company: null,
            address: expect.objectContaining({
                city: "Bengaluru",
                postalCode: "560038",
            }),
        });
        const moved = await call(key, "PATCH", `/v1/customers/${id}`, {
            address: null,
        });
        expect(moved.body.address).toBeNull();
        // A bad address makes no customer.
        const bad = await call(key, "POST", "/v1/customers", {
            email: `${uniq("bad")}@example.com`,
            address: { city: "Pune", state: "Narnia", country: "IN" },
        });
        expect(bad.status).toBe(400);
        expect(
            await prisma.contact.count({
                where: { organizationId: org.id, city: "Pune" },
            }),
        ).toBe(0);

        // What only `customer:sensitive` sees: a medical entry, and a note
        // on a booking, each carrying a marker that must never come back.
        const MARKER = `zq-sensitive-${tag}`;
        await prisma.contactAttention.create({
            data: {
                organizationId: org.id,
                contactId: id,
                kind: "MEDICAL",
                label: `Heart condition ${MARKER}`,
                detail: MARKER,
                sensitive: true,
            },
        });
        const svc = await prisma.service.create({
            data: {
                organizationId: org.id,
                name: "Intake",
                durationMinutes: 30,
                timezone: "UTC",
            },
        });
        const at = nextStart();
        await prisma.booking.create({
            data: {
                organizationId: org.id,
                serviceId: svc.id,
                contactId: id,
                startAt: at,
                endAt: new Date(at.getTime() + 30 * 60_000),
                timezone: "UTC",
                snapshot: {},
                intakeNote: `Allergic to latex ${MARKER}`,
            },
        });
        const read = await call(key, "GET", `/v1/customers/${id}`);
        const list = await call(key, "GET", "/v1/customers");
        for (const res of [read, list]) {
            expect(res.status).toBe(200);
            expect(JSON.stringify(res.body)).not.toContain(MARKER);
            expect(res.text).not.toMatch(/attention|sensitive/i);
        }
        expect(Object.keys(read.body).sort()).toEqual(
            [
                "address",
                "company",
                "createdAt",
                "email",
                "firstName",
                "id",
                "lastName",
                "phone",
                "updatedAt",
            ].sort(),
        );
    });
});

/** A start some days from now at 10:00 UTC, a day of its own each time. */
let dayOut = 3;
function nextStart(): Date {
    const d = new Date();
    d.setUTCHours(10, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + dayOut);
    dayOut += 1;
    return d;
}

describe("/v1 bookings", () => {
    let org: Awaited<ReturnType<typeof business>>;
    let key: string;
    let service: string;
    let webhookSeq = 0;

    beforeAll(async () => {
        org = await business();
        key = await secretKey(org);
        await prisma.bookingRules.create({
            data: { organizationId: org.id, freeCancelHours: 24 },
        });
        service = (
            await prisma.service.create({
                data: {
                    organizationId: org.id,
                    name: "Root canal",
                    durationMinutes: 60,
                    capacity: 1,
                    priceCents: 80_000,
                    currency: "INR",
                    timezone: "UTC",
                    depositMode: "PERCENT_50",
                    availabilityRules: {
                        create: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
                            organizationId: org.id,
                            dayOfWeek,
                            startMinute: 9 * 60,
                            endMinute: 18 * 60,
                        })),
                    },
                },
            })
        ).id;
        await payments.connectProvider(org.owner, {
            provider: "RAZORPAY",
            publicKey: "rzp_test_V1",
            keyId: "rzp_test_V1",
            keySecret: "rzp_secret",
            webhookSecret: WEBHOOK_SECRET,
        });
    });

    /** A booking with its deposit paid online, as a customer makes one. */
    async function paidBooking() {
        const made = await publicBookings.bookOnline(
            service,
            {
                startAt: nextStart().toISOString(),
                bookerName: "Meera Iyer",
                bookerEmail: `${uniq("meera")}@example.com`,
                idempotencyKey: uniq("v1"),
                pay: "DEPOSIT",
            },
            "ip_1",
        );
        const intent = await publicInvoices.createIntent(
            made.payToken ?? "",
            {},
        );
        const raw = Buffer.from(
            JSON.stringify({
                providerEventId: `evt_v1_${++webhookSeq}_${tag}`,
                eventType: "payment.captured",
                outcome: "SUCCEEDED",
                providerIntentId: intent.providerIntentId,
                providerPaymentRef: `pay_v1_${webhookSeq}_${tag}`,
            }),
        );
        await webhooks.handle("razorpay", org.id, raw, {
            "x-fake-signature": createHmac("sha256", WEBHOOK_SECRET)
                .update(raw)
                .digest("hex"),
        });
        return made.booking.id;
    }

    it("books, moves and reads a booking", async () => {
        const made = await call(key, "POST", "/v1/bookings", {
            serviceId: service,
            startAt: nextStart().toISOString(),
            bookerName: "Asha",
            bookerEmail: `${uniq("asha")}@example.com`,
        });
        expect(made.status).toBe(201);
        exactly(bookingView, made.body);
        expect(made.body).toMatchObject({
            serviceId: service,
            status: "confirmed",
            outcome: null,
        });
        expect(made.text).not.toContain("intakeNote");
        const to = nextStart().toISOString();
        const moved = await call(
            key,
            "POST",
            `/v1/bookings/${String(made.body.id)}/move`,
            { startAt: to },
        );
        expect(moved.status).toBe(200);
        expect(moved.body.startAt).toBe(to);
        const list = await call(
            key,
            "GET",
            `/v1/bookings?serviceId=${service}`,
        );
        expect((list.body.data as { id: string }[]).map((b) => b.id)).toContain(
            made.body.id,
        );
        const confirmed = await call(
            key,
            "GET",
            `/v1/bookings?serviceId=${service}&status=confirmed`,
        );
        expect(
            (confirmed.body.data as { id: string }[]).map((b) => b.id),
        ).toContain(made.body.id);
        expect(
            (await call(key, "GET", "/v1/bookings?status=CONFIRMED")).status,
        ).toBe(400);
    });

    it("cancels a paid booking under the policy: one refund, and a second cancel changes nothing", async () => {
        const bookingId = await paidBooking();
        const refunds = () =>
            prisma.paymentRefund.count({
                where: { idempotencyKey: `deposit-refund:${bookingId}` },
            });
        const headers = { "idempotency-key": uniq("cancel") };
        const first = await call(
            key,
            "POST",
            `/v1/bookings/${bookingId}/cancel`,
            undefined,
            headers,
        );
        expect(first.status).toBe(200);
        exactly(cancelledBookingView, first.body);
        expect(first.body).toMatchObject({
            status: "cancelled",
            money: {
                // Cancelled in time: the deposit (half of ₹800) goes back.
                refund: { amount: { amountMinor: 40_000, currency: "INR" } },
                kept: null,
            },
        });
        expect(await refunds()).toBe(1);

        const replay = await call(
            key,
            "POST",
            `/v1/bookings/${bookingId}/cancel`,
            undefined,
            headers,
        );
        expect(replay.body).toEqual(first.body);
        const again = await call(
            key,
            "POST",
            `/v1/bookings/${bookingId}/cancel`,
        );
        expect(again.status).toBe(200);
        expect(again.body).toMatchObject({ status: "cancelled" });
        expect(await refunds()).toBe(1);
    });
});

describe("/v1 orders", () => {
    it("takes an order, reads it and moves its status", async () => {
        const org = await business();
        const key = await secretKey(org);
        const product = String(
            (await call(key, "POST", "/v1/products", loaf())).body.id,
        );
        const made = await call(key, "POST", "/v1/orders", {
            items: [{ productId: product, quantity: 2 }],
            customer: { email: `${uniq("ravi")}@example.com`, name: "Ravi" },
        });
        expect(made.status).toBe(201);
        exactly(orderView, made.body);
        expect(made.body).toMatchObject({
            status: "pending",
            paymentStatus: "unpaid",
            stage: "new",
            fulfilment: "pickup",
            storefrontId: org.storeId,
            items: [
                expect.objectContaining({
                    productId: product,
                    quantity: 2,
                    unitPrice: { amountMinor: 18_000, currency: "INR" },
                }),
            ],
        });
        const id = String(made.body.id);
        const moved = await call(key, "POST", `/v1/orders/${id}/status`, {
            status: "processing",
        });
        expect(moved.status).toBe(200);
        expect(moved.body.status).toBe("processing");
        expect((await call(key, "GET", `/v1/orders/${id}`)).body).toEqual(
            moved.body,
        );

        // Cancelling hands money back: a key without `order:refund` can't.
        const editOnly = await secretKey(org, ["order:read", "order:edit"]);
        const refused = await call(
            editOnly,
            "POST",
            `/v1/orders/${id}/status`,
            {
                status: "cancelled",
            },
        );
        expect(refused.status).toBe(403);
    });
});

describe("/v1 enquiries", () => {
    it("reads enquiries and form entries, newest first", async () => {
        const org = await business();
        const key = await secretKey(org);
        const contact = await prisma.contact.create({
            data: { organizationId: org.id, email: `${uniq("e")}@example.com` },
        });
        const pipeline = await prisma.pipeline.create({
            data: {
                organizationId: org.id,
                name: "Enquiries",
                stages: {
                    create: [{ organizationId: org.id, name: "New", order: 0 }],
                },
            },
            include: { stages: true },
        });
        const form = await prisma.form.create({
            data: {
                organizationId: org.id,
                name: "Contact us",
                fields: [
                    { name: "message", label: "Message", type: "textarea" },
                ],
            },
        });
        const lead = await prisma.lead.create({
            data: {
                organizationId: org.id,
                contactId: contact.id,
                pipelineId: pipeline.id,
                stageId: pipeline.stages[0]?.id ?? "",
                formId: form.id,
                title: "Cake for 40",
            },
        });
        await prisma.submission.create({
            data: {
                organizationId: org.id,
                formId: form.id,
                contactId: contact.id,
                leadId: lead.id,
                data: { message: "A cake for 40 on Saturday" },
            },
        });
        const enquiries = await call(key, "GET", "/v1/enquiries");
        exactly(page(enquiryView), enquiries.body);
        expect(enquiries.body.data).toEqual([
            expect.objectContaining({
                id: lead.id,
                status: "open",
                stage: { id: pipeline.stages[0]?.id, name: "New" },
                customerId: contact.id,
            }),
        ]);
        expect(
            (await call(key, "GET", `/v1/enquiries/${lead.id}`)).status,
        ).toBe(200);
        const entries = await call(
            key,
            "GET",
            `/v1/form-entries?formId=${form.id}`,
        );
        expect(entries.body.data).toEqual([
            expect.objectContaining({
                enquiryId: lead.id,
                answers: [
                    {
                        name: "message",
                        label: "Message",
                        value: "A cake for 40 on Saturday",
                    },
                ],
            }),
        ]);
    });
});
