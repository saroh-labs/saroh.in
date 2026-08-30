import { Injectable, Logger } from "@nestjs/common";

import { AnalyticsService } from "./analytics.service";
import {
    FIRST_CUSTOMER_CREATED_TYPE,
    FIRST_ORDER_CREATED_TYPE,
    FIRST_PRODUCT_CREATED_TYPE,
    IMPORT_COMPLETED_TYPE,
    MODULE_ENABLED_TYPE,
    ONBOARDING_COMPLETED_TYPE,
    ORGANIZATION_CREATED_TYPE,
} from "./event-contract";

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
 */
@Injectable()
export class ActivationEvents {
    private readonly logger = new Logger(ActivationEvents.name);

    constructor(private readonly analytics: AnalyticsService) {}

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
            await this.analytics.record({
                organizationId,
                type,
                properties,
                dedupeKey,
                // Server-produced and about the merchant's own use of Saroh, so
                // there is no visitor to hash and no consent basis to carry.
                visitorHash: null,
            });
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
