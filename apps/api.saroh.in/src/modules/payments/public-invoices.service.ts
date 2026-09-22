import {
    BadRequestException,
    ConflictException,
    HttpException,
    Injectable,
    NotFoundException,
    Optional,
} from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { toMoneyString } from "../../common/money";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import type { InvoiceStanding } from "../invoices/invoice-state";
import { invoiceStanding } from "../invoices/invoice-state";
import { hashPayToken } from "../invoices/pay-token";
import { parseSiteStyle, siteStyleVariables } from "../sites/site-style";
import type { CreateIntentResult } from "./payments.service";
import { PaymentsService } from "./payments.service";
import { isSupportedProvider } from "./providers/provider.port";

/**
 * What the customer's pay page shows, and nothing more (ADR-007, U13). An
 * explicit allow-list: no email, contact or invoice id, no notes, no payment
 * references, no internal state.
 */
export interface PublicInvoiceView {
    businessName: string;
    number: string;
    issuedAt: string | null;
    dueAt: string | null;
    lines: {
        description: string;
        quantity: number;
        unitPrice: string;
        amount: string;
    }[];
    tax: string;
    total: string;
    currency: string;
    /** Overdue is derived, as in the workspace. Void means not payable. */
    status: Exclude<InvoiceStanding, "DRAFT">;
    billedTo: string | null;
    /** The business's site theme as `--site-*` variables; null for defaults. */
    theme: Record<string, string> | null;
}

/** Reads per link per minute: a page reload is fine, a scraper is not. */
const READS_PER_WINDOW = 30;
const READ_WINDOW_MS = 60_000;
/** Payment starts per link per ten minutes. */
const PAYS_PER_WINDOW = 10;
const PAY_WINDOW_MS = 10 * 60_000;

const MAX_KEY_LENGTH = 255;

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
 * The customer's side of an invoice pay link — no session, so everything
 * hangs on the token (ADR-007, U13).
 *
 * The token is found by its hash and nothing else is taken from the request
 * but a provider and an idempotency key: the business, the amount and the
 * currency all come from the stored invoice. An unknown, replaced or revoked
 * token is a 404. The hash lookup runs before any org context exists, so
 * these checks are the guarantee; `runInOrgContext` adds the database's own
 * when row-level security is on (the review link's pattern).
 */
@Injectable()
export class PublicInvoicesService {
    constructor(
        private readonly payments: PaymentsService,
        @Optional()
        private readonly readLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            READS_PER_WINDOW,
            READ_WINDOW_MS,
        ),
        @Optional()
        private readonly payLimiter: FixedWindowRateLimiter = new FixedWindowRateLimiter(
            PAYS_PER_WINDOW,
            PAY_WINDOW_MS,
        ),
    ) {}

    async read(token: string): Promise<PublicInvoiceView> {
        const tokenHash = hashPayToken(token);
        if (!this.readLimiter.take(tokenHash)) throw tooManyRequests();
        const found = await this.find(tokenHash);
        return runInOrgContext(found.organizationId, async () => {
            const invoice = await prisma.invoice.findFirst({
                where: {
                    id: found.id,
                    organizationId: found.organizationId,
                },
                select: {
                    number: true,
                    status: true,
                    issuedAt: true,
                    dueAt: true,
                    tax: true,
                    total: true,
                    currency: true,
                    billToName: true,
                    organization: { select: { name: true } },
                    lines: {
                        orderBy: { position: "asc" },
                        select: {
                            description: true,
                            quantity: true,
                            unitPrice: true,
                            amount: true,
                        },
                    },
                },
            });
            if (!invoice?.number || invoice.status === "DRAFT") notFound();
            const site = await prisma.site.findFirst({
                where: {
                    organizationId: found.organizationId,
                    deletedAt: null,
                    currentPublicationId: { not: null },
                },
                orderBy: { createdAt: "asc" },
                select: { style: true },
            });
            return {
                businessName: invoice.organization.name,
                number: invoice.number,
                issuedAt: invoice.issuedAt?.toISOString() ?? null,
                dueAt: invoice.dueAt?.toISOString() ?? null,
                lines: invoice.lines.map((l) => ({
                    description: l.description,
                    quantity: l.quantity,
                    unitPrice: toMoneyString(l.unitPrice),
                    amount: toMoneyString(l.amount),
                })),
                tax: toMoneyString(invoice.tax),
                total: toMoneyString(invoice.total),
                currency: invoice.currency,
                status: invoiceStanding(invoice, new Date()) as Exclude<
                    InvoiceStanding,
                    "DRAFT"
                >,
                billedTo: invoice.billToName,
                theme: site
                    ? siteStyleVariables(parseSiteStyle(site.style))
                    : null,
            };
        });
    }

    /**
     * Start paying: an intent for the invoice's own total, through the
     * business's own connected provider. `body` is read by hand, not by a
     * DTO, so anything but `provider` and `idempotencyKey` — an `amount`,
     * say — is ignored rather than refused.
     */
    async createIntent(
        token: string,
        body: unknown,
    ): Promise<CreateIntentResult> {
        const options = parseIntentBody(body);
        const tokenHash = hashPayToken(token);
        if (!this.payLimiter.take(tokenHash)) throw tooManyRequests();
        const found = await this.find(tokenHash);
        return runInOrgContext(found.organizationId, async () => {
            const invoice = await prisma.invoice.findFirst({
                where: {
                    id: found.id,
                    organizationId: found.organizationId,
                },
                select: {
                    id: true,
                    organizationId: true,
                    status: true,
                    total: true,
                    currency: true,
                },
            });
            if (!invoice) notFound();
            if (invoice.status !== "ISSUED") {
                throw new ConflictException(
                    invoice.status === "PAID"
                        ? "This invoice is already paid."
                        : "This invoice is no longer payable.",
                );
            }
            return this.payments.createIntentForInvoicePublic(invoice, options);
        });
    }

    private async find(
        tokenHash: string,
    ): Promise<{ id: string; organizationId: string }> {
        const row = await prisma.invoice.findUnique({
            where: { payTokenHash: tokenHash },
            select: { id: true, organizationId: true },
        });
        if (!row) notFound();
        return row;
    }
}

/** The two fields the public intent request may carry; the rest is ignored. */
export function parseIntentBody(body: unknown): {
    provider?: string;
    idempotencyKey?: string;
} {
    const record =
        typeof body === "object" && body !== null
            ? (body as Record<string, unknown>)
            : {};
    const out: { provider?: string; idempotencyKey?: string } = {};
    if (record.provider !== undefined && record.provider !== null) {
        const provider =
            typeof record.provider === "string"
                ? record.provider.trim().toUpperCase()
                : "";
        if (!isSupportedProvider(provider)) {
            throw new BadRequestException("That payment provider is unknown");
        }
        out.provider = provider;
    }
    if (record.idempotencyKey !== undefined && record.idempotencyKey !== null) {
        if (
            typeof record.idempotencyKey !== "string" ||
            record.idempotencyKey.length > MAX_KEY_LENGTH
        ) {
            throw new BadRequestException("The idempotency key is not valid");
        }
        out.idempotencyKey = record.idempotencyKey;
    }
    return out;
}
