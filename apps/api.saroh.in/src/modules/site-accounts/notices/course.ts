import type { Prisma } from "@saroh/database";

import { toMinor } from "../../../common/money";
import { moneyWordsMinor } from "../../../common/words-format";
import { noticeOn } from "../../communications/notice-settings";
import type { CustomerNotifyPayload } from "../customer-notify-queue";
import { enqueueCustomerNotice } from "../customer-notify-queue";
import { defineNotice, firstWord, noticeWhen } from "./notice";

/**
 * A course's student hears they are enrolled, with every session, or that
 * their enrolment is cancelled, with what happens to the money (DEC-174
 * U17, #1148). One switch, COURSE, on by default. A course's sessions are
 * never told one by one (ADR-007): the enrolment carries the schedule.
 *
 * Queued by `CoursesService.enrol` and `.cancelEnrollment` on their own
 * transaction ({@link queueCourseNotice}), once per enrolment and kind.
 * Read again when the job runs: an enrolment cancelled since tells nobody
 * it is enrolled, and the money line follows the enrolment's invoice as it
 * stands then.
 */

export const COURSE_NOTICE_KINDS = [
    "COURSE_ENROLLED",
    "COURSE_CANCELLED",
] as const;
export type CourseNoticeKind = (typeof COURSE_NOTICE_KINDS)[number];

/**
 * Where a cancelled enrolment's money stands, from its invoice. A cancel
 * never refunds or voids anything by itself (`cancelEnrollment`), so the
 * words say only what the invoice says now.
 */
export type CourseMoney =
    /** Paid, and not refunded. */
    | { state: "PAID"; amountMinor: number; currency: string }
    /** Issued and still to pay. */
    | { state: "OPEN"; amountMinor: number; currency: string }
    /** Voided: nothing owed. */
    | { state: "VOID" }
    /** Cancelled with a credit note (ADR-008). */
    | { state: "CREDITED" };

export interface CourseNoticeVars {
    business: string;
    firstName: string | null;
    course: string;
    /** Its sessions still to come (enrolled), or how many were cancelled. */
    sessions: Date[];
    timeZone: string;
    /** Every session is online. */
    online: boolean;
    /** A cancel's money; null: no invoice, nothing to say. */
    money: CourseMoney | null;
}

export interface CourseNotice {
    kind: CourseNoticeKind;
    course: CourseNoticeVars;
}

/** A course notice's key: once per enrolment and kind. */
export function courseNoticeKey(
    kind: CourseNoticeKind,
    enrollmentId: string,
): string {
    return kind === "COURSE_ENROLLED"
        ? `course-enrolled:${enrollmentId}`
        : `course-cancelled:${enrollmentId}`;
}

type Tx = Prisma.TransactionClient;

/**
 * Queue a course notice on the enrolment's transaction, unless the
 * business has Course emails off. Returns whether one was queued.
 */
export async function queueCourseNotice(
    tx: Tx,
    organizationId: string,
    kind: CourseNoticeKind,
    enrollmentId: string,
): Promise<boolean> {
    if (!(await noticeOn(tx, organizationId, "COURSE"))) return false;
    await enqueueCustomerNotice(tx, organizationId, {
        kind,
        eventKey: courseNoticeKey(kind, enrollmentId),
        courseEnrollmentId: enrollmentId,
    });
    return true;
}

function isCourseKind(kind: string): kind is CourseNoticeKind {
    return (COURSE_NOTICE_KINDS as readonly string[]).includes(kind);
}

function plural(n: number, one: string, many: string): string {
    return `${n} ${n === 1 ? one : many}`;
}

/** What a cancel's money line says; null: nothing. */
export function courseMoneyWords(
    money: CourseMoney | null,
    business: string,
): string | null {
    if (!money) return null;
    switch (money.state) {
        case "PAID":
            return `The ${moneyWordsMinor(money.amountMinor, money.currency)} you paid hasn't been refunded. Ask ${business} if you have a question about it.`;
        case "OPEN":
            return `Its ${moneyWordsMinor(money.amountMinor, money.currency)} invoice is still open. Ask ${business} what you owe now.`;
        case "VOID":
            return "Its invoice has been cancelled, so nothing is owed.";
        case "CREDITED":
            return "Its invoice has been cancelled with a credit note.";
    }
}

