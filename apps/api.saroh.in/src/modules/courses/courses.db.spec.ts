/**
 * Courses against a real Postgres: what an enrolment books and invoices, a
 * late start, a session added later, the last seat raced for, a full session
 * leaving nothing behind, the seats a course holds from public bookers,
 * re-enrolling, cancelling, and deleting the person. Runs in the integration
 * project (TEST_DATABASE_URL).
 */
import { ConflictException } from "@nestjs/common";
import { prisma, runInOrgContext } from "@saroh/database";

import { giveBusinessDetails } from "../../../test/business-details";
import type { OrganizationContext } from "../../common/types/organization-context";
import { BookingsService } from "../bookings/bookings.service";
import { PublicBookingsService } from "../bookings/public-bookings.service";
import { ContactsService } from "../contacts/contacts.service";
import { InvoicesService } from "../invoices/invoices.service";
import { loadSubject } from "../site-accounts/customer-notify.handler";
import { noticeSentence, renderNotice } from "../site-accounts/notices";
import { CoursesService } from "./courses.service";

const bookings = new BookingsService();
const publicBookings = new PublicBookingsService();
const courses = new CoursesService(bookings, new InvoicesService());

const DAY = 86_400_000;
let org: OrganizationContext;
let people = 0;

/** 09:00 UTC, `days` from now: a slot the all-day rules accept. */
function slot(days: number): Date {
    const d = new Date(Date.now() + days * DAY);
    d.setUTCHours(9, 0, 0, 0);
    return d;
}

beforeAll(async () => {
    const created = await prisma.organization.create({
        data: { name: "Courses Org", slug: `courses-org-${process.pid}` },
    });
    await giveBusinessDetails(created.id);
    // Booking history names the person who enrolled someone, so they exist.
    const user = await prisma.user.create({
        data: { email: `courses-${process.pid}@example.com` },
    });
    org = { organizationId: created.id, userId: user.id, role: "OWNER" };
});

/** A service of its own per test, so capacity is never shared by accident. */
async function makeService(capacity: number): Promise<string> {
    const service = await prisma.service.create({
        data: {
            organizationId: org.organizationId,
            name: "Pottery",
            durationMinutes: 60,
            capacity,
            timezone: "UTC",
            status: "ACTIVE",
            currency: "INR",
        },
    });
    await prisma.availabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
            organizationId: org.organizationId,
            serviceId: service.id,
            dayOfWeek,
            startMinute: 0,
            endMinute: 1440,
        })),
    });
    return service.id;
}

async function person(): Promise<string> {
    people += 1;
    return (
        await prisma.contact.create({
            data: {
                organizationId: org.organizationId,
                email: `learner${people}@example.com`,
                firstName: "Asha",
            },
        })
    ).id;
}

async function openCourse(
    serviceId: string,
    seats: number,
    days: number[],
): Promise<string> {
    const made = await courses.create(org, {
        serviceId,
        name: "Beginners' wheel",
        price: "8000",
        seats,
        status: "OPEN",
        sessions: days.map((d) => slot(d).toISOString()),
    });
    return made.id;
}

const bookingsOf = (enrollmentId: string) =>
    prisma.booking.findMany({
        where: { courseEnrollmentId: enrollmentId, status: "CONFIRMED" },
        orderBy: { startAt: "asc" },
    });

const WEEKS = [7, 14, 21, 28, 35, 42, 49, 56];

