// Courses with a mocked database: who may, whose ids are trusted, what an
// enrolment books and invoices, and the plain refusals. The races and the
// held seats run against a real Postgres in courses.db.spec.ts.
// The business-details refusal (DEC-068) has its own specs
// (`business-details.spec.ts`, `business-details.db.spec.ts`); here
// the business has its address.
jest.mock("../invoices/business-details", () => ({
    ...jest.requireActual<typeof import("../invoices/business-details")>(
        "../invoices/business-details",
    ),
    assertBusinessDetails: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const tx = {
        $queryRaw: jest.fn(),
        course: { findFirst: jest.fn(), update: jest.fn() },
        courseSession: {
            create: jest.fn(),
            findFirst: jest.fn(),
            delete: jest.fn(),
        },
        courseEnrollment: {
            count: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
        },
        booking: {
            count: jest.fn(),
            findMany: jest.fn(),
            updateMany: jest.fn(),
        },
        bookingEvent: { createMany: jest.fn() },
        organizationModule: { findFirst: jest.fn() },
        // Whether the business is registered, asked at an enrolment.
        businessProfile: { findUnique: jest.fn() },
        // A course's price history entry, written with its save.
        auditEvent: { create: jest.fn() },
    };
    // Making a course is one transaction with its first price history
    // entry: the specs read the create off either client.
    const courseCreate = jest.fn();
    Object.assign(tx.course, { create: courseCreate });
    return {
        ...actual,
        prisma: {
            course: {
                findFirst: jest.fn(),
                findMany: jest.fn(),
                create: courseCreate,
            },
            courseEnrollment: { findMany: jest.fn(), findFirst: jest.fn() },
            booking: { groupBy: jest.fn() },
            contact: { findFirst: jest.fn() },
            service: { findFirst: jest.fn() },
            organizationModule: { findFirst: jest.fn() },
            // How the business's prices carry GST, for a read's amount to pay.
            businessProfile: { findUnique: jest.fn() },
            // A course's price history, as its page reads it.
            auditEvent: { findMany: jest.fn() },
            user: { findMany: jest.fn() },
            $transaction: jest.fn(
                (fn: (t: typeof tx) => unknown, _opts?: unknown) => fn(tx),
            ),
            __tx: tx,
        },
    };
});

import "reflect-metadata";

import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { BookingsService } from "../bookings/bookings.service";
import type { InvoicesService } from "../invoices/invoices.service";
import { resolveCapabilities } from "../organizations/organization-policy";
import { CoursesService } from "./courses.service";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked> & {
    $transaction: jest.Mock;
    __tx: Record<string, Mocked> & { $queryRaw: jest.Mock };
};
const tx = db.__tx;

const owner: OrganizationContext = {
    organizationId: "org_1",
    userId: "user_1",
    role: "OWNER",
};
const member: OrganizationContext = { ...owner, role: "MEMBER" };

const reserveInTx = jest.fn();
const issueInTx = jest.fn();
const service = new CoursesService(
    { reserveInTx } as unknown as BookingsService,
    { issueInTx } as unknown as InvoicesService,
);

const decimal = (s: string) => ({ toString: () => s });
const at = (s: string) => new Date(s);
const DAY = 86_400_000;

const SERVICE = {
    id: "svc_1",
    organizationId: "org_1",
    name: "Pottery",
    capacity: 10,
    durationMinutes: 90,
    currency: "INR",
    deletedAt: null,
};
const CONTACT = {
    id: "c_1",
    email: "asha@example.com",
    firstName: "Asha",
    lastName: "Rao",
    phone: null,
};

/** A course as the enrolment transaction reads it under its lock. */
function lockedCourse(over: Record<string, unknown> = {}) {
    const now = Date.now();
    return {
        id: "course_1",
        name: "Beginners' wheel",
        price: decimal("8000"),
        currency: "INR",
        seats: 8,
        status: "OPEN",
        service: SERVICE,
        sessions: Array.from({ length: 8 }, (_, i) => ({
            startAt: new Date(now + (i + 1) * 7 * DAY),
            endAt: new Date(now + (i + 1) * 7 * DAY + 90 * 60_000),
        })),
        _count: { enrollments: 3 },
        ...over,
    };
}

const COURSE_ROW = {
    id: "course_1",
    name: "Beginners' wheel",
    description: null,
    price: decimal("8000"),
    currency: "INR",
    seats: 8,
    status: "OPEN",
    createdAt: at("2026-09-01T00:00:00Z"),
    updatedAt: at("2026-09-01T00:00:00Z"),
    service: {
        id: "svc_1",
        name: "Pottery",
        capacity: 10,
        durationMinutes: 90,
    },
    sessions: [],
    _count: { enrollments: 3 },
};

const ENROLLMENT_ROW = {
    id: "enr_1",
    status: "ACTIVE",
    price: decimal("8000"),
    currency: "INR",
    cancelledAt: null,
    createdAt: at("2026-09-22T10:00:00Z"),
    course: { id: "course_1", name: "Beginners' wheel" },
    contact: CONTACT,
    invoices: [
        {
            id: "inv_1",
            number: "INV-0001",
            status: "PAID",
            dueAt: at("2026-09-29T00:00:00Z"),
        },
    ],
};

beforeEach(() => {
    jest.clearAllMocks();
    tx.$queryRaw.mockResolvedValue([{ id: "course_1" }]);
    tx.course!.findFirst!.mockResolvedValue(lockedCourse());
    tx.courseEnrollment!.count!.mockResolvedValue(0);
    tx.courseEnrollment!.create!.mockResolvedValue({ id: "enr_1" });
    tx.courseEnrollment!.findMany!.mockResolvedValue([]);
    tx.booking!.findMany!.mockResolvedValue([]);
    tx.organizationModule!.findFirst!.mockResolvedValue(null);
    db.contact!.findFirst!.mockResolvedValue(CONTACT);
    db.service!.findFirst!.mockResolvedValue(SERVICE);
    db.course!.findFirst!.mockResolvedValue(COURSE_ROW);
    db.course!.create!.mockResolvedValue({ id: "course_1" });
    db.courseEnrollment!.findMany!.mockResolvedValue([]);
    db.courseEnrollment!.findFirst!.mockResolvedValue(ENROLLMENT_ROW);
    db.booking!.groupBy!.mockResolvedValue([]);
    db.organizationModule!.findFirst!.mockResolvedValue(null);
    reserveInTx.mockResolvedValue({ id: "bk" });
    issueInTx.mockResolvedValue({ id: "inv_1", number: "INV-0001" });
});

describe("enrolling", () => {
    it("books every session still to come and invoices the course price, in one serializable transaction", async () => {
        await service.enrol(owner, "course_1", { contactId: "c_1" });

        expect(db.$transaction.mock.calls[0]![1]).toMatchObject({
            isolationLevel: "Serializable",
        });
        // The course lock comes before anything is read.
        expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
            tx.course!.findFirst!.mock.invocationCallOrder[0]!,
        );
        expect(tx.courseEnrollment!.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    courseId: "course_1",
                    contactId: "c_1",
                    price: "8000.00",
                }),
            }),
        );
        expect(reserveInTx).toHaveBeenCalledTimes(8);
        expect(reserveInTx.mock.calls[0]![4]).toMatchObject({
            bookerEmail: "asha@example.com",
            bookerName: "Asha Rao",
        });
        expect(reserveInTx.mock.calls[0]![6]).toEqual({
            courseId: "course_1",
            enrollmentId: "enr_1",
        });
        expect(issueInTx).toHaveBeenCalledWith(
            tx,
            "org_1",
            expect.objectContaining({
                source: "COURSE",
                courseEnrollmentId: "enr_1",
                lines: [
                    {
                        description: "Beginners' wheel · 8 sessions",
                        quantity: 1,
                        unitPrice: "8000.00",
                    },
                ],
            }),
        );
    });

    it("books only the sessions still to come after a late start, at the price given", async () => {
        const course = lockedCourse();
        tx.course!.findFirst!.mockResolvedValue({
            ...course,
            sessions: course.sessions.slice(2),
        });
        await service.enrol(owner, "course_1", {
            contactId: "c_1",
            price: "6000",
        });
        expect(reserveInTx).toHaveBeenCalledTimes(6);
        expect(issueInTx.mock.calls[0]![2].lines[0]).toMatchObject({
            description: "Beginners' wheel · 6 sessions",
            // The price typed for them, written as money.
            unitPrice: "6000.00",
        });
        // Only future sessions were asked for.
        expect(
            tx.course!.findFirst!.mock.calls[0]![0].select.sessions.where,
        ).toEqual({ startAt: { gt: expect.any(Date) } });
    });

    it("issues no invoice with Payments off, and still enrols", async () => {
        tx.organizationModule!.findFirst!.mockResolvedValue({ id: "m_1" });
        await service.enrol(owner, "course_1", { contactId: "c_1" });
        expect(reserveInTx).toHaveBeenCalledTimes(8);
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it.each([
        ["a draft", { status: "DRAFT" }, "This course is not open yet."],
        ["a closed course", { status: "CLOSED" }, "not taking enrolments"],
        ["one whose sessions have all passed", { sessions: [] }, "have passed"],
        ["a full one", { _count: { enrollments: 8 } }, "The course is full."],
    ])("refuses %s", async (_label, over, message) => {
        tx.course!.findFirst!.mockResolvedValue(lockedCourse(over));
        const attempt = service.enrol(owner, "course_1", { contactId: "c_1" });
        await expect(attempt).rejects.toBeInstanceOf(ConflictException);
        await expect(attempt).rejects.toThrow(message);
        expect(tx.courseEnrollment!.create).not.toHaveBeenCalled();
        expect(reserveInTx).not.toHaveBeenCalled();
    });

    it("refuses someone already on the course", async () => {
        tx.courseEnrollment!.count!.mockResolvedValue(1);
        await expect(
            service.enrol(owner, "course_1", { contactId: "c_1" }),
        ).rejects.toThrow("They are already on this course.");
    });

    it("answers the same person enrolled twice at once with a 409", async () => {
        db.$transaction.mockRejectedValueOnce(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(
            service.enrol(owner, "course_1", { contactId: "c_1" }),
        ).rejects.toThrow("They are already on this course.");
    });

    it("says a session is full in the course's words, not the booking core's", async () => {
        reserveInTx
            .mockResolvedValueOnce({ id: "bk_1" })
            .mockResolvedValueOnce({ id: "bk_2" })
            .mockRejectedValueOnce(
                new ConflictException("That time is fully booked."),
            );
        await expect(
            service.enrol(owner, "course_1", { contactId: "c_1" }),
        ).rejects.toThrow("One of the course's sessions has no room left.");
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("tries a lost race once more, then answers with a 409", async () => {
        db.$transaction
            .mockRejectedValueOnce(
                Object.assign(new Error("race"), { code: "P2034" }),
            )
            .mockRejectedValueOnce(
                Object.assign(new Error("race"), { code: "P2034" }),
            );
        await expect(
            service.enrol(owner, "course_1", { contactId: "c_1" }),
        ).rejects.toThrow("That changed while you were enrolling them.");
        expect(db.$transaction).toHaveBeenCalledTimes(2);
    });

    it("404s another business's contact before any transaction", async () => {
        db.contact!.findFirst!.mockResolvedValue(null);
        await expect(
            service.enrol(owner, "course_1", { contactId: "c_other" }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.contact!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "c_other", organizationId: "org_1" },
            }),
        );
        expect(db.$transaction).not.toHaveBeenCalled();
    });
});

describe("sessions", () => {
    const later = () => new Date(Date.now() + 30 * DAY).toISOString();

    it("books everyone on the course into a session added later", async () => {
        tx.course!.findFirst!.mockResolvedValue({
            id: "course_1",
            status: "OPEN",
            service: SERVICE,
            sessions: [],
        });
        tx.courseEnrollment!.findMany!.mockResolvedValue([
            { id: "enr_1", contact: CONTACT },
            { id: "enr_2", contact: { ...CONTACT, email: "b@example.com" } },
        ]);
        const startAt = later();
        await service.addSession(owner, "course_1", { startAt });

        expect(tx.courseSession!.create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                courseId: "course_1",
                startAt: new Date(startAt),
                endAt: new Date(Date.parse(startAt) + 90 * 60_000),
            },
        });
        expect(reserveInTx).toHaveBeenCalledTimes(2);
        expect(reserveInTx.mock.calls[1]![6]).toEqual({
            courseId: "course_1",
            enrollmentId: "enr_2",
        });
        expect(tx.courseEnrollment!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { courseId: "course_1", status: "ACTIVE" },
            }),
        );
    });

    it("refuses a session in the past, or at a time the course already has", async () => {
        await expect(
            service.addSession(owner, "course_1", {
                startAt: new Date(Date.now() - DAY).toISOString(),
            }),
        ).rejects.toBeInstanceOf(BadRequestException);

        const startAt = later();
        tx.course!.findFirst!.mockResolvedValue({
            id: "course_1",
            status: "OPEN",
            service: SERVICE,
            sessions: [{ startAt: new Date(startAt) }],
        });
        await expect(
            service.addSession(owner, "course_1", { startAt }),
        ).rejects.toThrow("already has a session then");
    });

    it("refuses to remove a session people are booked on", async () => {
        tx.courseSession!.findFirst!.mockResolvedValue({
            id: "ses_1",
            startAt: at("2026-10-01T09:00:00Z"),
        });
        tx.booking!.count!.mockResolvedValue(3);
        await expect(
            service.removeSession(owner, "course_1", "ses_1"),
        ).rejects.toThrow("3 people are booked on this session.");
        expect(tx.courseSession!.delete).not.toHaveBeenCalled();
    });

    it("removes a session nobody is booked on", async () => {
        tx.courseSession!.findFirst!.mockResolvedValue({
            id: "ses_1",
            startAt: at("2026-10-01T09:00:00Z"),
        });
        tx.booking!.count!.mockResolvedValue(0);
        await service.removeSession(owner, "course_1", "ses_1");
        expect(tx.courseSession!.delete).toHaveBeenCalledWith({
            where: { id: "ses_1" },
        });
    });
});

