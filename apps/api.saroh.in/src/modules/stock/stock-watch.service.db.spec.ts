/**
 * "Tell me when it's back" (DEC-174 U23, #1154) against a real Postgres:
 * the public sign-up on a business's site, its stop page, and the
 * workspace's count.
 *
 * - Sold out, the switch on and the business's own email connected: a
 *   watch, for the product or one option. In stock, the switch off or no
 *   provider: refused with the reason, nothing written.
 * - One open watch per address per product or option, the address
 *   trimmed and lower-cased; a contact that already has it is named, and
 *   none is made.
 * - Another business's product on this site, an option not sold there, a
 *   site that doesn't exist: not found.
 * - The stop token stops a waiting watch once; a forged one is not found.
 *
 * Runs in the integration project, plain and under `TEST_RLS=on`.
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
    // The stop link's key falls back to the test value.
    declaredNodeEnv: "test",
}));

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    HttpException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type {
    ListedProduct,
    ShopBusiness,
} from "../../../test/fixtures/stock-watch";
import {
    listedProduct,
    shopBusiness,
} from "../../../test/fixtures/stock-watch";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { siteCodeSecret } from "../site-accounts/site-secrets";
import { signWatchToken } from "./stock-watch-rules";
import { StockWatchService } from "./stock-watch.service";

const roomy = () => new FixedWindowRateLimiter(1_000, 60_000);
const watches = new StockWatchService(roomy(), roomy(), roomy());
const VISITOR = "visitor-hash";

const tellMe = (
    b: ShopBusiness,
    p: { id: string },
    over: { email?: string; variantId?: string | null; consent?: boolean } = {},
) =>
    watches.watch(
        b.siteId,
        p.id,
        {
            email: over.email ?? "asha@example.com",
            variantId: over.variantId ?? null,
            consent: over.consent ?? true,
        },
        VISITOR,
    );

const openWatches = (organizationId: string) =>
    prisma.stockWatch.findMany({
        where: { organizationId, toldAt: null, cancelledAt: null },
        orderBy: { createdAt: "asc" },
    });

describe("Tell me when it's back (U23)", () => {
    let rye: ShopBusiness;
    let shirt: ListedProduct;
    let soap: ListedProduct;

    beforeAll(async () => {
        rye = await shopBusiness();
        shirt = await listedProduct(rye, "Linen shirt", {
            variants: ["Blue / M", "Blue / L"],
            onHand: 0,
        });
        soap = await listedProduct(rye, "Neem soap", { onHand: 0 });
    });

    afterAll(() => prisma.$disconnect());

    it("offers it on a sold-out product, and takes the watch", async () => {
        await expect(
            watches.offer(rye.siteId, soap.id, null, VISITOR),
        ).resolves.toEqual({ offered: true, why: null });
        const taken = await tellMe(rye, soap, { email: "  Asha@Example.COM " });
        expect(taken.state).toBe("waiting");
        expect(taken.stopToken).toMatch(/^v1\./);
        const [watch] = await openWatches(rye.organizationId);
        expect(watch).toMatchObject({
            productId: soap.id,
            variantId: null,
            siteId: rye.siteId,
            email: "asha@example.com",
            contactId: null,
            toldAt: null,
        });
        expect(watch.consentAt).toBeInstanceOf(Date);
    });

    it("the same address twice is one watch, and hands out no second stop link", async () => {
        const again = await tellMe(rye, soap, { email: "asha@example.com" });
        expect(again).toEqual({ state: "waiting", stopToken: null });
        expect(
            await prisma.stockWatch.count({
                where: { productId: soap.id, email: "asha@example.com" },
            }),
        ).toBe(1);
    });

    it("makes no contact, and names one that already has the address", async () => {
        const contact = await prisma.contact.create({
            data: {
                organizationId: rye.organizationId,
                email: "Meera@example.com",
                firstName: "Meera",
            },
        });
        const before = await prisma.contact.count({
            where: { organizationId: rye.organizationId },
        });
        await tellMe(rye, soap, { email: "meera@example.com" });
        await tellMe(rye, soap, { email: "new.person@example.com" });
        expect(
            await prisma.contact.count({
                where: { organizationId: rye.organizationId },
            }),
        ).toBe(before);
        const meera = await prisma.stockWatch.findFirstOrThrow({
            where: { email: "meera@example.com" },
        });
        expect(meera.contactId).toBe(contact.id);
    });

    it("an option's watch is its own: the same address on two options is two", async () => {
        await tellMe(rye, shirt, { variantId: shirt.variants[0] });
        await tellMe(rye, shirt, { variantId: shirt.variants[1] });
        await tellMe(rye, shirt, { variantId: shirt.variants[1] });
        await tellMe(rye, shirt);
        const rows = await prisma.stockWatch.findMany({
            where: { productId: shirt.id, email: "asha@example.com" },
            select: { variantId: true },
        });
        expect(rows.map((r) => r.variantId).sort()).toEqual(
            [null, ...shirt.variants].sort(),
        );
    });

    it("refuses with the reason while it is in stock", async () => {
        const jam = await listedProduct(rye, "Mango jam", { onHand: 4 });
        await expect(
            watches.offer(rye.siteId, jam.id, null, VISITOR),
        ).resolves.toEqual({ offered: false, why: "IN_STOCK" });
        await expect(tellMe(rye, jam)).rejects.toMatchObject({
            response: { reason: "IN_STOCK" },
        });
        expect(
            await prisma.stockWatch.count({ where: { productId: jam.id } }),
        ).toBe(0);
    });

    it("an option sold out on a product that sells: offered for that option only", async () => {
        const tee = await listedProduct(rye, "Cotton tee", {
            variants: ["S", "M"],
            onHand: 0,
        });
        await prisma.stockLevel.update({
            where: { id: tee.shelves[1] },
            data: { onHand: 3 },
        });
        await expect(
            watches.offer(rye.siteId, tee.id, tee.variants[0], VISITOR),
        ).resolves.toEqual({ offered: true, why: null });
        await expect(
            watches.offer(rye.siteId, tee.id, tee.variants[1], VISITOR),
        ).resolves.toEqual({ offered: false, why: "IN_STOCK" });
        // The whole product sells (M is there).
        await expect(
            watches.offer(rye.siteId, tee.id, null, VISITOR),
        ).resolves.toEqual({ offered: false, why: "IN_STOCK" });
    });

    it("an uncounted product marked Sold out by hand is offered", async () => {
        const cake = await listedProduct(rye, "Plum cake", {
            stockTracked: false,
        });
        await expect(
            watches.offer(rye.siteId, cake.id, null, VISITOR),
        ).resolves.toEqual({ offered: false, why: "IN_STOCK" });
        await prisma.productListing.updateMany({
            where: { productId: cake.id },
            data: { soldOutAt: new Date() },
        });
        await expect(
            watches.offer(rye.siteId, cake.id, null, VISITOR),
        ).resolves.toEqual({ offered: true, why: null });
    });

    it("refuses with the switch off, and with no email provider", async () => {
        const off = await shopBusiness("Kavi Dental");
        const p = await listedProduct(off, "Toothbrush");
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: off.organizationId,
                kind: "BACK_IN_STOCK",
                enabled: false,
            },
        });
        await expect(tellMe(off, p)).rejects.toBeInstanceOf(ConflictException);
        await expect(
            watches.offer(off.siteId, p.id, null, VISITOR),
        ).resolves.toEqual({ offered: false, why: "SWITCHED_OFF" });

        const quiet = await shopBusiness("Pulse Fitness", { email: false });
        const q = await listedProduct(quiet, "Shaker");
        await expect(tellMe(quiet, q)).rejects.toMatchObject({
            response: { reason: "NO_EMAIL" },
        });
        expect(
            await prisma.stockWatch.count({
                where: {
                    organizationId: {
                        in: [off.organizationId, quiet.organizationId],
                    },
                },
            }),
        ).toBe(0);
    });

    it("another business's product on this site is not found, and so is an option not sold here", async () => {
        const northwind = await shopBusiness("Northwind");
        const theirs = await listedProduct(northwind, "Oat milk");
        await expect(tellMe(rye, theirs)).rejects.toBeInstanceOf(
            NotFoundException,
        );
        await expect(
            watches.offer(rye.siteId, theirs.id, null, VISITOR),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            tellMe(rye, shirt, { variantId: "notavariant0001" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            tellMe(rye, soap, { variantId: shirt.variants[0] }),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            watches.offer("site_missing", soap.id, null, VISITOR),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("needs the opt-in ticked and a real address", async () => {
        await expect(
            tellMe(rye, soap, { consent: false }),
        ).rejects.toBeInstanceOf(BadRequestException);
        await expect(
            tellMe(rye, soap, { email: "not-an-email" }),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("limits a visitor, and an address, whatever visitor sends it", async () => {
        const tight = new StockWatchService(
            new FixedWindowRateLimiter(2, 60_000),
            new FixedWindowRateLimiter(1, 60_000),
            roomy(),
        );
        const send = (email: string, visitor: string) =>
            tight.watch(rye.siteId, soap.id, { email, consent: true }, visitor);
        await send("one@example.com", "v1");
        await expect(send("one@example.com", "v2")).rejects.toMatchObject({
            status: 429,
        });
        await send("two@example.com", "v1");
        await expect(send("three@example.com", "v1")).rejects.toBeInstanceOf(
            HttpException,
        );
    });

    it("the stop token stops a waiting watch, once; a forged one is not found", async () => {
        const taken = await tellMe(rye, soap, { email: "stop.me@example.com" });
        const token = taken.stopToken ?? "";
        await expect(watches.read(rye.siteId, token, VISITOR)).resolves.toEqual(
            {
                state: "waiting",
                business: "Rye & Co.",
                product: "Neem soap",
            },
        );
        await expect(
            watches.stop(rye.siteId, token, VISITOR),
        ).resolves.toMatchObject({ state: "stopped" });
        const stopped = await prisma.stockWatch.findFirstOrThrow({
            where: { email: "stop.me@example.com" },
        });
        expect(stopped.cancelledAt).toBeInstanceOf(Date);
        // Again: nothing changes.
        await expect(
            watches.stop(rye.siteId, token, VISITOR),
        ).resolves.toMatchObject({ state: "stopped" });
        expect(
            (
                await prisma.stockWatch.findFirstOrThrow({
                    where: { id: stopped.id },
                })
            ).cancelledAt,
        ).toEqual(stopped.cancelledAt);
        // Stopped, the address may ask again: a new watch.
        const anew = await tellMe(rye, soap, { email: "stop.me@example.com" });
        expect(anew.stopToken).not.toBeNull();

        await expect(
            watches.read(rye.siteId, `${token.slice(0, -2)}xx`, VISITOR),
        ).rejects.toBeInstanceOf(NotFoundException);
        // A good token on another business's site is not found.
        const other = await shopBusiness("Other");
        await expect(
            watches.stop(other.siteId, token, VISITOR),
        ).rejects.toBeInstanceOf(NotFoundException);
        // A token for a watch that doesn't exist.
        await expect(
            watches.read(
                rye.siteId,
                signWatchToken(siteCodeSecret(), "clnotawatch0000"),
                VISITOR,
            ),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("the workspace counts who waits, per option, for store:read only", async () => {
        const count = await watches.countFor(rye.owner, shirt.id);
        expect(count.productId).toBe(shirt.id);
        expect(count.waiting).toBe(3);
        expect(count.byOption).toEqual(
            expect.arrayContaining([
                { variantId: null, waiting: 1 },
                { variantId: shirt.variants[0], waiting: 1 },
                { variantId: shirt.variants[1], waiting: 1 },
            ]),
        );
        const northwind = await shopBusiness("Northwind 2");
        await expect(
            watches.countFor(northwind.owner, shirt.id),
        ).rejects.toBeInstanceOf(NotFoundException);
        await expect(
            watches.countFor({ ...rye.owner, role: "REVIEWER" }, shirt.id),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});
