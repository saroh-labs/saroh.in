import { ConflictException } from "@nestjs/common";
import type { MerchantPaymentProvider, Prisma } from "@saroh/database";

import { needsPublicKey, OPENS_CHECKOUT } from "./public-key";

/**
 * Which provider takes the payment behind an order's pay link (plan B, B11),
 * and whether one can at all.
 *
 * The order's storefront's choice (Sell → Storefronts), when it made one;
 * otherwise the business's first connection that can open a checkout
 * window. A Razorpay connection still missing its public key id can't
 * (DEC-054): offering a link it would take would only fail on the
 * customer's phone, so it counts as no provider here.
 *
 * The staff side calls this before minting a link, and the customer's pay
 * page calls it again before starting a payment, so the two never disagree.
 */

type Db = Pick<
    Prisma.TransactionClient,
    "merchantPaymentProvider" | "storeSettings"
>;

/** What the staff side is told when no provider can take the payment. */
export const NO_PAY_LINK_PROVIDER =
    "Connect a payment provider to send a pay link.";

function opensCheckout(row: MerchantPaymentProvider): boolean {
    return !needsPublicKey(row.provider) || Boolean(row.publicKey?.trim());
}

/** Why a connection can't take a pay link's payment, in the merchant's words. */
function notReady(row: MerchantPaymentProvider | null, pinned: string): string {
    if (row?.status !== "CONNECTED") {
        return `This storefront takes payment through ${label(pinned)}, which isn't connected. Connect it, or pick another in Sell › Storefronts.`;
    }
    return `Your ${label(row.provider)} connection needs its public key id before it can take a pay link. Add it in Settings › Providers.`;
}

function label(provider: string): string {
    const p = provider.toUpperCase();
    if (p === "RAZORPAY") return "Razorpay";
    if (p === "CASHFREE") return "Cashfree";
    return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
}

/**
 * The provider for a pay link on an order of `storeId`, or a 409 saying why
 * there is none.
 */
export async function payLinkProvider(
    db: Db,
    organizationId: string,
    storeId: string,
): Promise<MerchantPaymentProvider> {
    const settings = await db.storeSettings.findUnique({
        where: { storeId },
        select: { checkoutProvider: true },
    });
    const pinned = settings?.checkoutProvider?.toUpperCase() ?? null;
    if (pinned) {
        const row = await db.merchantPaymentProvider.findUnique({
            where: {
                organizationId_provider: { organizationId, provider: pinned },
            },
        });
        if (row?.status === "CONNECTED" && opensCheckout(row)) return row;
        throw new ConflictException(notReady(row, pinned));
    }
    return businessPayLinkProvider(db, organizationId);
}

/**
 * The provider for a pay link with no storefront to choose one — an
 * invoice's (ADR-007) — or a 409 saying why there is none: the business's
 * first connection that can open a checkout window, the same fallback an
 * order's link takes. Invoices mint their link through it, and the invoice
 * pay page starts its payment through it, so a Razorpay connection missing
 * its public key id never hands out a link its page then refuses.
 */
export async function businessPayLinkProvider(
    db: Pick<Prisma.TransactionClient, "merchantPaymentProvider">,
    organizationId: string,
): Promise<MerchantPaymentProvider> {
    const ready = await db.merchantPaymentProvider.findFirst({
        where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
        orderBy: { createdAt: "asc" },
    });
    if (ready) return ready;
    // Connected, but none can open the window: say which needs what.
    const stuck = await db.merchantPaymentProvider.findFirst({
        where: { organizationId, status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
    });
    throw new ConflictException(
        stuck ? notReady(stuck, stuck.provider) : NO_PAY_LINK_PROVIDER,
    );
}
