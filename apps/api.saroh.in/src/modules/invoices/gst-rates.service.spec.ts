// The GST rates a business still has to choose, and the save that chooses
// them. The database is mocked; the rows it would return are in
// `gst-rates.db.spec.ts`.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        service: {
            findMany: jest.fn(),
            // The name and the rate before, for the activity log.
            findFirst: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        // Who chose a service's, a product's or a course's rate.
        auditEvent: { create: jest.fn() },
        product: {
            findMany: jest.fn(),
            // What the MRP rule reads before a product's rate is saved.
            findFirst: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        businessProfile: { findUnique: jest.fn() },
        // Plans, class packs and courses carry a rate too (12 Oct 2026).
        subscriptionPlan: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
        },
        subscriptionPlanEvent: { create: jest.fn() },
        classPack: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
        },
        packEvent: { create: jest.fn() },
        course: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        customerSubscription: { groupBy: jest.fn() },
        $queryRaw: jest.fn(),
    };
    return {
        ...actual,
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});
jest.mock("./order-invoicing", () => ({
    loadTaxProfile: jest.fn(),
}));
// A product's rate tells the page cache; whether it is on is not this
// spec's.
jest.mock("../sites/page-cache-revalidate", () => ({
    enqueuePageRevalidation: jest.fn().mockResolvedValue(false),
}));

import "reflect-metadata";

import {
    BadRequestException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { OrgAction } from "../organizations/organization-actions";
import { SetGstRatesDto } from "./gst-rates.dto";
import { GstRatesService } from "./gst-rates.service";
import { loadTaxProfile } from "./order-invoicing";

const profile = loadTaxProfile as jest.Mock;
const services = prisma.service as unknown as Record<string, jest.Mock>;
const products = prisma.product as unknown as Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const plans = db.subscriptionPlan!;
const packs = db.classPack!;
const courses = db.course!;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};

/** A role the business made, with exactly these permissions. */
function roleWith(...actions: OrgAction[]): OrganizationContext {
    return {
        ...owner,
        role: "MEMBER",
        roleKey: "desk",
        actions: new Set(actions),
    };
}

const decimal = (s: string) => ({ toString: () => s });
const rates = new GstRatesService();

beforeEach(() => {
    jest.clearAllMocks();
    profile.mockResolvedValue({ registered: true });
    services.findMany!.mockResolvedValue([]);
    products.findMany!.mockResolvedValue([]);
    services.updateMany!.mockResolvedValue({ count: 1 });
    products.updateMany!.mockResolvedValue({ count: 1 });
    plans.findMany!.mockResolvedValue([]);
    packs.findMany!.mockResolvedValue([]);
    courses.findMany!.mockResolvedValue([]);
    courses.updateMany!.mockResolvedValue({ count: 1 });
    db.customerSubscription!.groupBy!.mockResolvedValue([]);
});

