import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { prisma } from "@saroh/database";

import { stateName } from "../invoices/gst-states";
import {
    billingEmail,
    billingName,
    nonEmpty,
    readBillingParty,
} from "./billing-details";
import { CATALOGUE_BILLING_PROVIDER } from "./provider-plan-sync.service";
import type {
    BillingCustomer,
    BillingProviderFactory,
    ProviderCustomerCapability,
} from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

/**
 * One customer per business at Saroh's billing provider (DEC-165, owner,
 * 17 Oct 2026: "make sure to create a razorpay customer when they join the
 * app, and then update the details based on info they fill in for
 * billing, this way we will make sure the data is consistent and we wont
 * create customer again").
 *
 * - **Made at sign-up** by the `billing.customer.sync` job
 *   (`billing-customer-sync.ts`), queued in the sign-up's transaction;
 *   never in its way. Where the provider's keys aren't set (local, CI) it
 *   asks nothing, and the first checkout makes it.
 * - **Kept current**: the same job runs whenever the business's billing
 *   details change (Settings › Business, the checkout's details step) and
 *   sends the name, email, phone and GSTIN. The address can't be updated
 *   on a customer (its notes are create-only); it stays on each
 *   subscription's or order's notes and on Saroh's invoice.
 * - **Never found by email or phone**: the id is kept on
 *   `BillingCustomer`, so a business is never handed another's customer.
 *   An owner's second business with the same email and phone is refused
 *   by Razorpay ("already exists"): it is made without the phone, which
 *   stays in Saroh (`contactWithheld`).
 * - Every checkout, subscription and Saroh invoice copies its id.
 */
export class BillingCustomers {
    constructor(
        private readonly providers: BillingProviderFactory,
        private readonly logger: Pick<Logger, "log" | "warn" | "error">,
    ) {}

    /**
     * The business's customer id, made now if it has none (a checkout before
     * the sign-up's job ran). Never throws: null when the provider can't be
     * asked here or refuses, and the checkout goes on without one.
     */
    async idFor(organizationId: string): Promise<string | null> {
        try {
            return await this.sync(organizationId, { update: false });
        } catch (error) {
            this.logger.warn(
                `billing_customer_failed org=${organizationId}: ${message(error)}`,
            );
            return null;
        }
    }

    /**
     * Make the business's customer, or (with `update`) send its details as
     * they are now. Throws what the provider answered, after keeping it on
     * the row (`lastError`); the job retries.
     */
    async sync(
        organizationId: string,
        options: { update: boolean },
    ): Promise<string | null> {
        const provider = CATALOGUE_BILLING_PROVIDER;
        const customers = this.providers.get(provider).customers;
        if (!customers?.configured()) {
            this.logger.log(
                `billing_customer_skipped org=${organizationId}: the provider isn't configured here`,
            );
            return null;
        }
        const key = { organizationId_provider: { organizationId, provider } };
        try {
            const row = await prisma.billingCustomer.findUnique({ where: key });
            if (row?.providerCustomerId) {
                if (!options.update) return row.providerCustomerId;
                await customers.updateCustomer(
                    row.providerCustomerId,
                    await billingCustomerOf(organizationId),
                    { withContact: !row.contactWithheld },
                );
                await prisma.billingCustomer.update({
                    where: key,
                    data: { syncedAt: new Date(), lastError: null },
                });
                return row.providerCustomerId;
            }
            return await this.create(organizationId, customers);
        } catch (error) {
            await prisma.billingCustomer.upsert({
                where: key,
                create: { organizationId, provider, lastError: message(error) },
                update: { lastError: message(error) },
            });
            throw error;
        }
    }

