import {
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { takesOnlinePayment } from "../bookings/public-booking-page";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { contactEmailForDisplay } from "../contacts/contact-email";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { contactName } from "../invoices/serialize";
import { assertOrganizationOpen } from "../organizations/organization-lifecycle.gate";
import { PaymentsService } from "../payments/payments.service";
import { OPENS_CHECKOUT } from "../payments/public-key";
import type { CustomerContext } from "../site-accounts/customer-context.decorator";
import type {
    AccountPackAttempt,
    AccountPackCheckout,
    AccountPacksOnSale,
} from "../site-accounts/customer-view";
import {
    packAttemptView,
    packCheckoutView,
    packOnSaleView,
} from "../site-accounts/customer-view";
import {
    createPackDraftInTx,
    MAX_OPEN_PACK_ATTEMPTS,
    openPackDraftsWhere,
    PACK_DRAFT_REPLACED_REASON,
    packTermsOf,
    readPackTerms,
    sameTerms,
} from "./pack-checkout";
import { PACK_ON_SALE, PACKS_ON_SALE } from "./pack-on-sale";
import { packsOffered } from "./packs-offered";

/**
 * Buying a class pack online from the customer's account (round-2 A11, R12;
 * ADR-011), at `public/site-accounts/me/packs`.
 *
 * - **Only what is on sale.** The business must offer Class packs — Saroh has
 *   rolled the module out (DEC-057) and the business has it on (E12) — and
 *   the pack must be published and not archived (E14, D21). Anything else
 *   is a 404, as a pack that isn't there: a draft is never sold.
 * - **Priced by the server.** The customer names a pack and nothing else;
 *   the draft invoice takes the pack's price and terms as they are now
 *   (`pack-checkout.ts`), and the intent's amount is the draft's.
 * - **The existing money path.** The intent is made by
 *   `PaymentsService.createIntentForInvoicePublic` on the business's own
 *   provider, whose window shows the methods the business's account has on
 *   (DEC-059); the webhook completes it (`webhooks.service.ts`). No
 *   provider that can open a window: nothing is made, and the sheet says to
 *   buy at the desk.
 * - **Few open at once.** Starting the same pack again, on the same terms,
 *   reuses its draft; a draft whose pack has changed since is voided and
 *   started again. At most {@link MAX_OPEN_PACK_ATTEMPTS} different packs
 *   wait to be paid at once.
 *
 * Every read and write is scoped to the signed-in customer's business and
 * contact; another customer's attempt is a 404. It runs in the business's
 * RLS context (`OrgRlsInterceptor`, from `customerContext`).
 */

/** Purchase starts per account per ten minutes: retries, not a flood. */
const STARTS_PER_WINDOW = 10;
const START_WINDOW_MS = 10 * 60_000;

/** The most packs the sheet lists, cheapest first. */
const PACK_ROWS = 20;

/** Said when the business takes no payment online. */
export const BUY_AT_DESK =
    "This business isn't taking payments online right now. Buy the pack at the desk.";

/** Said to a fourth open attempt (409). */
export const TOO_MANY_OPEN_PACKS = `You've started paying for ${MAX_OPEN_PACK_ATTEMPTS} packs without finishing. Finish one of those, or try again tomorrow.`;

function notFound(): never {
    throw new NotFoundException("Class pack not found");
}

@Injectable()
export class PublicPackPurchaseService {
    private readonly flags = new FeatureFlagService();

    constructor(
        private readonly payments: PaymentsService,
        @Optional()
        private readonly startLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            STARTS_PER_WINDOW,
            START_WINDOW_MS,
        ),
    ) {}

    /** The packs on sale here, and whether they can be paid for online. */
    async onSale(customer: CustomerContext): Promise<AccountPacksOnSale> {
        const { organizationId } = customer;
        if (!(await packsOffered(organizationId, this.flags))) {
            return { payOnline: false, packs: [] };
        }
        const [packs, payOnline] = await Promise.all([
            prisma.classPack.findMany({
                where: { organizationId, ...PACKS_ON_SALE },
                orderBy: [{ price: "asc" }, { createdAt: "asc" }],
                take: PACK_ROWS,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    credits: true,
                    validityDays: true,
                    price: true,
                    currency: true,
                },
            }),
            takesOnlinePayment(organizationId),
        ]);
        return { payOnline, packs: packs.map(packOnSaleView) };
    }

    /**
     * Start paying for a pack: its draft invoice (reused when one on the
     * same terms is waiting) and an intent for it. The same idempotency key
     * on the same draft returns the same intent.
     */
    async start(
        customer: CustomerContext,
        ref: string,
        idempotencyKey: string | undefined,
        now: Date = new Date(),
    ): Promise<AccountPackCheckout> {
        const { organizationId, contactId } = customer;
        if (!this.startLimiter.take(customer.accountId)) {
            throw new HttpException(
                "Too many tries just now. Wait a few minutes, then try again.",
                429,
            );
        }
        await assertOrganizationOpen(organizationId);
        if (!(await packsOffered(organizationId, this.flags))) notFound();
        const pack = await prisma.classPack.findFirst({
            where: { id: ref, organizationId },
            select: {
                id: true,
                name: true,
                credits: true,
                validityDays: true,
                price: true,
                currency: true,
                status: true,
            },
        });
        // A draft isn't published and an archived pack isn't sold: to the
        // customer both are packs that aren't there.
        if (pack?.status !== PACK_ON_SALE) notFound();

        const provider = await prisma.merchantPaymentProvider.findFirst({
            where: { organizationId, status: "CONNECTED", ...OPENS_CHECKOUT },
            orderBy: { createdAt: "asc" },
            select: { provider: true },
        });
        if (!provider || !(await takesOnlinePayment(organizationId))) {
            throw new ConflictException({
                message: BUY_AT_DESK,
                details: { reason: "desk" },
            });
        }

        const terms = packTermsOf(pack);
        const draft = await prisma.$transaction(async (tx) => {
            // One start at a time per customer, so two tabs can't both slip
            // under the open-attempts limit.
            await tx.$queryRaw`SELECT id FROM "Contact" WHERE id = ${contactId} AND "organizationId" = ${organizationId} FOR NO KEY UPDATE`;
            const open = await tx.invoice.findMany({
                where: openPackDraftsWhere(organizationId, contactId, now),
                orderBy: { createdAt: "asc" },
                select: {
                    id: true,
                    total: true,
                    currency: true,
                    packTerms: true,
                },
            });
            const same = open.find((d) => {
                const t = readPackTerms(d.packTerms);
                return t !== null && sameTerms(t, terms);
            });
            if (same) return same;
            // This pack's older drafts no longer match what is on sale.
            const stale = open.filter(
                (d) => readPackTerms(d.packTerms)?.packId === terms.packId,
            );
            if (stale.length > 0) {
                await tx.invoice.updateMany({
                    where: {
                        id: { in: stale.map((d) => d.id) },
                        status: "DRAFT",
                    },
                    data: {
                        status: "VOID",
                        voidedAt: now,
                        voidReason: PACK_DRAFT_REPLACED_REASON,
                    },
                });
            }
            if (open.length - stale.length >= MAX_OPEN_PACK_ATTEMPTS) {
                throw new ConflictException({
                    message: TOO_MANY_OPEN_PACKS,
                    details: { reason: "too-many" },
                });
            }
            const [contact, account] = await Promise.all([
                tx.contact.findFirst({
                    where: { id: contactId, organizationId },
                    select: { firstName: true, lastName: true, email: true },
                }),
                tx.customerAccount.findFirst({
                    where: { id: customer.accountId, organizationId },
                    select: { email: true },
                }),
            ]);
            if (!contact) notFound();
            const name = contactName(contact).trim();
            return createPackDraftInTx(tx, {
                organizationId,
                contactId,
                billToName: name.length > 0 ? name : null,
                billToEmail: contactEmailForDisplay(
                    contact.email,
                    account?.email,
                ),
                terms,
            });
        });

        const payment = await this.payments.createIntentForInvoicePublic(
            {
                id: draft.id,
                organizationId,
                total: draft.total,
                currency: draft.currency,
            },
            { idempotencyKey, provider: provider.provider },
        );
        return packCheckoutView({
            invoiceId: draft.id,
            terms,
            total: draft.total,
            currency: draft.currency,
            payment,
        });
    }

    /** How a started purchase stands; another customer's is a 404. */
    async standing(
        customer: CustomerContext,
        ref: string,
    ): Promise<AccountPackAttempt> {
        const row = await prisma.invoice.findFirst({
            where: {
                id: ref,
                organizationId: customer.organizationId,
                contactId: customer.contactId,
                kind: "INVOICE",
                source: "PACK",
            },
            select: {
                status: true,
                packTerms: true,
                packPurchase: { select: { expiresAt: true } },
            },
        });
        const terms = readPackTerms(row?.packTerms);
        // A pack the desk sold has no snapshot: not an online attempt.
        if (!row || !terms) {
            throw new NotFoundException("Pack payment not found");
        }
        return packAttemptView({
            status: row.status,
            terms,
            expiresAt: row.packPurchase?.expiresAt ?? null,
        });
    }
}
