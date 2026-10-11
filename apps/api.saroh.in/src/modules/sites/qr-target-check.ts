import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { modulePageState } from "./module-pages";
import type { QrTargetKind, QrTargetSite } from "./qr-target";
import {
    isQrTargetKind,
    normaliseQrColor,
    qrPage,
    qrProduct,
    qrTargetNeedsRef,
    tooLightToScan,
} from "./qr-target";
import { effectiveStorefront } from "./sells-from";

/**
 * What a QR code is checked against when it is saved: a target the site
 * really has, and a colour a phone can read. Each refusal is a 400 in the
 * merchant's words whose `details` name the field and the reason, so the
 * screen can say it beside the control that caused it.
 */

/** Why a save was refused, as `details.reason`. */
export type QrRefusalReason =
    | "unknown"
    | "booking-closed"
    | "shop-closed"
    | "product-missing"
    | "page-missing"
    | "format"
    | "too-light";

function refuse(
    field: "target" | "color",
    reason: QrRefusalReason,
    message: string,
): never {
    throw new BadRequestException({ message, details: { field, reason } });
}

/** A colour a phone can read, as stored ("#rrggbb"). */
export function checkedQrColor(value: string): string {
    const color = normaliseQrColor(value);
    if (!color) refuse("color", "format", "Pick a colour as #RRGGBB");
    if (tooLightToScan(color)) {
        refuse(
            "color",
            "too-light",
            "That colour is too light for a phone to scan. Pick a darker one.",
        );
    }
    return color;
}

/**
 * A target checked against what the site has now:
 *
 * - the site itself, always;
 * - the booking page, while bookings are open for the business;
 * - the shop, or a product, only while the shop is open to the business and
 *   the site sells from a location; a product must be published there;
 * - a page, when it is a free-form page of this site that the published
 *   site holds.
 *
 * A product or page of another business reads exactly as one that doesn't
 * exist. Returns what to store: the kind and, where it names a row, its id.
 */
export async function checkedQrTarget(
    site: QrTargetSite,
    kind: QrTargetKind,
    ref: string | null,
): Promise<{ kind: QrTargetKind; ref: string | null }> {
    if (!isQrTargetKind(kind) || (!qrTargetNeedsRef(kind) && ref !== null)) {
        refuse("target", "unknown", "Choose what this code opens.");
    }
    const organizationId = site.organizationId;
    switch (kind) {
        case "SITE":
            return { kind, ref: null };
        case "BOOK": {
            const book = await modulePageState("BOOK", organizationId);
            if (book.state !== "on") {
                refuse(
                    "target",
                    "booking-closed",
                    "Your booking page isn't open, so a code can't open it yet.",
                );
            }
            return { kind, ref: null };
        }
        case "SHOP":
        case "PRODUCT": {
            const [shop, storefront] = await Promise.all([
                modulePageState("SHOP", organizationId),
                effectiveStorefront(prisma, site),
            ]);
            if (shop.state !== "on" || !storefront) {
                refuse(
                    "target",
                    "shop-closed",
                    "Your online shop isn't open on this site, so a code can't open it yet.",
                );
            }
            if (kind === "SHOP") return { kind, ref: null };
            const product = ref ? await qrProduct(prisma, site, ref) : null;
            if (!product) {
                refuse(
                    "target",
                    "product-missing",
                    "That product isn't in your online shop. Publish it there, then make its code.",
                );
            }
            return { kind, ref: product.id };
        }
        case "PAGE": {
            const page = ref ? await qrPage(prisma, site, ref) : null;
            if (!page) {
                refuse(
                    "target",
                    "page-missing",
                    "That page isn't on your published site. Publish it, then make its code.",
                );
            }
            return { kind, ref: page.id };
        }
    }
}
