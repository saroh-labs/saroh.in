import { apiFetch, getJson, orgBase } from "@/lib/api/http";

import type { ApiResult } from "@/lib/api/failure";
import { toFailure } from "@/lib/api/failure";
import type { GstValues } from "@/lib/gst/item-words";
import type { GstOnPrice } from "@/lib/gst/on-price";
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
    /**
     * GST (12 Oct 2026): the rate its price carries ("18"; null is not
     * set), its SAC code, and its own way of carrying GST (null is the
     * business's). Absent from an API before it.
     */
    gstRate?: GstValues["gstRate"];
    sacCode?: GstValues["sacCode"];
    gstPriceMode?: GstValues["gstPriceMode"];
    /**
     * The GST on its price as an enrolment is charged today, and the
     * amount to pay; null when nothing is said about GST. `price` is the
     * price the business set. Absent from an API before it.
     */
    gst?: GstOnPrice | null;
}

export interface Enrollment {
    id: string;
    course: { id: string; name: string };
    contact: { id: string; name: string; email: string };
    status: "ACTIVE" | "CANCELLED";
    /** What they were charged, GST and all. */
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
    /** GST: null clears the rate or the code, or is "same as the business". */
    gstRate?: GstValues["gstRate"];
    sacCode?: GstValues["sacCode"];
    gstPriceMode?: GstValues["gstPriceMode"];
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
        "Couldn't save that course.",
    );
}
export function updateCourse(id: string, input: CourseInput) {
    return send<CourseDetail>(
        course(id),
        "PATCH",
        input,
        "Couldn't save that course.",
    );
}
export function addSession(id: string, startAt: string) {
    return send<CourseDetail>(
        `${course(id)}/sessions`,
        "POST",
        { startAt },
        "Couldn't add that session.",
    );
}
export function removeSession(id: string, sessionId: string) {
    return send<CourseDetail>(
        `${course(id)}/sessions/${encodeURIComponent(sessionId)}`,
        "DELETE",
        undefined,
        "Couldn't remove that session.",
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
        "Couldn't enrol them.",
    );
}
export function cancelEnrollment(id: string, enrollmentId: string) {
    return send<Enrollment>(
        `${course(id)}/enrollments/${encodeURIComponent(enrollmentId)}/cancel`,
        "POST",
        {},
        "Couldn't cancel that enrolment.",
    );
}
