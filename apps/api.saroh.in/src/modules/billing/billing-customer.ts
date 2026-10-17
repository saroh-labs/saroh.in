import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { stateName } from "../invoices/gst-states";
import {
    billingEmail,
    billingName,
    nonEmpty,
    readBillingParty,
} from "./billing-details";
import { raiseBillingOpsNoticeInTx } from "./billing-ops-notice";
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
 * - **Adopted, not made twice**: a business that paid before DEC-165 has a
 *   customer the provider made at payment (on `Subscription` or its latest
 *   `BillingCheckout`); it is checked at the provider and kept, unless
 *   another business already holds it. One the provider holds for the same
 *   email and phone is this business's when its notes name it (an earlier
 *   try whose answer was lost), and kept too.
 * - **Kept current**: the same job runs whenever the business's billing
 *   details change (Settings › Business, the checkout's details step, the
 *   owner's email) and sends the name, email, phone and GSTIN. The address
 *   can't be updated on a customer (its notes are create-only); it stays
 *   on each subscription's or order's notes and on Saroh's invoice.
 * - **Never handed another's**: an owner's second business with the same
 *   email and phone is refused by Razorpay ("already exists"), on a create
 *   or an update: it goes without the phone, which stays in Saroh
 *   (`contactWithheld`). Any other refusal is an operator's note, once.
 * - Every checkout, subscription and Saroh invoice copies its id.
 */
export class BillingCustomers {
    constructor(
        private readonly providers: BillingProviderFactory,
        private readonly logger: Pick<Logger, "log" | "warn" | "error">,
    ) {}

    /**
     * The business's customer id, made now if it has none (a checkout before
     * the sign-up's job ran). Null when the provider isn't configured here,
     * or refuses (the checkout goes on without one); a provider that can't
     * answer throws, so the checkout never goes on to have the provider
     * make a second customer of its own.
     */
    async idFor(organizationId: string): Promise<string | null> {
        try {
            return await this.sync(organizationId, { update: false });
        } catch (error) {
            if (
                error instanceof BillingProviderError &&
                error.kind === "REFUSED"
            ) {
                this.logger.warn(
                    `billing_customer_refused org=${organizationId}: ${message(error)}`,
                );
                return null;
            }
            throw error;
        }
    }

    /**
     * Make the business's customer, or (with `update`) send its details as
     * they are now. Throws what the provider answered, after keeping it on
     * the row (`lastError`, and an operator's note the first time a
     * refusal is seen); the job retries.
     */
    async sync(
        organizationId: string,
        options: { update: boolean },
    ): Promise<string | null> {
        const provider = CATALOGUE_BILLING_PROVIDER;
        const customers = this.providers.get(provider).customers;
        if (!customers?.configured()) {
            // Fine locally and in CI; in production every business goes
            // without a customer until the keys are set.
            const say = `billing_customer_skipped org=${organizationId}: the provider isn't configured here`;
            if (env.NODE_ENV === "production") this.logger.warn(say);
            else this.logger.log(say);
            return null;
        }
        const key = { organizationId_provider: { organizationId, provider } };
        const before = await prisma.billingCustomer.findUnique({ where: key });
        try {
            if (before?.providerCustomerId) {
                if (options.update) {
                    await this.push(organizationId, customers, before);
                }
                return before.providerCustomerId;
            }
            const made = await this.create(organizationId, customers);
            if (made.adopted) {
                // Adopted as the provider had it: bring it up to date.
                const row = await prisma.billingCustomer.findUniqueOrThrow({
                    where: key,
                });
                await this.push(organizationId, customers, row);
            }
            return made.providerCustomerId;
        } catch (error) {
            const said = message(error);
            const refused =
                error instanceof BillingProviderError &&
                error.kind === "REFUSED";
            await prisma.$transaction(async (tx) => {
                await tx.billingCustomer.upsert({
                    where: key,
                    create: { organizationId, provider, lastError: said },
                    update: { lastError: said },
                });
                // Once per refusal: asked again it answers the same.
                if (refused && before?.lastError !== said) {
                    await raiseBillingOpsNoticeInTx(tx, this.logger, {
                        code: "billing_customer_refused",
                        organizationId,
                        refs: {
                            provider,
                            customer: before?.providerCustomerId,
                        },
                        note: `The billing provider refused this business's customer details (${said}), so its customer there may be missing or out of date. Check the business's billing details and its customer in the provider's dashboard.`,
                    });
                }
            });
            throw error;
        }
    }

    /**
     * Its details as they are now. An email and phone another customer has
     * (the owner's other business, saved here since): sent without the
     * phone, which stays withheld from then on.
     */
    private async push(
        organizationId: string,
        customers: ProviderCustomerCapability,
        row: { providerCustomerId: string | null; contactWithheld: boolean },
    ): Promise<void> {
        const id = row.providerCustomerId;
        if (!id) return;
        const details = await billingCustomerOf(organizationId);
        let withheld = row.contactWithheld;
        let answer = await customers.updateCustomer(id, details, {
            withContact: !withheld,
        });
        if (answer === "exists" && !withheld) {
            withheld = true;
            this.logger.warn(
                `billing_customer_contact_withheld org=${organizationId}: another customer has the same email and phone`,
            );
            answer = await customers.updateCustomer(id, details, {
                withContact: false,
            });
        }
        if (answer === "exists") {
            throw new BillingProviderError(
                "REFUSED",
                "the provider has another customer with these details",
            );
        }
        await prisma.billingCustomer.update({
            where: {
                organizationId_provider: {
                    organizationId,
                    provider: CATALOGUE_BILLING_PROVIDER,
                },
            },
            data: {
                syncedAt: new Date(),
                lastError: null,
                contactWithheld: withheld,
            },
        });
    }

    /**
     * Made (or adopted) once: under a lock per business, so sign-up's job
     * and a checkout running together never make two. The lock's
     * transaction only holds the lock: each id the provider answers is
     * stored at once on its own (only where none is stored yet), so a
     * transaction that times out or fails after the provider made the
     * customer never loses it, and a lost answer is healed by the next try
     * finding its own customer by its notes.
     */
    private async create(
        organizationId: string,
        customers: ProviderCustomerCapability,
    ): Promise<{ providerCustomerId: string; adopted: boolean }> {
        const customer = await billingCustomerOf(organizationId);
        return prisma.$transaction(
            async (tx) => {
                // A waiter gives up (and its job retries) rather than
                // holding a connection for the whole timeout.
                await tx.$executeRaw`SET LOCAL lock_timeout = '30s'`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-customer:${organizationId}`}))`;
                const row = await tx.billingCustomer.findUnique({
                    where: {
                        organizationId_provider: {
                            organizationId,
                            provider: CATALOGUE_BILLING_PROVIDER,
                        },
                    },
                });
                if (row?.providerCustomerId) {
                    return {
                        providerCustomerId: row.providerCustomerId,
                        adopted: false,
                    };
                }
                const known = await this.knownCustomer(
                    tx,
                    organizationId,
                    customers,
                );
                if (known) {
                    await this.store(organizationId, known, false);
                    this.logger.log(
                        `billing_customer_adopted org=${organizationId} customer=${known}: made by the provider at an earlier payment`,
                    );
                    return { providerCustomerId: known, adopted: true };
                }
                let withheld = false;
                let made = await customers.createCustomer(customer, {
                    withContact: true,
                });
                if (made === "exists") {
                    const existing = await customers.existingCustomer(
                        customer,
                        { withContact: true },
                    );
                    if (existing.organizationId === organizationId) {
                        // Its own, from a try whose answer was lost.
                        await this.store(
                            organizationId,
                            existing.providerCustomerId,
                            false,
                        );
                        this.logger.log(
                            `billing_customer_adopted org=${organizationId} customer=${existing.providerCustomerId}: its own, from an earlier try`,
                        );
                        return {
                            providerCustomerId: existing.providerCustomerId,
                            adopted: true,
                        };
                    }
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
                await this.store(
                    organizationId,
                    made.providerCustomerId,
                    withheld,
                );
                this.logger.log(
                    `billing_customer_created org=${organizationId} customer=${made.providerCustomerId}`,
                );
                return {
                    providerCustomerId: made.providerCustomerId,
                    adopted: false,
                };
            },
            // Up to three provider calls inside (15 s each); the id is
            // stored as soon as it is answered, outside this transaction.
            { timeout: 60_000, maxWait: 10_000 },
        );
    }

    /**
     * A customer the provider made for this business at an earlier payment
     * (before DEC-165): its subscription's, else its latest checkout's —
     * still at the provider, naming no other business, and held by no
     * other business here.
     */
    private async knownCustomer(
        tx: Pick<
            Prisma.TransactionClient,
            "subscription" | "billingCheckout" | "billingCustomer"
        >,
        organizationId: string,
        customers: ProviderCustomerCapability,
    ): Promise<string | null> {
        const provider = CATALOGUE_BILLING_PROVIDER;
        const [sub, checkout] = await Promise.all([
            tx.subscription.findFirst({
                where: {
                    organizationId,
                    provider,
                    providerCustomerId: { not: null },
                },
                select: { providerCustomerId: true },
            }),
            tx.billingCheckout.findFirst({
                where: {
                    organizationId,
                    provider,
                    providerCustomerId: { not: null },
                },
                orderBy: { createdAt: "desc" },
                select: { providerCustomerId: true },
            }),
        ]);
        const ids = [
            ...new Set(
                [sub?.providerCustomerId, checkout?.providerCustomerId].filter(
                    (id): id is string => Boolean(id),
                ),
            ),
        ];
        for (const id of ids) {
            const held = await tx.billingCustomer.findFirst({
                where: {
                    provider,
                    providerCustomerId: id,
                    organizationId: { not: organizationId },
                },
                select: { id: true },
            });
            if (held) continue;
            const found = await customers.findCustomer(id);
            if (!found) continue;
            if (
                found.organizationId &&
                found.organizationId !== organizationId
            ) {
                continue;
            }
            return id;
        }
        return null;
    }

    /**
     * The id, kept the moment the provider answers it: on its own
     * connection, not the lock's transaction, and only where none is kept.
     */
    private async store(
        organizationId: string,
        providerCustomerId: string,
        contactWithheld: boolean,
    ): Promise<void> {
        const provider = CATALOGUE_BILLING_PROVIDER;
        const data = {
            providerCustomerId,
            contactWithheld,
            syncedAt: new Date(),
            lastError: null,
        };
        const kept = await prisma.billingCustomer.updateMany({
            where: { organizationId, provider, providerCustomerId: null },
            data,
        });
        if (kept.count === 0) {
            await prisma.billingCustomer.createMany({
                data: [{ organizationId, provider, ...data }],
                skipDuplicates: true,
            });
        }
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
    const [party, org] = await Promise.all([
        readBillingParty(prisma, organizationId, owner?.userId ?? null),
        prisma.organization.findUnique({
            where: { id: organizationId },
            select: { slug: true },
        }),
    ]);
    const profile = party.profile;
    return {
        name: billingName(party) ?? party.userName ?? "",
        businessName: party.orgName,
        businessSlug: org?.slug ?? null,
        email: billingEmail(party) ?? givenEmail?.billToEmail ?? null,
        contact: nonEmpty(profile?.phone) ?? givenPhone?.billToPhone ?? null,
        // As on Saroh's invoice: the profile's GSTIN only while the
        // business says it is GST-registered.
        gstin:
            (profile?.gstRegistered ? nonEmpty(profile.taxId) : null) ??
            givenGstin?.billToGstin ??
            null,
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