/** The account thread's sentence and the email's lead. */
export function courseSentence(kind: CourseNoticeKind, c: CourseNoticeVars) {
    const n = c.sessions.length;
    if (kind === "COURSE_ENROLLED") {
        const when = c.sessions.map((at) => noticeWhen(at, c.timeZone));
        const span =
            when.length === 0
                ? plural(n, "session", "sessions")
                : when.length === 1
                  ? `1 session, on ${when.join("")}`
                  : `${plural(n, "session", "sessions")}, from ${when.slice(0, 1).join("")} to ${when.slice(-1).join("")}`;
        const online = c.online ? " Every session is online." : "";
        return `You're enrolled in ${c.course}: ${span}.${online}`;
    }
    const left =
        n > 0
            ? ` Its ${plural(n, "session", "sessions")} still to come ${n === 1 ? "is" : "are"} cancelled.`
            : "";
    const money = courseMoneyWords(c.money, c.business);
    return `Your place in ${c.course} is cancelled.${left}${money ? ` ${money}` : ""}`;
}

export const courseNotice = defineNotice<CourseNotice>({
    setting: "COURSE",
    load: (tx, organizationId, payload) =>
        loadCourse(tx, organizationId, payload),
    sentence: ({ kind, course }) => courseSentence(kind, course),
    subject: ({ kind, course: c }) =>
        kind === "COURSE_ENROLLED"
            ? `You're enrolled in ${c.course} at ${c.business}`
            : `Your place in ${c.course} at ${c.business} is cancelled`,
    names: ({ course }) => ({
        business: course.business,
        firstName: course.firstName,
    }),
    // The enrolment's email lists every session, in the business's zone.
    list: ({ kind, course: c }) =>
        kind === "COURSE_ENROLLED" && c.sessions.length > 0
            ? {
                  lead: "Your sessions:",
                  items: c.sessions.map((at) => noticeWhen(at, c.timeZone)),
              }
            : null,
});

async function loadCourse(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
): Promise<{ contactId: string; vars: CourseNotice } | null> {
    const kind = payload.kind;
    if (!isCourseKind(kind) || !payload.courseEnrollmentId) return null;
    const enrollment = await tx.courseEnrollment.findFirst({
        where: { id: payload.courseEnrollmentId, organizationId },
        select: {
            id: true,
            contactId: true,
            status: true,
            cancelledAt: true,
            contact: { select: { firstName: true } },
            organization: { select: { name: true } },
            course: {
                select: {
                    name: true,
                    service: {
                        select: { timezone: true, locationType: true },
                    },
                },
            },
        },
    });
    if (!enrollment) return null;
    // Where it stands now: one cancelled since isn't enrolled, and one
    // still active isn't cancelled.
    const active = enrollment.status === "ACTIVE";
    if ((kind === "COURSE_ENROLLED") !== active) return null;

    // Its sessions as booked: still to come when enrolled; when cancelled,
    // the ones the cancel took.
    const bookings = await tx.booking.findMany({
        where: {
            organizationId,
            courseEnrollmentId: enrollment.id,
            ...(active
                ? { status: "CONFIRMED" }
                : {
                      status: "CANCELLED",
                      ...(enrollment.cancelledAt
                          ? { startAt: { gt: enrollment.cancelledAt } }
                          : {}),
                  }),
        },
        orderBy: { startAt: "asc" },
        select: { startAt: true },
    });
    if (active && bookings.length === 0) return null;

    const service = enrollment.course.service;
    return {
        contactId: enrollment.contactId,
        vars: {
            kind,
            course: {
                business: enrollment.organization.name,
                firstName: firstWord(enrollment.contact.firstName),
                course: enrollment.course.name,
                sessions: bookings.map((b) => b.startAt),
                timeZone: service.timezone,
                online: service.locationType === "ONLINE",
                money: active
                    ? null
                    : await courseMoney(tx, organizationId, enrollment.id),
            },
        },
    };
}

/** The enrolment's invoice as it stands; null: none (Payments off). */
async function courseMoney(
    tx: Tx,
    organizationId: string,
    enrollmentId: string,
): Promise<CourseMoney | null> {
    const invoice = await tx.invoice.findFirst({
        where: {
            organizationId,
            courseEnrollmentId: enrollmentId,
            kind: "INVOICE",
            status: { not: "DRAFT" },
        },
        orderBy: { createdAt: "desc" },
        select: { status: true, total: true, currency: true },
    });
    if (!invoice) return null;
    const amountMinor = toMinor(invoice.total);
    switch (invoice.status) {
        case "PAID":
            return { state: "PAID", amountMinor, currency: invoice.currency };
        case "ISSUED":
            return { state: "OPEN", amountMinor, currency: invoice.currency };
        case "VOID":
            return { state: "VOID" };
        case "CREDITED":
            return { state: "CREDITED" };
        default:
            return null;
    }
}
