import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import { outsideOrgContext, prisma, runInOrgContext } from "@saroh/database";
import { randomUUID } from "node:crypto";

import { appBase } from "../../common/app-url";
import type { OrganizationContext } from "../../common/types/organization-context";
import { env } from "../../env";
import {
    AuditAction,
    AuditOutcome,
    AuditService,
} from "../audit/audit.service";
import { holdXactLock } from "../billing/xact-lock";
import { GOOGLE_BUSY_FRESH_MS } from "../bookings/staff-availability";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { assertWithinReach } from "../organizations/organization-members.service";
import { authorize } from "../organizations/organization-policy";
import { apiBase } from "../payments/webhook-setup";
import type { SealedConnection } from "./calendar-access";
import { accessTokenFor, SEALED_CONNECTION } from "./calendar-access";
import {
    accountsAllowed,
    assertCalendarPlan,
    overAllowance,
    pausedBecause,
} from "./calendar-allowed";
import { scheduleBusy } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import { CalendarReleaseService } from "./calendar-release.service";
import type { ConnectState, StateRefusal } from "./connect-state";
import {
    newNonce,
    signState,
    STATE_TTL_MS,
    verifyState,
} from "./connect-state";
import type {
    CalendarAccountView,
    CalendarStatusView,
    ChooseCalendarsDto,
    ConnectStartView,
    DisconnectView,
    GoogleCalendarOptionView,
} from "./dto";
import {
    bookingsCalendarChoices,
    calendarReads,
    takeOrRefuse,
} from "./google-changes";
import type {
    GoogleCalendarEntry,
    GoogleCalendarPort,
} from "./google/google-calendar.port";
import {
    GOOGLE_CALENDAR,
    grantedParts,
    isGoogleError,
} from "./google/google-calendar.port";
import { businessMeetAccess } from "./meet-access";
import { queueCalendarSyncs } from "./queue-sync";
import { sealToken, tokenColumns } from "./sealing";

/** Where Google sends the person back to, on the API. */
export const CALLBACK_PATH = "/integrations/google-calendar/callback";
/** Where the API then sends them, in the app: their calendar settings (the next round's screen). */
export const RETURN_PATH = "/settings/google-calendar";

/** A connection that counts: one Saroh holds a token for, or should (reconnect). */
const LIVE = ["CONNECTED", "LAPSED"];

/** Who is connecting: their membership and their place on the diary. */
interface Person {
    membershipId: string;
    staffId: string;
}

/** A consent's state is good once: its nonce is kept here until used (GC-15). */
const stateKey = (nonce: string) => `google-calendar-state:${nonce}`;

/** How a callback ended, for the app's address. */
export type CallbackOutcome =
    | "connected"
    | "partial"
    | "denied"
    | StateRefusal
    | "someone-else"
    | "refused"
    /** Another Google account past the plan's allowance (DEC-233). */
    | "limit"
    | "failed";

/**
 * A person's own Google Calendar in one business (#1047, U4): start the
 * consent, take Google's answer, show the connection, choose calendars,
 * and disconnect. Every step asks the `GOOGLE_CALENDAR` flag, the plan's
 * `integrations` row (Free locked) and `calendar:connect-own`, and needs
 * the person on the diary (someone without a login can't be connected:
 * nobody can sign in to Google for them).
 *
 * Once connected, the same checks keep applying (`calendar-allowed.ts`):
 * a connection that is no longer allowed reads PAUSED and stops syncing.
 * Disconnecting needs only a membership (GC-03): the person can always
 * stop it, and anyone who may change their role can stop it for them.
 */
@Injectable()
export class CalendarConnectService {
    private readonly logger = new Logger(CalendarConnectService.name);

    constructor(
        @Optional()
        @Inject(GOOGLE_CALENDAR)
        private readonly google: GoogleCalendarPort | null,
        private readonly flags: FeatureFlagService,
        private readonly lapses: CalendarLapseService,
        private readonly releases: CalendarReleaseService,
        @Optional()
        private readonly audit: AuditService = new AuditService(),
    ) {}

