import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { env } from "../../env";
import { stateName } from "../invoices/gst-states";
import { raiseBillingOpsNoticeInTx } from "./billing-ops-notice";
import type { BillingProfileSyncPayload } from "./billing-profile-sync";
import { CATALOGUE_BILLING_PROVIDER } from "./provider-plan-sync.service";
import type {
    BillingProviderFactory,
    ProfileCustomer,
    ProviderCustomer,
    ProviderCustomerCapability,
} from "./providers/billing-provider.port";
import {
    BILLING_PROVIDER_FACTORY,
    BillingProviderError,
} from "./providers/billing-provider.port";

/**
 * One customer per billing profile at Saroh's billing provider (DEC-167,
 * which replaces DEC-165's one per business: Razorpay refuses a second
 * customer with the same email and phone, so an owner's second business
 * could never have one).
 *
 * - **Made in the background** by the `billing.profile.sync` job
 *   (`billing-profile-sync.ts`), queued in the transaction that made or
 *   changed the profile; never in its way. Where the provider's keys
 *   aren't set (local, CI) it asks nothing, and the first checkout makes
 *   it.
 * - **Adopted, not made twice**: a profile whose businesses paid before
 *   DEC-165 has a customer the provider made at payment (on their
 *   `Subscription` or latest `BillingCheckout`); it is checked at the
 *   provider and kept, unless another profile already holds it. One the
 *   provider holds for the same email and phone is this profile's when its
 *   notes name it (an earlier try whose answer was lost), or, made per
 *   business before profiles, one of its businesses.
 * - **Kept current**: the same job runs whenever the profile is saved and
 *   sends the legal name, billing email, phone and GSTIN. The address
 *   can't be updated on a customer (its notes are create-only); it stays
 *   on each subscription's or order's notes and on Saroh's invoice.
 * - **Never handed another's**: a profile whose email and phone another
 *   customer has is refused by Razorpay ("already exists"), on a create or
 *   an update: it goes without the phone, which stays in Saroh
 *   (`contactWithheld`). Any other refusal is an operator's note, once,
 *   on each business billed to the profile.
 * - Every checkout, subscription and Saroh invoice copies its id.
 */
export class BillingCustomers {
    constructor(
        private readonly providers: BillingProviderFactory,
        private readonly logger: Pick<Logger, "log" | "warn" | "error">,
    ) {}

    /**
     * The profile's customer id, made now if it has none (a checkout
     * before the profile's job ran). Null for a business with no profile,
     * where the provider isn't configured here, or when it refuses (the
     * checkout goes on without one); a provider that can't answer throws,
     * so the checkout never goes on to have the provider make a second
     * customer of its own.
     */
    async idFor(billingProfileId: string | null): Promise<string | null> {
        if (!billingProfileId) return null;
        try {
            return await this.sync(billingProfileId, { update: false });
        } catch (error) {
            if (
                error instanceof BillingProviderError &&
                error.kind === "REFUSED"
            ) {
                this.logger.warn(
                    `billing_customer_refused profile=${billingProfileId}: ${message(error)}`,
                );
                return null;
            }
            throw error;
        }
    }

