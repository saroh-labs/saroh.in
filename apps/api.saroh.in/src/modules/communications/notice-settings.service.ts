import { ConflictException, Injectable } from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { recordableChanges } from "../audit/audit-changes";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { ModuleAvailabilityService } from "../capabilities/module-availability.service";
import type { ModuleKey } from "../capabilities/module-registry";
import { allows, authorize } from "../organizations/organization-policy";
import type { NoticeKind, NoticeUnavailable } from "./notice-settings";
import {
    defaultOn,
    NOTICE_KINDS,
    NOTICE_MODULE,
    NOTICE_UNAVAILABLE_WORDS,
    NOTICE_WORDS,
    noticeOffer,
    settingOn,
} from "./notice-settings";

/** One switch, as the workspace draws it. */
export interface NoticeSettingView {
    kind: NoticeKind;
    /** What it is called, and what it sends. */
    label: string;
    says: string;
    /** Whether the business sends it. */
    on: boolean;
    /** Whether it is sent when the business has never chosen. */
    default: boolean;
    /** Whether the business can change it now. */
    offered: boolean;
    /** Why it can't, when it can't: a code and the words. */
    reason: NoticeUnavailable | null;
    why: string | null;
}

/** `GET /organizations/:id/customer-notices/settings`. */
export interface NoticeSettingsView {
    /** Only the kinds whose module is on, in `NOTICE_KINDS`' order. */
    notices: NoticeSettingView[];
    /** Whether this person may change them (`comms:manage`). */
    canChange: boolean;
}

/** One switch flipped. */
export interface NoticeSettingChange {
    kind: NoticeKind;
    on: boolean;
}

/**
 * The business's switches for its automatic customer notices (DEC-174,
 * U1 #1132), read and written. The rules are `notice-settings.ts`.
 *
 * - **Reading** is open to anyone in the business, so a Member sees what
 *   is sent and that they can't change it (`canChange`).
 * - **Writing** needs `comms:manage`, as the rest of Settings › Providers.
 *   A kind not offered (its module off, or the enquiry reply with no email
 *   provider) is refused in words (409), so a stale screen can't change
 *   something it no longer shows.
 * - **A write equal to the default deletes the row**, as
 *   `NotificationPreference` does.
 * - **Every change** writes a settings-audit entry
 *   (`customer-notices.setting`).
 */
@Injectable()
export class NoticeSettingsService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        private readonly audit: AuditService,
    ) {}

    async read(ctx: OrganizationContext): Promise<NoticeSettingsView> {
        const [offers, stored] = await Promise.all([
            this.offers(ctx),
            this.stored(ctx.organizationId),
        ]);
        return {
            notices: offers.map(({ kind, offer }) => {
                const reason = offer.offered ? null : offer.why;
                return {
                    kind,
                    ...NOTICE_WORDS[kind],
                    on: settingOn(stored, kind),
                    default: defaultOn(kind),
                    offered: offer.offered,
                    reason,
                    why: reason ? NOTICE_UNAVAILABLE_WORDS[reason] : null,
                };
            }),
            canChange: allows(ctx, "comms:manage"),
        };
    }

    async update(
        ctx: OrganizationContext,
        change: NoticeSettingChange,
    ): Promise<NoticeSettingsView> {
        authorize(ctx, "comms:manage");
        const listed = (await this.offers(ctx)).find(
            (o) => o.kind === change.kind,
        );
        if (!listed) {
            throw new ConflictException(
                "That email isn't one this business sends.",
            );
        }
        if (!listed.offered) {
            throw new ConflictException(
                `${NOTICE_UNAVAILABLE_WORDS[listed.why]}.`,
            );
        }

        const organizationId = ctx.organizationId;
        const before = settingOn(
            await this.stored(organizationId),
            change.kind,
        );
        const key = { organizationId, kind: change.kind };
        if (change.on === defaultOn(change.kind)) {
            await prisma.customerNoticeSetting.deleteMany({ where: key });
        } else {
            await prisma.customerNoticeSetting.upsert({
                where: { organizationId_kind: key },
                create: {
                    ...key,
                    enabled: change.on,
                    updatedByUserId: ctx.userId,
                },
                update: { enabled: change.on, updatedByUserId: ctx.userId },
            });
        }

        const changes = recordableChanges([
            { field: "noticeOn", before, after: change.on },
        ]);
        if (changes.length > 0) {
            await this.audit.record({
                action: AuditAction.CustomerNoticesSetting,
                actorUserId: ctx.userId,
                actorRoleKey: ctx.roleKey,
                organizationId,
                targetType: "organization",
                targetId: organizationId,
                outcome: AuditOutcome.Success,
                metadata: {
                    kind: change.kind,
                    changes: changes as unknown as Prisma.InputJsonArray,
                },
            });
        }
        return this.read(ctx);
    }

    /** The kinds listed for this business, and whether each can change. */
    private async offers(ctx: OrganizationContext) {
        const modules = [
            ...new Set(
                NOTICE_KINDS.map((k) => NOTICE_MODULE[k]).filter(
                    (m): m is ModuleKey => m !== null,
                ),
            ),
        ];
        const [states, provider] = await Promise.all([
            Promise.all(
                modules.map(
                    async (key) =>
                        [key, await this.moduleOn(ctx, key)] as const,
                ),
            ),
            prisma.communicationProvider.findUnique({
                where: {
                    organizationId_channel: {
                        organizationId: ctx.organizationId,
                        channel: "EMAIL",
                    },
                },
                select: { status: true },
            }),
        ]);
        const on = new Map(states);
        const has = {
            moduleOn: (key: ModuleKey) => on.get(key) === true,
            emailConnected: provider?.status === "CONNECTED",
        };
        return NOTICE_KINDS.flatMap((kind) => {
            const offer = noticeOffer(kind, has);
            return offer ? [{ kind, offer, ...offer }] : [];
        });
    }

    /**
     * On for the business and rolled out to it. Whether this person may
     * use the module is not asked: the switches are the business's.
     */
    private async moduleOn(
        ctx: OrganizationContext,
        key: ModuleKey,
    ): Promise<boolean> {
        const a = await this.availability.evaluate({
            organizationId: ctx.organizationId,
            moduleKey: key,
            organizationRole: ctx.role,
            organizationActions: ctx.actions,
        });
        return a.rolloutAllowed && a.configured && a.entitled;
    }

    private stored(organizationId: string) {
        return prisma.customerNoticeSetting.findMany({
            where: { organizationId },
            select: { kind: true, enabled: true },
        });
    }
}
