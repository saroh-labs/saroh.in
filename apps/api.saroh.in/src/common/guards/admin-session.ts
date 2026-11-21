import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";
import type { IncomingHttpHeaders } from "node:http";

import { env } from "../../env";
import type { AdminAuditInput } from "../../modules/admin/admin-audit.service";
import { createAdminAuditData } from "../../modules/admin/admin-audit.service";
import { AdminPermission } from "../../modules/admin/admin-permissions";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const HOUR_MS = 60 * 60 * 1000;

/** What `/admin` re-sign-in refusals carry; the console keys on it. */
export const REAUTH_REQUIRED = "reauth_required";

/**
 * Admin writes a stolen or stale session must not reach (review A2): each
 * needs a session signed in within `ADMIN_STEP_UP_MAX_AGE_MINUTES`.
 */
export const STEP_UP_PERMISSIONS: ReadonlySet<AdminPermission> = new Set([
    AdminPermission.StaffGrant,
    AdminPermission.TeamWrite,
    AdminPermission.OrganizationPeopleWrite,
    AdminPermission.PeopleSignInHelp,
    AdminPermission.FlagsPublish,
    AdminPermission.SubscriptionOverride,
    AdminPermission.PricingOverride,
    AdminPermission.PricingPublish,
    AdminPermission.DeploymentsRun,
    AdminPermission.OrganizationLifecycleWrite,
    AdminPermission.OrganizationLegalHoldLift,
    AdminPermission.CommissionRates,
    AdminPermission.SarohBillingAct,
    AdminPermission.AiSettingsWrite,
    // Review F10: money (a 100%-off coupon, prices), what a business can
    // use, mail sent in Saroh's name, replays and retries, and opening a
    // support session onto a business's personal data.
    AdminPermission.CouponsManage,
    AdminPermission.PricingEdit,
    AdminPermission.OrganizationModulesWrite,
    AdminPermission.WaitlistInvite,
    AdminPermission.WebhooksReplay,
    AdminPermission.JobsRetry,
    AdminPermission.OrganizationViewAs,
    // Review A5 (21 Nov): a payout marked paid can't be undone, an account
    // manager gets a business's data, a tracker switched back on loads
    // third-party code on a merchant's page, and a search page goes public.
    AdminPermission.TeamPay,
    AdminPermission.AccountsAssign,
    AdminPermission.OrganizationTrackersWrite,
    AdminPermission.SearchPagesPublish,
]);

export function isMutating(method: string | undefined): boolean {
    return MUTATING.has((method ?? "").toUpperCase());
}

/**
 * A7: an `/admin` write must say where it came from. `BetterAuthGuard`
 * refuses an untrusted Origin; here a write with none, and no browser
 * same-site marker, is refused too.
 */
export function assertAdminWriteOrigin(
    method: string | undefined,
    headers: IncomingHttpHeaders | undefined,
): void {
    if (!isMutating(method)) return;
    const site = headers?.["sec-fetch-site"];
    if (headers?.origin || headers?.referer) return;
    if (site === "same-origin" || site === "same-site") return;
    throw new ForbiddenException("Admin changes need a request origin");
}

/** Refuse a session signed in more than `maxMinutes` ago (401, re-sign-in). */
export function assertSessionFresh(
    session: { createdAt?: Date | string } | undefined,
    maxMinutes: number,
    now = Date.now(),
): void {
    const created = session?.createdAt ? new Date(session.createdAt) : null;
    if (created && now - created.getTime() <= maxMinutes * 60_000) return;
    throw new UnauthorizedException({
        message: "Sign in again to continue in the admin console.",
        details: { reason: REAUTH_REQUIRED },
    });
}

// Number(...) || default: under SKIP_ENV_VALIDATION the value arrives raw and
// the schema's defaults are gone, which refused every admin session.
export const adminSessionMaxAge = () =>
    Number(env.ADMIN_SESSION_MAX_AGE_MINUTES) || 720;
export const adminStepUpMaxAge = () =>
    Number(env.ADMIN_STEP_UP_MAX_AGE_MINUTES) || 60;

/**
 * Write a ledger row unless one with the same action already exists for
 * `dedupe` (a session, or a user within the last hour), so a looping caller
 * cannot flood the ledger. Best effort: never the request's failure.
 */
export async function auditOnce(
    input: AdminAuditInput,
    dedupe: { sessionId: string } | { actorUserId: string; withinMs?: number },
): Promise<void> {
    try {
        const where: Prisma.AdminAuditEventWhereInput =
            "sessionId" in dedupe
                ? { action: input.action, sessionId: dedupe.sessionId }
                : {
                      action: input.action,
                      actorUserId: dedupe.actorUserId,
                      createdAt: {
                          gt: new Date(
                              Date.now() - (dedupe.withinMs ?? HOUR_MS),
                          ),
                      },
                  };
        const seen = await prisma.adminAuditEvent.findFirst({
            where,
            select: { id: true },
        });
        if (seen) return;
        await prisma.adminAuditEvent.create({
            data: createAdminAuditData(input),
        });
    } catch {
        // The ledger is not the gate: a failed write never opens or closes it.
    }
}
