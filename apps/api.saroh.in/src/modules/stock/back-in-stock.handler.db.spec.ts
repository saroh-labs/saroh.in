/**
 * Telling the people waiting for a product that it's back (DEC-174 U23,
 * #1154), against a real Postgres: from stock coming back, through the
 * held `stock.back-in-stock` run and `customer.notify`, to an email through
 * the business's own provider.
 *
 * - Counted from 0 to 5: one run, held ten minutes, however often it rises
 *   meanwhile; then one email per waiting address, each watch told once.
 * - Back and sold out again before the run: nothing sent, all still wait.
 * - A variant's watch hears only about that variant; the product's, about
 *   any option.
 * - The switch off, or no provider, at the run: nothing sent, all wait.
 * - Stopped before it was told: never told.
 * - The 501st watcher: told by the next run.
 * - A contact with the address who revoked email consent: suppressed.
 * - A hand-marked Sold out cleared queues the run too (every writer's
 *   call is checked by `on-sellable-again.guard.spec.ts`); a product
 *   nobody waits for queues nothing.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
    declaredNodeEnv: "test",
}));

import type { Job } from "@saroh/database";
import { prisma, runInOrgContext } from "@saroh/database";

import type {
    ListedProduct,
    ShopBusiness,
} from "../../../test/fixtures/stock-watch";
import {
    listedProduct,
    shopBusiness,
} from "../../../test/fixtures/stock-watch";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { CommunicationsService } from "../communications/communications.service";
import type { ProductAccess } from "../products/product-access";
import { SoldOutService } from "../products/sold-out.service";
import { CUSTOMER_NOTIFY_TYPE } from "../site-accounts/customer-notify-queue";
import {
    CustomerNotifyHandler,
    CustomerNotifyService,
} from "../site-accounts/customer-notify.handler";
import { BackInStockHandler } from "./back-in-stock.handler";
import { onSellableAgain } from "./on-sellable-again";
import {
    BACK_IN_STOCK_BATCH,
    BACK_IN_STOCK_DELAY_MS,
    BACK_IN_STOCK_TYPE,
} from "./stock-watch-rules";
import { StockWatchService } from "./stock-watch.service";
import { recordEntry } from "./stock.service";

const comms = new CommunicationsService();
const customerNotify = new CustomerNotifyHandler(
    new CustomerNotifyService(comms),
);
const backInStock = new BackInStockHandler();
const roomy = () => new FixedWindowRateLimiter(10_000, 60_000);
const watches = new StockWatchService(roomy(), roomy(), roomy());

function tellMe(
    b: ShopBusiness,
    p: { id: string },
    email: string,
    variantId: string | null = null,
) {
    return watches.watch(
        b.siteId,
        p.id,
        { email, variantId, consent: true },
        "visitor",
    );
}

/** Put units on a shelf (+) or take them off (−), as the stock log does. */
function move(b: ShopBusiness, stockLevelId: string, quantity: number) {
    return runInOrgContext(b.organizationId, () =>
        prisma.$transaction((tx) =>
            recordEntry(tx, {
                stockLevelId,
                kind: quantity > 0 ? "RECEIVED" : "WASTED",
                quantity,
            }),
        ),
    );
}

function pendingRuns(organizationId: string) {
    return prisma.job.findMany({
        where: { organizationId, type: BACK_IN_STOCK_TYPE, status: "PENDING" },
        orderBy: { createdAt: "asc" },
    });
}

/** Run every job of `type` waiting for this business, whenever it is due. */
async function runAll(
    organizationId: string,
    type: string,
    handle: (job: Job) => Promise<void>,
): Promise<number> {
    const jobs = await prisma.job.findMany({
        where: { organizationId, type, status: "PENDING" },
        orderBy: { createdAt: "asc" },
    });
    for (const job of jobs) {
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "PROCESSING" },
        });
        await handle(job);
        await prisma.job.update({
            where: { id: job.id },
            data: { status: "DONE" },
        });
    }
    return jobs.length;
}