    async start(ctx: OrganizationContext): Promise<ConnectStartView> {
        const { google, person } = await this.gate(ctx);
        const redirectUri = this.redirectUri(ctx);
        const user = await prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { email: true },
        });
        // Only the latest consent is good (L6): a script starting over and
        // over can't fill the table.
        await prisma.verification.deleteMany({
            where: {
                identifier: { startsWith: stateKey("") },
                value: ctx.userId,
            },
        });
        const nonce = newNonce();
        const state = signState(
            {
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
                userId: ctx.userId,
            },
            new Date(),
            nonce,
        );
        await prisma.verification.create({
            data: {
                id: randomUUID(),
                identifier: stateKey(nonce),
                value: ctx.userId,
                expiresAt: new Date(Date.now() + STATE_TTL_MS),
            },
        });
        return {
            url: google.consentUrl({
                redirectUri,
                state,
                ...(user?.email ? { loginHint: user.email } : {}),
            }),
        };
    }

    /**
     * Google's answer. Always ends in the app's address, never a JSON
     * error: the person's browser is here, not the app. `resolve` builds
     * the signed-in person's context in the state's business.
     */
    async callback(
        query: { code?: string; state?: string; error?: string },
        signedInUserId: string,
        resolve: (orgId: string) => Promise<OrganizationContext>,
    ): Promise<string> {
        let state: ConnectState | StateRefusal;
        try {
            // A key missing on the server is "invalid" here, never a JSON
            // error in the person's browser (GC-15).
            state = verifyState(query.state);
        } catch (error) {
            this.logger.warn(
                `google_calendar_state_unreadable reason=${reasonOf(error)}`,
            );
            return this.back(null, "failed");
        }
        if (typeof state === "string") return this.back(null, state);
        const where = await prisma.organization.findUnique({
            where: { id: state.organizationId },
            select: { edition: true },
        });
        const edition = where?.edition ?? null;
        if (state.userId !== signedInUserId) {
            return this.back(edition, "someone-else");
        }
        // Good once: a second use of the same state is refused (GC-15).
        if (!(await this.useState(state.nonce, signedInUserId))) {
            return this.back(edition, "expired");
        }
        if (query.error || !query.code) {
            return this.back(edition, "denied");
        }
        try {
            const ctx = await resolve(state.organizationId);
            const outcome = await runInOrgContext(ctx.organizationId, () =>
                this.connect(ctx, state.membershipId, query.code ?? ""),
            );
            return this.back(edition, outcome);
        } catch (error) {
            this.logger.warn(
                `google_calendar_connect_failed org=${state.organizationId} reason=${reasonOf(error)}`,
            );
            return this.back(
                edition,
                error instanceof ForbiddenException ||
                    error instanceof NotFoundException
                    ? "refused"
                    : "failed",
            );
        }
    }

    async status(ctx: OrganizationContext): Promise<CalendarStatusView> {
        const membershipId = await this.membershipOf(ctx);
        const rows = await prisma.googleCalendarConnection.findMany({
            where: {
                organizationId: ctx.organizationId,
                membershipId,
                status: { in: LIVE },
            },
            orderBy: { createdAt: "asc" },
            select: {
                id: true,
                status: true,
                googleEmail: true,
                scopes: true,
                busyRefreshedAt: true,
                updatedAt: true,
                calendars: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        calendarId: true,
                        name: true,
                        writeTo: true,
                        checkBusy: true,
                    },
                },
            },
        });
        // Kept, but no longer allowed (GC-02, GC-03): shown as paused, with
        // why, so the person sees it and can disconnect it.
        const paused =
            rows.length > 0
                ? await pausedBecause(
                      ctx.organizationId,
                      membershipId,
                      this.flags,
                  )
                : null;
        if (!paused) await this.gate(ctx);
        // Past the plan's allowance (a downgrade): that account is paused.
        const over = await overAllowance(ctx.organizationId);
        const accounts: CalendarAccountView[] = [];
        for (const row of rows) {
            const checksBusy = row.calendars.some((c) => c.checkBusy);
            const rowPaused = !!paused || over.has(row.id);
            const behind =
                !rowPaused &&
                row.status === "CONNECTED" &&
                checksBusy &&
                // Never checked yet counts from when it was connected (or its
                // calendars changed): a fresh connection is not "late".
                isStale(row.busyRefreshedAt ?? row.updatedAt);
            // A chain that stopped (a worker lost, a flag flipped) restarts here.
            if (behind) {
                await scheduleBusy(ctx.organizationId, row.id, new Date());
            }
            accounts.push({
                id: row.id,
                googleEmail: row.googleEmail,
                state:
                    row.status === "LAPSED"
                        ? "LAPSED"
                        : rowPaused
                          ? "PAUSED"
                          : "CONNECTED",
                calendars: row.calendars.map((c) => ({
                    id: c.calendarId,
                    name: c.name,
                    writeTo: c.writeTo,
                    checkBusy: c.checkBusy,
                })),
                granted: grantedParts(row.scopes),
                busyRefreshedAt: row.busyRefreshedAt?.toISOString() ?? null,
                behind,
            });
        }
        const goes = accounts
            .filter((a) => a.state !== "LAPSED")
            .flatMap((a) =>
                a.calendars
                    .filter((c) => c.writeTo)
                    .map((c) => ({
                        accountId: a.id,
                        googleEmail: a.googleEmail,
                        calendarId: c.id,
                        name: c.name,
                    })),
            );
        return {
            state:
                accounts.length === 0
                    ? "NOT_CONNECTED"
                    : paused
                      ? "PAUSED"
                      : accounts.some((a) => a.state === "CONNECTED")
                        ? "CONNECTED"
                        : "LAPSED",
            pausedBecause: paused,
            accounts,
            bookingsGoTo: goes.length > 0 ? goes[0] : null,
            accountsAllowed: await accountsAllowed(ctx.organizationId),
            meetAccess: await businessMeetAccess(ctx.organizationId),
        };
    }

    /** One of their Google accounts' calendars, to choose from. */
    async listCalendars(
        ctx: OrganizationContext,
        accountId: string,
    ): Promise<GoogleCalendarOptionView[]> {
        const { google, person } = await this.gate(ctx);
        await takeCalendarRead(ctx);
        const connection = await this.connectionOf(ctx, person, accountId);
        const entries = await this.calendarsOf(google, connection);
        return entries.map((e) => ({
            id: e.id,
            name: e.name,
            primary: e.primary,
            canWrite: e.canWrite,
        }));
    }

    /**
     * This account's busy calendars, and, when `writeTo` is given, whether
     * bookings go to one of its calendars (DEC-233: one across all their
     * accounts, so choosing one here takes it off any other).
     */
    async choose(
        ctx: OrganizationContext,
        accountId: string,
        dto: ChooseCalendarsDto,
    ): Promise<CalendarStatusView> {
        const { google, person } = await this.gate(ctx);
        await takeCalendarRead(ctx);
        const connection = await this.connectionOf(ctx, person, accountId);
        const { scopes } =
            await prisma.googleCalendarConnection.findUniqueOrThrow({
                where: { id: connection.id },
                select: { scopes: true },
            });
        const granted = grantedParts(scopes);
        const current = await prisma.googleCalendarLink.findFirst({
            where: { connectionId: connection.id, writeTo: true },
            select: { calendarId: true },
        });
        const writeTo =
            dto.writeTo === undefined
                ? (current?.calendarId ?? null)
                : dto.writeTo;
        if (writeTo && writeTo !== current?.calendarId) {
            // A new "bookings go to" can be followed by a move (L1).
            await takeOrRefuse(
                bookingsCalendarChoices,
                ctx,
                "You've changed where your bookings go a few times today. Try again tomorrow.",
            );
        }
        const busy = [...new Set(dto.checkBusy)];
        const chosen = new Set([...(writeTo ? [writeTo] : []), ...busy]);
        if (writeTo && !granted.events) {
            throw new BadRequestException(
                "Google didn't let Saroh add events. Connect again and allow it to put bookings on your calendar.",
            );
        }
        if (busy.length > 0 && !granted.freeBusy) {
            throw new BadRequestException(
                "Google didn't let Saroh see when you're busy. Connect again and allow it.",
            );
        }
        const entries = await this.calendarsOf(google, connection);
        const byId = new Map(entries.map((e) => [e.id, e]));
        for (const id of chosen) {
            if (!byId.has(id)) {
                throw new BadRequestException(
                    "That calendar isn't in this Google account.",
                );
            }
        }
        if (writeTo && !byId.get(writeTo)?.canWrite) {
            throw new BadRequestException(
                "Saroh can only put bookings on a calendar you own.",
            );
        }
        await prisma.$transaction(async (tx) => {
            // One "bookings go to" across their accounts (DEC-233).
            if (writeTo) {
                await tx.googleCalendarLink.updateMany({
                    where: {
                        organizationId: ctx.organizationId,
                        writeTo: true,
                        connection: { membershipId: person.membershipId },
                    },
                    data: { writeTo: false },
                });
            }
            await tx.googleCalendarLink.deleteMany({
                where: { connectionId: connection.id },
            });
            for (const id of chosen) {
                await tx.googleCalendarLink.create({
                    data: {
                        organizationId: ctx.organizationId,
                        connectionId: connection.id,
                        calendarId: id,
                        name: byId.get(id)?.name ?? id,
                        writeTo: id === writeTo,
                        checkBusy: busy.includes(id),
                    },
                });
            }
            // Busy times from calendars no longer checked must not block.
            await tx.googleCalendarBusy.deleteMany({
                where: { connectionId: connection.id },
            });
            await tx.googleCalendarConnection.update({
                where: { id: connection.id },
                data: { busyRefreshedAt: null },
            });
        });
        await scheduleBusy(ctx.organizationId, connection.id, new Date());
        return this.status(ctx);
    }

    /**
     * Stop syncing (DEC-233): Saroh's access goes (revoked at Google at
     * its last use, the token deleted), busy times stop blocking, and the
     * upcoming events Saroh made stay in Google as they are, no longer
     * updated; connecting the same account again picks them back up
     * (`CalendarReleaseService`). Every account of theirs, or one. Needs
     * only a membership (GC-03): someone who lost the permission or their
     * diary place can still stop it.
     */
    async disconnect(
        ctx: OrganizationContext,
        accountId?: string,
    ): Promise<DisconnectView> {
        const membershipId = await this.membershipOf(ctx);
        let kept: number;
        if (accountId) {
            const row = await prisma.googleCalendarConnection.findFirst({
                where: {
                    id: accountId,
                    organizationId: ctx.organizationId,
                    membershipId,
                },
                select: { id: true },
            });
            if (!row)
                throw new NotFoundException(
                    "That account isn't connected here.",
                );
            kept = await this.releases.release(ctx.organizationId, row.id);
        } else {
            kept = await this.releases.releaseMember(
                ctx.organizationId,
                membershipId,
            );
        }
        return this.after(ctx, kept, "your");
    }

    /**
     * An owner or admin stopping someone else's connection (GC-03): anyone
     * who may change this person's role (`member:role:update`, within
     * reach) may also stop what a role allowed.
     * Their events stay as the person's own disconnect leaves them. Audited.
     */
    async disconnectMember(
        ctx: OrganizationContext,
        membershipId: string,
    ): Promise<DisconnectView> {
        authorize(ctx, "member:role:update");
        const member = await prisma.membership.findFirst({
            where: { id: membershipId, organizationId: ctx.organizationId },
            select: { id: true, role: true, extraActions: true },
        });
        if (!member) throw new NotFoundException("That person isn't here.");
        // As changing their role: never someone who can do more than you.
        await assertWithinReach(ctx, member.role, "disconnect", {
            mustExist: false,
            extras: member.extraActions,
        });
        const kept = await this.releases.releaseMember(
            ctx.organizationId,
            member.id,
        );
        await this.audit.record({
            action: AuditAction.CalendarMemberDisconnect,
            actorUserId: ctx.userId,
            actorRoleKey: ctx.roleKey,
            organizationId: ctx.organizationId,
            targetType: "membership",
            targetId: member.id,
            outcome: AuditOutcome.Success,
            // A count, never the Google address.
            metadata: { keptUpcomingEvents: kept },
        });
        return this.after(ctx, kept, "their");
    }

    private async after(
        ctx: OrganizationContext,
        kept: number,
        whose: "your" | "their",
    ): Promise<DisconnectView> {
        // The caller's own status; one who can't read it (off the diary,
        // not a member) reads as not connected.
        const view = await this.status(ctx).catch(() => this.notConnected(ctx));
        return {
            ...view,
            kept: { upcomingEvents: kept, message: keptWords(kept, whose) },
        };
    }

    private async notConnected(
        ctx: OrganizationContext,
    ): Promise<CalendarStatusView> {
        return {
            state: "NOT_CONNECTED",
            pausedBecause: null,
            accounts: [],
            bookingsGoTo: null,
            accountsAllowed: await accountsAllowed(ctx.organizationId),
            meetAccess: await businessMeetAccess(ctx.organizationId),
        };
    }

    /**
     * Keep Google's grant (U4): the token sealed to the row, the scopes
     * as granted, and on a first connect (or another Google account) the
     * primary calendar chosen for whatever the grant allows. A reconnect
     * after a lapse keeps the person's choices. Then busy times are read.
     */
    async connect(
        ctx: OrganizationContext,
        membershipId: string,
        code: string,
    ): Promise<CallbackOutcome> {
        const { google, person } = await this.gate(ctx);
        if (person.membershipId !== membershipId) return "someone-else";
        const grant = await google.exchangeCode(code, this.redirectUri(ctx));
        const granted = grantedParts(grant.scopes);
        // The same Google account again (a lapse, a disconnect): its row,
        // its choices and its events (DEC-233).
        const before = await prisma.googleCalendarConnection.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
                googleEmail: grant.email,
            },
            select: { id: true, status: true },
        });
        const counts = !before || before.status === "DISCONNECTED";
        const allowed = counts
            ? await accountsAllowed(ctx.organizationId)
            : null;
        const primary = granted.calendars
            ? (await google.listCalendars(grant.accessToken)).find(
                  (c) => c.primary,
              )
            : undefined;
        const connectionId = await prisma.$transaction(async (tx) => {
            if (allowed !== null) {
                // One connect at a time per person, so two consents
                // finishing together can't both pass the allowance.
                await holdXactLock(
                    tx,
                    `google-calendar-connect:${person.membershipId}`,
                );
                const live = await tx.googleCalendarConnection.count({
                    where: {
                        organizationId: ctx.organizationId,
                        membershipId: person.membershipId,
                        status: { in: LIVE },
                    },
                });
                if (live >= allowed) return null;
            }
            const row = before
                ? await tx.googleCalendarConnection.update({
                      where: { id: before.id },
                      data: {
                          scopes: grant.scopes,
                          status: "CONNECTED",
                          lapsedAt: null,
                          lastError: null,
                      },
                      select: { id: true },
                  })
                : await tx.googleCalendarConnection.create({
                      data: {
                          organizationId: ctx.organizationId,
                          membershipId: person.membershipId,
                          googleEmail: grant.email,
                          scopes: grant.scopes,
                      },
                      select: { id: true },
                  });
            await tx.googleCalendarConnection.update({
                where: { id: row.id },
                data: tokenColumns(
                    sealToken(grant.refreshToken, {
                        organizationId: ctx.organizationId,
                        connectionId: row.id,
                    }),
                ),
            });
            // Bookings go to one calendar across their accounts (DEC-233):
            // this one only when no other account of theirs has it.
            const elsewhere = await tx.googleCalendarLink.count({
                where: {
                    writeTo: true,
                    connection: {
                        id: { not: row.id },
                        membershipId: person.membershipId,
                        status: { in: LIVE },
                    },
                },
            });
            if (elsewhere > 0) {
                await tx.googleCalendarLink.updateMany({
                    where: { connectionId: row.id, writeTo: true },
                    data: { writeTo: false },
                });
            }
            const links = await tx.googleCalendarLink.count({
                where: { connectionId: row.id },
            });
            if (links === 0 && (granted.events || granted.freeBusy)) {
                await tx.googleCalendarLink.create({
                    data: {
                        organizationId: ctx.organizationId,
                        connectionId: row.id,
                        // Google's own name for the primary calendar.
                        calendarId: primary?.id ?? "primary",
                        name: primary?.name ?? grant.email,
                        writeTo: granted.events && elsewhere === 0,
                        checkBusy: granted.freeBusy,
                    },
                });
            }
            // Its upcoming events, picked back up with no email (DEC-233).
            if (before) {
                const events = await tx.googleCalendarEvent.findMany({
                    where: {
                        connectionId: row.id,
                        booking: { endAt: { gt: new Date() } },
                    },
                    select: { bookingId: true },
                });
                await queueCalendarSyncs(
                    tx,
                    ctx.organizationId,
                    events.map((e) => e.bookingId),
                    { quietUpdate: true },
                );
            }
            return row.id;
        });
        if (!connectionId) {
            await this.releases.revokeGrant(
                grant.refreshToken,
                grant.email,
                ctx.userId,
            );
            return "limit";
        }
        await scheduleBusy(ctx.organizationId, connectionId, new Date());
        return granted.events && granted.freeBusy ? "connected" : "partial";
    }

    /** Refuse unless this person may connect here, now. */
    private async gate(
        ctx: OrganizationContext,
    ): Promise<{ google: GoogleCalendarPort; person: Person }> {
        authorize(ctx, "calendar:connect-own");
        if (
            !(await this.flags.isEnabled("GOOGLE_CALENDAR", ctx.organizationId))
        ) {
            throw new NotFoundException("Google Calendar isn't available yet.");
        }
        await assertCalendarPlan(ctx.organizationId);
        const person = await this.personOf(ctx);
        if (!this.google) {
            throw new ServiceUnavailableException(
                "Google Calendar can't be connected yet: Google isn't set up on this server.",
            );
        }
        return { google: this.google, person };
    }

    /** The caller's own membership here: all disconnecting and reading status need. */
    private async membershipOf(ctx: OrganizationContext): Promise<string> {
        const membership = await prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                },
            },
            select: { id: true },
        });
        if (!membership)
            throw new NotFoundException("You aren't in this business.");
        return membership.id;
    }

    /** Spend a consent state's nonce: true only the first time, for its own person. */
    private async useState(nonce: string, userId: string): Promise<boolean> {
        const { count } = await outsideOrgContext(() =>
            prisma.verification.deleteMany({
                where: {
                    identifier: stateKey(nonce),
                    value: userId,
                    expiresAt: { gt: new Date() },
                },
            }),
        );
        return count > 0;
    }

    private async personOf(ctx: OrganizationContext): Promise<Person> {
        const membership = await prisma.membership.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: ctx.organizationId,
                    userId: ctx.userId,
                },
            },
            select: { id: true, staffMember: { select: { id: true } } },
        });
        if (!membership?.staffMember) {
            throw new ForbiddenException({
                message:
                    "Only someone who takes bookings can connect a calendar. Add yourself to the diary first.",
                details: { code: "NOT_ON_DIARY" },
            });
        }
        return {
            membershipId: membership.id,
            staffId: membership.staffMember.id,
        };
    }

    private async connectionOf(
        ctx: OrganizationContext,
        person: Person,
        accountId: string,
    ): Promise<SealedConnection> {
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: {
                id: accountId,
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
                status: { in: LIVE },
            },
            select: SEALED_CONNECTION,
        });
        if (!connection) {
            throw new NotFoundException(
                "That Google account isn't connected here.",
            );
        }
        if (connection.status !== "CONNECTED") {
            throw new ForbiddenException({
                message: "Google stopped Saroh's access. Connect again.",
                details: { code: "CALENDAR_LAPSED" },
            });
        }
        return connection;
    }

    private async calendarsOf(
        google: GoogleCalendarPort,
        connection: SealedConnection,
    ): Promise<GoogleCalendarEntry[]> {
        try {
            const access = await accessTokenFor(google, connection, (id) =>
                this.lapses.lapse(id),
            );
            return await google.listCalendars(access);
        } catch (error) {
            if (isGoogleError(error, "lapsed")) {
                throw new ForbiddenException({
                    message: "Google stopped Saroh's access. Connect again.",
                    details: { code: "CALENDAR_LAPSED" },
                });
            }
            if (isGoogleError(error)) {
                throw new ServiceUnavailableException(
                    "Google didn't answer. Try again in a minute.",
                );
            }
            throw error;
        }
    }

    private redirectUri(ctx: OrganizationContext): string {
        if (env.GOOGLE_CALENDAR_LOCAL_REDIRECT)
            return env.GOOGLE_CALENDAR_LOCAL_REDIRECT;
        const base = apiBase(ctx.edition ?? null);
        if (!base) {
            throw new ServiceUnavailableException(
                "Google Calendar can't be connected yet: API_PUBLIC_URL is not set on this server.",
            );
        }
        return `${base}${CALLBACK_PATH}`;
    }

    private back(
        edition: Parameters<typeof appBase>[0] | null,
        outcome: CallbackOutcome,
    ): string {
        return `${appBase(edition ?? undefined)}${RETURN_PATH}?calendar=${outcome}`;
    }
}

