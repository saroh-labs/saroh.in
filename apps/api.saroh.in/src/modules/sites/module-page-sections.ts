import type { Prisma } from "@saroh/database";
import { parseSectionContent, PRODUCT_GRID_MAX } from "@saroh/database";

import { offeredOnSite } from "../bookings/public-booking-page";
import type { ModulePageKind } from "./page-kinds";

/**
 * The sections a module page starts with (G14). Ordinary sections, which the
 * merchant then edits like any other; the list sections are the bound blocks,
 * so they hold how to show things and never the things themselves.
 *
 * - Shop: a Product grid of what the site sells (the newest, as many as a
 *   grid holds), at the sells-from storefront.
 * - Book: a short intro and a services list — the services shown on the
 *   booking page (E1), in its order — each opening the flow at itself. With
 *   no such service yet, the intro alone: a list needs one, and the editor
 *   adds it when there is.
 * - Prices: the plans on sale (G20 adds the packs).
 * - Journal: the latest posts.
 * - Contact: Visit us (the business's only shop, when it has exactly one;
 *   otherwise the editor asks which) and an enquiry form, whose Form is made
 *   with it so it takes enquiries from the first publish.
 *
 * Every section is checked against its contract here, so a page can never
 * start with one publish would refuse.
 */

export interface DefaultSection {
    type: string;
    contractVersion: number;
    content: Record<string, unknown>;
}

/** What an enquiry on a Contact page asks, as the seeded sites ask it. */
export const CONTACT_ENQUIRY_FIELDS = [
    { name: "name", label: "Your name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "message", label: "Message", type: "textarea", required: true },
] as const;

/** A services list holds at most this many (its contract). */
const SERVICES_LIST_MAX = 24;

type Tx = Pick<Prisma.TransactionClient, "service" | "store" | "form">;

function checked(section: DefaultSection): DefaultSection {
    const parsed = parseSectionContent(
        section.type,
        section.contractVersion,
        section.content,
    );
    if (!parsed.success) {
        // A default that fails its own contract is a bug here, not a
        // merchant's mistake: fail loudly rather than store it.
        throw new Error(
            `Module page default "${section.type}" is invalid: ${parsed.error.message}`,
        );
    }
    return {
        ...section,
        content: parsed.data as Record<string, unknown>,
    };
}

export async function defaultModuleSections(
    tx: Tx,
    input: {
        organizationId: string;
        siteId: string;
        siteName: string;
        kind: ModulePageKind;
    },
): Promise<DefaultSection[]> {
    const { organizationId, siteId, kind } = input;
    switch (kind) {
        case "SHOP":
            return [
                checked({
                    type: "productGrid",
                    contractVersion: 1,
                    content: {
                        title: "All products",
                        source: "newest",
                        count: PRODUCT_GRID_MAX,
                    },
                }),
            ];
        case "BOOK": {
            const services = await tx.service.findMany({
                where: offeredOnSite(organizationId, siteId),
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                take: SERVICES_LIST_MAX,
                select: { id: true },
            });
            const intro = checked({
                type: "richText",
                contractVersion: 1,
                content: {
                    format: "html",
                    value: "<p>Pick a service, then a time that suits you.</p>",
                },
            });
            if (services.length === 0) return [intro];
            return [
                intro,
                checked({
                    type: "servicesList",
                    contractVersion: 1,
                    content: {
                        heading: "Services",
                        serviceIds: services.map((s) => s.id),
                        showPrices: true,
                    },
                }),
            ];
        }
        case "PRICES":
            return [
                checked({
                    type: "plans",
                    contractVersion: 1,
                    content: { title: "Memberships" },
                }),
            ];
        case "JOURNAL":
            return [
                checked({
                    type: "journal",
                    contractVersion: 1,
                    content: { title: "Journal", count: 6 },
                }),
            ];
        case "CONTACT": {
            const shops = await tx.store.findMany({
                where: {
                    organizationId,
                    deletedAt: null,
                    settings: { is: { kind: "SHOP" } },
                },
                select: { id: true },
                take: 2,
            });
            const storeId = shops.length === 1 ? shops[0]?.id : undefined;
            const title = "Send us a message";
            const form = await tx.form.create({
                data: {
                    organizationId,
                    siteId,
                    name: `${input.siteName} contact`,
                    fields: CONTACT_ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    status: "ACTIVE",
                },
                select: { id: true },
            });
            return [
                checked({
                    type: "visitUs",
                    contractVersion: 1,
                    content: {
                        title: "Visit us",
                        ...(storeId ? { storeId } : {}),
                    },
                }),
                checked({
                    type: "enquiry",
                    contractVersion: 1,
                    content: {
                        formId: form.id,
                        title,
                        submitLabel: "Send",
                        successMessage: "Thanks — we'll be in touch soon.",
                        fields: CONTACT_ENQUIRY_FIELDS.map((f) => ({ ...f })),
                    },
                }),
            ];
        }
    }
}
