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
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { FlagKey } from "../feature-flags/flags";
import { allows } from "../organizations/organization-policy";
import type {
    AlertChannel,
    AlertEvent,
    ChannelState,
} from "./alert-preferences";
import {
    ALERT_CHANNELS,
    ALERT_EVENTS,
    ALERT_MODULE,
    alertOn,
    channelState,
    defaultOn,
    mayHearAbout,
} from "./alert-preferences";

/** One row of the grid: whether each channel is on for this person. */
export interface AlertRowView {
    key: AlertEvent;
    channels: Record<AlertChannel, boolean>;
}

/** `GET /organizations/:id/me/alerts`. */
export interface AlertPreferencesView {
    /** Only the rows this person is offered, in the design's order. */
    alerts: AlertRowView[];
    /** What each channel can do for them here; an unavailable one reads as off. */
    channels: Record<AlertChannel, ChannelState>;
    /** They may connect a provider themselves (Settings › Providers). */
    canConnect: boolean;
}

/** One switch flipped. */
export interface AlertChange {
    alert: AlertEvent;
    channel: AlertChannel;
    on: boolean;
}

/**
 * Each person's alerts (round-2 F14, R13): which things reach them, and by
 * which channel. Always the signed-in person's own, in the active business:
 * the user id is the context's, never one the caller sent, so nobody can
 * read or change someone else's (no capability is asked — it is theirs).
 *
 * - **Rows** are offered only when the person's role reads what they are
 *   about (`ALERT_READS`) and the module they belong to is on for the
 *   business and rolled out to it (DEC-057: a module that is rolled out
 *   off is never named). The Website row also needs `SITE_TEST_RELEASES`
 *   (a scheduled go-live, a business without test releases is not told
 *   of) or a verified custom domain of the business's own (#917: one that
 *   stops working is told on it), so nobody hears on a row they can't
 *   turn off.
 * - **Channels** are only what can deliver: the bell to someone who sees
 *   the inbox, email through the business's own connected provider
 *   (DEC-011), and WhatsApp never — Saroh keeps no WhatsApp number for a
 *   team member. There is no SMS.
 * - **Defaults** are code; a row is kept only while a choice differs from
 *   its default, so a switch put back removes it.
 * - **Every change** writes a settings-audit entry (`member.alerts.update`).
 */
@Injectable()
export class NotificationPreferencesService {
    constructor(
        private readonly availability: ModuleAvailabilityService,
        private readonly audit: AuditService,
        private readonly flags: FeatureFlagService,
    ) {}

    async read(ctx: OrganizationContext): Promise<AlertPreferencesView> {
        const [offered, channels, stored] = await Promise.all([
            this.offeredEvents(ctx),
            this.channelStates(ctx),
            this.stored(ctx),
        ]);
        return {
            alerts: offered.map((key) => ({
                key,
                channels: Object.fromEntries(
                    ALERT_CHANNELS.map((channel) => [
                        channel,
                        channels[channel].available &&
                            alertOn(stored, key, channel),
                    ]),
                ) as Record<AlertChannel, boolean>,
            })),
            channels,
            canConnect: allows(ctx, "comms:manage"),
        };
    }

    /**
     * Flip one switch. Refused (409, in words) for a row this person isn't
     * offered or a channel that can't deliver, so a stale screen can't turn
     * on something that would never arrive.
     */
    async update(
        ctx: OrganizationContext,
        change: AlertChange,
    ): Promise<AlertPreferencesView> {
        const [offered, channels] = await Promise.all([
            this.offeredEvents(ctx),
            this.channelStates(ctx),
        ]);
        if (!offered.includes(change.alert)) {
            throw new ConflictException(
                "That alert isn't one you can choose here.",
            );
        }
        const state = channels[change.channel];
        if (!state.available) {
            throw new ConflictException(unavailableMessage(change.channel));
        }

        const where = {
            organizationId_userId_event_channel: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                event: change.alert,
                channel: change.channel,
            },
        };
        const before = alertOn(
            await this.stored(ctx),
            change.alert,
            change.channel,
        );
        if (change.on === defaultOn(change.alert, change.channel)) {
            await prisma.notificationPreference.deleteMany({
                where: where.organizationId_userId_event_channel,
            });
        } else {
            await prisma.notificationPreference.upsert({
                where,
                create: {
                    ...where.organizationId_userId_event_channel,
                    enabled: change.on,
                },
                update: { enabled: change.on },
            });
        }

