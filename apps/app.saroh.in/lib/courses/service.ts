import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { InvoiceStanding } from "@/lib/invoices/service";

/**
 * Courses (ADR-007), read and written through the API's
 * `/organizations/:id/courses` routes. Server-only. A course is its own
 * module (Courses), which needs Appointments: its sessions are bookings.
 */

export type CourseStatus = "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";

export interface CourseSession {
    id: string;
    startAt: string;
    endAt: string;
}

export interface Course {
    id: string;
    service: {
        id: string;
        name: string;
        capacity: number;
        durationMinutes: number;
        /** The zone its sessions are read in. */
        timezone: string;
    };
    name: string;
    description: string | null;
    price: string;
    currency: string;
    seats: number;
    enrolled: number;
    seatsLeft: number;
    status: CourseStatus;
    sessions: CourseSession[];
    sessionsLeft: number;
    nextSessionAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface Enrollment {
    id: string;
    course: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    status: "ACTIVE" | "CANCELLED";
    price: string;
    currency: string;
    /** Their sessions still to come that are booked. */
    upcoming: number;
    cancelledAt: string | null;
    invoice: {
        id: string;
        number: string | null;
        standing: InvoiceStanding;
    } | null;
    createdAt: string;
}

export interface CourseDetail extends Omit<Course, "sessions"> {
    sessions: (CourseSession & { booked: number })[];
    enrollments: Enrollment[];
    /** Whether enrolling someone now issues an invoice (Payments is on). */
    invoicesOnEnrol: boolean;
}

export interface CourseInput {
    serviceId?: string;
    name?: string;
    description?: string | null;
    price?: string;
    currency?: string;
    seats?: number;
    status?: CourseStatus;
    /** On create only: session start instants, ISO. */
    sessions?: string[];
}

export async function listCourses(): Promise<Course[]> {
    const base = await orgBase();
    if (!base) return [];
    return (await getJson<Course[]>(`${base}/courses`)) ?? [];
}

/** One course with its roster, or null when missing / not permitted. */
export async function getCourse(id: string): Promise<CourseDetail | null> {
    const base = await orgBase();
    if (!base) return null;
    return getJson<CourseDetail>(`${base}/courses/${encodeURIComponent(id)}`);
}

async function send<T>(
    path: string,
    method: "POST" | "PATCH" | "DELETE",
    body: unknown,
    fallback: string,
): Promise<ApiResult<T>> {
    const base = await orgBase();
    if (!base) return { ok: false, error: "No active business." };
    const res = await apiFetch(`${base}${path}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: (data ?? {}) as T };
    return toFailure(data, fallback);
}

const course = (id: string) => `/courses/${encodeURIComponent(id)}`;

export function createCourse(input: CourseInput) {
    return send<CourseDetail>(
        "/courses",
        "POST",
        input,
        "Could not save that course.",
    );
}
export function updateCourse(id: string, input: CourseInput) {
    return send<CourseDetail>(
        course(id),
        "PATCH",
        input,
        "Could not save that course.",
    );
}
export function addSession(id: string, startAt: string) {
    return send<CourseDetail>(
        `${course(id)}/sessions`,
        "POST",
        { startAt },
        "Could not add that session.",
    );
}
export function removeSession(id: string, sessionId: string) {
    return send<CourseDetail>(
        `${course(id)}/sessions/${encodeURIComponent(sessionId)}`,
        "DELETE",
        undefined,
        "Could not remove that session.",
    );
}
export function enrol(
    id: string,
    input: { contactId: string; price?: string },
) {
    return send<Enrollment>(
        `${course(id)}/enrollments`,
        "POST",
        input,
        "Could not enrol them.",
    );
}
export function cancelEnrollment(id: string, enrollmentId: string) {
    return send<Enrollment>(
        `${course(id)}/enrollments/${encodeURIComponent(enrollmentId)}/cancel`,
        "POST",
        {},
        "Could not cancel that enrolment.",
    );
}
