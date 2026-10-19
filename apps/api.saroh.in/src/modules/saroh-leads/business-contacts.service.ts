import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import { outsideOrgContext, prisma } from "@saroh/database";

import type { PlatformAdminInfo } from "../../common/decorators/platform-admin-context.decorator";
import {
    AdminAuditOutcome,
    AdminAuditService,
} from "../admin/admin-audit.service";
import { AdminPermission } from "../admin/admin-permissions";
import { assertMaySeeOrganization, scopeForStaff } from "../admin/staff-scope";
import { CONTACT_SELECT } from "./lead-access";
import type { ContactKind } from "./lead-rules";
import { longTextOrNull } from "./lead-rules";
import type { LeadContact } from "./lead-views";
import { contactView } from "./lead-views";

export interface LogBusinessContactInput {
    kind: ContactKind;
    summary: string;
    feedback?: string | null;
    minutes?: number | null;
    /** When it happened; now when left out. */
    happenedAt?: string | null;
}

/**
 * A call, visit or message with a business a teammate looks after (DEC-169,
 * admin console U22): the same contact log a lead keeps
 * (`SarohContactLog`, U20), on the business instead. It needs
 * `saroh-leads:write`, scoped by `scopeForStaff`: an Account manager logs
 * only with a business whose open manager link names them (another's is a
 * 403); Support and Platform owner with any. Kept with the logger's name,
 * on the ledger against the business, with no words of the call in its
 * metadata.
 */
@Injectable()
export class SarohBusinessContactsService {
    constructor(private readonly audit: AdminAuditService) {}

    async log(
        staff: PlatformAdminInfo,
        organizationId: string,
        input: LogBusinessContactInput,
    ): Promise<LeadContact> {
        const scope = scopeForStaff(staff, AdminPermission.SarohLeadsWrite);
        const summary = longTextOrNull(input.summary);
        if (!summary) throw new BadRequestException("Say what was said.");
        const now = new Date();
        const happenedAt = input.happenedAt ? new Date(input.happenedAt) : now;
        if (Number.isNaN(happenedAt.getTime()) || happenedAt > now) {
            throw new BadRequestException(
                "When it happened can't be later than now.",
            );
        }
        await assertMaySeeOrganization(scope, organizationId);

        return outsideOrgContext(() =>
            prisma.$transaction(async (tx) => {
                const business = await tx.organization.findUnique({
                    where: { id: organizationId },
                    select: { id: true },
                });
                if (!business)
                    throw new NotFoundException("Business not found");
                const row = await tx.sarohContactLog.create({
                    data: {
                        organizationId: business.id,
                        platformAdminId: staff.platformAdminId,
                        actorUserId: staff.userId,
                        kind: input.kind,
                        happenedAt,
                        minutes: input.minutes ?? null,
                        summary,
                        feedback: longTextOrNull(input.feedback),
                    },
                    select: CONTACT_SELECT,
                });
                await this.audit.write(tx, {
                    actorUserId: staff.userId,
                    permission: AdminPermission.SarohLeadsWrite,
                    action: "business.contact-logged",
                    targetType: "organization",
                    targetId: business.id,
                    organizationId: business.id,
                    outcome: AdminAuditOutcome.Success,
                    metadata: { kind: input.kind, contactLogId: row.id },
                });
                return contactView(row);
            }),
        );
    }
}
