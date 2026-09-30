/**
 * Where a pay link lives (DEC-069, plan L6), against a real Postgres: the
 * pay page's read carries `payUrl`, which the renderer sends a pay page
 * opened on another host to.
 *
 * `PAY_LINK_ON_SITE` off (the default, failing closed): the apex, exactly
 * the link issued before DEC-069. On: the business's verified custom
 * domain, else its subdomain; the apex again when it has no live site.
 *
 * Only the app env is stubbed (for the credential key). Runs in the
 * integration project (TEST_DATABASE_URL).
 */
jest.mock("../../env", () => ({
    env: {
        PAYMENTS_ENC_KEY:
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        NODE_ENV: "test",
    },
}));

import { prisma } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { FlagKey } from "../feature-flags/flags";
import { InvoicesService } from "../invoices/invoices.service";
import { orderPayLinkUrlFor, payLinkUrlFor } from "../invoices/pay-link-url";
import { PaymentsService } from "./payments.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import { PublicInvoicesService } from "./public-invoices.service";

const tag = `${process.pid}x${Date.now() % 100000}`;

const payments = new PaymentsService(
    new FakeProviderFactory(new FakeMerchantProvider("RAZORPAY")),
);
const publicInvoices = new PublicInvoicesService(payments);
const invoices = new InvoicesService();

/** A business with a provider and a contact, ready to issue a pay link. */
async function business(name: string): Promise<OrganizationContext> {
    const org = await prisma.organization.create({
        data: { name, slug: `l6-${name.toLowerCase()}-${tag}` },
    });
    await giveBusinessDetails(org.id);
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: `user_${name}`,
        role: "OWNER",
    };
    await payments.connectProvider(owner, {
        provider: "RAZORPAY",
        publicKey: "rzp_test_L6",
        keyId: "rzp_test_L6",
        keySecret: "rzp_secret",
        webhookSecret: "whsec_l6",
    });
    return owner;
}

/** An issued invoice's fresh pay link token. */
async function payToken(owner: OrganizationContext): Promise<string> {
    const contact = await prisma.contact.create({
        data: {
            organizationId: owner.organizationId,
            email: `asha-${tag}@example.com`,
            firstName: "Asha",
            lastName: "Rao",
        },
    });
    const draft = await invoices.createDraft(owner, {
        contactId: contact.id,
        currency: "INR",
        lines: [{ description: "Tasting menu", quantity: 1, unitPrice: "800" }],
    });
    await invoices.issue(owner, draft.id);
    return (await invoices.createPayLink(owner, draft.id)).token;
}

/** The business's site at `subdomain`, published unless `draft`. */
async function site(
    organizationId: string,
    subdomain: string,
    { draft = false } = {},
): Promise<string> {
    const made = await prisma.site.create({
        data: {
            organizationId,
            name: "Site",
            slug: `l6-site-${subdomain}`,
            subdomain,
        },
    });
    if (!draft) {
        const publication = await prisma.publication.create({
            data: {
                siteId: made.id,
                organizationId,
                snapshot: { pages: [] },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: made.id },
            data: { currentPublicationId: publication.id },
        });
    }
    return made.id;
}

/** The business's own `PAY_LINK_ON_SITE` override (the admin console's). */
async function payLinksOnSite(organizationId: string, enabled: boolean) {
    await prisma.featureFlag.upsert({
        where: { key: FlagKey.PAY_LINK_ON_SITE },
        create: { key: FlagKey.PAY_LINK_ON_SITE, enabledByDefault: false },
        update: {},
    });
    await prisma.featureFlagOverride.upsert({
        where: {
            flagKey_organizationId: {
                flagKey: FlagKey.PAY_LINK_ON_SITE,
                organizationId,
            },
        },
        create: { flagKey: FlagKey.PAY_LINK_ON_SITE, organizationId, enabled },
        update: { enabled },
    });
}

describe("payUrl on the pay page's read (DEC-069, L6)", () => {
    it("is the apex with the flag off, even when the business has a site", async () => {
        const owner = await business("Rye");
        await site(owner.organizationId, `rye${tag}`);
        const token = await payToken(owner);

        const view = await publicInvoices.read(token);
        expect(view.payUrl).toBe(`https://saroh.app/pay/${token}`);

        await payLinksOnSite(owner.organizationId, false);
        expect((await publicInvoices.read(token)).payUrl).toBe(
            `https://saroh.app/pay/${token}`,
        );
    });

    it("is the business's subdomain with the flag on", async () => {
        const owner = await business("Northwind");
        const subdomain = `northwind${tag}`;
        await site(owner.organizationId, subdomain);
        await payLinksOnSite(owner.organizationId, true);
        const token = await payToken(owner);

        expect((await publicInvoices.read(token)).payUrl).toBe(
            `https://${subdomain}.saroh.app/pay/${token}`,
        );
        expect(await orderPayLinkUrlFor(owner.organizationId, "t1")).toBe(
            `https://${subdomain}.saroh.app/pay/o/t1`,
        );
    });

    it("is the verified custom domain first, never a pending one", async () => {
        const owner = await business("Lotus");
        const siteId = await site(owner.organizationId, `lotus${tag}`);
        await payLinksOnSite(owner.organizationId, true);
        await prisma.domain.create({
            data: {
                organizationId: owner.organizationId,
                siteId,
                hostname: `pending-${tag}.example.test`,
                status: "PENDING",
                verificationToken: "p",
            },
        });
        expect(await payLinkUrlFor(owner.organizationId, "t2")).toBe(
            `https://lotus${tag}.saroh.app/pay/t2`,
        );

        await prisma.domain.create({
            data: {
                organizationId: owner.organizationId,
                siteId,
                hostname: `shop-${tag}.example.test`,
                status: "VERIFIED",
                verifiedAt: new Date(),
                verificationToken: "v",
            },
        });
        const token = await payToken(owner);
        expect((await publicInvoices.read(token)).payUrl).toBe(
            `https://shop-${tag}.example.test/pay/${token}`,
        );
        expect(await orderPayLinkUrlFor(owner.organizationId, "t3")).toBe(
            `https://shop-${tag}.example.test/pay/o/t3`,
        );
    });

    it("is the apex with the flag on but no live site", async () => {
        const owner = await business("Pulse");
        await site(owner.organizationId, `pulse${tag}`, { draft: true });
        await payLinksOnSite(owner.organizationId, true);

        expect(await payLinkUrlFor(owner.organizationId, "t4")).toBe(
            "https://saroh.app/pay/t4",
        );
        expect(await orderPayLinkUrlFor(owner.organizationId, "t5")).toBe(
            "https://saroh.app/pay/o/t5",
        );
    });

    it("is one business's flag, never another's", async () => {
        const on = await business("Kavi");
        const off = await business("Mira");
        await site(on.organizationId, `kavi${tag}`);
        await site(off.organizationId, `mira${tag}`);
        await payLinksOnSite(on.organizationId, true);

        expect(await payLinkUrlFor(on.organizationId, "t6")).toBe(
            `https://kavi${tag}.saroh.app/pay/t6`,
        );
        expect(await payLinkUrlFor(off.organizationId, "t7")).toBe(
            "https://saroh.app/pay/t7",
        );
    });
});
