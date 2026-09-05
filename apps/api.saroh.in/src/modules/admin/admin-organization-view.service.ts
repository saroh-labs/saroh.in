import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

/**
 * What a support-access session is allowed to see about one Organization.
 *
 * Shape, not contents: how much of each thing exists and what state the
 * workspace is in. No customer, contact, order line, message or site body.
 */
export interface OrganizationSupportView {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    lifecycleStatus: string;
    suspendedAt: Date | null;
    deletionScheduledAt: Date | null;
    counts: {
        members: number;
        stores: number;
        projects: number;
        teams: number;
        sites: number;
        orders: number;
        openOrders: number;
        bookings: number;
        contacts: number;
    };
    /** Module keys currently ENABLED for this Organization. */
    enabledModules: string[];
}

/**
 * The per-tenant support read surface — deliberately NOT part of
 * `AdminMetricsService`.
 *
 * That service reads across every tenant and is restricted to aggregates for
 * exactly that reason; its own comment says per-tenant inspection must stay "a
 * separate, explicitly-audited surface rather than something this quietly grows
 * into". This is that surface, and the separation is the point: reaching it
 * requires an open, reason-bound, read-only access session
 * (`OrganizationAccessSessionGuard`), and every read is written to the admin
 * audit ledger.
 *
 * It returns counts and lifecycle state only. A support engineer answering
 * "is their Commerce module on?" or "did their site ever publish?" needs the
 * shape of the workspace, not its contents — and the contents are the customer
 * data the tenant trusted Saroh with. Widening this beyond counts is a product
 * decision, not a convenience.
 */
@Injectable()
export class AdminOrganizationViewService {
    async view(organizationId: string): Promise<OrganizationSupportView> {
        const organization = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: {
                id: true,
                name: true,
                slug: true,
                createdAt: true,
                lifecycleStatus: true,
                suspendedAt: true,
                deletionScheduledAt: true,
            },
        });

        if (!organization) {
            throw new NotFoundException("Organization not found");
        }

        const where = { organizationId };

        const [
            members,
            stores,
            projects,
            teams,
            sites,
            orders,
            openOrders,
            bookings,
            contacts,
            moduleRows,
        ] = await Promise.all([
            prisma.membership.count({ where }),
            prisma.store.count({ where }),
            prisma.project.count({ where }),
            prisma.team.count({ where }),
            prisma.site.count({ where }),
            prisma.order.count({ where }),
            prisma.order.count({
                where: { ...where, status: { in: ["PENDING", "PROCESSING"] } },
            }),
            prisma.booking.count({ where }),
            prisma.contact.count({ where }),
            prisma.organizationModule.findMany({
                where: { ...where, status: "ENABLED" },
                select: { moduleKey: true },
                orderBy: { moduleKey: "asc" },
            }),
        ]);

        return {
            ...organization,
            counts: {
                members,
                stores,
                projects,
                teams,
                sites,
                orders,
                openOrders,
                bookings,
                contacts,
            },
            enabledModules: moduleRows.map((row) => row.moduleKey),
        };
    }
}
