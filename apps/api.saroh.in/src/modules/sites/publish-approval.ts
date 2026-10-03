import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import {
    AuditAction,
    AuditOutcome,
    auditMetadata,
} from "../audit/audit.service";
import { planMeter } from "../billing/metering.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";

/**
 * "Publishing needs approval" (DEC-071, R10, KTD-11; amends DEC-047).
 *
 * A site setting, off by default. Off, approval is advisory, as DEC-047 has
 * it: going live past an open review is recorded as a bypass, never
 * prevented. On, Publish and restore are refused, and Go live succeeds only
 * for an approved test release. An owner can still go live without one,
 * and that override is written down three ways: the publication's route,
 * an OVERRIDDEN approval row, and an audit event.
 *
 * Only an owner turns the setting on or off, and only an owner overrides.
 * Letting an admin switch it off would be an override with no record.
 *
 * The enforcement itself is in `putLive` (`live-pointer.ts`), the one path
 * that repoints a site, so no way of going live can skip it.
 */

export const APPROVAL_REQUIRED_MESSAGE =
    "This site goes live only from an approved test release.";
export const OVERRIDE_OWNER_ONLY_MESSAGE =
    "Only an owner can go live without approval.";
export const APPROVAL_SETTING_OWNER_ONLY_MESSAGE =
    "Only an owner can change whether publishing needs approval.";
export const APPROVAL_SETTING_UNAVAILABLE_MESSAGE =
    "Publishing needs approval works with test releases, which aren't on for this business yet.";

/** The 409 for going live without the approval the setting asks for. */
export function approvalRequired(): ConflictException {
    return new ConflictException({
        message: APPROVAL_REQUIRED_MESSAGE,
        details: { code: "APPROVAL_REQUIRED", reason: "approvalRequired" },
    });
}

/**
 * Whether the caller is an owner of the business. A role the business
 * invented is never one, however much it may do, and nor is a Saroh
 * operator acting for the business.
 */
export function isOwner(ctx: Pick<OrganizationContext, "role" | "roleKey">) {
    return (ctx.roleKey ?? ctx.role) === "OWNER";
}

/** `override` is an owner's alone (KTD-11): 403 from anyone else. */
export function assertOverrideAllowed(
    ctx: Pick<OrganizationContext, "role" | "roleKey">,
    override: boolean | undefined,
): void {
    if (override === true && !isOwner(ctx)) {
        throw new ForbiddenException(OVERRIDE_OWNER_ONLY_MESSAGE);
    }
}

// Stateless (it reads the flag rows on every call), as `sells-from.ts` has it.
const flags = new FeatureFlagService();

/**
 * Whether test releases are on for the business (`SITE_TEST_RELEASES`).
 * The setting can't be turned on without them: with it on and no releases,
 * nothing could go live but an owner's override.
 */
export function testReleasesOn(organizationId: string): Promise<boolean> {
    return flags.isEnabled(FlagKey.SITE_TEST_RELEASES, organizationId);
}

/**
 * Turn "Publishing needs approval" on or off, inside the caller's
 * transaction. Owner only (403), and turning it on needs test releases
 * (409). A change is recorded as an audit event; saving the value it
 * already has writes nothing.
 *
 * Turning it on doesn't cancel a scheduled go-live: the job checks again
 * when it runs (KTD-14), and goes live then only if the release is approved
 * or an owner scheduled it past approval.
 */
export async function setPublishNeedsApproval(
    tx: Pick<Prisma.TransactionClient, "site" | "auditEvent">,
    ctx: OrganizationContext,
    siteId: string,
    on: boolean,
): Promise<void> {
    if (!isOwner(ctx)) {
        throw new ForbiddenException(APPROVAL_SETTING_OWNER_ONLY_MESSAGE);
    }
    const site = await tx.site.findUniqueOrThrow({
        where: { id: siteId },
        select: { publishNeedsApproval: true },
    });
    if (site.publishNeedsApproval === on) return;
    // Reviewing changes before they go live is a plan row (U13): turning it
    // on is refused where the plan leaves it off; turning it off never is.
    if (on) await planMeter.assertIncluded(ctx.organizationId, "review");
    if (on && !(await testReleasesOn(ctx.organizationId))) {
        throw new ConflictException({
            message: APPROVAL_SETTING_UNAVAILABLE_MESSAGE,
            details: { reason: "testReleasesOff" },
        });
    }
    await tx.site.update({
        where: { id: siteId },
        data: { publishNeedsApproval: on },
        select: { id: true },
    });
    await tx.auditEvent.create({
        data: {
            action: on
                ? AuditAction.SitePublishApprovalOn
                : AuditAction.SitePublishApprovalOff,
            actorUserId: ctx.userId,
            organizationId: ctx.organizationId,
            targetType: "site",
            targetId: siteId,
            outcome: AuditOutcome.Success,
            metadata: auditMetadata(ctx.roleKey, { from: !on, to: on }),
        },
        select: { id: true },
    });
}
