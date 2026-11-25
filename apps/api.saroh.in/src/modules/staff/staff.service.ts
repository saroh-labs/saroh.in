import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException,
    Optional,
    ServiceUnavailableException,
} from "@nestjs/common";
import type { MediaBucket, Prisma } from "@saroh/database";
import { ensureCalendarOnlyRole, prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { clockWords } from "../../common/words-format";
import { planMeter } from "../billing/metering.service";
import type { AvailabilityRuleWindow } from "../bookings/availability";
import { withinIntervals, workingIntervals } from "../bookings/availability";
import { requireBookingPower } from "../bookings/booking-access";
import type { BookingPaymentView } from "../bookings/booking-payment";
import { bookingPaymentView } from "../bookings/booking-payment";
import type { BookingRulesValue } from "../bookings/booking-rules";
import {
    BOOKING_RULES_SELECT,
    bookingRulesOf,
    loadBookingRules,
} from "../bookings/booking-rules";
import { pausedDiaryIds } from "../bookings/diary-paused";
import { liveServiceIds } from "../bookings/live-service-ids";
import { loadOpeningHours } from "../bookings/opening-hours";
import { ownDiaryOf } from "../bookings/own-diary";
import type { PersonRules } from "../bookings/person-rules";
import { personRulesOf } from "../bookings/person-rules";
import { businessTimezone, dateOnly } from "../bookings/staff-availability";
import { MediaService } from "../media/media.service";
import { noticeOf } from "../notifications/notice-target";
import { allows } from "../organizations/organization-policy";
import { enqueueBusinessSitesRevalidation } from "../sites/page-cache-revalidate";
import type { ClosureView } from "./closures.service";
import { closureViews } from "./closures.service";
import type {
    AddExtraHoursDto,
    AddSelfDto,
    AddTimeOffDto,
    CreateStaffDto,
    StaffHoursDto,
    UpdateBookingRulesDto,
    UpdateStaffDto,
    UpdateStaffProfileDto,
} from "./dto";
import {
    firstOverlap,
    formatMinute,
    isCalendarDate,
    rangeRefusal,
    weeklyHoursRefusal,
    weeklyMinutes,
} from "./hours";
import type { BookingBrief } from "./off-bookings";
import { bookingsInSpans, MAX_LISTED, upcomingBookings } from "./off-bookings";
import type { OffSpan } from "./off-range";
import { offRangeRefusal, offSpans } from "./off-range";
import { lockWaitingInTx, replaceWaitingInTx } from "./rule-request-close";
import { recordBusinessRulesInTx } from "./rules-history";
import { diarySeatDelta } from "./staff-seats";

const DAY = 86_400_000;
/** What a profile photo may be (the share-image rule: no SVG, no GIF). */
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
/** How far back a person's read carries time off and extra hours. */
const HISTORY_DAYS = 31;

export type { BookingBrief };

export interface StaffView {
    id: string;
    name: string;
    title: string | null;
    status: string;
    /** Picked by an owner or admin for Our team (round 3). */
    showOnTeamPage: boolean;
    /** Their own photo (a library image), or null: initials show instead. */
    photo: { id: string; url: string } | null;
    /** A few words in their own voice, or null. */
    about: string | null;
    /** The team member they are, when they have an account. */
    membership: {
        id: string;
        userId: string;
        name: string | null;
        email: string;
        /** Their role's key ("OWNER", "ADMIN", …), for Our team's picker. */
        role: string;
    } | null;
    serviceIds: string[];
    hours: { dayOfWeek: number; startMinute: number; endMinute: number }[];
    /** Minutes a week the hours add up to. */
    weeklyMinutes: number;
    extraHours: {
        id: string;
        date: string;
        startMinute: number;
        endMinute: number;
    }[];
    /** Current and recent time off, with its team-only reason. */
    timeOff: {
        id: string;
        startAt: Date;
        endAt: Date;
        allDay: boolean;
        reason: string | null;
    }[];
    /**
     * On the diary with no login and past the plan's team limit (#800):
     * takes no new bookings; theirs are kept. Absent when not paused.
     */
    paused?: true;
    /**
     * Their own booking rules (DEC-170, #1038); a null is "same as the
     * business". The whole picture, with any request, is
     * `GET staff/:id/booking-rules`.
     */
    rules: PersonRules;
}

/** Staff, and the zone their hours are wall-clock times in. */
export interface StaffList {
    timezone: string;
    staff: StaffView[];
    /** Current and coming days the whole business is closed (E3). */
    closures: ClosureView[];
    /**
     * When the business is open, as weekly windows in `timezone`: every
     * walk-in storefront's week together, or null with none set. In-person
     * bookings keep to them (DEC-087).
     */
    openingHours: AvailabilityRuleWindow[] | null;
}

const staffInclude = (since: Date) =>
    ({
        photoMedia: {
            select: { id: true, key: true, bucket: true, status: true },
        },
        membership: {
            select: {
                id: true,
                userId: true,
                role: true,
                user: { select: { name: true, email: true } },
            },
        },
        services: { select: { serviceId: true } },
        hours: {
            select: { dayOfWeek: true, startMinute: true, endMinute: true },
            orderBy: [{ dayOfWeek: "asc" }, { startMinute: "asc" }],
        },
        extraHours: {
            where: { date: { gte: since } },
            select: {
                id: true,
                date: true,
                startMinute: true,
                endMinute: true,
            },
            orderBy: [{ date: "asc" }, { startMinute: "asc" }],
        },
        timeOff: {
            where: { endAt: { gte: since } },
            select: {
                id: true,
                startAt: true,
                endAt: true,
                allDay: true,
                reason: true,
            },
            orderBy: { startAt: "asc" },
        },
    }) satisfies Prisma.StaffMemberInclude;

type StaffRow = Prisma.StaffMemberGetPayload<{
    include: ReturnType<typeof staffInclude>;
}>;

/** A library image's public address, or null while it can't be served. */
type UrlOf = (media: { key: string; bucket: MediaBucket }) => string | null;

function toView(
    row: StaffRow,
    paused: ReadonlySet<string> = new Set(),
    urlOf: UrlOf = () => null,
): StaffView {
    const photoUrl =
        row.photoMedia?.status === "READY" ? urlOf(row.photoMedia) : null;
    return {
        ...(paused.has(row.id) ? { paused: true as const } : {}),
        id: row.id,
        name: row.name,
        title: row.title,
        status: row.status,
        showOnTeamPage: row.showOnTeamPage,
        photo:
            row.photoMedia && photoUrl
                ? { id: row.photoMedia.id, url: photoUrl }
                : null,
        about: row.about,
        membership: row.membership
            ? {
                  id: row.membership.id,
                  userId: row.membership.userId,
                  name: row.membership.user.name,
                  email: row.membership.user.email,
                  role: row.membership.role,
              }
            : null,
        serviceIds: row.services.map((s) => s.serviceId),
        hours: row.hours,
        weeklyMinutes: weeklyMinutes(row.hours),
        rules: personRulesOf(row),
        extraHours: row.extraHours.map((e) => ({
            id: e.id,
            date: dateOnly(e.date),
            startMinute: e.startMinute,
            endMinute: e.endMinute,
        })),
        timeOff: row.timeOff,
    };
}

/** A field left blank is not given. */
function blankToNull(value: string | null | undefined): string | null {
    return value === undefined || value === null || value === "" ? null : value;
}

function refuse(message: string, field: string): never {
    throw new BadRequestException({ message, field });
}

/**
 * The people who take bookings, their hours, time off and one-off extra
 * hours, and the business's booking rules (U3, ADR-008).
 *
 * Reads need `service:read` — the diary's floor, so a Member sees who works
 * when (and why someone is off: the reason is team-only, not Member-proof).
 * Adding, changing and removing people and the services they take need
 * `service:write`. Weekly hours, extra hours and time off need only
 * `hours:write` (DEC-170): the front desk — a Member — keeps anyone's
 * hours, and `service:write` implies it. Every id is the organization's
 * own or a 404.
 */
@Injectable()
export class StaffService {
    constructor(@Optional() private readonly media?: MediaService) {}

    private readonly urlOf: UrlOf = (m) => this.media?.urlOf(m) ?? null;

    // ── People ─────────────────────────────────────────────────────────────

    async list(ctx: OrganizationContext, now = new Date()): Promise<StaffList> {
        requireBookingPower(ctx, "service:read");
        const since = new Date(now.getTime() - HISTORY_DAYS * DAY);
        // Calendar only sees its own diary (#868): themselves, not the
        // team's hours, time off or reasons.
        const own = await ownDiaryOf(prisma, ctx);
        const [rows, timezone, closures, opening, paused] = await Promise.all([
            prisma.staffMember.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    ...(own ? { id: own.staffId ?? { in: [] } } : {}),
                },
                include: staffInclude(since),
                orderBy: [{ status: "asc" }, { name: "asc" }],
            }),
            businessTimezone(prisma, ctx.organizationId),
            closureViews(ctx.organizationId, since),
            loadOpeningHours(prisma, ctx.organizationId),
            // Past the plan's team limit (#800): the diary marks them and
            // offers no new booking with them.
            pausedDiaryIds(ctx.organizationId),
        ]);
        return {
            timezone,
            staff: rows.map((row) => toView(row, paused, this.urlOf)),
            closures,
            openingHours: opening?.windows ?? null,
        };
    }

    async get(
        ctx: OrganizationContext,
        staffId: string,
        now = new Date(),
    ): Promise<StaffView> {
        requireBookingPower(ctx, "service:read");
        // Calendar only: their own, and nobody else's (#868).
        const own = await ownDiaryOf(prisma, ctx);
        if (own && own.staffId !== staffId) {
            throw new NotFoundException("Staff member not found");
        }
        return this.read(ctx, staffId, now);
    }

    async create(
        ctx: OrganizationContext,
        dto: CreateStaffDto,
    ): Promise<StaffView> {
        requireBookingPower(ctx, "service:write");
        const hours = dto.hours ?? [];
        const refusal = weeklyHoursRefusal(hours);
        if (refusal) refuse(refusal.message, refusal.field);
        const serviceIds = await this.assertServices(
            ctx,
            dto.serviceIds ?? [],
            [],
        );
        if (dto.membershipId) {
            await this.assertMembership(ctx, dto.membershipId);
        }

        const created = await this.guardLink(() =>
            prisma.$transaction(async (tx) => {
                // Someone who takes bookings with no login uses a team
                // seat of their own (DEC-111, UX-053); a team member's is
                // theirs already (DEC-155).
                await planMeter.roomInTx(tx, ctx.organizationId, "members", {
                    adding: diarySeatDelta(null, {
                        status: "ACTIVE",
                        membershipId: dto.membershipId ?? null,
                    }),
                });
                // Whoever is on the diary can be given a login as Calendar
                // only (#868): the business has the role from its first.
                await ensureCalendarOnlyRole(tx, ctx.organizationId);
                const person = await tx.staffMember.create({
                    data: {
                        organizationId: ctx.organizationId,
                        name: dto.name,
                        title: blankToNull(dto.title),
                        membershipId: dto.membershipId ?? null,
                    },
                    select: { id: true },
                });
                if (serviceIds.length > 0) {
                    await tx.staffService.createMany({
                        data: serviceIds.map((serviceId) => ({
                            organizationId: ctx.organizationId,
                            staffId: person.id,
                            serviceId,
                        })),
                    });
                }
                if (hours.length > 0) {
                    await tx.staffHours.createMany({
                        data: hours.map((h) => ({
                            organizationId: ctx.organizationId,
                            staffId: person.id,
                            dayOfWeek: h.dayOfWeek,
                            startMinute: h.startMinute,
                            endMinute: h.endMinute,
                        })),
                    });
                }
                return person;
            }),
        );
        return this.read(ctx, created.id);
    }

    /**
     * "It's just me": the caller on the diary as themselves, linked to
     * their own membership, which is read from the session and never sent.
     * A team member already uses a team seat, so taking bookings adds
     * none and no plan limit is asked (DEC-155, `staff-seats.ts`). Someone who was on it and archived comes back as
     * they were, given the week and services sent only where they had
     * none; someone already on it is answered as they are.
     */
    async addSelf(
        ctx: OrganizationContext,
        dto: AddSelfDto,
    ): Promise<StaffView> {
        requireBookingPower(ctx, "service:write");
        const membership = await prisma.membership.findFirst({
            where: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
            },
            select: {
                id: true,
                user: { select: { name: true, email: true } },
                staffMember: {
                    select: {
                        id: true,
                        status: true,
                        _count: { select: { hours: true, services: true } },
                    },
                },
            },
        });
        if (!membership) {
            throw new ForbiddenException(
                "Only someone on this business's team can go on its diary.",
            );
        }
        const mine = membership.staffMember;
        if (!mine) {
            // Their own name, else the front of their email.
            const typed = membership.user.name?.trim() ?? "";
            const local = membership.user.email.split("@")[0] ?? "";
            const name = typed !== "" ? typed : local !== "" ? local : "Me";
            return this.create(ctx, {
                name: name.slice(0, 80),
                membershipId: membership.id,
                serviceIds: dto.serviceIds,
                hours: dto.hours,
            });
        }
        if (mine.status === "ACTIVE") return this.read(ctx, mine.id);
        await this.update(ctx, mine.id, { status: "ACTIVE" });
        if (mine._count.hours === 0 && dto.hours?.length) {
            await this.replaceHours(ctx, mine.id, dto.hours);
        }
        if (mine._count.services === 0 && dto.serviceIds?.length) {
            await this.setServices(ctx, mine.id, dto.serviceIds);
        }
        return this.read(ctx, mine.id);
    }

    async update(
        ctx: OrganizationContext,
        staffId: string,
        dto: UpdateStaffDto,
    ): Promise<StaffView> {
        requireBookingPower(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        if (dto.membershipId) {
            await this.assertMembership(ctx, dto.membershipId, person.id);
        }
        const archiving =
            dto.status === "ARCHIVED" && person.status !== "ARCHIVED";
        const after = {
            status: dto.status ?? person.status,
            membershipId:
                dto.membershipId !== undefined
                    ? dto.membershipId
                    : person.membershipId,
        };
        await this.guardLink(() =>
            prisma.$transaction(async (tx) => {
                // Back from archived with no login, or unlinked from one: a
                // team seat again (DEC-111, UX-053). Freeing one never asks.
                await planMeter.roomInTx(tx, ctx.organizationId, "members", {
                    adding: diarySeatDelta(person, after),
                });
                // On Our team, a new name or leaving shows on the live
                // pages at once (team-live.ts), so they redraw.
                if (
                    person.showOnTeamPage &&
                    (dto.name !== undefined || dto.status !== undefined)
                ) {
                    await enqueueBusinessSitesRevalidation(
                        tx,
                        ctx.organizationId,
                        "team",
                    );
                }
                return tx.staffMember.update({
                    where: { id: person.id },
                    data: {
                        ...(dto.name !== undefined ? { name: dto.name } : {}),
                        ...(dto.title !== undefined
                            ? { title: blankToNull(dto.title) }
                            : {}),
                        ...(dto.membershipId !== undefined
                            ? { membershipId: dto.membershipId }
                            : {}),
                        ...(dto.status !== undefined
                            ? {
                                  status: dto.status,
                                  archivedAt: archiving
                                      ? new Date()
                                      : dto.status === "ACTIVE"
                                        ? null
                                        : undefined,
                              }
                            : {}),
                    },
                    select: { id: true },
                });
            }),
        );
        return this.read(ctx, person.id);
    }

    /**
     * The caller's own place on the diary, or null when they are not on it:
     * what Your profile reads to show their photo (23 Nov 2026). Any
     * member may read their own.
     */
    async mine(
        ctx: OrganizationContext,
        now = new Date(),
    ): Promise<StaffView | null> {
        const since = new Date(now.getTime() - HISTORY_DAYS * DAY);
        const row = await prisma.staffMember.findFirst({
            where: {
                organizationId: ctx.organizationId,
                membership: { userId: ctx.userId },
            },
            include: staffInclude(since),
        });
        return row ? toView(row, new Set(), this.urlOf) : null;
    }

    /**
     * Someone's photo and "About them" (23 Nov 2026): set by the person
     * themselves, or for them by an owner or admin (`service:write`); nobody
     * else. The photo is one of this business's READY library images (JPG,
     * PNG or WebP). When someone else sets or changes it, the person is told
     * in their own alerts, one line, and can change it themselves. A person
     * on Our team redraws on the live pages at once.
     */
    async updateProfile(
        ctx: OrganizationContext,
        staffId: string,
        dto: UpdateStaffProfileDto,
    ): Promise<StaffView> {
        const person = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            select: {
                id: true,
                showOnTeamPage: true,
                photoMediaId: true,
                membership: { select: { userId: true } },
            },
        });
        if (!person) throw new NotFoundException("Staff member not found");
        const own = person.membership?.userId === ctx.userId;
        if (!own && !allows(ctx, "service:write")) {
            throw new ForbiddenException(
                "Only an owner, an admin or the person themselves can change this photo or text.",
            );
        }
        if (typeof dto.photoMediaId === "string") {
            if (!this.media) {
                throw new ServiceUnavailableException(
                    "Photos can't be chosen right now. Try again in a moment.",
                );
            }
            const media = await this.media.readyObject(
                ctx.organizationId,
                dto.photoMediaId,
            );
            if (!PHOTO_TYPES.has(media.contentType)) {
                throw new BadRequestException({
                    message: "That is not a photo. Choose a JPG, PNG or WebP.",
                    field: "photoMediaId",
                });
            }
        }
        const told =
            typeof dto.photoMediaId === "string" &&
            dto.photoMediaId !== person.photoMediaId &&
            !own &&
            person.membership?.userId;
        const actor = told
            ? await prisma.user.findUnique({
                  where: { id: ctx.userId },
                  select: { name: true },
              })
            : null;
        await prisma.$transaction(async (tx) => {
            await tx.staffMember.update({
                where: { id: person.id },
                data: {
                    ...(dto.photoMediaId !== undefined
                        ? { photoMediaId: dto.photoMediaId }
                        : {}),
                    ...(dto.about !== undefined
                        ? { about: blankToNull(dto.about) }
                        : {}),
                },
                select: { id: true },
            });
            if (told) {
                await tx.notification.create({
                    data: {
                        organizationId: ctx.organizationId,
                        userId: told,
                        ...noticeOf("staff.photo", {}),
                        title: "Your profile photo was changed",
                        body: `${actor?.name?.trim() ? actor.name.trim() : "An owner or admin"} set your photo. Change or remove it in Your profile.`,
                    },
                    select: { id: true },
                });
            }
            if (person.showOnTeamPage) {
                await enqueueBusinessSitesRevalidation(
                    tx,
                    ctx.organizationId,
                    "team",
                );
            }
        });
        return this.read(ctx, person.id);
    }

    /**
     * Who appears on Our team (round 3, EBTeamPicker, replaces DEC-248's
     * opt-in): an owner or admin (`service:write`) picks the people, the
     * whole list at once; nobody adds themselves and nobody is told. The
     * chosen set is read live by every Our team section (`sites/team-live.ts`),
     * so the business's live pages are told to redraw.
     */
    async setTeamPage(
        ctx: OrganizationContext,
        staffIds: string[],
    ): Promise<{ staffIds: string[] }> {
        if (!allows(ctx, "service:write")) {
            throw new ForbiddenException(
                "Only an owner or admin can choose who appears on Our team.",
            );
        }
        const ids = [...new Set(staffIds)];
        return prisma.$transaction(async (tx) => {
            const found = await tx.staffMember.findMany({
                where: {
                    organizationId: ctx.organizationId,
                    id: { in: ids },
                    status: "ACTIVE",
                },
                select: { id: true },
            });
            if (found.length !== ids.length) {
                throw new NotFoundException("Staff member not found");
            }
            await tx.staffMember.updateMany({
                where: {
                    organizationId: ctx.organizationId,
                    id: { in: ids },
                    showOnTeamPage: false,
                },
                data: { showOnTeamPage: true },
            });
            await tx.staffMember.updateMany({
                where: {
                    organizationId: ctx.organizationId,
                    id: { notIn: ids },
                    showOnTeamPage: true,
                },
                data: { showOnTeamPage: false },
            });
            await enqueueBusinessSitesRevalidation(
                tx,
                ctx.organizationId,
                "team",
            );
            return { staffIds: ids };
        });
    }

    /**
     * Take someone off the diary for new bookings. Their bookings keep them
     * (the diary still says who); their hours stay, in case they come back.
     */
    async archive(
        ctx: OrganizationContext,
        staffId: string,
    ): Promise<StaffView> {
        return this.update(ctx, staffId, { status: "ARCHIVED" });
    }

    /** Replace the services a person takes. */
    async setServices(
        ctx: OrganizationContext,
        staffId: string,
        serviceIds: string[],
    ): Promise<StaffView> {
        requireBookingPower(ctx, "service:write");
        const person = await this.requireStaff(ctx, staffId);
        const held = await prisma.staffService.findMany({
            where: { staffId: person.id, organizationId: ctx.organizationId },
            select: { serviceId: true },
        });
        const ids = await this.assertServices(
            ctx,
            serviceIds,
            held.map((h) => h.serviceId),
        );
        await prisma.$transaction(async (tx) => {
            await tx.staffService.deleteMany({
                where: { staffId: person.id, serviceId: { notIn: ids } },
            });
            if (ids.length > 0) {
                await tx.staffService.createMany({
                    data: ids.map((serviceId) => ({
                        organizationId: ctx.organizationId,
                        staffId: person.id,
                        serviceId,
                    })),
                    skipDuplicates: true,
                });
            }
        });
        return this.read(ctx, person.id);
    }

    // ── Hours ──────────────────────────────────────────────────────────────

    /**
     * Replace a person's weekly hours. Bookings already made that now fall
     * outside them are KEPT, and listed so the merchant can move or keep
     * them (the Availability design's rule) — saving hours never cancels.
     */
    async replaceHours(
        ctx: OrganizationContext,
        staffId: string,
        hours: StaffHoursDto[],
        now = new Date(),
    ): Promise<{ staff: StaffView; outside: BookingBrief[] }> {
        requireBookingPower(ctx, "hours:write");
        const person = await this.requireStaff(ctx, staffId);
        const refusal = weeklyHoursRefusal(hours);
        if (refusal) refuse(refusal.message, refusal.field);

        await prisma.$transaction(async (tx) => {
            await tx.staffHours.deleteMany({ where: { staffId: person.id } });
            if (hours.length > 0) {
                await tx.staffHours.createMany({
                    data: hours.map((h) => ({
                        organizationId: ctx.organizationId,
                        staffId: person.id,
                        dayOfWeek: h.dayOfWeek,
                        startMinute: h.startMinute,
                        endMinute: h.endMinute,
                    })),
                });
            }
        });
        const outside = await this.bookingsOutsideHours(ctx, person.id, now);
        return { staff: await this.read(ctx, person.id, now), outside };
    }

    /** Hours on one date, on top of the weekly ones. */
    async addExtraHours(
        ctx: OrganizationContext,
        staffId: string,
        dto: AddExtraHoursDto,
    ): Promise<StaffView> {
        requireBookingPower(ctx, "hours:write");
        const person = await this.requireStaff(ctx, staffId);
        if (!isCalendarDate(dto.date)) refuse("That is not a date.", "date");
        const range = rangeRefusal(dto, dto.date, "endMinute");
        if (range) refuse(range.message, range.field);

        const date = new Date(`${dto.date}T00:00:00.000Z`);
        const sameDay = await prisma.staffExtraHours.findMany({
            where: { staffId: person.id, date },
            select: { startMinute: true, endMinute: true },
        });
        const clash = firstOverlap([...sameDay, dto]);
        if (clash) {
            refuse(
                `${person.name} already has extra hours on ${dto.date} from ${clockWords(formatMinute(clash[0].startMinute))} to ${clockWords(formatMinute(clash[0].endMinute))}.`,
                "startMinute",
            );
        }
        await prisma.staffExtraHours.create({
            data: {
                organizationId: ctx.organizationId,
                staffId: person.id,
                date,
                startMinute: dto.startMinute,
                endMinute: dto.endMinute,
                createdByUserId: ctx.userId,
            },
            select: { id: true },
        });
        return this.read(ctx, person.id);
    }

    async removeExtraHours(
        ctx: OrganizationContext,
        staffId: string,
        extraHoursId: string,
        now = new Date(),
    ): Promise<{ staff: StaffView; outside: BookingBrief[] }> {
        requireBookingPower(ctx, "hours:write");
        const person = await this.requireStaff(ctx, staffId);
        const { count } = await prisma.staffExtraHours.deleteMany({
            where: {
                id: extraHoursId,
                staffId: person.id,
                organizationId: ctx.organizationId,
            },
        });
        if (count === 0) throw new NotFoundException("Extra hours not found");
        // Closing a day again can leave bookings outside the hours — kept.
        const outside = await this.bookingsOutsideHours(ctx, person.id, now);
        return { staff: await this.read(ctx, person.id, now), outside };
    }

    // ── Time off ───────────────────────────────────────────────────────────

    /**
     * Time off: a range of whole days, the same hours on each day of a range
     * (E3, one row per day, written together), or one stretch of time.
     * Bookings it covers are kept and listed — the merchant decides what to
     * do with each.
     */
    async addTimeOff(
        ctx: OrganizationContext,
        staffId: string,
        dto: AddTimeOffDto,
        now = new Date(),
    ): Promise<{ staff: StaffView; affected: BookingBrief[] }> {
        requireBookingPower(ctx, "hours:write");
        const person = await this.requireStaff(ctx, staffId);

        let spans: OffSpan[];
        if (dto.fromDate) {
            if (dto.startAt || dto.endAt) {
                refuse(
                    "Give whole days or a start and end time, not both.",
                    "startAt",
                );
            }
            const range = {
                fromDate: dto.fromDate,
                toDate: dto.toDate,
                startMinute: dto.startMinute,
                endMinute: dto.endMinute,
            };
            const refusal = offRangeRefusal(range);
            if (refusal) refuse(refusal.message, refusal.field);
            const zone = await businessTimezone(prisma, ctx.organizationId);
            spans = offSpans(range, zone);
        } else if (dto.startAt && dto.endAt) {
            const span = {
                startAt: new Date(dto.startAt),
                endAt: new Date(dto.endAt),
                allDay: false,
            };
            if (span.endAt <= span.startAt) {
                refuse("The end must be after the start.", "endAt");
            }
            if (span.endAt.getTime() - span.startAt.getTime() > 366 * DAY) {
                refuse("Time off can be at most a year at a time.", "toDate");
            }
            spans = [span];
        } else {
            refuse(
                "Choose the days, or a start and end time.",
                dto.startAt ? "endAt" : "fromDate",
            );
        }
        if (spans.length === 0) {
            refuse("Those hours don't happen on those days.", "startMinute");
        }

        await prisma.staffTimeOff.createMany({
            data: spans.map((span) => ({
                organizationId: ctx.organizationId,
                staffId: person.id,
                startAt: span.startAt,
                endAt: span.endAt,
                allDay: span.allDay,
                reason: blankToNull(dto.reason),
                createdByUserId: ctx.userId,
            })),
        });
        const affected = await bookingsInSpans(
            ctx.organizationId,
            person.id,
            spans,
            now,
        );
        return { staff: await this.read(ctx, person.id, now), affected };
    }

    /** Take away several rows of time off at once — one line on the screen. */
    async removeTimeOffMany(
        ctx: OrganizationContext,
        staffId: string,
        ids: string[],
    ): Promise<StaffView> {
        requireBookingPower(ctx, "hours:write");
        const person = await this.requireStaff(ctx, staffId);
        const unique = [...new Set(ids)];
        await prisma.$transaction(async (tx) => {
            const { count } = await tx.staffTimeOff.deleteMany({
                where: {
                    id: { in: unique },
                    staffId: person.id,
                    organizationId: ctx.organizationId,
                },
            });
            // All or nothing: a stale id means the screen is out of date.
            if (count !== unique.length) {
                throw new NotFoundException("Time off not found");
            }
        });
        return this.read(ctx, person.id);
    }

    async removeTimeOff(
        ctx: OrganizationContext,
        staffId: string,
        timeOffId: string,
    ): Promise<StaffView> {
        requireBookingPower(ctx, "hours:write");
        const person = await this.requireStaff(ctx, staffId);
        const { count } = await prisma.staffTimeOff.deleteMany({
            where: {
                id: timeOffId,
                staffId: person.id,
                organizationId: ctx.organizationId,
            },
        });
        if (count === 0) throw new NotFoundException("Time off not found");
        return this.read(ctx, person.id);
    }

    // ── Booking rules ──────────────────────────────────────────────────────

    async getBookingRules(
        ctx: OrganizationContext,
    ): Promise<BookingRulesValue> {
        requireBookingPower(ctx, "service:read");
        return loadBookingRules(prisma, ctx.organizationId);
    }

    /** How people pay when they book, and whether online can be taken. */
    async getBookingPayment(
        ctx: OrganizationContext,
    ): Promise<BookingPaymentView> {
        requireBookingPower(ctx, "service:read");
        return bookingPaymentView(ctx.organizationId);
    }

    /**
     * Set the business's rules; an absent field is left, `null` clears it.
     * Each change lands in the business's history (#1038): the fields as
     * they were and became, in the same transaction. Switching "Members'
     * rule changes need approval" off closes every request still waiting
     * as "Replaced by a newer change", and tells each person (owner, 20
     * Oct 2026; `rule-request-close.ts`).
     */
    async updateBookingRules(
        ctx: OrganizationContext,
        dto: UpdateBookingRulesDto,
    ): Promise<BookingRulesValue> {
        requireBookingPower(ctx, "service:write");
        const data = {
            ...(dto.bookAheadDays !== undefined
                ? { bookAheadDays: dto.bookAheadDays }
                : {}),
            ...(dto.latestBookingMinutes !== undefined
                ? { latestBookingMinutes: dto.latestBookingMinutes }
                : {}),
            ...(dto.freeCancelHours !== undefined
                ? { freeCancelHours: dto.freeCancelHours }
                : {}),
            ...(dto.refundInTimeCancels !== undefined
                ? { refundInTimeCancels: dto.refundInTimeCancels }
                : {}),
            ...(dto.bookingPayment !== undefined
                ? { bookingPayment: dto.bookingPayment }
                : {}),
            ...(dto.gapMinutes !== undefined
                ? { gapMinutes: dto.gapMinutes }
                : {}),
            ...(dto.memberRuleChangesNeedApproval !== undefined
                ? {
                      memberRuleChangesNeedApproval:
                          dto.memberRuleChangesNeedApproval,
                  }
                : {}),
        };
        return prisma.$transaction(async (tx) => {
            const before = await loadBookingRules(tx, ctx.organizationId);
            const row = await tx.bookingRules.upsert({
                where: { organizationId: ctx.organizationId },
                create: { organizationId: ctx.organizationId, ...data },
                update: data,
                select: BOOKING_RULES_SELECT,
            });
            const after = bookingRulesOf(row);
            await recordBusinessRulesInTx(tx, ctx, before, after);
            if (
                before.memberRuleChangesNeedApproval &&
                !after.memberRuleChangesNeedApproval
            ) {
                await replaceWaitingInTx(
                    tx,
                    ctx,
                    await lockWaitingInTx(tx, ctx.organizationId),
                    "approval-off",
                );
            }
            return after;
        });
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private async read(
        ctx: OrganizationContext,
        staffId: string,
        now = new Date(),
    ): Promise<StaffView> {
        const since = new Date(now.getTime() - HISTORY_DAYS * DAY);
        const row = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            include: staffInclude(since),
        });
        if (!row) throw new NotFoundException("Staff member not found");
        return toView(row, new Set(), this.urlOf);
    }

    private async requireStaff(ctx: OrganizationContext, staffId: string) {
        const person = await prisma.staffMember.findFirst({
            where: { id: staffId, organizationId: ctx.organizationId },
            select: {
                id: true,
                name: true,
                status: true,
                membershipId: true,
                showOnTeamPage: true,
            },
        });
        if (!person) throw new NotFoundException("Staff member not found");
        return person;
    }

    /**
     * Every service id belongs to this business and is not deleted, or 404.
     * One the person already takes whose service was deleted since is
     * dropped, not refused. Answers the ids to keep.
     */
    private async assertServices(
        ctx: OrganizationContext,
        ids: readonly string[],
        held: readonly string[],
    ): Promise<string[]> {
        const live = await liveServiceIds(
            prisma,
            ctx.organizationId,
            ids,
            held,
        );
        if (!live) {
            throw new NotFoundException({
                message: "One of those services was not found",
                field: "serviceIds",
            });
        }
        return live;
    }

    /**
     * The membership is this business's, and nobody else on the diary is
     * already that team member.
     */
    private async assertMembership(
        ctx: OrganizationContext,
        membershipId: string,
        staffId?: string,
    ): Promise<void> {
        const membership = await prisma.membership.findFirst({
            where: { id: membershipId, organizationId: ctx.organizationId },
            select: {
                id: true,
                staffMember: { select: { id: true, name: true } },
            },
        });
        if (!membership) {
            throw new NotFoundException({
                message: "That team member was not found",
                field: "membershipId",
            });
        }
        if (membership.staffMember && membership.staffMember.id !== staffId) {
            throw new ConflictException({
                message: `That team member is already on the diary as ${membership.staffMember.name}.`,
                field: "membershipId",
            });
        }
    }

    /** A second person linked to one member at the same moment: say so. */
    private async guardLink<T>(write: () => Promise<T>): Promise<T> {
        try {
            return await write();
        } catch (err) {
            if ((err as { code?: string }).code === "P2002") {
                throw new ConflictException({
                    message: "That team member is already on the diary.",
                    field: "membershipId",
                });
            }
            throw err;
        }
    }

    /**
     * Upcoming bookings of a person that their hours (weekly and extra) no
     * longer cover. Time off is its own warning and is not counted here.
     */
    private async bookingsOutsideHours(
        ctx: OrganizationContext,
        staffId: string,
        now: Date,
    ): Promise<BookingBrief[]> {
        const upcoming = await upcomingBookings(
            ctx.organizationId,
            staffId,
            now,
        );
        if (upcoming.length === 0) return [];
        const first = upcoming[0].startAt;
        const last = upcoming.reduce(
            (max, b) => (b.endAt > max ? b.endAt : max),
            upcoming[0].endAt,
        );
        const [zone, hours, extra] = await Promise.all([
            businessTimezone(prisma, ctx.organizationId),
            prisma.staffHours.findMany({
                where: { staffId },
                select: { dayOfWeek: true, startMinute: true, endMinute: true },
            }),
            prisma.staffExtraHours.findMany({
                where: {
                    staffId,
                    date: {
                        gte: new Date(first.getTime() - 2 * DAY),
                        lte: new Date(last.getTime() + 2 * DAY),
                    },
                },
                select: { date: true, startMinute: true, endMinute: true },
            }),
        ]);
        const windows = workingIntervals(
            {
                hours,
                extraHours: extra.map((e) => ({
                    date: dateOnly(e.date),
                    startMinute: e.startMinute,
                    endMinute: e.endMinute,
                })),
                timeOff: [],
            },
            zone,
            first,
            last,
        );
        return upcoming
            .filter((b) => !withinIntervals(b, windows))
            .slice(0, MAX_LISTED);
    }
}
