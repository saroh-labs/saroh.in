/**
 * The Prices page's Class packs read (round-2 G20) against a real Postgres:
 * only packs on sale, with their published values (never a DRAFT, an
 * ARCHIVED pack or a live pack's unpublished changes), one class's price to
 * compare, whether Buy works, nothing while Class packs is off or not
 * rolled out, another business's packs never, and the per-visitor limit.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicPacksService } from "./public-packs.service";

const tag = `${process.pid}-${Date.now()}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

// Generous: these tests read many times from one "visitor".
const service = new PublicPacksService(new FixedWindowRateLimiter(1_000));

async function expectNotFound(p: Promise<unknown>) {
    await expect(p).rejects.toBeInstanceOf(NotFoundException);
}

/**
 * A business with a site; Class packs rolled out and on, and Payments on
 * with a provider that opens a checkout, unless said.
 */
async function business(
    over: {
        rolledOut?: boolean;
        packs?: "ENABLED" | "DISABLED" | null;
        provider?: boolean;
    } = {},
) {
    const org = await prisma.organization.create({
        data: { name: "Packs", slug: uniq("g20-org") },
    });
    for (const key of ["MODULE_CLASS_PACKS", "MODULE_PAYMENTS"]) {
        await prisma.featureFlag.upsert({
            where: { key },
            create: { key, enabledByDefault: false },
            update: {},
        });
    }
    await prisma.featureFlagOverride.createMany({
        data: [
            {
                flagKey: "MODULE_CLASS_PACKS",
                organizationId: org.id,
                enabled: over.rolledOut !== false,
            },
            {
                flagKey: "MODULE_PAYMENTS",
                organizationId: org.id,
                enabled: true,
            },
        ],
    });
    const status = over.packs === undefined ? "ENABLED" : over.packs;
    if (status) {
        await prisma.organizationModule.create({
            data: { organizationId: org.id, moduleKey: "CLASS_PACKS", status },
        });
    }
    await prisma.organizationModule.create({
        data: {
            organizationId: org.id,
            moduleKey: "PAYMENTS",
            status: "ENABLED",
        },
    });
    if (over.provider !== false) {
        await prisma.merchantPaymentProvider.create({
            data: {
                organizationId: org.id,
                provider: "RAZORPAY",
                status: "CONNECTED",
                publicKey: "rzp_test_G20",
                encryptedCredentials: "x",
                credentialsIv: "x",
                credentialsAuthTag: "x",
            },
        });
    }
    const site = await prisma.site.create({
        data: { organizationId: org.id, name: "Site", slug: uniq("g20-site") },
    });
    return { organizationId: org.id, siteId: site.id };
}

async function pack(
    organizationId: string,
    name: string,
    price: string,
    over: {
        status?: string;
        credits?: number;
        kind?: string;
        description?: string;
        pendingChanges?: Record<string, unknown>;
        services?: { priceCents: number | null; status?: string }[];
    } = {},
) {
    const created = await prisma.classPack.create({
        data: {
            organizationId,
            name,
            price,
            currency: "INR",
            credits: over.credits ?? 10,
            validityDays: 60,
            kind: over.kind ?? "CLASSES",
            status: over.status ?? "ACTIVE",
            description: over.description ?? null,
            ...(over.pendingChanges
                ? {
                      pendingChanges: over.pendingChanges,
                      pendingChangedAt: new Date(),
                  }
                : {}),
        },
    });
    for (const s of over.services ?? []) {
        const service = await prisma.service.create({
            data: {
                organizationId,
                name: uniq("Class"),
                durationMinutes: 60,
                timezone: "Asia/Kolkata",
                priceCents: s.priceCents,
                currency: s.priceCents === null ? null : "INR",
                status: s.status ?? "ACTIVE",
            },
        });
        await prisma.classPackService.create({
            data: { packId: created.id, serviceId: service.id, organizationId },
        });
    }
    return created.id;
}

