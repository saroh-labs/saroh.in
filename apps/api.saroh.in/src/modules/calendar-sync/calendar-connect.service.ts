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
import { prisma, runInOrgContext } from "@saroh/database";

import { appBase } from "../../common/app-url";
import type { OrganizationContext } from "../../common/types/organization-context";
import { planMeter } from "../billing/metering.service";
import { FeatureFlagService } from "../feature-flags/feature-flags.service";
import { authorize } from "../organizations/organization-policy";
import { apiBase } from "../payments/webhook-setup";
import type { SealedConnection } from "./calendar-access";
import { accessTokenFor, SEALED_CONNECTION } from "./calendar-access";
import { scheduleBusy } from "./calendar-jobs";
import { CalendarLapseService } from "./calendar-lapse.service";
import type { StateRefusal } from "./connect-state";
import { signState, verifyState } from "./connect-state";
import type {
    CalendarStatusView,
    ChooseCalendarsDto,
    ConnectStartView,
    GoogleCalendarOptionView,
} from "./dto";
import type {
    GoogleCalendarEntry,
    GoogleCalendarPort,
} from "./google/google-calendar.port";
import {
    GOOGLE_CALENDAR,
    grantedParts,
    isGoogleError,
} from "./google/google-calendar.port";
import { openToken, sealedToken, sealToken, tokenColumns } from "./sealing";

/** Where Google sends the person back to, on the API. */
export const CALLBACK_PATH = "/integrations/google-calendar/callback";
/** Where the API then sends them, in the app: their calendar settings (the next round's screen). */
export const RETURN_PATH = "/settings/google-calendar";
/** Busy times older than this are ignored, and the connection reads behind. */
export const BUSY_FRESH_MS = 2 * 60 * 60_000;

/**
 * How many of their Google calendars one person may choose (KTD5): one
 * today, used both to write bookings to and to check for busy times. The
 * one place a paid plan's larger allowance plugs in later.
 */
export function calendarsAllowed(_organizationId: string): number {
    return 1;
}

/** Who is connecting: their membership and their place on the diary. */
interface Person {
    membershipId: string;
    staffId: string;
}

/** How a callback ended, for the app's address. */
export type CallbackOutcome =
    | "connected"
    | "partial"
    | "denied"
    | StateRefusal
    | "someone-else"
    | "refused"
    | "failed";

