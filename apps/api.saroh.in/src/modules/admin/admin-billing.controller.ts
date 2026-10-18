import { Get, Header, Param, Query, StreamableFile } from "@nestjs/common";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import { PlatformAdminContext } from "../../common/decorators/platform-admin-context.decorator";
import { RequireAdminPermission } from "../../common/decorators/require-admin-permission.decorator";
import { AdminAuditOutcome, AdminAuditService } from "./admin-audit.service";
import {
    ExportSarohInvoicesDto,
    ListSarohInvoicesDto,
    ListSarohSubscriptionsDto,
} from "./admin-billing.dto";
import { AdminBillingService } from "./admin-billing.service";
import { AdminPermission } from "./admin-permissions";
import { AdminRoutes } from "./admin-routes.decorator";

/**
 * Admin › Billing (DEC-163): every invoice Saroh issued and every business's
 * Saroh subscription. Read-only. Every route needs `saroh-billing:read`
 * (Platform Owners and Billing), which the service checks again, and every
 * read is recorded on the admin ledger: invoices carry a business's billing
 * name, GSTIN and address.
 *
 * No support-access session: these are Saroh's own documents about the
 * business, not the business's own data, and the list spans every business.
 */
@AdminRoutes()
export class AdminBillingController {
    constructor(
        private readonly billing: AdminBillingService,
        private readonly adminAudit: AdminAuditService,
    ) {}

    @Get("billing/invoices")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    async listInvoices(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ListSarohInvoicesDto,
    ) {
        const page = await this.billing.listInvoices(staff, query);
        await this.read(staff, "billing.invoices.list", "saroh_invoice", {
            metadata: { ...filters(query), resultCount: page.items.length },
        });
        return page;
    }

    /** One month's invoices as a CSV for GST filing. Declared before `:id`. */
    @Get("billing/invoices/export")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    @Header("Cache-Control", "no-store")
    async exportInvoices(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ExportSarohInvoicesDto,
    ): Promise<StreamableFile> {
        const { csv, fileName, count } = await this.billing.exportInvoices(
            staff,
            query,
        );
        await this.read(staff, "billing.invoices.export", "saroh_invoice", {
            metadata: { ...filters(query), resultCount: count },
        });
        const file = Buffer.from(csv, "utf8");
        return new StreamableFile(file, {
            type: "text/csv; charset=utf-8",
            disposition: `attachment; filename="${fileName}"`,
            length: file.length,
        });
    }

    @Get("billing/invoices/:invoiceId/pdf")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    @Header("Cache-Control", "no-store")
    async invoicePdf(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("invoiceId") invoiceId: string,
    ): Promise<StreamableFile> {
        const { file, fileName, organizationId } =
            await this.billing.invoicePdf(staff, invoiceId);
        await this.read(staff, "billing.invoice.pdf", "saroh_invoice", {
            targetId: invoiceId,
            organizationId,
        });
        return new StreamableFile(file, {
            type: "application/pdf",
            disposition: `attachment; filename="${fileName}"`,
            length: file.length,
        });
    }

    @Get("billing/subscriptions")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    async listSubscriptions(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Query() query: ListSarohSubscriptionsDto,
    ) {
        const page = await this.billing.listSubscriptions(staff, query);
        await this.read(staff, "billing.subscriptions.list", "subscription", {
            metadata: { ...filters(query), resultCount: page.items.length },
        });
        return page;
    }

    @Get("billing/subscriptions/:subscriptionId")
    @RequireAdminPermission(AdminPermission.SarohBillingRead)
    async subscription(
        @PlatformAdminContext() staff: PlatformAdminInfo,
        @Param("subscriptionId") subscriptionId: string,
    ) {
        const detail = await this.billing.subscriptionDetail(
            staff,
            subscriptionId,
        );
        await this.read(staff, "billing.subscription.read", "subscription", {
            targetId: subscriptionId,
            organizationId: detail.subscription.organization.id,
        });
        return detail;
    }

    /** A successful read on the admin ledger; an audit outage is logged. */
    private read(
        staff: PlatformAdminInfo,
        action: string,
        targetType: string,
        extra: {
            targetId?: string;
            organizationId?: string;
            metadata?: Record<string, unknown>;
        },
    ) {
        return this.adminAudit.recordRead({
            actorUserId: staff.userId,
            permission: AdminPermission.SarohBillingRead,
            action,
            targetType,
            outcome: AdminAuditOutcome.Success,
            ...extra,
        });
    }
}

/** The filters asked for, for the ledger (no search text: it may be a name). */
function filters(query: object): Record<string, unknown> {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(query)) {
        if (key === "q") {
            if (value) kept.searched = true;
        } else if (value !== undefined) {
            kept[key] = value;
        }
    }
    return kept;
}