    /**
     * Made once: under a lock per business, so sign-up's job and a checkout
     * running together never make two.
     */
    private async create(
        organizationId: string,
        customers: ProviderCustomerCapability,
    ): Promise<string> {
        const provider = CATALOGUE_BILLING_PROVIDER;
        const customer = await billingCustomerOf(organizationId);
        return prisma.$transaction(
            async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-customer:${organizationId}`}))`;
                const row = await tx.billingCustomer.findUnique({
                    where: {
                        organizationId_provider: { organizationId, provider },
                    },
                });
                if (row?.providerCustomerId) return row.providerCustomerId;
                let withheld = false;
                let made = await customers.createCustomer(customer, {
                    withContact: true,
                });
                if (made === "exists") {
                    // Another business of the same owner (same email and
                    // phone): this one is made without the phone.
                    withheld = true;
                    this.logger.warn(
                        `billing_customer_contact_withheld org=${organizationId}: another customer has the same email and phone`,
                    );
                    made = await customers.createCustomer(customer, {
                        withContact: false,
                    });
                }
                if (made === "exists") {
                    throw new BillingProviderError(
                        "REFUSED",
                        "the provider has a customer with these details",
                    );
                }
                const data = {
                    providerCustomerId: made.providerCustomerId,
                    contactWithheld: withheld,
                    syncedAt: new Date(),
                    lastError: null,
                };
                await tx.billingCustomer.upsert({
                    where: {
                        organizationId_provider: { organizationId, provider },
                    },
                    create: { organizationId, provider, ...data },
                    update: data,
                });
                this.logger.log(
                    `billing_customer_created org=${organizationId} customer=${made.providerCustomerId}`,
                );
                return made.providerCustomerId;
            },
            // The provider is asked inside: up to two calls.
            { timeout: 40_000, maxWait: 10_000 },
        );
    }
}

/**
 * Who the business's customer is: its billing name (legal name, else the
 * business's), the owner's email (else the profile's contact email, else
 * the latest one given at a checkout), its phone (else the latest given at
 * a checkout), its GSTIN (else the latest given at a checkout) and its
 * registered address. Each is the latest checkout that gave *it*: a later
 * checkout that asked nothing (an upgrade with every detail on file) never
 * hides what an earlier one was given.
 */
export async function billingCustomerOf(
    organizationId: string,
): Promise<BillingCustomer> {
    const latest = { organizationId } as const;
    const newest = { createdAt: "desc" } as const;
    const [owner, givenEmail, givenPhone, givenGstin] = await Promise.all([
        prisma.membership.findFirst({
            where: { organizationId, role: "OWNER" },
            orderBy: { createdAt: "asc" },
            select: { userId: true },
        }),
        prisma.billingCheckout.findFirst({
            where: { ...latest, billToEmail: { not: null } },
            orderBy: newest,
            select: { billToEmail: true },
        }),
        prisma.billingCheckout.findFirst({
            where: { ...latest, billToPhone: { not: null } },
            orderBy: newest,
            select: { billToPhone: true },
        }),
        prisma.billingCheckout.findFirst({
            where: { ...latest, billToGstin: { not: null } },
            orderBy: newest,
            select: { billToGstin: true },
        }),
    ]);
    const party = await readBillingParty(
        prisma,
        organizationId,
        owner?.userId ?? null,
    );
    const profile = party.profile;
    return {
        name: billingName(party) ?? party.userName ?? "",
        businessName: party.orgName,
        email: billingEmail(party) ?? givenEmail?.billToEmail ?? null,
        contact: nonEmpty(profile?.phone) ?? givenPhone?.billToPhone ?? null,
        gstin: nonEmpty(profile?.taxId) ?? givenGstin?.billToGstin ?? null,
        address: profile?.addressLine1
            ? {
                  line1: profile.addressLine1,
                  line2: profile.addressLine2 ?? null,
                  city: profile.city ?? null,
                  state: stateName(profile.gstState),
                  postalCode: profile.postalCode ?? null,
              }
            : null,
        organizationId,
    };
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : "unknown error";
}

/** The `billing.customer.sync` job: make the customer, or update it. */
@Injectable()
export class BillingCustomerSyncHandler {
    private readonly logger = new Logger(BillingCustomerSyncHandler.name);
    private readonly customers: BillingCustomers;

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        providers: BillingProviderFactory,
    ) {
        this.customers = new BillingCustomers(providers, this.logger);
    }

    readonly handle = async (job: Job): Promise<void> => {
        const organizationId = job.organizationId;
        if (!organizationId) {
            this.logger.error(`billing_customer_bad_job job=${job.id}`);
            return;
        }
        const org = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { deletedRetainedAt: true },
        });
        if (!org || org.deletedRetainedAt) return;
        try {
            await this.customers.sync(organizationId, { update: true });
        } catch (error) {
            const refused =
                error instanceof BillingProviderError &&
                error.kind === "REFUSED";
            this.logger.error(
                `billing_customer_sync_failed org=${organizationId} attempt=${job.attempts + 1}/${job.maxAttempts}: ${message(error)}`,
            );
            // A refusal won't change by asking again; the next change of
            // details, or the next checkout, tries again.
            if (refused) return;
            throw error;
        }
    };
}