/** The held run, then every notice it queued. */
async function runBackInStock(organizationId: string): Promise<void> {
    await runAll(organizationId, BACK_IN_STOCK_TYPE, backInStock.handle);
    await runAll(organizationId, CUSTOMER_NOTIFY_TYPE, customerNotify.handle);
}

function emails(organizationId: string) {
    return prisma.message.findMany({
        where: { organizationId, template: "BACK_IN_STOCK" },
        orderBy: { toAddress: "asc" },
        select: {
            toAddress: true,
            subject: true,
            body: true,
            status: true,
            contactId: true,
        },
    });
}

function waiting(productId: string) {
    return prisma.stockWatch.count({
        where: { productId, toldAt: null, cancelledAt: null },
    });
}

describe("back in stock (U23)", () => {
    afterAll(() => prisma.$disconnect());

    describe("counted from 0 to 5", () => {
        let rye: ShopBusiness;
        let soap: ListedProduct;

        beforeAll(async () => {
            rye = await shopBusiness();
            soap = await listedProduct(rye, "Neem soap", { onHand: 0 });
            await tellMe(rye, soap, "asha@example.com");
            await tellMe(rye, soap, "meera@example.com");
        });

        it("queues one run, held ten minutes, however often it rises", async () => {
            const before = Date.now();
            await move(rye, soap.shelves[0], 5);
            await move(rye, soap.shelves[0], 2);
            const runs = await pendingRuns(rye.organizationId);
            expect(runs).toHaveLength(1);
            expect(runs[0].payload).toEqual({ productId: soap.id });
            expect(runs[0].runAt.getTime()).toBeGreaterThanOrEqual(
                before + BACK_IN_STOCK_DELAY_MS - 1_000,
            );
            // Nobody is told before it runs.
            expect(await emails(rye.organizationId)).toHaveLength(0);
        });

        it("then emails each waiting address once, through the business's own provider", async () => {
            await runBackInStock(rye.organizationId);
            const sent = await emails(rye.organizationId);
            expect(sent.map((m) => m.toAddress)).toEqual([
                "asha@example.com",
                "meera@example.com",
            ]);
            for (const m of sent) {
                expect(m.status).toBe("QUEUED");
                expect(m.subject).toBe("Neem soap is back at Rye & Co.");
                expect(m.body).toContain("only email you&#39;ll get about it");
            }
            expect(await waiting(soap.id)).toBe(0);
            // Never in an account thread: they may be nobody's account.
            expect(
                await prisma.customerThreadMessage.count({
                    where: {
                        organizationId: rye.organizationId,
                        event: "BACK_IN_STOCK",
                    },
                }),
            ).toBe(0);
            // A delivery for the business's provider, never Saroh's.
            const deliveries = await prisma.delivery.findMany({
                where: {
                    organizationId: rye.organizationId,
                    message: { template: "BACK_IN_STOCK" },
                },
                select: { provider: true },
            });
            expect(deliveries.map((d) => d.provider)).toEqual([
                "RESEND",
                "RESEND",
            ]);
        });

        it("tells nobody twice: another rise, another run", async () => {
            await move(rye, soap.shelves[0], 1);
            expect(await pendingRuns(rye.organizationId)).toHaveLength(0);
            await runBackInStock(rye.organizationId);
            expect(await emails(rye.organizationId)).toHaveLength(2);
        });

        it("a new sell-out needs a new Tell me, which is told again", async () => {
            await move(rye, soap.shelves[0], -8);
            const again = await tellMe(rye, soap, "asha@example.com");
            expect(again.stopToken).not.toBeNull();
            await move(rye, soap.shelves[0], 3);
            await runBackInStock(rye.organizationId);
            expect(
                (await emails(rye.organizationId)).filter(
                    (m) => m.toAddress === "asha@example.com",
                ),
            ).toHaveLength(2);
        });
    });

    it("back and sold out again before the run: nothing sent, everyone still waits", async () => {
        const b = await shopBusiness("Kavi Dental");
        const brush = await listedProduct(b, "Toothbrush", { onHand: 0 });
        await tellMe(b, brush, "asha@example.com");
        await move(b, brush.shelves[0], 5);
        await move(b, brush.shelves[0], -5);
        await runBackInStock(b.organizationId);
        expect(await emails(b.organizationId)).toHaveLength(0);
        expect(await waiting(brush.id)).toBe(1);
        // Promised all it has: sold out too.
        await move(b, brush.shelves[0], 2);
        await prisma.stockLevel.update({
            where: { id: brush.shelves[0] },
            data: { promised: 2 },
        });
        await runBackInStock(b.organizationId);
        expect(await emails(b.organizationId)).toHaveLength(0);
        expect(await waiting(brush.id)).toBe(1);
    });

    it("a variant's watch hears only about that variant; the product's, about any", async () => {
        const b = await shopBusiness("Linen House");
        const shirt = await listedProduct(b, "Linen shirt", {
            variants: ["Blue / M", "Blue / L"],
            onHand: 0,
        });
        const [m, l] = shirt.variants;
        await tellMe(b, shirt, "m@example.com", m);
        await tellMe(b, shirt, "l@example.com", l);
        await tellMe(b, shirt, "any@example.com");
        await move(b, shirt.shelves[0], 4);
        await runBackInStock(b.organizationId);
        const sent = await emails(b.organizationId);
        expect(sent.map((x) => x.toAddress)).toEqual([
            "any@example.com",
            "m@example.com",
        ]);
        expect(sent.find((x) => x.toAddress === "m@example.com")?.subject).toBe(
            "Linen shirt (Blue / M) is back at Linen House",
        );
        const left = await prisma.stockWatch.findMany({
            where: { productId: shirt.id, toldAt: null },
            select: { email: true },
        });
        expect(left).toEqual([{ email: "l@example.com" }]);
    });

    it("the switch off, or the provider gone, at the run: nothing sent, all still wait", async () => {
        const b = await shopBusiness("Pulse Fitness");
        const shaker = await listedProduct(b, "Shaker", { onHand: 0 });
        await tellMe(b, shaker, "asha@example.com");
        await move(b, shaker.shelves[0], 5);
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: b.organizationId,
                kind: "BACK_IN_STOCK",
                enabled: false,
            },
        });
        await runBackInStock(b.organizationId);
        expect(await emails(b.organizationId)).toHaveLength(0);
        expect(await waiting(shaker.id)).toBe(1);

        await prisma.customerNoticeSetting.deleteMany({
            where: { organizationId: b.organizationId },
        });
        await prisma.communicationProvider.updateMany({
            where: { organizationId: b.organizationId },
            data: { status: "DISCONNECTED" },
        });
        await onSellableAgain(prisma, b.organizationId, shaker.id);
        await runBackInStock(b.organizationId);
        expect(await emails(b.organizationId)).toHaveLength(0);
        expect(await waiting(shaker.id)).toBe(1);
    });

    it("stopped before it was told: never told, even with its notice queued", async () => {
        const b = await shopBusiness("Northwind");
        const milk = await listedProduct(b, "Oat milk", { onHand: 0 });
        const early = await tellMe(b, milk, "early@example.com");
        const late = await tellMe(b, milk, "late@example.com");
        await watches.stop(b.siteId, early.stopToken ?? "", "visitor");
        await move(b, milk.shelves[0], 5);
        await runAll(b.organizationId, BACK_IN_STOCK_TYPE, backInStock.handle);
        // Stopped after the run queued its notice, before it went.
        await prisma.stockWatch.updateMany({
            where: { email: "late@example.com" },
            data: { cancelledAt: new Date() },
        });
        await runAll(
            b.organizationId,
            CUSTOMER_NOTIFY_TYPE,
            customerNotify.handle,
        );
        expect(await emails(b.organizationId)).toHaveLength(0);
        expect(late.stopToken).not.toBeNull();
        const early_ = await prisma.stockWatch.findFirstOrThrow({
            where: { email: "early@example.com" },
        });
        expect(early_.toldAt).toBeNull();
    });

    it("the 501st watcher is told by the next run", async () => {
        const b = await shopBusiness("Crowd Co.");
        const tote = await listedProduct(b, "Tote bag", { onHand: 0 });
        const consentAt = new Date();
        await prisma.stockWatch.createMany({
            data: Array.from({ length: BACK_IN_STOCK_BATCH + 1 }, (_, i) => ({
                organizationId: b.organizationId,
                productId: tote.id,
                siteId: b.siteId,
                email: `fan${String(i).padStart(3, "0")}@example.com`,
                consentAt,
                createdAt: new Date(consentAt.getTime() + i),
            })),
        });
        await move(b, tote.shelves[0], 50);
        await runAll(b.organizationId, BACK_IN_STOCK_TYPE, backInStock.handle);
        expect(await waiting(tote.id)).toBe(1);
        // The rest, at once.
        const next = await pendingRuns(b.organizationId);
        expect(next).toHaveLength(1);
        expect(next[0].runAt.getTime()).toBeLessThanOrEqual(Date.now());
        await runAll(b.organizationId, BACK_IN_STOCK_TYPE, backInStock.handle);
        expect(await waiting(tote.id)).toBe(0);
        expect(
            await prisma.job.count({
                where: {
                    organizationId: b.organizationId,
                    type: CUSTOMER_NOTIFY_TYPE,
                },
            }),
        ).toBe(BACK_IN_STOCK_BATCH + 1);
        expect(await pendingRuns(b.organizationId)).toHaveLength(0);
    });

    it("a contact with the address who turned email off: suppressed, never sent", async () => {
        const b = await shopBusiness("Quiet Co.");
        const candle = await listedProduct(b, "Candle", { onHand: 0 });
        const contact = await prisma.contact.create({
            data: {
                organizationId: b.organizationId,
                email: "asha@example.com",
            },
        });
        await prisma.consent.create({
            data: {
                organizationId: b.organizationId,
                contactId: contact.id,
                channel: "EMAIL",
                status: "REVOKED",
            },
        });
        await tellMe(b, candle, "asha@example.com");
        await move(b, candle.shelves[0], 1);
        await runBackInStock(b.organizationId);
        const [m] = await emails(b.organizationId);
        expect(m).toMatchObject({
            status: "SUPPRESSED",
            contactId: contact.id,
        });
    });

    it("a hand-marked Sold out cleared queues the run, and the run tells", async () => {
        const b = await shopBusiness("Bakehouse");
        const cake = await listedProduct(b, "Plum cake", {
            stockTracked: false,
        });
        await prisma.productListing.updateMany({
            where: { productId: cake.id },
            data: { soldOutAt: new Date() },
        });
        await tellMe(b, cake, "asha@example.com");
        const soldOut = new SoldOutService({} as ProductAccess);
        await runInOrgContext(b.organizationId, () =>
            soldOut.setIn(
                {
                    organizationId: b.organizationId,
                    userId: "u_owner",
                    storeId: b.storeId,
                },
                cake.id,
                false,
            ),
        );
        expect(await pendingRuns(b.organizationId)).toHaveLength(1);
        await runBackInStock(b.organizationId);
        expect(
            (await emails(b.organizationId)).map((m) => m.toAddress),
        ).toEqual(["asha@example.com"]);
    });

    it("a product nobody waits for queues nothing when its stock rises", async () => {
        const b = await shopBusiness("Plain Co.");
        const mug = await listedProduct(b, "Mug", { onHand: 0 });
        await move(b, mug.shelves[0], 5);
        expect(await pendingRuns(b.organizationId)).toHaveLength(0);
    });
});
