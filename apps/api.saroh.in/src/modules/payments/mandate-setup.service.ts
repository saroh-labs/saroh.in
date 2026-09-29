import { randomUUID } from "node:crypto";

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
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import {
    AUTHORISATION_PURPOSE,
    captureCheckInTx,
    checkCentsFor,
    recordCheckInTx,
} from "./authorisation-check";
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
    MandateSetupHandoff,
    ProviderFactory,
} from "./providers/provider.port";
import {
    isMandateMethod,
    MandateCallError,
    PROVIDER_FACTORY,
} from "./providers/provider.port";

// Stateless: it reads the flag rows on every call.
const rolloutFlags = new FeatureFlagService();

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
            // An adapter behind a rollout flag (Razorpay, D19) is offered
            // only where the flag is on; it fails closed while unset.
            const flag = connection.mandates.rolloutFlag;
            if (flag && !(await rolloutFlags.isEnabled(flag, organizationId))) {
                continue;
            }
            try {
                const methods = await connection.mandates.mandateMethods({
                    credentials: connection.credentials,
                });
                const known = methods.filter(isMandateMethod);
                const checkCents: MandateOffer["checkCents"] = {};
                for (const m of known) {
                    const cents = checkCentsFor(connection.mandates, m);
                    if (cents > 0) checkCents[m] = cents;
                }
                if (known.length > 0) {
                    offers.push({ provider, methods: known, checkCents });
                }
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
     *
     * Nothing to pay (`firstAmountCents` 0) by a method whose authorisation
     * must take a payment (Razorpay UPI and card): the provider's minimum is
     * taken as the ₹1 check, recorded as an AUTHORISATION intent — never a
     * sale — and refunded once captured (`authorisation-check.ts`, DEC-064).
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
        // The ₹1 check (DEC-064): only with nothing to pay, only where the
        // method's authorisation must take a payment.
        const checkCents =
            firstAmountCents === 0
                ? checkCentsFor(connection.mandates, method)
                : 0;
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
                setupSource: input.source ?? null,
                setupAccountId: input.accountId ?? null,
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
                firstAmountCents:
                    checkCents > 0 ? checkCents : firstAmountCents,
                maxAmountCents: input.maxAmountCents,
                currency,
                frequency,
                expiresAt,
                setupExpiresAt,
                description: `Autopay for ${subscription.plan.name}`,
                ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
                ...(input.handoff ? { handoff: input.handoff } : {}),
                credentials: connection.credentials,
            });
            const paymentReference =
                setup.paymentReference ?? setup.setupReference;
            await prisma.$transaction(async (tx) => {
                await tx.paymentMandate.update({
                    where: { id: row.id },
                    data: {
                        providerCustomerId: setup.providerCustomerId,
                        setupReference: setup.setupReference,
                        expiresAt,
                    },
                });
                // Before the customer sees the window: the capture webhook
                // always has the check's intent to find.
                if (checkCents > 0) {
                    await recordCheckInTx(tx, {
                        organizationId,
                        mandateId: row.id,
                        provider: connection.provider,
                        providerIntentId: paymentReference,
                        amountCents: checkCents,
                        currency,
                    });
                }
            });
            return {
                mandateId: row.id,
                provider: connection.provider,
                method,
                maxAmountCents: input.maxAmountCents,
                currency,
                setupReference: setup.setupReference,
                authorisationUrl: setup.authorisationUrl,
                clientParams: setup.clientParams,
                setupExpiresAt,
                checkCents,
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
     * Start an authorisation for a plan being joined online (D12, G20's
     * pay-first join), before any subscription exists: no row is written.
     * The caller keeps what this returns on the join's draft invoice
     * (`plan-join.ts`), and the mandate row is made under `mandateId` when
     * the draft's payment starts the subscription. A provider report that
     * arrives before then is held on the draft (`mandate-events.ts`) and
     * applied once the row exists.
     */
    async createJoinSetup(input: CreateJoinSetupInput): Promise<JoinSetup> {
        const now = input.now ?? new Date();
        if (
            !Number.isInteger(input.maxAmountCents) ||
            input.maxAmountCents <= 0 ||
            input.maxAmountCents > MANDATE_MAX_CENTS
        ) {
            throw new BadRequestException("That autopay limit isn't allowed");
        }
        if (
            !Number.isInteger(input.firstAmountCents) ||
            input.firstAmountCents < 0
        ) {
            throw new BadRequestException("That first payment isn't allowed");
        }
        const offers = await this.mandateMethods(input.organizationId);
        const offer = offers.find((o) => o.methods.includes(input.method));
        const connection = offer
            ? await openMandateConnection(
                  this.providers,
                  input.organizationId,
                  offer.provider,
                  { connectedOnly: true },
              )
            : null;
        if (!connection) {
            throw new ConflictException(
                "That way to pay isn't available for autopay with this business",
            );
        }
        const contact = await prisma.contact.findFirst({
            where: {
                id: input.contactId,
                organizationId: input.organizationId,
            },
            select: {
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
            },
        });
        if (!contact) throw new NotFoundException("Customer not found");
        const setupExpiresAt = new Date(now.getTime() + SETUP_TTL_MS);
        const expiresAt = new Date(now);
        expiresAt.setFullYear(expiresAt.getFullYear() + MANDATE_TERM_YEARS);
        const frequency: MandateFrequency = "AS_PRESENTED";
        const mandateId = newMandateId();
        const name =
            [contact.firstName, contact.lastName]
                .filter((p) => p?.trim())
                .join(" ")
                .trim() || "Customer";
        try {
            const setup = await connection.mandates.createSetup({
                reference: mandateId,
                method: input.method,
                customer: {
                    name,
                    email: isReservedContactEmail(contact.email)
                        ? null
                        : contact.email,
                    phone: contact.phone ?? null,
                },
                firstAmountCents: input.firstAmountCents,
                maxAmountCents: input.maxAmountCents,
                currency: input.currency,
                frequency,
                expiresAt,
                setupExpiresAt,
                description: input.description,
                ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
                credentials: connection.credentials,
            });
            return {
                mandateId,
                provider: connection.provider,
                method: input.method,
                maxAmountCents: input.maxAmountCents,
                currency: input.currency,
                frequency,
                providerCustomerId: setup.providerCustomerId,
                setupReference: setup.setupReference,
                authorisationUrl: setup.authorisationUrl,
                clientParams: setup.clientParams,
                expiresAt,
                setupExpiresAt,
            };
        } catch (err) {
            const outcome =
                err instanceof MandateCallError ? err.outcome : "UNKNOWN";
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
        let reported: Awaited<ReturnType<typeof connection.mandates.get>>;
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
        // The ₹1 check's capture webhook was lost: the read found its
        // payment, so it is refunded all the same (DEC-064) — whatever
        // became of the mandate.
        const checkCaptured = reported.setupPayment?.captured
            ? await this.captureCheck(
                  organizationId,
                  row.id,
                  reported.setupPayment.providerPaymentRef,
              )
            : false;
        if (reported.status === "PENDING") {
            return { status: row.status, applied: checkCaptured };
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
        return { status: after.status, applied: applied || checkCaptured };
    }

    /** Capture a set-up's check, if it has one still waiting (DEC-064). */
    private async captureCheck(
        organizationId: string,
        mandateId: string,
        providerPaymentRef: string,
    ): Promise<boolean> {
        const check = await prisma.paymentIntent.findFirst({
            where: {
                organizationId,
                checkForMandateId: mandateId,
                purpose: AUTHORISATION_PURPOSE,
            },
            select: { id: true, organizationId: true },
        });
        if (!check) return false;
        const { applied } = await prisma.$transaction((tx) =>
            captureCheckInTx(tx, check, providerPaymentRef),
        );
        return applied;
    }
}

/** A provider a customer can set up autopay through, and its methods. */
export interface MandateOffer {
    provider: string;
    methods: MandateMethod[];
    /**
     * The check each method takes when nothing is owed, in minor units
     * (DEC-064: Razorpay UPI and card 100). A method not here takes none.
     */
    checkCents: Partial<Record<MandateMethod, number>>;
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
     * invoice's). 0 by default: nothing owed, and a method that must take a
     * payment takes the ₹1 check instead (DEC-064).
     */
    firstAmountCents?: number;
    frequency?: MandateFrequency;
    /** Where the customer set it up (D12); absent for staff. */
    source?: MandateSetupSource;
    /** The site account that set it up, when it was one. */
    accountId?: string | null;
    /** The page on the business's site the provider sends them back to. */
    returnUrl?: string;
    /**
     * The provider's window on the site (the default, D12), or its hosted
     * page for a set-up link sent to the customer (D13/D14).
     */
    handoff?: MandateSetupHandoff;
    now?: Date;
}

/** Where a customer set autopay up (D12), for the subscription's log. */
export const MANDATE_SETUP_SOURCES = ["PAY_LINK", "PRICES", "ACCOUNT"] as const;
export type MandateSetupSource = (typeof MANDATE_SETUP_SOURCES)[number];

export interface CreateJoinSetupInput {
    organizationId: string;
    contactId: string;
    method: MandateMethod;
    maxAmountCents: number;
    /** The join's first period (UPI, card), or 0 (eMandate). */
    firstAmountCents: number;
    currency: string;
    description: string;
    returnUrl?: string;
    now?: Date;
}

/** An authorisation started for a join, kept on its draft until paid. */
export interface JoinSetup {
    /** The id the mandate row takes once the subscription starts. */
    mandateId: string;
    provider: string;
    method: MandateMethod;
    maxAmountCents: number;
    currency: string;
    frequency: MandateFrequency;
    providerCustomerId: string;
    setupReference: string;
    authorisationUrl: string | null;
    clientParams: Record<string, unknown>;
    expiresAt: Date;
    setupExpiresAt: Date;
}

/** A mandate id made before its row: letters and digits, like a cuid. */
export function newMandateId(): string {
    return `m${randomUUID().replace(/-/g, "")}`;
}

/** What the customer's side needs to go and approve it. Never a secret. */
export interface MandateSetupView {
    mandateId: string;
    provider: string;
    method: MandateMethod;
    maxAmountCents: number;
    currency: string;
    /** The provider's set-up object; for UPI and card, the first payment's order. */
    setupReference: string;
    /** The provider's page to approve it on, when it has one. */
    authorisationUrl: string | null;
    /** Non-secret parameters for the provider's window otherwise. */
    clientParams: Record<string, unknown>;
    setupExpiresAt: Date;
    /**
     * The ₹1 check this set-up takes, in minor units (DEC-064): refunded
     * once captured. 0: none (something is paid with it, or eMandate).
     */
    checkCents: number;
}