        const changes = recordableChanges([
            { field: "alertOn", before, after: change.on },
        ]);
        if (changes.length > 0) {
            await this.audit.record({
                action: AuditAction.MemberAlertsUpdate,
                actorUserId: ctx.userId,
                actorRoleKey: ctx.roleKey,
                organizationId: ctx.organizationId,
                targetType: "member",
                targetId: ctx.userId,
                outcome: AuditOutcome.Success,
                metadata: {
                    alert: change.alert,
                    channel: change.channel,
                    changes: changes as unknown as Prisma.InputJsonArray,
                },
            });
        }
        return this.read(ctx);
    }

    /** The rows this person is offered. */
    private async offeredEvents(
        ctx: OrganizationContext,
    ): Promise<AlertEvent[]> {
        const has = (action: Parameters<typeof allows>[1]) =>
            allows(ctx, action);
        const readable = ALERT_EVENTS.filter((e) =>
            mayHearAbout(e, has, ctx.roleKey),
        );
        const modules = [
            ...new Set(
                readable
                    .map((e) => ALERT_MODULE[e])
                    .filter((m): m is string => m !== null),
            ),
        ];
        const on = new Map(
            await Promise.all(
                modules.map(
                    async (key) =>
                        [key, await this.moduleOn(ctx, key)] as const,
                ),
            ),
        );
        const website =
            readable.includes("site") && (await this.websiteRowOn(ctx));
        return readable.filter((e) => {
            if (e === "site" && !website) return false;
            const module = ALERT_MODULE[e];
            return module === null || on.get(module) === true;
        });
    }

    /**
     * Whether the Website row has anything to tell this business: test
     * releases on (a scheduled go-live), or a verified custom domain
     * (#917). The domain is asked only when the flag is off.
     */
    private async websiteRowOn(ctx: OrganizationContext): Promise<boolean> {
        if (
            await this.flags.isEnabled(
                FlagKey.SITE_TEST_RELEASES,
                ctx.organizationId,
            )
        ) {
            return true;
        }
        const domains = await prisma.domain.count({
            where: { organizationId: ctx.organizationId, status: "VERIFIED" },
        });
        return domains > 0;
    }

    /**
     * On for the business and rolled out to it. Who may use it is the row's
     * own reads, asked above, so the module's authorization gate isn't.
     */
    private async moduleOn(
        ctx: OrganizationContext,
        key: string,
    ): Promise<boolean> {
        const a = await this.availability.evaluate({
            organizationId: ctx.organizationId,
            moduleKey: key as ModuleKey,
            organizationRole: ctx.role,
            organizationActions: ctx.actions,
        });
        return a.rolloutAllowed && a.configured && a.entitled;
    }

    private async channelStates(
        ctx: OrganizationContext,
    ): Promise<Record<AlertChannel, ChannelState>> {
        // Only WhatsApp asks after a provider: email alerts come from Saroh
        // (DEC-011, amended 2026-10-07), whatever the business connected.
        const whatsapp = await prisma.communicationProvider.findMany({
            where: {
                organizationId: ctx.organizationId,
                status: "CONNECTED",
                channel: "WHATSAPP",
            },
            select: { channel: true },
        });
        const input = {
            seesInbox: allows(ctx, "notification:read"),
            whatsappConnected: whatsapp.some((p) => p.channel === "WHATSAPP"),
        };
        return Object.fromEntries(
            ALERT_CHANNELS.map((channel) => [
                channel,
                channelState({ ...input, channel }),
            ]),
        ) as Record<AlertChannel, ChannelState>;
    }

    private stored(ctx: OrganizationContext) {
        return prisma.notificationPreference.findMany({
            where: { organizationId: ctx.organizationId, userId: ctx.userId },
            select: { event: true, channel: true, enabled: true },
        });
    }
}

/** Why a channel can't be switched on, as the person reads it. */
function unavailableMessage(channel: AlertChannel): string {
    switch (channel) {
        case "bell":
            return "Your role doesn't see the bell in this business.";
        case "email":
            return "Alerts can't be sent to you by email.";
        case "whatsapp":
            return "Alerts can't be sent to you on WhatsApp.";
    }
}
