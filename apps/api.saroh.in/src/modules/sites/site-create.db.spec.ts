/**
 * A site is never made without a web address (DEC-069, L5), against a real
 * Postgres: `/sites/new` takes the business's own address when it is free to
 * them, refuses one in use with a free one to offer, and never writes a site
 * with none. A site from before this rule that has no address is flagged,
 * and publishing it is refused until it has one.
 *
 * Runs in the integration project (TEST_DATABASE_URL), plain and under
 * `TEST_RLS=on`.
 */
import { BadRequestException, ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { ADDRESS_MISSING_MESSAGE } from "./site-flags";
import { SitesService } from "./sites.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);

const DAY = 86_400_000;
const tag = `${process.pid}x${Date.now().toString(36)}`;
let seq = 0;
const uniq = (label: string) => `${label}-${tag}-${++seq}`;

/** A business with its setup address, and its owner. */
async function business(name = "Rye") {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("l5") },
        select: { id: true, slug: true },
    });
    const user = await prisma.user.create({
        data: { email: `${uniq("l5-user")}@example.test` },
        select: { id: true },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
    };
    return { ctx, slug: org.slug };
}

/** What a refused call threw, as the API answers it. */
async function refusal(call: Promise<unknown>, type: new () => Error) {
    const error = await call.then(
        () => null,
        (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(type);
    return (error as { getResponse(): Record<string, unknown> }).getResponse();
}

const siteCount = (organizationId: string) =>
    prisma.site.count({ where: { organizationId } });

describe("making a site (L5)", () => {
    it("takes the business's own address when it is free to them", async () => {
        const { ctx, slug } = await business();
        const created = await sites.createFromTemplate(ctx, { name: "Rye" });
        const site = await prisma.site.findUniqueOrThrow({
            where: { id: created.siteId },
            select: { subdomain: true },
        });
        expect(site.subdomain).toBe(slug);
    });

    it("refuses when another business's site has it, with a free one, and writes nothing", async () => {
        const { ctx, slug } = await business();
        const other = await business("Kiln");
        // A site from before setup reserved addresses, on this one's.
        await prisma.site.create({
            data: {
                organizationId: other.ctx.organizationId,
                name: "Kiln",
                slug: "kiln",
                subdomain: slug,
            },
        });

        const r = await refusal(
            sites.createFromTemplate(ctx, { name: "Rye" }),
            ConflictException,
        );
        expect(r).toMatchObject({
            message: `${slug}.saroh.app belongs to another business`,
            details: {
                field: "subdomain",
                reason: "taken",
                suggestion: `${slug}-2`,
            },
        });
        expect(await siteCount(ctx.organizationId)).toBe(0);

        // Taking the suggestion works.
        await sites.createFromTemplate(ctx, {
            name: "Rye",
            subdomain: `${slug}-2`,
        });
        expect(await siteCount(ctx.organizationId)).toBe(1);
    });

    it("refuses an address with two hyphens in a row", async () => {
        const { ctx } = await business();
        const r = await refusal(
            sites.createFromTemplate(ctx, {
                name: "Rye",
                subdomain: `rye--${seq}`,
            }),
            BadRequestException,
        );
        expect(r).toEqual({
            message: "An address can't have two hyphens in a row",
            details: { field: "subdomain" },
        });
        expect(await siteCount(ctx.organizationId)).toBe(0);
    });

    it("refuses another business's live hold on the address, and takes one that has run out", async () => {
        const { ctx } = await business();
        const other = await business("Kiln");
        const live = uniq("held");
        const gone = uniq("gone");
        for (const [address, until] of [
            [live, Date.now() + DAY],
            [gone, Date.now() - DAY],
        ] as const) {
            await prisma.addressReservation.create({
                data: {
                    organizationId: other.ctx.organizationId,
                    address,
                    reservedUntil: new Date(until),
                    redirectUntil: new Date(until),
                },
            });
        }

        const r = await refusal(
            sites.createFromTemplate(ctx, { name: "Rye", subdomain: live }),
            ConflictException,
        );
        expect(r).toMatchObject({
            details: { field: "subdomain", suggestion: `${live}-2` },
        });

        const created = await sites.createFromTemplate(ctx, {
            name: "Rye",
            subdomain: gone,
        });
        expect(
            await prisma.site.findUniqueOrThrow({
                where: { id: created.siteId },
                select: { subdomain: true },
            }),
        ).toEqual({ subdomain: gone });
        // The run-out hold was released in the claiming transaction.
        expect(
            await prisma.addressReservation.count({ where: { address: gone } }),
        ).toBe(0);
    });
});

describe("GET sites/new-defaults (L5)", () => {
    it("offers the business's name and its own address", async () => {
        const { ctx, slug } = await business("Rye & Co");
        await expect(sites.newSiteDefaults(ctx)).resolves.toEqual({
            siteName: "Rye & Co",
            address: slug,
        });
    });

    it("offers a free address like it when the business's is in use", async () => {
        const { ctx, slug } = await business();
        const other = await business("Kiln");
        await prisma.site.create({
            data: {
                organizationId: other.ctx.organizationId,
                name: "Kiln",
                slug: "kiln",
                subdomain: slug,
            },
        });
        await expect(sites.newSiteDefaults(ctx)).resolves.toMatchObject({
            address: `${slug}-2`,
        });
    });

    it("is the creation form's, so a MEMBER is refused", async () => {
        const { ctx } = await business();
        await expect(
            sites.newSiteDefaults({ ...ctx, role: "MEMBER" }),
        ).rejects.toThrow(/site:create/);
    });
});

describe("a site with no web address (L5)", () => {
    it("is flagged and can't publish until it has one", async () => {
        const { ctx, slug } = await business();
        const { siteId } = await sites.createFromTemplate(ctx, { name: "Rye" });
        // A site from before every site had an address.
        await prisma.site.update({
            where: { id: siteId },
            data: { subdomain: null },
        });

        const { flags } = await sites.getSiteFlags(ctx, siteId);
        expect(flags[0]).toEqual({
            type: "addressMissing",
            message: ADDRESS_MISSING_MESSAGE,
            pageId: null,
            sectionIndex: null,
            field: "subdomain",
            blocking: true,
        });

        const r = await refusal(
            sites.publishSite(ctx, siteId),
            ConflictException,
        );
        expect(r).toEqual({
            message: ADDRESS_MISSING_MESSAGE,
            details: { field: "subdomain", reason: "addressMissing" },
        });
        expect(await prisma.publication.count({ where: { siteId } })).toBe(0);

        // Given an address (what L2's change of address does), it clears.
        await prisma.site.update({
            where: { id: siteId },
            data: { subdomain: slug },
        });
        const after = await sites.getSiteFlags(ctx, siteId);
        expect(after.flags.map((f) => f.type)).not.toContain("addressMissing");
        await expect(sites.publishSite(ctx, siteId)).resolves.toMatchObject({
            bypassed: false,
        });
    });
});
