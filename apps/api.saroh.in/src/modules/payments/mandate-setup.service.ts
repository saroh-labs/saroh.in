import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import { isReservedContactEmail } from "../contacts/contact-email";
import { mandateProviders, openMandateConnection } from "./mandate-connection";
import { applyMandateChangeInTx } from "./mandate-events";
import type { ReportedMandateStatus } from "./mandate-rules";
import {
    MANDATE_MAX_CENTS,
    MANDATE_TERM_YEARS,
    providerName,
    SETUP_TTL_MS,
} from "./mandate-rules";
import type {
    MandateFrequency,
    MandateMethod,
    ProviderFactory,
} from "./providers/provider.port";
import {
    isMandateMethod,
    MandateCallError,
    PROVIDER_FACTORY,
} from "./providers/provider.port";

/**
 * Setting up autopay (round-2 D11, DEC-038): which methods a business's
 * customers can authorise with, the authorisation itself, and reading a
 * mandate back when its webhook never came. D12 calls it from the pay
 * link, the join sheet and the customer's account; D20's
 * `MandatesService` ends a mandate, and `MandateChargesService` charges
 * one.
 */
@Injectable()
export class MandateSetupService {
    private readonly logger = new Logger(MandateSetupService.name);

    constructor(
        @Inject(PROVIDER_FACTORY) private readonly providers: ProviderFactory,
    ) {}

    /**
     * How a customer of this business can set up autopay: each connected
     * provider that can take it, with the methods its account allows. The
     * customer picks from all of them; Saroh never narrows the list
     * (DEC-059). Empty: autopay isn't offered. A provider that can't answer
     * is left out and logged, never guessed at.
     */
    async mandateMethods(organizationId: string): Promise<MandateOffer[]> {
        const offers: MandateOffer[] = [];
        for (const provider of await mandateProviders(
            this.providers,
            organizationId,
        )) {
            const connection = await openMandateConnection(
                this.providers,
                organizationId,
                provider,
                { connectedOnly: true },
            );
            if (!connection) continue;
            try {
                const methods = await connection.mandates.mandateMethods({
                    credentials: connection.credentials,
                });
                const known = methods.filter(isMandateMethod);
                if (known.length > 0) offers.push({ provider, methods: known });
            } catch {
                this.logger.warn(
                    `${provider} didn't say which autopay methods it takes; autopay isn't offered through it for now`,
                );
            }
        }
        return offers;
    }

    /**
     * Start an authorisation for one subscription: a PENDING mandate, and
     * the provider's page to approve it on. The customer picked `method`
     * from {@link mandateMethods}; the limit is the caller's (D12 asks for
     * `mandateLimitCents` of the price). Several PENDING set-ups may wait
     * at once; the first the customer approves becomes ACTIVE and replaces
     * any older one (`mandate-events.ts`).
     *
     * The row is written first, so its id is the provider's reference and
     * a webhook always has a row to find. A refusal or no answer marks it
     * FAILED — the customer never saw a page to approve — and says so.
     */
    async createSetup(input: CreateSetupInput): Promise<MandateSetupView> {
        const { organizationId, subscriptionId, method } = input;
        const now = input.now ?? new Date();
        if (
            !Number.isInteger(input.maxAmountCents) ||
            input.maxAmountCents <= 0 ||
            input.maxAmountCents > MANDATE_MAX_CENTS
        ) {
            throw new BadRequestException("That autopay limit isn't allowed");
        }
        const firstAmountCents = input.firstAmountCents ?? 0;
        if (!Number.isInteger(firstAmountCents) || firstAmountCents < 0) {
            throw new BadRequestException("That first payment isn't allowed");
        }

        const subscription = await prisma.customerSubscription.findFirst({
            where: { id: subscriptionId, organizationId },
            select: {
                id: true,
                status: true,
                contactId: true,
                plan: { select: { name: true, currency: true } },
                contact: {
                    select: {
                        email: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                    },
                },
            },
        });
        if (!subscription)
            throw new NotFoundException("Subscription not found");
        if (subscription.status === "CANCELLED") {
            throw new ConflictException(
                "This subscription has ended, so autopay can't be set up for it",
            );
        }

        const offers = await this.mandateMethods(organizationId);
        const offer = input.provider
            ? offers.find((o) => o.provider === input.provider)
            : offers.find((o) => o.methods.includes(method));
        if (!offer?.methods.includes(method)) {
            throw new ConflictException(
                "That way to pay isn't available for autopay with this business",
            );
        }
        const connection = await openMandateConnection(
            this.providers,
            organizationId,
            offer.provider,
            { connectedOnly: true },
        );
        if (!connection) {
            throw new ConflictException(
                "That way to pay isn't available for autopay with this business",
            );
        }

        const currency = subscription.plan.currency;
        const setupExpiresAt = new Date(now.getTime() + SETUP_TTL_MS);
        const expiresAt = new Date(now);
        expiresAt.setFullYear(expiresAt.getFullYear() + MANDATE_TERM_YEARS);
        const frequency = input.frequency ?? "AS_PRESENTED";

        const row = await prisma.paymentMandate.create({
            data: {
                organizationId,
                contactId: subscription.contactId,
                subscriptionId,
                provider: connection.provider,
                status: "PENDING",
                method,
                maxAmountCents: input.maxAmountCents,
                currency,
                frequency,
                setupExpiresAt,
            },
            select: { id: true },
        });

        const contact = subscription.contact;
        const name =
            [contact.firstName, contact.lastName]
                .filter((p) => p?.trim())
                .join(" ")
                .trim() || "Customer";
        try {
            const setup = await connection.mandates.createSetup({
                reference: row.id,
                method,
                customer: {
                    name,
                    email: isReservedContactEmail(contact.email)
                        ? null
                        : contact.email,
                    phone: contact.phone ?? null,
                },
                firstAmountCents,
                maxAmountCents: input.maxAmountCents,
                currency,
                frequency,
                expiresAt,
                setupExpiresAt,
                description: `Autopay for ${subscription.plan.name}`,
                credentials: connection.credentials,
            });
            await prisma.paymentMandate.update({
                where: { id: row.id },
                data: {
                    providerCustomerId: setup.providerCustomerId,
                    setupReference: setup.setupReference,
                    expiresAt,
                },
            });
            return {
                mandateId: row.id,
                provider: connection.provider,
                method,
                maxAmountCents: input.maxAmountCents,
                currency,
                authorisationUrl: setup.authorisationUrl,
                clientParams: setup.clientParams,
                setupExpiresAt,
            };
        } catch (err) {
            const outcome =
                err instanceof MandateCallError ? err.outcome : "UNKNOWN";
            await prisma.paymentMandate.update({
                where: { id: row.id },
                data: {
                    status: "FAILED",
                    failedAt: now,
                    failureReason:
                        outcome === "REFUSED"
                            ? "SETUP_REFUSED"
                            : "SETUP_UNANSWERED",
                },
            });
            const at = providerName(connection.provider);
            if (outcome === "REFUSED") {
                throw new ConflictException(
                    `${at} didn't accept the autopay set-up. Try another way to pay, or pay this time without autopay`,
                );
            }
            throw new ServiceUnavailableException(
                `${at} didn't answer. Nothing was set up; try again in a few minutes`,
            );
        }
    }