/**
 * A person's own Google Calendar in one business (#1047, U4): start the
 * consent, take Google's answer, show the connection, choose calendars,
 * and disconnect. Every step asks the `GOOGLE_CALENDAR` flag, the plan's
 * `integrations` row (Free locked) and `calendar:connect-own`, and needs
 * the person on the diary (someone without a login can't be connected:
 * nobody can sign in to Google for them).
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
    ) {}

    async start(ctx: OrganizationContext): Promise<ConnectStartView> {
        const { google, person } = await this.gate(ctx);
        const redirectUri = this.redirectUri(ctx);
        const user = await prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { email: true },
        });
        const state = signState({
            organizationId: ctx.organizationId,
            membershipId: person.membershipId,
            userId: ctx.userId,
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
        const state = verifyState(query.state);
        if (typeof state === "string") return this.back(null, state);
        const where = await prisma.organization.findUnique({
            where: { id: state.organizationId },
            select: { edition: true },
        });
        const edition = where?.edition ?? null;
        if (state.userId !== signedInUserId) {
            return this.back(edition, "someone-else");
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
        const { person } = await this.gate(ctx);
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
            },
            select: {
                id: true,
                status: true,
                googleEmail: true,
                scopes: true,
                busyRefreshedAt: true,
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
        const allowed = calendarsAllowed(ctx.organizationId);
        if (!connection) {
            return {
                state: "NOT_CONNECTED",
                googleEmail: null,
                calendars: [],
                granted: null,
                busyRefreshedAt: null,
                behind: false,
                calendarsAllowed: allowed,
            };
        }
        const checksBusy = connection.calendars.some((c) => c.checkBusy);
        const behind =
            connection.status === "CONNECTED" &&
            checksBusy &&
            isStale(connection.busyRefreshedAt);
        // A chain that stopped (a worker lost, a flag flipped) restarts here.
        if (behind) {
            await scheduleBusy(ctx.organizationId, connection.id, new Date());
        }
        return {
            state: connection.status === "LAPSED" ? "LAPSED" : "CONNECTED",
            googleEmail: connection.googleEmail,
            calendars: connection.calendars.map((c) => ({
                id: c.calendarId,
                name: c.name,
                writeTo: c.writeTo,
                checkBusy: c.checkBusy,
            })),
            granted: grantedParts(connection.scopes),
            busyRefreshedAt: connection.busyRefreshedAt?.toISOString() ?? null,
            behind,
            calendarsAllowed: allowed,
        };
    }

    /** Their Google calendars, to choose from. */
    async listCalendars(
        ctx: OrganizationContext,
    ): Promise<GoogleCalendarOptionView[]> {
        const { google, person } = await this.gate(ctx);
        const connection = await this.connectionOf(ctx, person);
        const entries = await this.calendarsOf(google, connection);
        return entries.map((e) => ({
            id: e.id,
            name: e.name,
            primary: e.primary,
            canWrite: e.canWrite,
        }));
    }

    async choose(
        ctx: OrganizationContext,
        dto: ChooseCalendarsDto,
    ): Promise<CalendarStatusView> {
        const { google, person } = await this.gate(ctx);
        const connection = await this.connectionOf(ctx, person);
        const scopes = (
            await prisma.googleCalendarConnection.findUniqueOrThrow({
                where: { id: connection.id },
                select: { scopes: true },
            })
        ).scopes;
        const granted = grantedParts(scopes);
        const writeTo = dto.writeTo ?? null;
        const busy = [...new Set(dto.checkBusy)];
        const chosen = new Set([...(writeTo ? [writeTo] : []), ...busy]);
        const allowed = calendarsAllowed(ctx.organizationId);
        if (chosen.size > allowed) {
            throw new BadRequestException(
                allowed === 1
                    ? "Choose one calendar: Saroh uses it for your bookings and your busy times."
                    : `Choose up to ${allowed} calendars.`,
            );
        }
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
                    "That calendar isn't in your Google account.",
                );
            }
        }
        if (writeTo && !byId.get(writeTo)?.canWrite) {
            throw new BadRequestException(
                "Saroh can only put bookings on a calendar you own.",
            );
        }
        await prisma.$transaction(async (tx) => {
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
     * Stop both directions (KTD10): revoke at Google, then delete the
     * connection with its choices, busy times and event records. Events
     * already in Google stay: deleting them would email every customer a
     * cancellation. Jobs still queued find nothing and do nothing.
     */
    async disconnect(ctx: OrganizationContext): Promise<CalendarStatusView> {
        authorize(ctx, "calendar:connect-own");
        const person = await this.personOf(ctx);
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
            },
            select: SEALED_CONNECTION,
        });
        if (connection) {
            await this.revoke(connection);
            await prisma.googleCalendarConnection.deleteMany({
                where: { id: connection.id },
            });
        }
        return {
            state: "NOT_CONNECTED",
            googleEmail: null,
            calendars: [],
            granted: null,
            busyRefreshedAt: null,
            behind: false,
            calendarsAllowed: calendarsAllowed(ctx.organizationId),
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
        const before = await prisma.googleCalendarConnection.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
            },
            select: { id: true, googleEmail: true },
        });
        const sameAccount = before?.googleEmail === grant.email;
        const primary = granted.calendars
            ? (await google.listCalendars(grant.accessToken)).find(
                  (c) => c.primary,
              )
            : undefined;
        const connectionId = await prisma.$transaction(async (tx) => {
            const row = before
                ? await tx.googleCalendarConnection.update({
                      where: { id: before.id },
                      data: {
                          googleEmail: grant.email,
                          scopes: grant.scopes,
                          status: "CONNECTED",
                          lapsedAt: null,
                          lastError: null,
                          ...(sameAccount ? {} : { busyRefreshedAt: null }),
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
            // Another Google account: what was chosen, read and made in
            // the old one doesn't carry over (its events stay there).
            if (before && !sameAccount) {
                await tx.googleCalendarLink.deleteMany({
                    where: { connectionId: row.id },
                });
                await tx.googleCalendarBusy.deleteMany({
                    where: { connectionId: row.id },
                });
                await tx.googleCalendarEvent.deleteMany({
                    where: { connectionId: row.id },
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
                        writeTo: granted.events,
                        checkBusy: granted.freeBusy,
                    },
                });
            }
            return row.id;
        });
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
        await planMeter.assertIncluded(ctx.organizationId, "integrations");
        const person = await this.personOf(ctx);
        if (!this.google) {
            throw new ServiceUnavailableException(
                "Google Calendar can't be connected yet: Google isn't set up on this server.",
            );
        }
        return { google: this.google, person };
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
    ): Promise<SealedConnection> {
        const connection = await prisma.googleCalendarConnection.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membershipId: person.membershipId,
            },
            select: SEALED_CONNECTION,
        });
        if (!connection) {
            throw new NotFoundException("Connect your Google Calendar first.");
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

    /** Revoke at Google; a failure is logged, never kept: the row goes anyway. */
    private async revoke(connection: SealedConnection): Promise<void> {
        if (!this.google || connection.status !== "CONNECTED") return;
        try {
            const sealed = sealedToken(connection);
            if (!sealed) return;
            await this.google.revoke(
                openToken(sealed, {
                    organizationId: connection.organizationId,
                    connectionId: connection.id,
                }),
            );
        } catch (error) {
            this.logger.warn(
                `google_calendar_revoke_failed connection=${connection.id} reason=${reasonOf(error)}`,
            );
        }
    }

    private redirectUri(ctx: OrganizationContext): string {
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

const isStale = (at: Date | null, now: Date = new Date()) =>
    !at || now.getTime() - at.getTime() > BUSY_FRESH_MS;

/** A failure in words for a log line: a kind and status, never a token. */
function reasonOf(error: unknown): string {
    if (isGoogleError(error)) return `${error.kind}:${error.detail}`;
    return error instanceof Error ? error.name : "error";
}
