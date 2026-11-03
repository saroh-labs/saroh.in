import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, NotFoundException } from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";

interface EditionRequest {
    platformAdmin: PlatformAdminInfo;
    params?: Record<string, string | undefined>;
}

/**
 * The business a route's path names, for the params that name one across the
 * console. A BillingAction has no relation, so it reads its `organizationId`.
 */
async function editionBehindPath(
    params: Record<string, string | undefined>,
): Promise<string | null | undefined> {
    const { organizationId, invoiceId, subscriptionId, actionId, domainId } =
        params;
    const edition = { select: { edition: true } } as const;
    if (organizationId) {
        const row = await prisma.organization.findUnique({
            where: { id: organizationId },
            select: { edition: true },
        });
        return row?.edition;
    }
    if (invoiceId) {
        const row = await prisma.sarohInvoice.findUnique({
            where: { id: invoiceId },
            select: { organization: edition },
        });
        return row?.organization.edition;
    }
    if (subscriptionId) {
        const row = await prisma.subscription.findUnique({
            where: { id: subscriptionId },
            select: { organization: edition },
        });
        return row?.organization.edition;
    }
    if (domainId) {
        const row = await prisma.domain.findUnique({
            where: { id: domainId },
            select: { organization: edition },
        });
        return row?.organization.edition;
    }
    if (actionId) {
        const action = await prisma.billingAction.findUnique({
            where: { id: actionId },
            select: { organizationId: true },
        });
        if (!action?.organizationId) return undefined;
        const row = await prisma.organization.findUnique({
            where: { id: action.organizationId },
            select: { edition: true },
        });
        return row?.edition;
    }
    return undefined;
}

/**
 * A console reaches only its own edition's businesses (DEC-204 item 6): a path
 * naming another edition's is a 404, as any cross-tenant read is. A row that
 * doesn't exist passes, so the route answers its own 404.
 */
@Injectable()
export class AdminEditionGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<EditionRequest>();
        const served = request.platformAdmin?.edition;
        if (!served || !request.params) return true;
        const params = request.params;
        const edition = await outsideOrgContext(() =>
            editionBehindPath(params),
        );
        if (edition && edition !== served) {
            throw new NotFoundException("Business not found");
        }
        return true;
    }
}