describe("what is missing", () => {
    it("lists nothing, and reads nothing, for a business that isn't registered", async () => {
        profile.mockResolvedValue({ registered: false });
        await expect(rates.missing(owner)).resolves.toEqual({
            registered: false,
            items: [],
            more: false,
        });
        expect(services.findMany).not.toHaveBeenCalled();
        expect(products.findMany).not.toHaveBeenCalled();
        expect(plans.findMany).not.toHaveBeenCalled();
        expect(packs.findMany).not.toHaveBeenCalled();
        expect(courses.findMany).not.toHaveBeenCalled();
    });

    it("lists plans, class packs and courses with a price and no rate, after services and products", async () => {
        services.findMany!.mockResolvedValue([
            { id: "svc_pt", name: "PT", priceCents: 150_000, currency: "INR" },
        ]);
        plans.findMany!.mockResolvedValue([
            {
                id: "plan_gym",
                name: "Gym monthly",
                price: decimal("2000.00"),
                currency: "INR",
                gstPriceMode: "ADDED",
            },
        ]);
        packs.findMany!.mockResolvedValue([
            {
                id: "pack_10",
                name: "10 classes",
                price: decimal("4500"),
                currency: "INR",
                gstPriceMode: null,
            },
        ]);
        courses.findMany!.mockResolvedValue([
            {
                id: "course_yoga",
                name: "Yoga foundations",
                price: decimal("6000.50"),
                currency: "INR",
                gstPriceMode: null,
            },
        ]);
        // Who is on the plan now, by the price each pays.
        db.customerSubscription!.groupBy!.mockResolvedValue([
            {
                planId: "plan_gym",
                price: decimal("1800"),
                currency: "INR",
                _count: { _all: 2 },
            },
            {
                planId: "plan_gym",
                price: decimal("2000"),
                currency: "INR",
                _count: { _all: 10 },
            },
        ]);
        const read = await rates.missing(owner);
        expect(read.items.map((i) => i.kind)).toEqual([
            "SERVICE",
            "PLAN",
            "PACK",
            "COURSE",
        ]);
        expect(read.items.slice(1)).toEqual([
            {
                kind: "PLAN",
                id: "plan_gym",
                name: "Gym monthly",
                priceCents: 200_000,
                currency: "INR",
                canSet: true,
                // Its own way of carrying GST, and who renews at it.
                priceMode: "ADDED",
                members: [
                    { count: 2, price: "1800.00", currency: "INR" },
                    { count: 10, price: "2000.00", currency: "INR" },
                ],
            },
            {
                kind: "PACK",
                id: "pack_10",
                name: "10 classes",
                priceCents: 450_000,
                currency: "INR",
                canSet: true,
            },
            {
                kind: "COURSE",
                id: "course_yoga",
                name: "Yoga foundations",
                priceCents: 600_050,
                currency: "INR",
                canSet: true,
            },
        ]);
        // A plan on sale, or an archived one people still renew on: each
        // renewal is a tax invoice. Never a draft.
        expect(plans.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            price: { gt: 0 },
            gstRate: null,
            OR: [
                { status: "ACTIVE" },
                {
                    status: "ARCHIVED",
                    subscriptions: {
                        some: { status: { in: ["ACTIVE", "PAUSED"] } },
                    },
                },
            ],
        });
        expect(packs.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            status: "ACTIVE",
            price: { gt: 0 },
            gstRate: null,
        });
        // Only a course taking enrolments.
        expect(courses.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            status: "OPEN",
            price: { gt: 0 },
            gstRate: null,
        });
    });

    it("reads plans, packs and courses each with its own permission", async () => {
        await rates.missing(roleWith("subscription:read"));
        expect(plans.findMany).toHaveBeenCalled();
        expect(packs.findMany).not.toHaveBeenCalled();
        expect(courses.findMany).not.toHaveBeenCalled();
        expect(services.findMany).not.toHaveBeenCalled();
        jest.clearAllMocks();
        profile.mockResolvedValue({ registered: true });
        packs.findMany!.mockResolvedValue([]);
        courses.findMany!.mockResolvedValue([]);
        db.customerSubscription!.groupBy!.mockResolvedValue([]);
        await rates.missing(roleWith("pack:read", "course:read"));
        expect(packs.findMany).toHaveBeenCalled();
        expect(courses.findMany).toHaveBeenCalled();
        expect(plans.findMany).not.toHaveBeenCalled();
    });

    it("lets whoever sells packs fill in a pack's rate, and nothing else's", async () => {
        packs.findMany!.mockResolvedValue([
            {
                id: "pack_10",
                name: "10 classes",
                price: decimal("4500"),
                currency: "INR",
                gstPriceMode: null,
            },
        ]);
        courses.findMany!.mockResolvedValue([
            {
                id: "course_yoga",
                name: "Yoga",
                price: decimal("6000"),
                currency: "INR",
                gstPriceMode: null,
            },
        ]);
        const read = await rates.missing(
            roleWith("pack:read", "pack:sell", "course:read"),
        );
        expect(read.items.map((i) => [i.kind, i.canSet])).toEqual([
            ["PACK", true],
            ["COURSE", false],
        ]);
    });

    it("lists priced things on sale with no rate, services first", async () => {
        services.findMany!.mockResolvedValue([
            {
                id: "svc_pt",
                name: "Personal Training",
                priceCents: 150_000,
                currency: "INR",
            },
        ]);
        products.findMany!.mockResolvedValue([
            {
                id: "prod_serum",
                name: "Vitamin C serum",
                price: decimal("549.50"),
                currency: "INR",
            },
        ]);
        await expect(rates.missing(owner)).resolves.toEqual({
            registered: true,
            more: false,
            // Never chosen: its prices include GST.
            priceMode: "INCLUDED",
            items: [
                {
                    kind: "SERVICE",
                    id: "svc_pt",
                    name: "Personal Training",
                    priceCents: 150_000,
                    currency: "INR",
                    canSet: true,
                },
                {
                    kind: "PRODUCT",
                    id: "prod_serum",
                    name: "Vitamin C serum",
                    priceCents: 54_950,
                    currency: "INR",
                    canSet: true,
                },
            ],
        });
        // Only what can land on a tax invoice untaxed: the business's own,
        // on sale, priced, and with no rate. 0% is a rate and is left out.
        expect(services.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            deletedAt: null,
            status: "ACTIVE",
            priceCents: { gt: 0 },
            gstRate: null,
        });
        expect(products.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            status: "PUBLISHED",
            price: { gt: 0 },
            gstRate: null,
        });
    });

    it("reads each kind with its own permission", async () => {
        await rates.missing(roleWith("service:read"));
        expect(services.findMany).toHaveBeenCalled();
        expect(products.findMany).not.toHaveBeenCalled();
    });

    it("says who may save: the item's editor, or whoever issues invoices", async () => {
        services.findMany!.mockResolvedValue([
            { id: "svc_pt", name: "PT", priceCents: 100, currency: "INR" },
        ]);
        const read = async (ctx: OrganizationContext) =>
            (await rates.missing(ctx)).items[0]?.canSet;
        await expect(read(roleWith("service:read"))).resolves.toBe(false);
        await expect(
            read(roleWith("service:read", "invoice:write")),
        ).resolves.toBe(true);
        await expect(
            read(roleWith("service:read", "service:write")),
        ).resolves.toBe(true);
    });
});

