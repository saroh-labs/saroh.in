import { Injectable, Logger, Optional } from "@nestjs/common";

import { AnalyticsService } from "./analytics.service";
import {
    FIRST_BOOKING_CREATED_TYPE,
    FIRST_CUSTOMER_CREATED_TYPE,
    FIRST_ORDER_CREATED_TYPE,
    FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE,
    FIRST_PLAN_UPGRADED_TYPE,
    FIRST_PRODUCT_CREATED_TYPE,
    FIRST_SERVICE_CREATED_TYPE,
    FIRST_SITE_PUBLISHED_TYPE,
    IMPORT_COMPLETED_TYPE,
    MODULE_ENABLED_TYPE,
    ONBOARDING_COMPLETED_TYPE,
    ORGANIZATION_CREATED_TYPE,
} from "./event-contract";
import { ProductMilestones } from "./product-milestones";

/**
 * Activation instrumentation (#176, and the last open line of #119).
 *
 * `PRODUCT_STRATEGY.md` §23 requires every feature to answer "How will we know
 * whether it works?" — and for onboarding and activation nothing could, because
 * the three existing event contracts all describe something a merchant's
 * CUSTOMER did. This observes the merchant's own path instead.
 *
 * Two properties do the real work here:
 *
 * **Emitting never fails the operation.** A merchant's order must not fail
 * because an analytics row could not be written. Every method swallows its
 * error and logs it; callers are not expected to await or handle failure. This
 * is the one place in the codebase where discarding an error is correct, so it
 * is stated rather than left to be inferred.
 *
 * **"First" is decided by the ledger, not the caller.** The `first.*` events use
 * a deterministic `dedupeKey` of `type:organizationId`, and `record()` treats a
 * duplicate key as an idempotent no-op. So a caller emits on EVERY create and
 * only the first is ever stored — no caller has to query "have they made one
 * before?", and no race between two concurrent creates can record two firsts.
 *
 * **The ledger is also the source of the product milestones sent to PostHog**
 * (DEC-125). When `record()` says a row was stored, not replayed,
 * `ProductMilestones` is told its type; it sends the matching milestone once
 * and never holds this up. So a milestone can't be sent twice for a
 * business, and nothing here knows about PostHog.
 */
@Injectable()
export class ActivationEvents {
    private readonly logger = new Logger(ActivationEvents.name);

    constructor(
        private readonly analytics: AnalyticsService,
        @Optional() private readonly milestones?: ProductMilestones,
    ) {}

    /** t0 of the funnel. Once per Organization, ever. */
    organizationCreated(organizationId: string): Promise<void> {
        return this.emitOnce(organizationId, ORGANIZATION_CREATED_TYPE, {});
    }

    /**
     * The goal picker was finished or skipped. `moduleCount` of 0 is a skip,
     * which is a legitimate and interesting outcome rather than a missing event.
     */
    onboardingCompleted(
        organizationId: string,
        moduleCount: number,
    ): Promise<void> {
        return this.emitOnce(organizationId, ONBOARDING_COMPLETED_TYPE, {
            moduleCount,
        });
    }

    /** A capability switched on. Deduped per module, not per Organization. */
    moduleEnabled(organizationId: string, moduleKey: string): Promise<void> {
        return this.emit(
            organizationId,
            MODULE_ENABLED_TYPE,
            { moduleKey },
            `${MODULE_ENABLED_TYPE}:${organizationId}:${moduleKey}`,
        );
    }

    /** First-value milestones. Safe to call on every create — see the class note. */
    firstProductCreated(
        organizationId: string,
        productId: string,
    ): Promise<void> {
        return this.emitOnce(organizationId, FIRST_PRODUCT_CREATED_TYPE, {
            productId,
        });
    }

    firstCustomerCreated(
        organizationId: string,
        customerId: string,
    ): Promise<void> {
        return this.emitOnce(organizationId, FIRST_CUSTOMER_CREATED_TYPE, {
            customerId,
        });
    }

    firstOrderCreated(organizationId: string, orderId: string): Promise<void> {
        return this.emitOnce(organizationId, FIRST_ORDER_CREATED_TYPE, {
            orderId,
        });
    }

    /**
     * The Appointments path's first value. An organization that only takes
     * appointments produced no first-value event at all before this, so the
     * funnel under-counted that whole path rather than reporting zero.
     */
    firstBookingCreated(
        organizationId: string,
        bookingId: string,
    ): Promise<void> {
        return this.emitOnce(organizationId, FIRST_BOOKING_CREATED_TYPE, {
            bookingId,
        });
    }

    /**
     * The product funnel's other firsts (DEC-125). Safe to call on every
     * create, publish, connect and completed checkout, as the ones above
     * are: only the first is stored. Each carries an id or a key, never a
     * credential or a price.
     */
    firstServiceCreated(
        organizationId: string,
        serviceId: string,
    ): Promise<void> {
        return this.emitOnce(organizationId, FIRST_SERVICE_CREATED_TYPE, {
            serviceId,
        });
    }

    firstSitePublished(organizationId: string, siteId: string): Promise<void> {
        return this.emitOnce(organizationId, FIRST_SITE_PUBLISHED_TYPE, {
            siteId,
        });
    }

    /** `provider` is the provider's name ("RAZORPAY"), never a key of theirs. */
    firstPaymentProviderConnected(
        organizationId: string,
        provider: string,
    ): Promise<void> {
        return this.emitOnce(
            organizationId,
            FIRST_PAYMENT_PROVIDER_CONNECTED_TYPE,
            { provider },
        );
    }

    /** A checkout for a paid plan completed. `planKey` is the plan's key. */
    firstPlanUpgraded(organizationId: string, planKey: string): Promise<void> {
        return this.emitOnce(organizationId, FIRST_PLAN_UPGRADED_TYPE, {
            planKey,
        });
    }

    /**
     * An import finished. NOT deduped — every import is worth counting, and the
     * properties are counts only: no file name, no row contents. An import file
     * is full of customer data and none of it belongs in an analytics ledger.
     */
    importCompleted(
        organizationId: string,
        counts: {
            entity: string;
            created: number;
            updated: number;
            failed: number;
        },
    ): Promise<void> {
        return this.emit(organizationId, IMPORT_COMPLETED_TYPE, counts, null);
    }

    // ------------------------------------------------------------------

    /** Emit at most one of this type per Organization, ever. */
    private emitOnce(
        organizationId: string,
        type: string,
        properties: Record<string, unknown>,
    ): Promise<void> {
        return this.emit(
            organizationId,
            type,
            properties,
            `${type}:${organizationId}`,
        );
    }

    private async emit(
        organizationId: string,
        type: string,
        properties: Record<string, unknown>,
        dedupeKey: string | null,
    ): Promise<void> {
        try {
            const stored = await this.analytics.record({
                organizationId,
                type,
                properties,
                dedupeKey,
                // Server-produced and about the merchant's own use of Saroh, so
                // there is no visitor to hash and no consent basis to carry.
                visitorHash: null,
            });
            // Stored for the first time, not a replay: the one moment a
            // product milestone may be sent (DEC-125). Returns at once.
            if (!stored.deduped) {
                this.milestones?.ledgerStored(type, organizationId);
            }
        } catch (err) {
            // Deliberate: instrumentation must never fail the business
            // operation that triggered it. Logged so a broken contract is
            // visible rather than silent.
            this.logger.warn(
                `Could not record ${type} for organization ${organizationId}: ${
                    err instanceof Error ? err.message : String(err)
                }`,
            );
        }
    }
}
