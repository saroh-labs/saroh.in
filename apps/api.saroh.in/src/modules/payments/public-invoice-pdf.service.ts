import {
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { IssuedPdf } from "../invoices/issued-invoice-pdf";
import { IssuedInvoicePdf } from "../invoices/issued-invoice-pdf";
import { hashPayToken } from "../invoices/pay-token";

/** Downloads per caller per minute: the pay read's own allowance. */
const CALLS_PER_WINDOW = 30;
const CALL_WINDOW_MS = 60_000;
/**
 * Drawings per invoice per ten minutes. A PDF costs far more than a read,
 * and nobody needs their invoice more than a few times in a sitting.
 */
const DRAWS_PER_WINDOW = 10;
const DRAW_WINDOW_MS = 10 * 60_000;

function tooManyRequests(): HttpException {
    return new HttpException(
        "Too many requests for this link. Try again shortly.",
        429,
    );
}

/** Every miss looks the same: unknown, replaced and revoked links alike. */
function notFound(): never {
    throw new NotFoundException("Invoice not found");
}

/**
 * "Download PDF" on the customer's pay link (DEC-083): the issued paper the
 * merchant downloads and the invoice email carries, drawn on request and
 * never stored. No session — the token alone names the invoice, found by
 * its hash exactly as the pay read finds it (`public-invoices.service.ts`),
 * so an unknown, replaced or revoked token is a 404, and so is a draft
 * (no paper) or a void invoice (nobody is handed a void bill). Nothing the
 * caller sends but the token is read.
 *
 * The paper itself is the invoice the customer was sent — the seller as at
 * issue (DEC-082), their own bill-to, the lines and totals — and nothing
 * the pay page's allow-list keeps back from them: it carries no notes,
 * ids, payment references or internal state.
 *
 * Limited twice: per caller, as the pay read is, and per invoice, since a
 * drawing is the expensive part.
 */
@Injectable()
export class PublicInvoicePdfService {
    constructor(
        private readonly pdfs: IssuedInvoicePdf,
        @Optional()
        private readonly callLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            CALLS_PER_WINDOW,
            CALL_WINDOW_MS,
        ),
        @Optional()
        private readonly drawLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            DRAWS_PER_WINDOW,
            DRAW_WINDOW_MS,
        ),
    ) {}

    async pdf(token: string, callerHash?: string): Promise<IssuedPdf> {
        const tokenHash = hashPayToken(token);
        // Keyed on the caller, as the pay read is: keyed on the token sent,
        // every guessed token would be a fresh window.
        if (!this.callLimiter.take(callerHash ?? tokenHash)) {
            throw tooManyRequests();
        }
        const found = await prisma.invoice.findUnique({
            where: { payTokenHash: tokenHash },
            select: { id: true, organizationId: true },
        });
        if (!found) notFound();
        if (!this.drawLimiter.take(found.id)) throw tooManyRequests();
        const pdf = await runInOrgContext(found.organizationId, () =>
            this.pdfs.draw(found.organizationId, found.id),
        );
        if (!pdf) notFound();
        return pdf;
    }
}
