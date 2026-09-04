import { Module } from "@nestjs/common";

import { ActivationEvents } from "./activation-events";
import { AnalyticsService } from "./analytics.service";

/**
 * The analytics write primitives, on their own.
 *
 * Recording an event is not an analytics *feature* — it is something the domain
 * modules need in order to instrument themselves (#176). Reaching it through
 * the full {@link AnalyticsModule} would drag in that module's controllers, its
 * job handler and its `forwardRef` to `OrganizationsModule`, which is how a
 * genuine cycle gets created: `OrganizationsModule` would have to import
 * Analytics to record `organization.created`, while Analytics already reaches
 * back to Organizations for the org guard.
 *
 * `AnalyticsService` has no DI dependencies (its rate limiter is a per-instance
 * default), so extracting it into a module that imports NOTHING breaks that
 * cycle at its cause rather than papering over it with `forwardRef` on both
 * sides — the same move, for the same reason, as
 * {@link OrganizationContextModule}.
 *
 * `AnalyticsModule` re-exports this, so existing consumers are unaffected.
 */
@Module({
    providers: [AnalyticsService, ActivationEvents],
    exports: [AnalyticsService, ActivationEvents],
})
export class AnalyticsCoreModule {}