    /**
     * Make the profile's customer, or (with `update`) send its details as
     * they are now. Throws what the provider answered, after keeping it on
     * the profile (`lastError`, and an operator's note the first time a
     * refusal is seen); the job retries. Null when there is no such
     * profile, or the provider isn't configured here.
     */
    async sync(
        billingProfileId: string,
        options: { update: boolean },
    ): Promise<string | null> {
        const customers = this.providers.get(
            CATALOGUE_BILLING_PROVIDER,
        ).customers;
        if (!customers?.configured()) {
            // Fine locally and in CI; in production every profile goes
            // without a customer until the keys are set.
            const say = `billing_customer_skipped profile=${billingProfileId}: the provider isn't configured here`;
            if (env.NODE_ENV === "production") this.logger.warn(say);
            else this.logger.log(say);
            return null;
        }
        const before = await prisma.billingProfile.findUnique({
            where: { id: billingProfileId },
            select: {
                providerCustomerId: true,
                contactWithheld: true,
                lastError: true,
            },
        });
        if (!before) return null;
        try {
            if (before.providerCustomerId) {
                if (options.update) {
                    await this.push(billingProfileId, customers, before);
                }
                return before.providerCustomerId;
            }
            const made = await this.create(billingProfileId, customers);
            if (made.adopted) {
                // Adopted as the provider had it: bring it up to date.
                const row = await prisma.billingProfile.findUniqueOrThrow({
                    where: { id: billingProfileId },
                    select: { providerCustomerId: true, contactWithheld: true },
                });
                await this.push(billingProfileId, customers, row);
            }
            return made.providerCustomerId;
        } catch (error) {
            const said = message(error);
            const refused =
                error instanceof BillingProviderError &&
                error.kind === "REFUSED";
            await prisma.$transaction(async (tx) => {
                await tx.billingProfile.updateMany({
                    where: { id: billingProfileId },
                    data: { lastError: said },
                });
                // Once per refusal: asked again it answers the same.
                if (refused && before.lastError !== said) {
                    await this.raiseRefusal(tx, billingProfileId, said, before);
                }
            });
            throw error;
        }
    }

    /** The refusal, on each business billed to the profile. */
    private async raiseRefusal(
        tx: Prisma.TransactionClient,
        billingProfileId: string,
        said: string,
        before: { providerCustomerId: string | null },
    ): Promise<void> {
        const businesses = await tx.organization.findMany({
            where: { billingProfileId, deletedRetainedAt: null },
            select: { id: true },
        });
        if (businesses.length === 0) {
            this.logger.error(
                `billing_customer_refused profile=${billingProfileId}: ${said}`,
            );
            return;
        }
        for (const { id: organizationId } of businesses) {
            await raiseBillingOpsNoticeInTx(tx, this.logger, {
                code: "billing_customer_refused",
                organizationId,
                refs: {
                    provider: CATALOGUE_BILLING_PROVIDER,
                    profile: billingProfileId,
                    customer: before.providerCustomerId,
                },
                note: `The billing provider refused the details of the billing profile this business is billed to (${said}), so its customer there may be missing or out of date. Check the profile's billing details and its customer in the provider's dashboard.`,
            });
        }
    }

