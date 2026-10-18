/**
 * A blank cell on an import that updates (policy UPDATE) is no value: the
 * product or customer keeps what it has. A live product whose row leaves
 * the status blank stays live; its description and photo stay; a customer
 * keeps the phone and city a row doesn't fill. Real Postgres
 * (TEST_DATABASE_URL).
 */
import { prisma } from "@saroh/database";

import type { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { StoresService } from "../stores/stores.service";
import { ImportsService } from "./imports.service";

const tag = `${process.pid}-${Date.now()}`;
const stores = new StoresService({
    isEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService);
const imports = new ImportsService(stores);

let orgId = "";
let ownerId = "";
let storeId = "";

beforeAll(async () => {
    const org = await prisma.organization.create({
        data: { name: "Blank cells", slug: `imp-blank-${tag}` },
    });
    orgId = org.id;
    ownerId = (
        await prisma.user.create({
            data: { email: `imp-owner-${tag}@example.com` },
        })
    ).id;
    await prisma.membership.create({
        data: { organizationId: orgId, userId: ownerId, role: "OWNER" },
    });
    await prisma.businessProfile.create({
        data: { organizationId: orgId, timezone: "Asia/Kolkata" },
    });
    storeId = (
        await stores.createForUser(ownerId, orgId, {
            name: "Hill Road",
            slug: `imp-hill-${tag}`,
        })
    ).id;
});

afterAll(async () => {
    await prisma.$disconnect();
});

describe("an import that updates leaves blank cells as they were (DB)", () => {
    it("a live product stays live, with its description and photo", async () => {
        await prisma.product.create({
            data: {
                organizationId: orgId,
                storeId,
                slug: "rose-serum",
                name: "Rose Serum",
                price: "450",
                currency: "INR",
                status: "PUBLISHED",
                description: "<p>Cold-pressed.</p>",
                image: "https://example.com/rose.jpg",
            },
        });
        const result = await imports.apply(storeId, ownerId, "products", {
            csv: "name,slug,price,description,image,status\nRose Serum,rose-serum,480,,,\n",
            mapping: {
                name: "name",
                slug: "slug",
                price: "price",
                description: "description",
                image: "image",
                status: "status",
            },
            policy: "UPDATE",
        });
        expect(result).toMatchObject({ created: 0, updated: 1 });
        const after = await prisma.product.findFirstOrThrow({
            where: { organizationId: orgId, slug: "rose-serum" },
            select: {
                status: true,
                description: true,
                image: true,
                price: true,
            },
        });
        expect(after).toMatchObject({
            status: "PUBLISHED",
            description: "<p>Cold-pressed.</p>",
            image: "https://example.com/rose.jpg",
        });
        expect(after.price.toString()).toBe("480");
    });

    it("a status cell that says Archived archives it, stamped; a new row with none is a draft", async () => {
        await imports.apply(storeId, ownerId, "products", {
            csv: "name,slug,price,status\nRose Serum,rose-serum,480,Archived\nNeem Soap,neem-soap,90,\n",
            mapping: {
                name: "name",
                slug: "slug",
                price: "price",
                status: "status",
            },
            policy: "UPDATE",
        });
        const [rose, neem] = await Promise.all(
            ["rose-serum", "neem-soap"].map((slug) =>
                prisma.product.findFirstOrThrow({
                    where: { organizationId: orgId, slug },
                    select: { status: true, archivedAt: true },
                }),
            ),
        );
        expect(rose?.status).toBe("ARCHIVED");
        expect(rose?.archivedAt).toBeInstanceOf(Date);
        expect(neem).toEqual({ status: "DRAFT", archivedAt: null });
    });

    it("a customer keeps the phone and city a row leaves blank", async () => {
        await prisma.customer.create({
            data: {
                storeId,
                organizationId: orgId,
                email: `asha-${tag}@example.com`,
                firstName: "Asha",
                lastName: "Rao",
                phone: "+919800000000",
                city: "Pune",
            },
        });
        const result = await imports.apply(storeId, ownerId, "customers", {
            csv: `email,firstName,phone,city\nasha-${tag}@example.com,Asha,,\n`,
            mapping: {
                email: "email",
                firstName: "firstName",
                phone: "phone",
                city: "city",
            },
            policy: "UPDATE",
        });
        expect(result).toMatchObject({ updated: 1 });
        await expect(
            prisma.customer.findFirstOrThrow({
                where: { storeId, email: `asha-${tag}@example.com` },
                select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                    city: true,
                },
            }),
        ).resolves.toEqual({
            firstName: "Asha",
            lastName: "Rao",
            phone: "+919800000000",
            city: "Pune",
        });
    });
});