    /**
     * Ask the provider how a mandate stands and apply it, as its webhook
     * would have (a webhook lost or late). Safe to call again.
     */
    async refresh(
        organizationId: string,
        mandateId: string,
    ): Promise<{ status: string; applied: boolean }> {
        const row = await prisma.paymentMandate.findFirst({
            where: { id: mandateId, organizationId },
            select: {
                id: true,
                status: true,
                provider: true,
                providerMandateId: true,
                providerCustomerId: true,
                setupReference: true,
            },
        });
        if (!row) throw new NotFoundException("Autopay not found");
        if (!row.providerMandateId && !row.setupReference) {
            return { status: row.status, applied: false };
        }
        const connection = await openMandateConnection(
            this.providers,
            organizationId,
            row.provider,
            { connectedOnly: false },
        );
        if (!connection) return { status: row.status, applied: false };
        let reported;
        try {
            reported = await connection.mandates.get({
                providerMandateId: row.providerMandateId,
                providerCustomerId: row.providerCustomerId,
                setupReference: row.setupReference,
                credentials: connection.credentials,
            });
        } catch {
            this.logger.warn(
                `Mandate ${row.id}: ${row.provider} didn't say how it stands; left as it was`,
            );
            return { status: row.status, applied: false };
        }
        if (reported.status === "PENDING") {
            return { status: row.status, applied: false };
        }
        const { applied } = await prisma.$transaction((tx) =>
            applyMandateChangeInTx(tx, organizationId, row.provider, {
                status: reported.status as ReportedMandateStatus,
                providerMandateId: reported.providerMandateId ?? undefined,
                providerCustomerId: reported.providerCustomerId ?? undefined,
                setupReference: row.setupReference ?? undefined,
                method: reported.method ?? undefined,
                displayHint: reported.displayHint ?? undefined,
                maxAmountCents: reported.maxAmountCents ?? undefined,
                expiresAt: reported.expiresAt ?? undefined,
                failureReason: reported.failureReason ?? undefined,
            }),
        );
        const after = await prisma.paymentMandate.findUniqueOrThrow({
            where: { id: row.id },
            select: { status: true },
        });
        return { status: after.status, applied };
    }
}

/** A provider a customer can set up autopay through, and its methods. */
export interface MandateOffer {
    provider: string;
    methods: MandateMethod[];
}

export interface CreateSetupInput {
    organizationId: string;
    subscriptionId: string;
    method: MandateMethod;
    /** The provider to use; by default the first that offers `method`. */
    provider?: string;
    /** The most one charge may take, in minor units. */
    maxAmountCents: number;
    /**
     * The authorisation's own payment, in minor units (D12 makes it the
     * invoice's). UPI and card take at least ₹1 at Razorpay; 0 by default.
     */
    firstAmountCents?: number;
    frequency?: MandateFrequency;
    now?: Date;
}

/** What the customer's side needs to go and approve it. Never a secret. */
export interface MandateSetupView {
    mandateId: string;
    provider: string;
    method: MandateMethod;
    maxAmountCents: number;
    currency: string;
    /** The provider's page to approve it on, when it has one. */
    authorisationUrl: string | null;
    /** Non-secret parameters for the provider's window otherwise. */
    clientParams: Record<string, unknown>;
    setupExpiresAt: Date;
}
