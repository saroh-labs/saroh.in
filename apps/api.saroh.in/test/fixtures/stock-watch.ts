/**
 * A business whose site sells from one storefront, for the back-in-stock
 * specs (DEC-174 U23): the shop open (`SITE_SHOP`, Commerce rolled out),
 * its own email provider connected unless told not, and products listed
 * there with a shelf each. Fixture writes run as the owner with no
 * context, as the other db specs' do.
 */
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../src/common/types/organization-context";
import { CommunicationsService } from "../../src/modules/communications/communications.service";

let seq = 0;
const uniq = (label: string) =>
    `${label}-${process.pid}-${Date.now()}-${++seq}`;

export interface ShopBusiness {
    owner: OrganizationContext;
    organizationId: string;
    storeId: string;
    siteId: string;
    /** `https://<address>.saroh.app`; set only when published. */
    subdomain: string;
}

export async function shopBusiness(
    name = "Rye & Co.",
    opts: {
        email?: boolean;
        comms?: CommunicationsService;
        /**
         * The site published, so it has a web address: the emails' links
         * and "Stop waiting" (DEC-178) need one.
         */
        published?: boolean;
    } = {},
): Promise<ShopBusiness> {
    const org = await prisma.organization.create({
        data: { name, slug: uniq("u23-org") },
    });
    for (const flagKey of ["SITE_SHOP", "MODULE_COMMERCE"]) {
        // Off by default, on for this business.
        await prisma.featureFlag.upsert({
            where: { key: flagKey },
            create: { key: flagKey, enabledByDefault: false },
            update: {},
        });
        await prisma.featureFlagOverride.create({
            data: { flagKey, organizationId: org.id, enabled: true },
        });
    }
    const store = await prisma.store.create({
        data: {
            name: "Hill Road",
            slug: uniq("u23-store"),
            organizationId: org.id,
        },
    });
    const site = await prisma.site.create({
        data: {
            organizationId: org.id,
            name: "Site",
            slug: uniq("u23-site"),
            subdomain: uniq("u23"),
            storefrontId: store.id,
        },
    });
    if (opts.published) {
        const publication = await prisma.publication.create({
            data: {
                siteId: site.id,
                organizationId: org.id,
                snapshot: { pages: [] },
                templateId: "blank",
                templateVersion: 1,
            },
        });
        await prisma.site.update({
            where: { id: site.id },
            data: { currentPublicationId: publication.id },
        });
    }
    const owner: OrganizationContext = {
        organizationId: org.id,
        userId: "u_owner",
        role: "OWNER",
    };
    if (opts.email !== false) {
        await (opts.comms ?? new CommunicationsService()).connectProvider(
            owner,
            {
                channel: "EMAIL",
                provider: "RESEND",
                fromAddress: "hello@rye.example",
                credentials: { apiKey: "re_test_key" },
            },
        );
    }
    return {
        owner,
        organizationId: org.id,
        storeId: store.id,
        siteId: site.id,
        subdomain: site.subdomain ?? "",
    };
}

export interface ListedProduct {
    id: string;
    slug: string;
    /** Variant ids, in order; empty for a product without options. */
    variants: string[];
    /** Shelf ids at the storefront: the variants', or the whole one. */
    shelves: string[];
}

/**
 * A published product listed at the storefront, with a shelf per option
 * (or one for the whole product) holding `onHand` each.
 */
export async function listedProduct(
    b: ShopBusiness,
    name: string,
    opts: {
        variants?: string[];
        onHand?: number;
        stockTracked?: boolean;
    } = {},
): Promise<ListedProduct> {
    const organizationId = b.organizationId;
    const product = await prisma.product.create({
        data: {
            organizationId,
            name,
            slug: uniq(name.toLowerCase().replace(/\s+/g, "-")),
            price: "300.00",
            currency: "INR",
            status: "PUBLISHED",
            stockTracked: opts.stockTracked ?? true,
        },
    });
    const variants: string[] = [];
    for (const [i, title] of (opts.variants ?? []).entries()) {
        variants.push(
            (
                await prisma.productVariant.create({
                    data: {
                        productId: product.id,
                        sku: `${product.slug}-${i}`,
                        title,
                        position: i,
                    },
                })
            ).id,
        );
    }
    const listing = await prisma.productListing.create({
        data: { organizationId, storeId: b.storeId, productId: product.id },
    });
    for (const variantId of variants) {
        await prisma.productListingVariant.create({
            data: {
                organizationId,
                listingId: listing.id,
                productId: product.id,
                variantId,
            },
        });
    }
    const shelves: string[] = [];
    for (const variantId of variants.length > 0 ? variants : [null]) {
        shelves.push(
            (
                await prisma.stockLevel.create({
                    data: {
                        organizationId,
                        storeId: b.storeId,
                        productId: product.id,
                        variantId,
                        onHand: opts.onHand ?? 0,
                        lowStockAlert: 2,
                    },
                })
            ).id,
        );
    }
    return { id: product.id, slug: product.slug, variants, shelves };
}
