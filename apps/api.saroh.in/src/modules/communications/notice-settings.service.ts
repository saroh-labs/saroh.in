import {
    BadRequestException,
    ConflictException,
    Injectable,
} from "@nestjs/common";
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
import type { OverdueTiming } from "./overdue-timing";
import {
    isDefaultTiming,
    overdueSays,
    overdueTiming,
    overdueTimingProblem,
} from "./overdue-timing";

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
    /**
     * When it goes, for the kinds the business times itself: overdue
     * reminders' days and hours (DEC-178, #1169). Null for every other.
     */
    timing: OverdueTiming | null;
}

/** `GET /organizations/:id/customer-notices/settings`. */
export interface NoticeSettingsView {
    /** Only the kinds whose module is on, in `NOTICE_KINDS`' order. */
    notices: NoticeSettingView[];
    /** Whether this person may change them (`comms:manage`). */
    canChange: boolean;
    /**
     * Whether the business has its own email provider connected. Without
     * one none of these reach a customer's inbox, and the workspace says
     * so once (DEC-011).
     */
    emailConnected: boolean;
}

/** One switch flipped. */
export interface NoticeSettingChange {
    kind: NoticeKind;
    on: boolean;
}

/** The words for the timing's fields in Activity (the audit row). */
const TIMING_FIELDS: Record<keyof OverdueTiming, string> = {
    firstDay: "firstReminderDay",
    secondDay: "secondReminderDay",
    fromHour: "remindFromHour",
    untilHour: "remindUntilHour",
};

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
 * - **Overdue reminders' timing** (DEC-178, #1169) is read with the switch
 *   and written on its own ({@link updateOverdueTiming}), by the same
 *   rules: `comms:manage`, a row only while it differs from the default,
 *   and an audit entry under the same action and kind.
 */
@Injectable()
export class NoticeSettingsService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        private readonly audit: AuditService,
    ) {}

    async read(ctx: OrganizationContext): Promise<NoticeSettingsView> {
        const [{ offers, emailConnected }, stored, timing] = await Promise.all([
            this.listed(ctx),
            this.stored(ctx.organizationId),
            overdueTiming(prisma, ctx.organizationId),
        ]);
        return {
            emailConnected,
            notices: offers.map(({ kind, offer }) => {
                const reason = offer.offered ? null : offer.why;
                const timed = kind === "OVERDUE_REMINDERS";
                return {
                    kind,
                    ...NOTICE_WORDS[kind],
                    ...(timed ? { says: overdueSays(timing) } : {}),
                    on: settingOn(stored, kind),
                    default: defaultOn(kind),
                    offered: offer.offered,
                    reason,
                    why: reason ? NOTICE_UNAVAILABLE_WORDS[reason] : null,
                    timing: timed ? timing : null,
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
        const listed = (await this.listed(ctx)).offers.find(
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

    /**
     * When overdue reminders go (DEC-178, #1169): the days after the due
     * date and the hours, all four at once, so an Undo puts back exactly
     * what was there. `comms:manage`; refused while overdue reminders are
     * not offered (409), and in words when the four don't fit together
     * (400). Saved whether the switch is on or off, for when it is.
     */
    async updateOverdueTiming(
        ctx: OrganizationContext,
        timing: OverdueTiming,
    ): Promise<NoticeSettingsView> {
        authorize(ctx, "comms:manage");
        const listed = (await this.listed(ctx)).offers.find(
            (o) => o.kind === "OVERDUE_REMINDERS",
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
        const problem = overdueTimingProblem(timing);
        if (problem) throw new BadRequestException(problem);

        const organizationId = ctx.organizationId;
        const next: OverdueTiming = {
            firstDay: timing.firstDay,
            secondDay: timing.secondDay,
            fromHour: timing.fromHour,
            untilHour: timing.untilHour,
        };
        const before = await overdueTiming(prisma, organizationId);
        if (isDefaultTiming(next)) {
            await prisma.overdueReminderTiming.deleteMany({
                where: { organizationId },
            });
        } else {
            await prisma.overdueReminderTiming.upsert({
                where: { organizationId },
                create: {
                    organizationId,
                    ...next,
                    updatedByUserId: ctx.userId,
                },
                update: { ...next, updatedByUserId: ctx.userId },
            });
        }

        const changes = recordableChanges(
            (Object.keys(TIMING_FIELDS) as (keyof OverdueTiming)[]).map(
                (key) => ({
                    field: TIMING_FIELDS[key],
                    before: before[key],
                    after: next[key],
                }),
            ),
        );
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
                    kind: "OVERDUE_REMINDERS",
                    changes: changes as unknown as Prisma.InputJsonArray,
                },
            });
        }
        return this.read(ctx);
    }

    /**
     * The kinds listed for this business, whether each can change, and
     * whether it has its own email connected.
     */
    private async listed(ctx: OrganizationContext) {
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
        const offers = NOTICE_KINDS.flatMap((kind) => {
            const offer = noticeOffer(kind, has);
            return offer ? [{ kind, offer, ...offer }] : [];
        });
        return { offers, emailConnected: has.emailConnected };
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