/** What a disconnect left in Google, said plainly (DEC-233). */
export function keptWords(n: number, whose: "your" | "their"): string {
    if (n === 0) {
        return "Nothing upcoming was on Google Calendar. Saroh no longer reaches it.";
    }
    const them = n === 1 ? "booking stays" : `${n} upcoming bookings stay`;
    return `${n === 1 ? `1 upcoming ${them}` : them} on ${whose} Google Calendar with ${n === 1 ? "its" : "their"} Meet links. Saroh stops updating ${n === 1 ? "it" : "them"}; connect the same Google account again to pick ${n === 1 ? "it" : "them"} back up.`;
}

const isStale = (at: Date | null, now: Date = new Date()) =>
    !at || now.getTime() - at.getTime() > GOOGLE_BUSY_FRESH_MS;

/** A failure in words for a log line: a kind and status, never a token. */
function reasonOf(error: unknown): string {
    if (isGoogleError(error)) return `${error.kind}:${error.detail}`;
    return error instanceof Error ? error.name : "error";
}

/** Each list or choice asks Google (L4): about 30 per 10 minutes a person. */
function takeCalendarRead(ctx: OrganizationContext): Promise<void> {
    return takeOrRefuse(
        calendarReads,
        ctx,
        "You've looked at your Google calendars a lot just now. Try again in a few minutes.",
    );
}