/** Someone booked the third session's time before the course held it. */
async function thirdSessionFull(): Promise<void> {
    const serviceId = await makeService(2);
    const courseId = await openCourse(serviceId, 2, WEEKS);
    // Someone booked the third session's time before the course held it.
    await prisma.booking.create({
        data: {
            organizationId: org.organizationId,
            serviceId,
            startAt: slot(21),
            endAt: new Date(slot(21).getTime() + 3_600_000),
            timezone: "UTC",
            status: "CONFIRMED",
            snapshot: {},
            bookerEmail: "walk-in@example.com",
        },
    });
    await courses.enrol(org, courseId, { contactId: await person() });

    const second = await person();
    await expect(
        courses.enrol(org, courseId, { contactId: second }),
    ).rejects.toThrow("no room left");
    expect(
        await prisma.courseEnrollment.count({
            where: { courseId, contactId: second },
        }),
    ).toBe(0);
    expect(
        await prisma.booking.count({
            where: { courseEnrollment: { courseId, contactId: second } },
        }),
    ).toBe(0);
    expect(
        await prisma.invoice.count({
            where: { contactId: second, source: "COURSE" },
        }),
    ).toBe(0);
}

describe("courses (real database)", () => {
    it("books all eight sessions and issues one invoice for the course price", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 8, WEEKS);
        const enrolled = await courses.enrol(org, courseId, {
            contactId: await person(),
        });

        expect(await bookingsOf(enrolled.id)).toHaveLength(8);
        const invoices = await prisma.invoice.findMany({
            where: { courseEnrollmentId: enrolled.id },
        });
        expect(invoices).toHaveLength(1);
        expect(invoices[0]!.total.toString()).toBe("8000");
        expect(invoices[0]!.source).toBe("COURSE");
        // A course session is not queued for a notification nobody sends.
        expect(
            await prisma.job.count({
                where: {
                    type: "booking.notify",
                    organizationId: org.organizationId,
                    payload: { path: ["serviceId"], equals: serviceId },
                },
            }),
        ).toBe(0);
    });

    it("books only the six sessions left after a late start", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 8, WEEKS.slice(2));
        // Two sessions already happened.
        await prisma.courseSession.createMany({
            data: [-14, -7].map((d) => ({
                organizationId: org.organizationId,
                courseId,
                startAt: slot(d),
                endAt: new Date(slot(d).getTime() + 3_600_000),
            })),
        });
        const enrolled = await courses.enrol(org, courseId, {
            contactId: await person(),
            price: "6000",
        });
        expect(await bookingsOf(enrolled.id)).toHaveLength(6);
        expect(enrolled.price).toBe("6000.00");
    });

    it("books everyone on the course into a session added later", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 8, WEEKS);
        const a = await courses.enrol(org, courseId, {
            contactId: await person(),
        });
        const b = await courses.enrol(org, courseId, {
            contactId: await person(),
        });

        await courses.addSession(org, courseId, {
            startAt: slot(63).toISOString(),
        });
        expect(await bookingsOf(a.id)).toHaveLength(9);
        expect(await bookingsOf(b.id)).toHaveLength(9);
    });

    it("gives the last seat to one of two people enrolling at once", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 1, WEEKS.slice(0, 3));
        const results = await Promise.allSettled([
            courses.enrol(org, courseId, { contactId: await person() }),
            courses.enrol(org, courseId, { contactId: await person() }),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const refused = results.find(
            (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        expect(String(refused.reason)).toMatch(/full|changed/);
        expect(
            await prisma.courseEnrollment.count({
                where: { courseId, status: "ACTIVE" },
            }),
        ).toBe(1);
    });

    it.each([
        ["off", undefined],
        ["on", "1"],
    ])(
        "leaves nothing behind when the third of eight sessions is full (RLS enforcement %s)",
        async (_label, rls) => {
            const before = process.env.RLS_ENFORCEMENT;
            // eslint-disable-next-line no-restricted-properties -- the proxy reads this live
            if (rls) process.env.RLS_ENFORCEMENT = rls;
            try {
                await runInOrgContext(org.organizationId, () =>
                    thirdSessionFull(),
                );
            } finally {
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                if (before === undefined) delete process.env.RLS_ENFORCEMENT;
                // eslint-disable-next-line no-restricted-properties -- restore what the test changed
                else process.env.RLS_ENFORCEMENT = before;
            }
        },
    );

    it("keeps a session's unsold seats from a public booker", async () => {
        const serviceId = await makeService(2);
        await openCourse(serviceId, 2, [7]);
        await expect(
            publicBookings.book(
                serviceId,
                {
                    startAt: slot(7).toISOString(),
                    bookerEmail: "public@example.com",
                },
                undefined,
            ),
        ).rejects.toThrow("fully booked");
        // A time the course does not hold is still open.
        await expect(
            publicBookings.book(
                serviceId,
                {
                    startAt: slot(8).toISOString(),
                    bookerEmail: "public@example.com",
                },
                undefined,
            ),
        ).resolves.toBeDefined();
    });

    it("holds no seats while the business has Courses switched off", async () => {
        const serviceId = await makeService(2);
        await openCourse(serviceId, 2, [9]);
        await prisma.organizationModule.create({
            data: {
                organizationId: org.organizationId,
                moduleKey: "COURSES",
                status: "DISABLED",
            },
        });
        try {
            await expect(
                publicBookings.book(
                    serviceId,
                    {
                        startAt: slot(9).toISOString(),
                        bookerEmail: "public@example.com",
                    },
                    undefined,
                ),
            ).resolves.toBeDefined();
        } finally {
            await prisma.organizationModule.deleteMany({
                where: {
                    organizationId: org.organizationId,
                    moduleKey: "COURSES",
                },
            });
        }
    });

    it("lets someone enrol again after cancelling, and cancels only what was still to come", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 4, WEEKS.slice(0, 3));
        const contactId = await person();
        const first = await courses.enrol(org, courseId, { contactId });
        // Their first session has since happened.
        const [past] = await bookingsOf(first.id);
        await prisma.booking.update({
            where: { id: past!.id },
            data: {
                startAt: slot(-1),
                endAt: new Date(slot(-1).getTime() + 3_600_000),
            },
        });

        await courses.cancelEnrollment(org, courseId, first.id);
        expect(
            await prisma.booking.findUnique({ where: { id: past!.id } }),
        ).toMatchObject({ status: "CONFIRMED" });
        expect(await bookingsOf(first.id)).toHaveLength(1);

        const again = await courses.enrol(org, courseId, { contactId });
        expect(again.status).toBe("ACTIVE");
        expect(await bookingsOf(again.id)).toHaveLength(3);
    });

    it("cancels a deleted contact's course sessions still to come", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 4, WEEKS.slice(0, 3));
        const contactId = await person();
        const enrolled = await courses.enrol(org, courseId, { contactId });
        const ids = (await bookingsOf(enrolled.id)).map((b) => b.id);

        // The course's invoice keeps their record (DEC-042): refused, and
        // their sessions stand.
        await expect(
            new ContactsService().remove(org, contactId),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(await bookingsOf(enrolled.id)).toHaveLength(3);

        // Enrolled with no paper (as with Payments off), they can go.
        await prisma.invoice.deleteMany({ where: { contactId } });
        const removed = await new ContactsService().remove(org, contactId);
        expect(removed).toMatchObject({ courses: 1, bookingsCancelled: 3 });
        expect(
            await prisma.booking.count({
                where: { id: { in: ids }, status: "CANCELLED" },
            }),
        ).toBe(3);
    });
});

