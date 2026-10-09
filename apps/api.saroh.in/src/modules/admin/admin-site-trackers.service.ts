import {
    ConflictException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { enqueuePageRevalidation } from "../sites/page-cache-revalidate";
import { OrganizationLifecycleStatus } from "./admin-access.service";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import type { OperatorCommand } from "./admin-lifecycle.service";
import { requireReason } from "./admin-lifecycle.service";
import { AdminPermission } from "./admin-permissions";

type Tx = Prisma.TransactionClient;

export interface SiteTrackersCommand extends OperatorCommand {
    siteId: string;
}

/** One site of a business, as the business page's Trackers panel shows it. */
export interface SiteTrackersRow {
    id: string;
    name: string;
    subdomain: string | null;
    /** Trackers the merchant has on (they load only while not switched off). */
    trackersOn: number;
    switchedOff: {
        at: Date;
        reason: string | null;
        byUserId: string | null;
    } | null;
}

/**
 * Staff kill switch for a site's trackers (#897, plan U9, R10).
 *
 * Switching off writes `switchedOffAt` on the site's `SiteTrackingSettings`:
 * from then the public head read serves no tracker, whatever the plan, and
 * the merchant can't add or turn one on (`TRACKERS_SWITCHED_OFF`). Only
 * staff switch it back on. The merchant can still edit or remove theirs.
 *
 * Runs with no organization context, like every admin write, so the table's
 * `org_isolation` policy takes its permissive branch; the site is always
 * looked up by id AND organization, so a path naming one business's site
 * under another business is a 404. Every change is written to the admin
 * ledger with its reason in the same transaction, and to the business's own
 * history as Saroh support (without the reason, which is staff's).
 */
@Injectable()
export class AdminSiteTrackersService {
    constructor(private readonly audit: AdminAuditService) {}

    async switchOff(command: SiteTrackersCommand) {
        const reason = requireReason(command.reason);
        const now = new Date();
        return prisma.$transaction(async (tx) => {
            const site = await this.siteOrThrow(tx, command);
            const settings = await tx.siteTrackingSettings.findFirst({
                where: {
                    siteId: site.id,
                    organizationId: command.organizationId,
                },
                select: { switchedOffAt: true },
            });
            if (settings?.switchedOffAt) {
                return { ok: true, changed: false, switchedOff: true };
            }

            const off = {
                switchedOffAt: now,
                switchedOffByStaffId: command.staff.userId,
                switchedOffReason: reason,
            };
            await tx.siteTrackingSettings.upsert({
                where: { siteId: site.id },
                create: {
                    siteId: site.id,
                    organizationId: command.organizationId,
                    ...off,
                },
                update: off,
            });
            await this.record(tx, command, reason, site, "off");
            // Saroh's switch takes effect on the next visit, not when a
            // kept page runs out (#863, DEC-108).
            await enqueuePageRevalidation(tx, {
                cause: "trackers",
                siteIds: [site.id],
            });
            return { ok: true, changed: true, switchedOff: true };
        });
    }

    async switchOn(command: SiteTrackersCommand) {
        const reason = requireReason(command.reason);
        return prisma.$transaction(async (tx) => {
            const site = await this.siteOrThrow(tx, command);
            const updated = await tx.siteTrackingSettings.updateMany({
                where: {
                    siteId: site.id,
                    organizationId: command.organizationId,
                    switchedOffAt: { not: null },
                },
                data: {
                    switchedOffAt: null,
                    switchedOffByStaffId: null,
                    switchedOffReason: null,
                },
            });
            if (updated.count === 0) {
                return { ok: true, changed: false, switchedOff: false };
            }
            await this.record(tx, command, reason, site, "on");
            await enqueuePageRevalidation(tx, {
                cause: "trackers",
                siteIds: [site.id],
            });
            return { ok: true, changed: true, switchedOff: false };
        });
    }

    private async siteOrThrow(tx: Tx, command: SiteTrackersCommand) {
        const organization = await tx.organization.findUnique({
            where: { id: command.organizationId },
            select: { id: true, lifecycleStatus: true },
        });
        if (!organization) {
            throw new NotFoundException("Organization not found");
        }
        if (
            organization.lifecycleStatus ===
            OrganizationLifecycleStatus.DeletedRetained
        ) {
            throw new ConflictException("This business has been deleted.");
        }
        const site = await tx.site.findFirst({
            where: {
                id: command.siteId,
                organizationId: command.organizationId,
            },
            select: { id: true, name: true },
        });
        if (!site) throw new NotFoundException("Site not found");
        return site;
    }

    private async record(
        tx: Tx,
        command: SiteTrackersCommand,
        reason: string,
        site: { id: string; name: string },
        to: "off" | "on",
    ) {
        const action =
            to === "off"
                ? "site.trackers.switched-off"
                : "site.trackers.switched-on";
        await this.audit.write(tx, {
            actorUserId: command.staff.userId,
            permission: AdminPermission.OrganizationTrackersWrite,
            action,
            targetType: "site",
            targetId: site.id,
            organizationId: command.organizationId,
            reason,
            outcome: AdminAuditOutcome.Success,
            metadata: { siteName: site.name },
        });
        // The business's own history, attributed to the operator (DEC-035).
        await tx.auditEvent.create({
            data: {
                action,
                actorUserId: command.staff.userId,
                organizationId: command.organizationId,
                targetType: "site",
                targetId: site.id,
                outcome: "SUCCESS",
                metadata: { byOperator: true },
            },
        });
    }
}

/**
 * CROSS-TENANT READ, behind the business page's support session: each site
 * of one business with its tracker switch. Returns no tracker ids or codes,
 * only how many are on.
 */
export async function siteTrackerStates(
    organizationId: string,
): Promise<SiteTrackersRow[]> {
    const [sites, settings, trackers] = await Promise.all([
        prisma.site.findMany({
            where: { organizationId },
            select: { id: true, name: true, subdomain: true },
            orderBy: { createdAt: "asc" },
            take: 50,
        }),
        prisma.siteTrackingSettings.findMany({
            where: { organizationId },
            select: {
                siteId: true,
                switchedOffAt: true,
                switchedOffReason: true,
                switchedOffByStaffId: true,
            },
        }),
        prisma.siteTracker.groupBy({
            by: ["siteId"],
            where: { organizationId, enabled: true },
            _count: { _all: true },
        }),
    ]);
    const bySite = new Map(settings.map((row) => [row.siteId, row]));
    const counts = new Map(
        trackers.map((row) => [row.siteId, row._count._all]),
    );
    return sites.map((site) => {
        const s = bySite.get(site.id);
        return {
            id: site.id,
            name: site.name,
            subdomain: site.subdomain,
            trackersOn: counts.get(site.id) ?? 0,
            switchedOff: s?.switchedOffAt
                ? {
                      at: s.switchedOffAt,
                      reason: s.switchedOffReason,
                      byUserId: s.switchedOffByStaffId,
                  }
                : null,
        };
    });
}