describe("GET public/sites/:siteId/packs (G20, real database)", () => {
    it("lists two packs on sale, cheapest first, with one class's price to compare", async () => {
        const { organizationId, siteId } = await business();
        const ten = await pack(organizationId, "10 classes", "4500", {
            description: "Any group class.",
            services: [{ priceCents: 60_000 }, { priceCents: 50_000 }],
        });
        const five = await pack(organizationId, "5 PT sessions", "6000", {
            credits: 5,
            kind: "ONE_TO_ONE",
        });

        const read = await service.list(siteId, "visitor");
        expect(read).toEqual({
            payOnline: true,
            packs: [
                {
                    id: ten,
                    name: "10 classes",
                    description: "Any group class.",
                    credits: 10,
                    validityDays: 60,
                    price: "4500.00",
                    currency: "INR",
                    kind: "CLASSES",
                    singlePrice: "500.00",
                },
                {
                    id: five,
                    name: "5 PT sessions",
                    description: null,
                    credits: 5,
                    validityDays: 60,
                    price: "6000.00",
                    currency: "INR",
                    kind: "ONE_TO_ONE",
                    singlePrice: null,
                },
            ],
        });
    });

    it("never serves a Draft or an archived pack, and a live pack's pending changes stay unpublished", async () => {
        const { organizationId, siteId } = await business();
        await pack(organizationId, "Unlimited (draft)", "9000", {
            status: "DRAFT",
        });
        await pack(organizationId, "Old pack", "100", { status: "ARCHIVED" });
        const live = await pack(organizationId, "10 classes", "4500", {
            description: "Published words",
            pendingChanges: {
                name: "12 classes",
                price: "5000.00",
                description: "Unpublished words",
            },
        });

        const { packs } = await service.list(siteId, "visitor");
        expect(packs).toHaveLength(1);
        expect(packs[0]).toMatchObject({
            id: live,
            name: "10 classes",
            price: "4500.00",
            description: "Published words",
        });
        expect(JSON.stringify(packs)).not.toMatch(
            /draft|Old pack|12 classes|Unpublished/i,
        );
    });

    it("compares only with a live, priced service it covers", async () => {
        const { organizationId, siteId } = await business();
        await pack(organizationId, "10 classes", "4500", {
            services: [
                { priceCents: 30_000, status: "ARCHIVED" },
                { priceCents: null },
                { priceCents: 70_000 },
            ],
        });
        const { packs } = await service.list(siteId, "visitor");
        expect(packs[0]?.singlePrice).toBe("700.00");
    });

    it("says Buy can't be paid online without a provider, and still lists the packs", async () => {
        const { organizationId, siteId } = await business({ provider: false });
        await pack(organizationId, "10 classes", "4500");
        const read = await service.list(siteId, "visitor");
        expect(read.payOnline).toBe(false);
        expect(read.packs).toHaveLength(1);
    });

    it("with Class packs switched off, never switched on, or not rolled out → 404 (DEC-057)", async () => {
        for (const over of [
            { packs: "DISABLED" as const },
            { packs: null },
            { rolledOut: false },
        ]) {
            const { organizationId, siteId } = await business(over);
            await pack(organizationId, "10 classes", "4500");
            await expectNotFound(service.list(siteId, "visitor"));
        }
    });

    it("serves only the site's own business's packs", async () => {
        const mine = await business();
        const theirs = await business();
        const own = await pack(mine.organizationId, "Mine", "100");
        await pack(theirs.organizationId, "Theirs", "100");
        const { packs } = await service.list(mine.siteId, "visitor");
        expect(packs.map((p) => p.id)).toEqual([own]);
    });

    it("an unknown or deleted site → 404", async () => {
        await expectNotFound(service.list("no-such-site", "visitor"));
        const { siteId } = await business();
        await prisma.site.update({
            where: { id: siteId },
            data: { deletedAt: new Date() },
        });
        await expectNotFound(service.list(siteId, "visitor"));
    });

    it("limits a visitor who reads too often → 429", async () => {
        const { siteId } = await business();
        const tight = new PublicPacksService(new FixedWindowRateLimiter(2));
        await tight.list(siteId, "busy");
        await tight.list(siteId, "busy");
        await expect(tight.list(siteId, "busy")).rejects.toMatchObject({
            status: 429,
        });
        await expect(tight.list(siteId, "calm")).resolves.toEqual({
            payOnline: true,
            packs: [],
        });
    });
});
