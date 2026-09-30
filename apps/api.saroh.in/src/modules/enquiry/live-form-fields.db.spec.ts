/**
 * The live enquiry form switches with a go-live (#281, DEC-071 T7, KTD-4),
 * against a real Postgres.
 *
 * A submission is validated against the fields the LIVE snapshot shows. Going
 * live with a test release repoints the site, and repointing is the switch:
 * nothing else has to remember to change the form. Proven end to end here,
 * from the release's frozen form to the public submit.
 *
 * Runs in the integration project (TEST_DATABASE_URL).
 */
import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { EntitlementService } from "../billing/entitlement.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { SitesService } from "../sites/sites.service";
import { TestReleasesService } from "../sites/test-releases.service";
import { EnquiryService } from "./enquiry.service";

const sites = new SitesService({
    check: jest.fn().mockResolvedValue(true),
    can: jest.fn().mockResolvedValue(true),
    getEntitlements: jest.fn(),
} as unknown as EntitlementService);
const releases = new TestReleasesService(sites, new FeatureFlagService());
const enquiries = new EnquiryService();

const FLAG = "SITE_TEST_RELEASES";

const email = { name: "email", label: "Email", type: "email", required: true };
const name = { name: "name", label: "Name", type: "text", required: true };
const budget = {
    name: "budget",
    label: "Budget",
    type: "text",
    required: true,
};

let seq = 0;
const uniq = (label: string) => `${label}${process.pid}x${++seq}`;

beforeAll(async () => {
    await prisma.featureFlag.upsert({
        where: { key: FLAG },
        create: { key: FLAG, enabledByDefault: false },
        update: { enabledByDefault: false },
    });
});

/** A published site whose home page holds an enquiry form asking `fields`. */
async function siteWithForm(fields: unknown[]) {
    const org = await prisma.organization.create({
        data: { name: "Northwind forms", slug: uniq("t7f-org-") },
    });
    await prisma.featureFlagOverride.create({
        data: { flagKey: FLAG, organizationId: org.id, enabled: true },
    });
    const owner = await prisma.user.create({
        data: { email: `${uniq("t7f-owner-")}@example.test`, name: "Asha" },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Northwind",
            slug: uniq("t7f-site-"),
            subdomain: uniq("t7fsub"),
        },
    });
    const form = await prisma.form.create({
        data: { organizationId: org.id, name: "Ask us", fields },
    });
    const page = await prisma.page.create({
        data: {
            siteId: site.id,
            organizationId: org.id,
            path: "/",
            title: "Home",
            isHome: true,
        },
    });
    const version = await prisma.pageVersion.create({
        data: {
            pageId: page.id,
            organizationId: org.id,
            status: "DRAFT",
            createdByUserId: owner.id,
        },
    });
    const section = await prisma.section.create({
        data: {
            pageVersionId: version.id,
            organizationId: org.id,
            type: "enquiry",
            contractVersion: 1,
            order: 0,
            key: "ask",
            content: { formId: form.id, title: "Ask us", fields },
        },
    });
    const ctx: OrganizationContext = {
        organizationId: org.id,
        userId: owner.id,
        role: "OWNER",
    };
    await sites.publishSite(ctx, site.id);
    return { ctx, site, form, section };
}

/** The editor adding a field: the draft section and the Form row both move. */
async function askAlso(
    b: Awaited<ReturnType<typeof siteWithForm>>,
    fields: unknown[],
) {
    await prisma.section.update({
        where: { id: b.section.id },
        data: { content: { formId: b.form.id, title: "Ask us", fields } },
    });
    await prisma.form.update({ where: { id: b.form.id }, data: { fields } });
}

const visitor = (label: string) => ({
    email: `${uniq(label)}@example.test`,
    name: "Priya Raman",
});

describe("the live enquiry form after a go-live (#281, T7)", () => {
    it("validates against the release's fields once it goes live, and not before", async () => {
        const b = await siteWithForm([email, name]);
        // The release asks for a budget; live does not.
        await askAlso(b, [email, name, budget]);
        const made = await releases.create(b.ctx, b.site.id, {});

        // Before: the live site shows no budget field, so none is required.
        await expect(
            enquiries.submit(
                b.form.id,
                visitor("before-"),
                undefined,
                undefined,
            ),
        ).resolves.toMatchObject({ leadId: expect.any(String) });

        await releases.goLive(b.ctx, b.site.id, made.release.id);

        // After: the live form is the release's, and a budget is required.
        await expect(
            enquiries.submit(
                b.form.id,
                visitor("after-"),
                undefined,
                undefined,
            ),
        ).rejects.toThrow(BadRequestException);
        await expect(
            enquiries.submit(
                b.form.id,
                { ...visitor("after-budget-"), budget: "₹40,000" },
                undefined,
                undefined,
            ),
        ).resolves.toMatchObject({ leadId: expect.any(String) });
    });

    it("keeps the release's form live even when the draft drops the field again", async () => {
        const b = await siteWithForm([email, name]);
        await askAlso(b, [email, name, budget]);
        const made = await releases.create(b.ctx, b.site.id, {});
        // The editor takes the field back out after freezing.
        await askAlso(b, [email, name]);

        await releases.goLive(b.ctx, b.site.id, made.release.id);

        await expect(
            enquiries.submit(
                b.form.id,
                visitor("dropped-"),
                undefined,
                undefined,
            ),
        ).rejects.toThrow(/budget/i);
    });
});