// U17 (#1148): enrolling and cancelling tell the student, once each, under
// the COURSE switch; the sessions are not told one by one.
describe("course notices (real database)", () => {
    const courseJobs = (enrollmentId: string) =>
        prisma.job.findMany({
            where: {
                organizationId: org.organizationId,
                type: "customer.notify",
                payload: {
                    path: ["courseEnrollmentId"],
                    equals: enrollmentId,
                },
            },
            orderBy: { createdAt: "asc" },
        });

    const load = (kind: "COURSE_ENROLLED" | "COURSE_CANCELLED", id: string) =>
        runInOrgContext(org.organizationId, () =>
            prisma.$transaction((tx) =>
                loadSubject(tx, org.organizationId, {
                    kind,
                    eventKey: `${kind}:${id}`,
                    courseEnrollmentId: id,
                }),
            ),
        );

    it("enrolling in an 8-session course queues one notice that lists all 8", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 4, WEEKS);
        const contactId = await person();
        const enrolled = await courses.enrol(org, courseId, { contactId });

        const jobs = await courseJobs(enrolled.id);
        expect(jobs.map((j) => j.payload)).toEqual([
            {
                kind: "COURSE_ENROLLED",
                eventKey: `course-enrolled:${enrolled.id}`,
                courseEnrollmentId: enrolled.id,
            },
        ]);
        // No session is told on its own.
        const sessionIds = (await bookingsOf(enrolled.id)).map((b) => b.id);
        expect(
            await prisma.job.count({
                where: {
                    type: "booking.notify",
                    OR: sessionIds.map((id) => ({
                        payload: { path: ["bookingId"], equals: id },
                    })),
                },
            }),
        ).toBe(0);

        const subject = await load("COURSE_ENROLLED", enrolled.id);
        expect(subject?.contactId).toBe(contactId);
        if (subject?.vars.kind !== "COURSE_ENROLLED") throw new Error("kind");
        expect(subject.vars.course.sessions).toHaveLength(8);
        expect(noticeSentence(subject.vars)).toMatch(
            /^You're enrolled in Beginners' wheel: 8 sessions, from /,
        );
        const email = renderNotice(subject.vars);
        expect(email.subject).toBe(
            "You're enrolled in Beginners' wheel at Courses Org",
        );
        expect(email.body.match(/<li>/g)).toHaveLength(8);
    });

    it("cancelling tells them, with the invoice as it stands, and an enrolment told it is cancelled is not told it is enrolled", async () => {
        const serviceId = await makeService(10);
        const courseId = await openCourse(serviceId, 4, WEEKS.slice(0, 3));
        const enrolled = await courses.enrol(org, courseId, {
            contactId: await person(),
        });
        await courses.cancelEnrollment(org, courseId, enrolled.id);

        expect(
            (await courseJobs(enrolled.id)).map(
                (j) => (j.payload as { kind: string }).kind,
            ),
        ).toEqual(["COURSE_ENROLLED", "COURSE_CANCELLED"]);
        expect(await load("COURSE_ENROLLED", enrolled.id)).toBeNull();

        const open = await load("COURSE_CANCELLED", enrolled.id);
        if (open?.vars.kind !== "COURSE_CANCELLED") throw new Error("kind");
        expect(open.vars.course.sessions).toHaveLength(3);
        expect(open.vars.course.money).toMatchObject({ state: "OPEN" });
        expect(noticeSentence(open.vars)).toContain(
            "Its 3 sessions still to come are cancelled.",
        );
        expect(noticeSentence(open.vars)).toContain("invoice is still open");

        // Paid before the cancel: what they paid is not refunded by it.
        await prisma.invoice.updateMany({
            where: { courseEnrollmentId: enrolled.id },
            data: { status: "PAID", paidAt: new Date() },
        });
        const paid = await load("COURSE_CANCELLED", enrolled.id);
        if (paid?.vars.kind !== "COURSE_CANCELLED") throw new Error("kind");
        expect(paid.vars.course.money).toMatchObject({ state: "PAID" });
        expect(noticeSentence(paid.vars)).toMatch(
            /The ₹[\d,.]+ you paid hasn't been refunded\. Ask Courses Org/,
        );
    });

    it("with Course emails off, nothing is queued", async () => {
        await prisma.customerNoticeSetting.create({
            data: {
                organizationId: org.organizationId,
                kind: "COURSE",
                enabled: false,
            },
        });
        try {
            const serviceId = await makeService(10);
            const courseId = await openCourse(serviceId, 4, WEEKS.slice(0, 2));
            const enrolled = await courses.enrol(org, courseId, {
                contactId: await person(),
            });
            await courses.cancelEnrollment(org, courseId, enrolled.id);
            expect(await courseJobs(enrolled.id)).toHaveLength(0);
        } finally {
            await prisma.customerNoticeSetting.deleteMany({
                where: { organizationId: org.organizationId },
            });
        }
    });
});