describe("saving rates", () => {
    const one = (kind: "SERVICE" | "PRODUCT", rate = "18") =>
        ({ items: [{ kind, id: "x_1", rate }] }) as SetGstRatesDto;

    it("saves each rate on the business's own item, exempt included", async () => {
        await expect(
            rates.set(owner, {
                items: [
                    { kind: "SERVICE", id: "svc_pt", rate: "18" },
                    { kind: "PRODUCT", id: "prod_bread", rate: "0" },
                ],
            }),
        ).resolves.toEqual({ saved: 2 });
        expect(services.updateMany).toHaveBeenCalledWith({
            where: { id: "svc_pt", organizationId: "org_1", deletedAt: null },
            data: { gstRate: "18" },
        });
        expect(products.updateMany).toHaveBeenCalledWith({
            where: { id: "prod_bread", organizationId: "org_1" },
            data: { gstRate: "0" },
        });
    });

    it("keeps who chose a service's rate in its price history: one entry, the rate before and after", async () => {
        services.findFirst!.mockResolvedValue({
            name: "Personal Training",
            currency: "INR",
            priceCents: 150_000,
            gstRate: null,
            gstPriceMode: null,
        });
        await rates.set(owner, one("SERVICE", "18"));
        // One entry, in the shape every other way a rate changes writes:
        // never a `gst-rate.set` beside it.
        expect(db.auditEvent!.create).toHaveBeenCalledTimes(1);
        expect(db.auditEvent!.create).toHaveBeenCalledWith({
            data: {
                action: "price.changed",
                actorUserId: owner.userId,
                organizationId: "org_1",
                targetType: "service",
                targetId: "x_1",
                outcome: "SUCCESS",
                metadata: {
                    kind: "SERVICE",
                    name: "Personal Training",
                    currency: "INR",
                    source: "rates",
                    changes: [{ field: "gstRate", before: null, after: "18" }],
                },
            },
        });
    });

    it("a product's rate changed from the sheet says the rate it had", async () => {
        products.findFirst!.mockResolvedValue({
            name: "Rye loaf",
            currency: "INR",
            price: { toString: () => "780" },
            mrp: null,
            gstRate: { toString: () => "5.00" },
            gstPriceMode: "ADDED",
            variants: [],
        });
        await rates.set(owner, one("PRODUCT", "18"));
        expect(db.auditEvent!.create).toHaveBeenCalledTimes(1);
        expect(
            db.auditEvent!.create.mock.calls[0]![0].data.metadata,
        ).toMatchObject({
            kind: "PRODUCT",
            name: "Rye loaf",
            changes: [{ field: "gstRate", before: "5", after: "18" }],
        });
    });

    it("keeps nothing for a rate saved as it already was", async () => {
        services.findFirst!.mockResolvedValue({
            name: "Personal Training",
            currency: "INR",
            priceCents: 150_000,
            gstRate: { toString: () => "18.00" },
            gstPriceMode: null,
        });
        await rates.set(owner, one("SERVICE", "18"));
        expect(db.auditEvent!.create).not.toHaveBeenCalled();
    });

    it("keeps nothing when no rate was written", async () => {
        services.updateMany!.mockResolvedValue({ count: 0 });
        services.count!.mockResolvedValue(1);
        await rates
            .set(owner, { ...one("SERVICE", "18"), fill: true })
            .catch(() => undefined);
        expect(db.auditEvent!.create).not.toHaveBeenCalled();
    });

    it("refuses a rate GST does not have, before anything is written", async () => {
        const attempt = rates.set(owner, one("SERVICE", "7"));
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toMatchObject({
            response: { details: { field: "rate" } },
        });
        expect(services.updateMany).not.toHaveBeenCalled();
    });

    it("answers another business's item with a 404", async () => {
        services.updateMany!.mockResolvedValue({ count: 0 });
        services.count!.mockResolvedValue(0);
        await expect(rates.set(owner, one("SERVICE"))).rejects.toBeInstanceOf(
            NotFoundException,
        );
    });

    it("refuses a role with neither the editor's permission nor invoices", async () => {
        await expect(
            rates.set(
                roleWith("service:read", "booking:write"),
                one("SERVICE"),
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(services.updateMany).not.toHaveBeenCalled();
    });

    it("lets whoever issues invoices fill in a rate nobody chose, and never change one", async () => {
        const desk = roleWith("booking:write", "invoice:write");
        await rates.set(desk, one("SERVICE"));
        // Only where it is still unset.
        expect(services.updateMany).toHaveBeenCalledWith({
            where: {
                id: "x_1",
                organizationId: "org_1",
                deletedAt: null,
                gstRate: null,
            },
            data: { gstRate: "18" },
        });

        // It has a rate already: that is its editor's to change.
        services.updateMany!.mockResolvedValue({ count: 0 });
        services.count!.mockResolvedValue(1);
        await expect(rates.set(desk, one("SERVICE"))).rejects.toBeInstanceOf(
            ForbiddenException,
        );
    });
});

describe("saving a plan's, a pack's and a course's rate", () => {
    const tx = db;

    it("saves a plan's rate under its lock, moves its revision and records the change", async () => {
        plans.findFirst!.mockResolvedValue({ gstRate: null });
        await expect(
            rates.set(owner, {
                items: [{ kind: "PLAN", id: "plan_gym", rate: "18" }],
            }),
        ).resolves.toEqual({ saved: 1 });
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        // Written to the published columns: the next invoice reads it.
        expect(plans.updateMany).toHaveBeenCalledWith({
            where: { id: "plan_gym", organizationId: "org_1" },
            data: { gstRate: "18", draftRevision: { increment: 1 } },
        });
        expect(tx.subscriptionPlanEvent!.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                planId: "plan_gym",
                kind: "PRICE_CHANGED",
                actorKind: "TEAM",
                actorUserId: "user_1",
                changes: { gstRate: [null, "18"] },
            },
        });
    });

    it("saves a pack's rate with a CHANGED event, and a course's on its row", async () => {
        packs.findFirst!.mockResolvedValue({ gstRate: null });
        await rates.set(owner, {
            items: [
                { kind: "PACK", id: "pack_10", rate: "5" },
                { kind: "COURSE", id: "course_yoga", rate: "0" },
            ],
        });
        expect(packs.updateMany!.mock.calls[0][0]).toMatchObject({
            where: { id: "pack_10", organizationId: "org_1" },
            data: {
                gstRate: "5",
                draftRevision: { increment: 1 },
                revisedById: "user_1",
            },
        });
        expect(tx.packEvent!.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                packId: "pack_10",
                kind: "CHANGED",
                actorKind: "TEAM",
                actorUserId: "user_1",
                details: { gstRate: [null, "5"] },
            },
        });
        // Exempt (0%) is a rate.
        expect(courses.updateMany).toHaveBeenCalledWith({
            where: { id: "course_yoga", organizationId: "org_1" },
            data: { gstRate: "0" },
        });
    });

    it("answers another business's plan, pack or course with a 404", async () => {
        plans.findFirst!.mockResolvedValue(null);
        packs.findFirst!.mockResolvedValue(null);
        courses.updateMany!.mockResolvedValue({ count: 0 });
        courses.count!.mockResolvedValue(0);
        for (const kind of ["PLAN", "PACK", "COURSE"] as const) {
            await expect(
                rates.set(owner, { items: [{ kind, id: "x_1", rate: "18" }] }),
            ).rejects.toBeInstanceOf(NotFoundException);
        }
        expect(plans.updateMany).not.toHaveBeenCalled();
        expect(packs.updateMany).not.toHaveBeenCalled();
    });

    it("lets the desk fill in a plan's unset rate and never change one already chosen", async () => {
        const desk = roleWith("invoice:write");
        plans.findFirst!.mockResolvedValue({ gstRate: null });
        await rates.set(desk, {
            items: [{ kind: "PLAN", id: "plan_gym", rate: "18" }],
        });
        expect(plans.updateMany).toHaveBeenCalledTimes(1);

        // It has a rate already: changing it is the plan editor's.
        plans.updateMany!.mockClear();
        plans.findFirst!.mockResolvedValue({ gstRate: decimal("12.00") });
        await expect(
            rates.set(desk, {
                items: [{ kind: "PLAN", id: "plan_gym", rate: "18" }],
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(plans.updateMany).not.toHaveBeenCalled();
    });

    it("lets whoever sells packs fill in a pack's rate, and refuses them a plan's", async () => {
        const seller = roleWith("pack:sell");
        packs.findFirst!.mockResolvedValue({ gstRate: null });
        await expect(
            rates.set(seller, {
                items: [{ kind: "PACK", id: "pack_10", rate: "18" }],
            }),
        ).resolves.toEqual({ saved: 1 });
        await expect(
            rates.set(seller, {
                items: [{ kind: "PLAN", id: "plan_gym", rate: "18" }],
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(plans.updateMany).not.toHaveBeenCalled();
    });

    it("writes nothing and records nothing when the rate is the one it has", async () => {
        plans.findFirst!.mockResolvedValue({ gstRate: decimal("18.00") });
        await expect(
            rates.set(owner, {
                items: [{ kind: "PLAN", id: "plan_gym", rate: "18" }],
            }),
        ).resolves.toEqual({ saved: 1 });
        expect(plans.updateMany).not.toHaveBeenCalled();
        expect(tx.subscriptionPlanEvent!.create).not.toHaveBeenCalled();
    });
});

describe("what the API accepts", () => {
    const problems = async (body: unknown) =>
        validate(plainToInstance(SetGstRatesDto, body), {
            whitelist: true,
            forbidNonWhitelisted: true,
        });

    it("takes a service's or a product's rate", async () => {
        await expect(
            problems({ items: [{ kind: "SERVICE", id: "s_1", rate: "0" }] }),
        ).resolves.toHaveLength(0);
    });

    it("takes a plan's, a class pack's and a course's rate", async () => {
        for (const kind of ["PLAN", "PACK", "COURSE"]) {
            await expect(
                problems({ items: [{ kind, id: "x_1", rate: "18" }] }),
            ).resolves.toHaveLength(0);
        }
    });

    it("refuses nothing to save, an unknown kind and a missing rate", async () => {
        await expect(problems({ items: [] })).resolves.not.toHaveLength(0);
        await expect(
            problems({ items: [{ kind: "LINE", id: "0", rate: "18" }] }),
        ).resolves.not.toHaveLength(0);
        await expect(
            problems({ items: [{ kind: "SERVICE", id: "s_1", rate: "" }] }),
        ).resolves.not.toHaveLength(0);
    });
});

/**
 * GST is part of MRP (12 Oct 2026). A product's rate changes the amount to
 * pay where GST is added to its price, so the save that sets a rate is
 * judged as the product's own editor is.
 */
describe("a product's rate and its MRP", () => {
    const business = (mode: "INCLUDED" | "ADDED" | null, registered = true) =>
        db.businessProfile!.findUnique!.mockResolvedValue({
            gstRegistered: registered,
            gstState: registered ? "29" : null,
            taxId: registered ? "29AAGCR4375J1ZU" : null,
            gstPriceMode: mode,
        });
    /** The product the save reads: ₹1,000, with this MRP. */
    const product = (
        mrp: string | null,
        over: {
            gstRate?: string | null;
            gstPriceMode?: string | null;
            variants?: {
                title: string;
                price: string | null;
                mrp: string | null;
            }[];
        } = {},
    ) =>
        products.findFirst!.mockResolvedValue({
            name: "Face cream",
            price: decimal("1000"),
            mrp: mrp === null ? null : decimal(mrp),
            currency: "INR",
            gstRate: over.gstRate == null ? null : decimal(over.gstRate),
            gstPriceMode: over.gstPriceMode ?? null,
            variants: (over.variants ?? []).map((v) => ({
                title: v.title,
                price: v.price === null ? null : decimal(v.price),
                mrp: v.mrp === null ? null : decimal(v.mrp),
            })),
        });
    const set = (rate: string) =>
        rates.set(owner, {
            items: [{ kind: "PRODUCT", id: "prod_cream", rate }],
        });

    beforeEach(() => business("ADDED"));

    it("GST is added: refused where the rate takes it over the MRP, by name and with the sums", async () => {
        // 1,000 + 180 = 1,180 > 1,100
        product("1100");
        const attempt = set("18");
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await expect(attempt).rejects.toMatchObject({
            response: {
                message:
                    "Face cream: with 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.",
                details: { field: "rate", kind: "PRODUCT", id: "prod_cream" },
            },
        });
        expect(products.updateMany).not.toHaveBeenCalled();
    });

    it("GST is added: saved at exactly the MRP, below it, and at 0%", async () => {
        product("1180");
        await expect(set("18")).resolves.toEqual({ saved: 1 });
        product("1500");
        await expect(set("18")).resolves.toEqual({ saved: 1 });
        // Exempt: nothing is added, ₹1,000 against ₹1,000.
        product("1000");
        await expect(set("0")).resolves.toEqual({ saved: 1 });
        expect(products.updateMany).toHaveBeenCalledTimes(3);
    });

    it("at 5, 12 and 28 percent: ₹1,050, ₹1,120 and ₹1,280 to pay", async () => {
        for (const [rate, pay, short] of [
            ["5", "1050", "1049.99"],
            ["12", "1120", "1119.99"],
            ["28", "1280", "1279.99"],
        ] as const) {
            product(pay);
            await expect(set(rate)).resolves.toEqual({ saved: 1 });
            product(short);
            await expect(set(rate)).rejects.toBeInstanceOf(BadRequestException);
        }
    });

    it("names the option the rate takes over its own MRP", async () => {
        // Large: 1,200 + 216 = 1,416 > 1,300
        product("1500", {
            variants: [{ title: "Large", price: "1200", mrp: "1300" }],
        });
        await expect(set("18")).rejects.toMatchObject({
            response: {
                message:
                    "Face cream, Large: with 18% GST added this is ₹1,416 to pay, more than its MRP of ₹1,300. Lower the price, raise the MRP, or set this product's price to include GST.",
            },
        });
    });

    it("prices include GST: unchanged, any rate is saved", async () => {
        business("INCLUDED");
        product("1100");
        await expect(set("28")).resolves.toEqual({ saved: 1 });
        product("1000");
        await expect(set("28")).resolves.toEqual({ saved: 1 });
    });

    it("the product's own choice decides, both ways", async () => {
        business("INCLUDED");
        product("1100", { gstPriceMode: "ADDED" });
        await expect(set("18")).rejects.toBeInstanceOf(BadRequestException);
        business("ADDED");
        product("1100", { gstPriceMode: "INCLUDED" });
        await expect(set("18")).resolves.toEqual({ saved: 1 });
    });

    it("a business that isn't registered is untouched", async () => {
        business("ADDED", false);
        product("1100");
        await expect(set("18")).resolves.toEqual({ saved: 1 });
    });

    it("a product with no MRP asks nothing of the business", async () => {
        product(null);
        await expect(set("18")).resolves.toEqual({ saved: 1 });
        expect(db.businessProfile!.findUnique).not.toHaveBeenCalled();
    });

    it("someone who may only fill in a missing rate is not judged on a rate already chosen", async () => {
        // The desk can't change a rate: the save keeps the one it has,
        // and is refused as it always was, for the permission.
        product("1100", { gstRate: "5" });
        products.updateMany!.mockResolvedValue({ count: 0 });
        products.count!.mockResolvedValue(1);
        await expect(
            rates.set(roleWith("store:read", "invoice:write"), {
                items: [{ kind: "PRODUCT", id: "prod_cream", rate: "18" }],
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

describe("what is over its MRP", () => {
    const row = (mrp: string) => ({
        id: "prod_cream",
        name: "Face cream",
        price: decimal("1000"),
        mrp: decimal(mrp),
        currency: "INR",
        gstRate: decimal("18"),
        gstPriceMode: null,
        variants: [],
    });
    const business = (mode: "INCLUDED" | "ADDED", registered = true) =>
        db.businessProfile!.findUnique!.mockResolvedValue({
            gstRegistered: registered,
            gstState: registered ? "29" : null,
            taxId: registered ? "29AAGCR4375J1ZU" : null,
            gstPriceMode: mode,
        });

    it("as it would stand under GST is added: the count, and the first few by name", async () => {
        business("INCLUDED");
        products.findMany!.mockResolvedValue([row("1100"), row("1180")]);
        await expect(rates.overMrp(owner, "ADDED")).resolves.toEqual({
            registered: true,
            mode: "ADDED",
            products: 1,
            options: 0,
            items: [
                {
                    productId: "prod_cream",
                    name: "Face cream",
                    option: null,
                    currency: "INR",
                    listCents: 100_000,
                    payCents: 118_000,
                    mrpCents: 110_000,
                    rate: "18",
                },
            ],
            more: false,
        });
    });

    it("as it stands: nothing while the business's prices include GST", async () => {
        business("INCLUDED");
        products.findMany!.mockResolvedValue([row("1100")]);
        await expect(rates.overMrp(owner)).resolves.toMatchObject({
            mode: "INCLUDED",
            products: 0,
            items: [],
        });
    });

    it("as it stands: lists what a business already on GST is added has over", async () => {
        business("ADDED");
        products.findMany!.mockResolvedValue([row("1100")]);
        await expect(rates.overMrp(owner)).resolves.toMatchObject({
            mode: "ADDED",
            products: 1,
        });
    });

    it("says nothing for a business that isn't registered, or a role that can't read products", async () => {
        business("ADDED", false);
        await expect(rates.overMrp(owner, "ADDED")).resolves.toEqual({
            registered: false,
            mode: "ADDED",
            products: 0,
            options: 0,
            items: [],
            more: false,
        });
        business("ADDED");
        products.findMany!.mockResolvedValue([row("1100")]);
        await expect(
            rates.overMrp(roleWith("service:read"), "ADDED"),
        ).resolves.toMatchObject({ registered: true, products: 0 });
        expect(products.findMany).not.toHaveBeenCalled();
    });
});
