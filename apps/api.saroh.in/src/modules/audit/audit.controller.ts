import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { OrgContext } from "../../common/decorators/org-context.decorator";
import { BetterAuthGuard } from "../../common/guards/better-auth.guard";
import { OrganizationGuard } from "../../common/guards/organization.guard";
import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";
import { AuditService, parseAuditActions } from "./audit.service";

/**
 * Read access to an Organization's immutable audit stream (S1-009).
 *
 * The stream is append-only: there is intentionally NO write, update, or delete
 * endpoint here — events are emitted internally by `AuditService.record` at the
 * sensitive call sites, never by an HTTP client.
 *
 * `GET /organizations/:organizationId/audit` is double-guarded — `BetterAuthGuard`
 * authenticates and `OrganizationGuard` resolves an authorized
 * `OrganizationContext` — then `authorize(ctx, "audit:read")` restricts reads to
 * OWNER/ADMIN via the central policy (a MEMBER or non-member is rejected 403).
 *
 * `actions` (comma-separated) narrows the stream to those actions; unknown
 * ones are ignored. Each event names its actor and, for a membership or an
 * invitation, its target, as they are now.
 */
@Controller("organizations/:organizationId/audit")
@UseGuards(BetterAuthGuard, OrganizationGuard)
export class AuditController {
    constructor(private readonly audit: AuditService) {}

    @Get()
    list(
        @OrgContext() ctx: OrganizationContext,
        @Query("limit") limit?: string,
        @Query("cursor") cursor?: string,
        @Query("actions") actions?: string,
    ) {
        // Audit logs are sensitive: only OWNER/ADMIN may read them.
        authorize(ctx, "audit:read");
        return this.audit.listForOrganization(ctx.organizationId, {
            limit: limit ? Number(limit) : undefined,
            // An absent query param is already `undefined`; the service treats
            // an empty-string cursor as "no cursor" too.
            cursor,
            actions: parseAuditActions(actions),
        });
    }
}