describe("cancelling an enrolment", () => {
    it("cancels only the sessions still to come, with their history, and keeps the invoice", async () => {
        tx.courseEnrollment!.findFirst!.mockResolvedValue({
            id: "enr_1",
            status: "ACTIVE",
        });
        const startAt = new Date(Date.now() + 7 * DAY);
        tx.booking!.findMany!.mockResolvedValue([{ id: "bk_9", startAt }]);

        await service.cancelEnrollment(owner, "course_1", "enr_1");

        expect(tx.courseEnrollment!.update).toHaveBeenCalledWith({
            where: { id: "enr_1" },
            data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
        });
        expect(tx.booking!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    courseEnrollmentId: "enr_1",
                    organizationId: "org_1",
                    status: "CONFIRMED",
                    startAt: { gt: expect.any(Date) },
                },
            }),
        );
        expect(tx.booking!.updateMany).toHaveBeenCalledWith({
            where: { id: { in: ["bk_9"] } },
            data: { status: "CANCELLED", cancelledAt: expect.any(Date) },
        });
        expect(tx.bookingEvent!.createMany).toHaveBeenCalledWith({
            data: [
                expect.objectContaining({
                    bookingId: "bk_9",
                    type: "CANCELLED",
                    actorUserId: "user_1",
                    fromStartAt: startAt,
                }),
            ],
        });
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("refuses one already cancelled", async () => {
        tx.courseEnrollment!.findFirst!.mockResolvedValue({
            id: "enr_1",
            status: "CANCELLED",
        });
        await expect(
            service.cancelEnrollment(owner, "course_1", "enr_1"),
        ).rejects.toThrow("already cancelled");
    });
});