    /**
     * Its details as they are now. An email and phone another customer has
     * (saved here since): sent without the phone, which stays withheld from
     * then on.
     */
    private async push(
        billingProfileId: string,
        customers: ProviderCustomerCapability,
        row: { providerCustomerId: string | null; contactWithheld: boolean },
    ): Promise<void> {
        const id = row.providerCustomerId;
        if (!id) return;
        const details = await profileCustomerOf(billingProfileId);
        let withheld = row.contactWithheld;
        let answer = await customers.updateCustomer(id, details, {
            withContact: !withheld,
        });
        if (answer === "exists" && !withheld) {
            withheld = true;
            this.logger.warn(
                `billing_customer_contact_withheld profile=${billingProfileId}: another customer has the same email and phone`,
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
        await prisma.billingProfile.update({
            where: { id: billingProfileId },
            data: {
                syncedAt: new Date(),
                lastError: null,
                contactWithheld: withheld,
            },
        });
    }

    /**
     * Made (or adopted) once: under a lock per profile, so its job and a
     * checkout running together never make two. The lock's transaction
     * only holds the lock: each id the provider answers is stored at once
     * on its own (only where none is stored yet), so a transaction that
     * times out or fails after the provider made the customer never loses
     * it, and a lost answer is healed by the next try finding its own
     * customer by its notes.
     */
    private async create(
        billingProfileId: string,
        customers: ProviderCustomerCapability,
    ): Promise<{ providerCustomerId: string; adopted: boolean }> {
        const customer = await profileCustomerOf(billingProfileId);
        return prisma.$transaction(
            async (tx) => {
                // A waiter gives up (and its job retries) rather than
                // holding a connection for the whole timeout.
                await tx.$executeRaw`SET LOCAL lock_timeout = '30s'`;
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-profile:${billingProfileId}`}))`;
                const row = await tx.billingProfile.findUnique({
                    where: { id: billingProfileId },
                    select: { providerCustomerId: true },
                });
                if (row?.providerCustomerId) {
                    return {
                        providerCustomerId: row.providerCustomerId,
                        adopted: false,
                    };
                }
                const businesses = (
                    await tx.organization.findMany({
                        where: { billingProfileId },
                        select: { id: true },
                    })
                ).map((o) => o.id);
                const known = await this.knownCustomer(
                    tx,
                    billingProfileId,
                    businesses,
                    customers,
                );
                if (known) {
                    await this.store(billingProfileId, known, false);
                    this.logger.log(
                        `billing_customer_adopted profile=${billingProfileId} customer=${known}: made by the provider at an earlier payment`,
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
                    if (
                        isOwn(existing, billingProfileId, businesses) &&
                        !(await heldByAnother(
                            tx,
                            billingProfileId,
                            existing.providerCustomerId,
                        ))
                    ) {
                        // Its own, from a try whose answer was lost (or one
                        // of its businesses', made before profiles).
                        await this.store(
                            billingProfileId,
                            existing.providerCustomerId,
                            false,
                        );
                        this.logger.log(
                            `billing_customer_adopted profile=${billingProfileId} customer=${existing.providerCustomerId}: its own, from an earlier try`,
                        );
                        return {
                            providerCustomerId: existing.providerCustomerId,
                            adopted: true,
                        };
                    }
                    // Another's (same email and phone, e.g. another
                    // owner's profile billed to the same person): this one
                    // is made without the phone.
                    withheld = true;
                    this.logger.warn(
                        `billing_customer_contact_withheld profile=${billingProfileId}: another customer has the same email and phone`,
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
                    billingProfileId,
                    made.providerCustomerId,
                    withheld,
                );
                this.logger.log(
                    `billing_customer_created profile=${billingProfileId} customer=${made.providerCustomerId}`,
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
     * A customer the provider made for one of the profile's businesses at
     * an earlier payment (before DEC-165): a subscription's, else a latest
     * checkout's — still at the provider, its notes naming no other profile
     * or business, and held by no other profile here.
     */
    private async knownCustomer(
        tx: Pick<
            Prisma.TransactionClient,
            "subscription" | "billingCheckout" | "billingProfile"
        >,
        billingProfileId: string,
        businesses: string[],
        customers: ProviderCustomerCapability,
    ): Promise<string | null> {
        if (businesses.length === 0) return null;
        const provider = CATALOGUE_BILLING_PROVIDER;
        const where = {
            organizationId: { in: businesses },
            provider,
            providerCustomerId: { not: null },
        };
        const [subs, checkouts] = await Promise.all([
            tx.subscription.findMany({
                where,
                orderBy: { createdAt: "asc" },
                select: { providerCustomerId: true },
            }),
            tx.billingCheckout.findMany({
                where,
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { providerCustomerId: true },
            }),
        ]);
        const ids = [
            ...new Set(
                [...subs, ...checkouts]
                    .map((r) => r.providerCustomerId)
                    .filter((id): id is string => Boolean(id)),
            ),
        ];
        for (const id of ids) {
            if (await heldByAnother(tx, billingProfileId, id)) continue;
            const found = await customers.findCustomer(id);
            if (!found) continue;
            if (
                (found.billingProfileId || found.organizationId) &&
                !isOwn(found, billingProfileId, businesses)
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
        billingProfileId: string,
        providerCustomerId: string,
        contactWithheld: boolean,
    ): Promise<void> {
        await prisma.billingProfile.updateMany({
            where: { id: billingProfileId, providerCustomerId: null },
            data: {
                providerCustomerId,
                contactWithheld,
                syncedAt: new Date(),
                lastError: null,
            },
        });
    }
}

/**
 * Whether a provider's customer is this profile's: its notes name the
 * profile, or (made per business before profiles, naming no profile) one
 * of the businesses billed to it.
 */
function isOwn(
    found: ProviderCustomer,
    billingProfileId: string,
    businesses: string[],
): boolean {
    if (found.billingProfileId) {
        return found.billingProfileId === billingProfileId;
    }
    return (
        found.organizationId !== null &&
        businesses.includes(found.organizationId)
    );
}

async function heldByAnother(
    tx: Pick<Prisma.TransactionClient, "billingProfile">,
    billingProfileId: string,
    providerCustomerId: string,
): Promise<boolean> {
    const held = await tx.billingProfile.findFirst({
        where: {
            provider: CATALOGUE_BILLING_PROVIDER,
            providerCustomerId,
            id: { not: billingProfileId },
        },
        select: { id: true },
    });
    return held !== null;
}

/**
 * Who the profile's customer is: its legal name, billing email, phone,
 * GSTIN and address; its owner, and the first business billed to it (its
 * name and address, for the customer's notes).
 */
export async function profileCustomerOf(
    billingProfileId: string,
): Promise<ProfileCustomer> {
    const profile = await prisma.billingProfile.findUniqueOrThrow({
        where: { id: billingProfileId },
        select: {
            ownerUserId: true,
            legalName: true,
            gstin: true,
            gstState: true,
            addressLine1: true,
            addressLine2: true,
            city: true,
            postalCode: true,
            billingEmail: true,
            phone: true,
            organizations: {
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { name: true, slug: true },
            },
        },
    });
    // None yet: a profile made before any business is billed to it.
    const first = profile.organizations.length
        ? profile.organizations[0]
        : null;
    return {
        name: profile.legalName,
        businessName: first?.name ?? null,
        businessSlug: first?.slug ?? null,
        email: profile.billingEmail,
        contact: profile.phone,
        gstin: profile.gstin,
        address: profile.addressLine1
            ? {
                  line1: profile.addressLine1,
                  line2: profile.addressLine2,
                  city: profile.city,
                  state: stateName(profile.gstState),
                  postalCode: profile.postalCode,
              }
            : null,
        billingProfileId,
        ownerUserId: profile.ownerUserId,
    };
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : "unknown error";
}

/**
 * Run a sync for the job: a provider that can't answer is retried by the
 * queue; a refusal won't change by asking again (the next save of the
 * profile, or the next checkout, tries again).
 */
async function syncForJob(
    customers: BillingCustomers,
    logger: Logger,
    job: Job,
    billingProfileId: string,
): Promise<void> {
    try {
        await customers.sync(billingProfileId, { update: true });
    } catch (error) {
        const refused =
            error instanceof BillingProviderError && error.kind === "REFUSED";
        logger.error(
            `billing_customer_sync_failed profile=${billingProfileId} attempt=${job.attempts + 1}/${job.maxAttempts}: ${message(error)}`,
        );
        if (refused) return;
        throw error;
    }
}

/** The `billing.profile.sync` job: make the profile's customer, or update it. */
@Injectable()
export class BillingProfileSyncHandler {
    private readonly logger = new Logger(BillingProfileSyncHandler.name);
    private readonly customers: BillingCustomers;

    constructor(
        @Inject(BILLING_PROVIDER_FACTORY)
        providers: BillingProviderFactory,
    ) {
        this.customers = new BillingCustomers(providers, this.logger);
    }

    readonly handle = async (job: Job): Promise<void> => {
        const payload = (job.payload ??
            {}) as Partial<BillingProfileSyncPayload>;
        const billingProfileId = payload.billingProfileId;
        if (typeof billingProfileId !== "string" || !billingProfileId) {
            this.logger.error(`billing_profile_bad_job job=${job.id}`);
            return;
        }
        // A profile gone with its owner has nothing to send (`sync`).
        await syncForJob(this.customers, this.logger, job, billingProfileId);
    };
}

/**
 * DEC-165's `billing.customer.sync` job, still registered so jobs queued
 * before profiles (and an operator's Sync again) run: it syncs the
 * profile the business is billed to, and does nothing for a business
 * without one.
 */
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
            select: { deletedRetainedAt: true, billingProfileId: true },
        });
        if (!org || org.deletedRetainedAt || !org.billingProfileId) return;
        await syncForJob(
            this.customers,
            this.logger,
            job,
            org.billingProfileId,
        );
    };
}