describe("making and changing a course", () => {
    it("refuses more seats than its service takes at once", async () => {
        await expect(
            service.create(owner, {
                serviceId: "svc_1",
                name: "Wheel",
                price: "8000",
                seats: 12,
            }),
        ).rejects.toThrow("at most 10 seats");
        expect(db.course!.create).not.toHaveBeenCalled();
    });

    it("404s another business's service", async () => {
        db.service!.findFirst!.mockResolvedValue(null);
        await expect(
            service.create(owner, {
                serviceId: "svc_other",
                name: "Wheel",
                price: "8000",
                seats: 4,
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.service!.findFirst).toHaveBeenCalledWith({
            where: {
                id: "svc_other",
                organizationId: "org_1",
                deletedAt: null,
            },
        });
    });

    it("makes its sessions the service's length, and will not open without one", async () => {
        await service.create(owner, {
            serviceId: "svc_1",
            name: "Wheel",
            price: "8000",
            seats: 4,
            sessions: ["2026-10-08T09:00:00.000Z", "2026-10-01T09:00:00.000Z"],
        });
        expect(
            db.course!.create.mock.calls[0]![0].data.sessions.create,
        ).toEqual([
            {
                organizationId: "org_1",
                startAt: at("2026-10-01T09:00:00Z"),
                endAt: at("2026-10-01T10:30:00Z"),
            },
            {
                organizationId: "org_1",
                startAt: at("2026-10-08T09:00:00Z"),
                endAt: at("2026-10-08T10:30:00Z"),
            },
        ]);
        await expect(
            service.create(owner, {
                serviceId: "svc_1",
                name: "Wheel",
                price: "8000",
                seats: 4,
                status: "OPEN",
            }),
        ).rejects.toThrow("Add a session before opening the course");
    });

    it("will not drop seats below the people on it, or move it to another service", async () => {
        tx.course!.findFirst!.mockResolvedValue({
            serviceId: "svc_1",
            status: "OPEN",
            service: { capacity: 10 },
            _count: { sessions: 8, enrollments: 5 },
        });
        await expect(
            service.update(owner, "course_1", { seats: 4 }),
        ).rejects.toThrow("5 people are on this course");
        await expect(
            service.update(owner, "course_1", { serviceId: "svc_2" }),
        ).rejects.toThrow("stays on the service it was made for");
    });

    it("will not archive while people are still booked on sessions to come", async () => {
        tx.course!.findFirst!.mockResolvedValue({
            serviceId: "svc_1",
            status: "CLOSED",
            service: { capacity: 10 },
            _count: { sessions: 8, enrollments: 5 },
        });
        tx.booking!.count!.mockResolvedValue(12);
        await expect(
            service.update(owner, "course_1", { status: "ARCHIVED" }),
        ).rejects.toThrow("Close it instead");
        expect(tx.course!.update).not.toHaveBeenCalled();
    });
});

describe("the course page", () => {
    it("counts who is booked on each session, and says whether enrolling invoices", async () => {
        const start = at("2026-10-06T17:30:00Z");
        db.course!.findFirst!.mockResolvedValue({
            ...COURSE_ROW,
            sessions: [
                {
                    id: "ses_1",
                    startAt: start,
                    endAt: at("2026-10-06T19:30:00Z"),
                },
            ],
        });
        db.booking!.groupBy!.mockImplementation((args: { by: string[] }) =>
            Promise.resolve(
                args.by[0] === "startAt"
                    ? [{ startAt: start, _count: { _all: 7 } }]
                    : [],
            ),
        );
        db.courseEnrollment!.findMany!.mockResolvedValue([ENROLLMENT_ROW]);
        const detail = await service.get(owner, "course_1");
        expect(detail.sessions[0]).toMatchObject({ id: "ses_1", booked: 7 });
        expect(detail.invoicesOnEnrol).toBe(true);
        expect(detail.enrollments[0]!.invoice).toEqual({
            id: "inv_1",
            number: "INV-0001",
            standing: "PAID",
        });
    });

    it("leaves the invoice off for a role that may not read invoices", async () => {
        db.courseEnrollment!.findMany!.mockResolvedValue([ENROLLMENT_ROW]);
        const desk: OrganizationContext = {
            ...owner,
            role: "MEMBER",
            roleKey: "front-desk",
            actions: resolveCapabilities("front-desk", ["course:read"]),
        };
        const detail = await service.get(desk, "course_1");
        expect(detail.enrollments[0]!.invoice).toBeNull();
    });
});

describe("who may", () => {
    it("refuses a Member every read and write", async () => {
        await expect(service.list(member, {})).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(service.get(member, "course_1")).rejects.toBeInstanceOf(
            ForbiddenException,
        );
        await expect(
            service.enrol(member, "course_1", { contactId: "c_1" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.cancelEnrollment(member, "course_1", "enr_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
            service.addSession(member, "course_1", {
                startAt: new Date(Date.now() + DAY).toISOString(),
            }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it("reads a course in this business only", async () => {
        db.course!.findFirst!.mockResolvedValue(null);
        await expect(service.get(owner, "course_other")).rejects.toBeInstanceOf(
            NotFoundException,
        );
        expect(db.course!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "course_other", organizationId: "org_1" },
            }),
        );
    });
});

// — GST on a course (12 Oct 2026) ————————————————————————————————————
//
// A course carries a GST rate, a SAC code and its own way of carrying GST.
// An enrolment takes its amount to pay from `invoices/sale-price.ts`; the
// enrolment and its invoice both keep that amount.
describe("GST on a course enrolment", () => {
    const registered = (gstPriceMode: "INCLUDED" | "ADDED") => ({
        gstRegistered: true,
        taxId: "29ABCDE1234F1Z5",
        gstState: "29",
        gstPriceMode,
    });
    const business = (profile: Record<string, unknown> | null) =>
        tx.businessProfile!.findUnique!.mockResolvedValue(profile);
    const course = (gst: Record<string, unknown>) =>
        tx.course!.findFirst!.mockResolvedValue(
            lockedCourse({ gstRate: null, sacCode: null, ...gst }),
        );
    const enrol = (price?: string) =>
        service.enrol(owner, "course_1", {
            contactId: "c_1",
            ...(price ? { price } : {}),
        });
    const enrolled = () => tx.courseEnrollment!.create!.mock.calls[0]![0].data;
    const line = () => issueInTx.mock.calls[0]![2].lines[0];

    it("a business that is not registered enrols unchanged to the paisa, whatever the course's rate", async () => {
        business({ gstRegistered: false });
        course({ gstRate: decimal("18.00") });
        await enrol();
        expect(enrolled().price).toBe("8000.00");
        expect(issueInTx.mock.calls[0]![2].lines).toEqual([
            {
                description: "Beginners' wheel · 8 sessions",
                quantity: 1,
                unitPrice: "8000.00",
            },
        ]);
    });

    it("refuses a registered business's course with no rate, naming it, before anyone is enrolled or booked", async () => {
        business(registered("INCLUDED"));
        course({ gstRate: null });
        const err = await enrol().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toEqual({
            message:
                "Beginners' wheel has no GST rate. Choose one to issue this invoice.",
            details: {
                reason: "GST_RATE_MISSING",
                items: [
                    {
                        kind: "COURSE",
                        id: "course_1",
                        name: "Beginners' wheel",
                    },
                ],
            },
        });
        expect(tx.courseEnrollment!.create).not.toHaveBeenCalled();
        expect(reserveInTx).not.toHaveBeenCalled();
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("with Payments off writes no invoice, so nothing is asked", async () => {
        business(registered("INCLUDED"));
        course({ gstRate: null });
        tx.organizationModule!.findFirst!.mockResolvedValue({ id: "mod_1" });
        await expect(enrol()).resolves.toBeDefined();
        expect(issueInTx).not.toHaveBeenCalled();
    });

    it("a free course asks for no rate: there is no tax to choose", async () => {
        business(registered("INCLUDED"));
        course({ gstRate: null, price: decimal("0") });
        await expect(enrol()).resolves.toBeDefined();
        expect(enrolled().price).toBe("0.00");
    });

    it("includes GST: ₹8,000 to pay, and the line carries the rate so the paper shows the split", async () => {
        business(registered("INCLUDED"));
        course({ gstRate: decimal("18.00"), sacCode: "999293" });
        await enrol();
        expect(enrolled().price).toBe("8000.00");
        expect(line()).toEqual({
            description: "Beginners' wheel · 8 sessions",
            quantity: 1,
            unitPrice: "8000.00",
            gstRate: "18",
            hsnSac: "999293",
            priceMode: "INCLUDED",
        });
    });

    it("GST is added: ₹8,000 at 18% is ₹9,440 to pay, on the enrolment and its invoice", async () => {
        business(registered("ADDED"));
        course({ gstRate: decimal("18.00") });
        await enrol();
        expect(enrolled().price).toBe("9440.00");
        expect(line()).toEqual({
            description: "Beginners' wheel · 8 sessions",
            quantity: 1,
            unitPrice: "9440.00",
            gstRate: "18",
            hsnSac: null,
            priceMode: "ADDED",
        });
    });

    it("a price typed for one person is a typed price too: ₹6,000 for a late start is ₹7,080 where GST is added", async () => {
        business(registered("ADDED"));
        course({ gstRate: decimal("18.00") });
        await enrol("6000");
        expect(enrolled().price).toBe("7080.00");
        expect(line().unitPrice).toBe("7080.00");
    });

    it("and stays ₹6,000 where prices include GST", async () => {
        business(registered("INCLUDED"));
        course({ gstRate: decimal("18.00") });
        await enrol("6000");
        expect(enrolled().price).toBe("6000.00");
    });

    it("a course priced the other way from the business follows its own choice", async () => {
        business(registered("INCLUDED"));
        course({ gstRate: decimal("12.00"), gstPriceMode: "ADDED" });
        await enrol();
        // ₹8,000 + 12% = ₹8,960.
        expect(enrolled().price).toBe("8960.00");
    });
});

// — What the merchant reads of a course's price (12 Oct 2026) ————————
//
// One figure, one kind: `price` is the price the business set; `gst` says
// the GST in or on it and what an enrolment comes to, by the sum `enrol`
// uses. An enrolment's own `price` is what was charged.
describe("a course's price as the merchant reads it", () => {
    const registered = (gstPriceMode: "INCLUDED" | "ADDED") => ({
        gstRegistered: true,
        taxId: "29ABCDE1234F1Z5",
        gstState: "29",
        gstPriceMode,
    });
    const read = async (
        profile: Record<string, unknown> | null,
        gst: Record<string, unknown>,
    ) => {
        db.businessProfile!.findUnique!.mockResolvedValue(profile);
        db.course!.findFirst!.mockResolvedValue({ ...COURSE_ROW, ...gst });
        db.courseEnrollment!.findMany!.mockResolvedValue([]);
        db.booking!.groupBy!.mockResolvedValue([]);
        return service.get(owner, "course_1");
    };

    it("GST is added: ₹8,000 is the price, ₹9,440 the amount to pay", async () => {
        const course = await read(registered("ADDED"), {
            gstRate: decimal("18.00"),
        });
        expect(course.price).toBe("8000.00");
        expect(course.gst).toEqual({
            mode: "ADDED",
            rate: "18",
            listCents: 800_000,
            gstCents: 144_000,
            payCents: 944_000,
        });
    });

    it("prices include GST: ₹8,000 is both, with the GST inside it", async () => {
        const course = await read(registered("INCLUDED"), {
            gstRate: decimal("18.00"),
        });
        expect(course.price).toBe("8000.00");
        expect(course.gst).toEqual({
            mode: "INCLUDED",
            rate: "18",
            listCents: 800_000,
            gstCents: 122_034,
            payCents: 800_000,
        });
    });

    it("not registered, or no rate: nothing is said about GST", async () => {
        expect(
            (
                await read(
                    { gstRegistered: false },
                    { gstRate: decimal("18.00") },
                )
            ).gst,
        ).toBeNull();
        db.businessProfile!.findUnique!.mockClear();
        const unrated = await read(registered("ADDED"), { gstRate: null });
        expect(unrated.gst).toBeNull();
        expect(unrated.price).toBe("8000.00");
        // With no rate there is nothing to work out, and nothing is read.
        expect(db.businessProfile!.findUnique).not.toHaveBeenCalled();
    });

    it("the list says the same of each course", async () => {
        db.businessProfile!.findUnique!.mockResolvedValue(registered("ADDED"));
        db.course!.findMany!.mockResolvedValue([
            { ...COURSE_ROW, gstRate: decimal("18.00") },
        ]);
        const [course] = await service.list(owner, {});
        expect(course!.gst?.payCents).toBe(944_000);
    });
});

describe("a course's price history (12 Oct 2026)", () => {
    const entries = () =>
        tx.auditEvent!.create!.mock.calls.map(
            (call) => (call[0] as { data: Record<string, unknown> }).data,
        );
    /** The course under its lock, as the save reads it. */
    const locked = (over: Record<string, unknown> = {}) => ({
        id: "course_1",
        name: "Beginners' wheel",
        price: decimal("8000"),
        currency: "INR",
        gstRate: null,
        gstPriceMode: null,
        serviceId: "svc_1",
        status: "OPEN",
        service: { capacity: 10 },
        _count: { sessions: 8, enrollments: 0 },
        ...over,
    });

    beforeEach(() => {
        tx.course!.findFirst!.mockResolvedValue(locked());
        // The row a save returns: the course as it was, with what was sent.
        tx.course!.update!.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ ...locked(), ...data }),
        );
        db.course!.create!.mockImplementation(
            ({ data }: { data: Record<string, unknown> }) =>
                Promise.resolve({ id: "course_new", ...data }),
        );
    });

    it("a new course starts its history at what it was made at", async () => {
        await service.create(owner, {
            serviceId: "svc_1",
            name: "Wheel",
            price: "8000",
            seats: 4,
            gstRate: "18",
            gstPriceMode: "ADDED",
        });
        expect(entries()).toEqual([
            {
                action: "price.set",
                actorUserId: "user_1",
                organizationId: "org_1",
                targetType: "course",
                targetId: "course_new",
                outcome: "SUCCESS",
                metadata: {
                    kind: "COURSE",
                    name: "Wheel",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: null, after: "8000.00" },
                        { field: "gstRate", before: null, after: "18" },
                        { field: "gstPriceMode", before: null, after: "ADDED" },
                    ],
                },
            },
        ]);
    });

    it("a new price and rate are one entry, before and after, on the save's transaction", async () => {
        await service.update(owner, "course_1", {
            price: "9000",
            gstRate: "18",
        });
        expect(entries()).toEqual([
            expect.objectContaining({
                action: "price.changed",
                actorUserId: "user_1",
                targetType: "course",
                targetId: "course_1",
                metadata: {
                    kind: "COURSE",
                    name: "Beginners' wheel",
                    currency: "INR",
                    source: "editor",
                    changes: [
                        { field: "price", before: "8000.00", after: "9000.00" },
                        { field: "gstRate", before: null, after: "18" },
                    ],
                },
            }),
        ]);
    });

    it("keeps nothing when the cost did not move", async () => {
        await service.update(owner, "course_1", {
            name: "Wheel for beginners",
            seats: 6,
            price: "8000.00",
        });
        expect(tx.course!.update).toHaveBeenCalledTimes(1);
        expect(entries()).toEqual([]);
    });

    it("keeps nothing when the save is refused or fails", async () => {
        tx.course!.findFirst!.mockResolvedValue(
            locked({ _count: { sessions: 8, enrollments: 5 } }),
        );
        await expect(
            service.update(owner, "course_1", { seats: 4, price: "9000" }),
        ).rejects.toThrow("5 people are on this course");
        await expect(
            service.update(member, "course_1", { price: "9000" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        tx.course!.findFirst!.mockResolvedValue(locked());
        tx.course!.update!.mockRejectedValue(new Error("the database went"));
        await expect(
            service.update(owner, "course_1", { price: "9000" }),
        ).rejects.toThrow("the database went");
        expect(entries()).toEqual([]);
    });

    it("is read by whoever may read the course, in this business only, newest first", async () => {
        db.course!.findFirst!.mockResolvedValue({ id: "course_1" });
        db.auditEvent!.findMany!.mockResolvedValue([]);
        await expect(
            service.priceHistory(owner, "course_1", { limit: 5 }),
        ).resolves.toEqual({ entries: [], nextCursor: null });
        expect(db.course!.findFirst).toHaveBeenCalledWith({
            where: { id: "course_1", organizationId: "org_1" },
            select: { id: true },
        });
        expect(db.auditEvent!.findMany!.mock.calls[0]![0]).toMatchObject({
            where: {
                organizationId: "org_1",
                targetType: "course",
                targetId: "course_1",
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 6,
        });
        await expect(
            service.priceHistory(member, "course_1"),
        ).rejects.toBeInstanceOf(ForbiddenException);
        db.course!.findFirst!.mockResolvedValue(null);
        await expect(
            service.priceHistory(owner, "course_theirs"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(db.auditEvent!.findMany).toHaveBeenCalledTimes(1);
    });
});
