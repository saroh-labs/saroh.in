"use server";

import { revalidatePath } from "next/cache";

import { voidInvoice as voidInvoiceApi } from "@/lib/invoices/service";

import type { CourseInput } from "./service";
import * as api from "./service";

/** Thin: the API decides who may, and what a course may become. */

function refresh(id?: string) {
    revalidatePath("/courses");
    if (id) revalidatePath(`/courses/${id}`);
    // Enrolling books sessions and may issue an invoice.
    revalidatePath("/bookings");
    revalidatePath("/billing/invoices");
}

async function then<T extends { ok: boolean }>(
    res: Promise<T>,
    id?: string,
): Promise<T> {
    const r = await res;
    if (r.ok) refresh(id);
    return r;
}

export async function createCourse(input: CourseInput) {
    return then(api.createCourse(input));
}
export async function updateCourse(id: string, input: CourseInput) {
    return then(api.updateCourse(id, input), id);
}
export async function addSession(id: string, startAt: string) {
    return then(api.addSession(id, startAt), id);
}
export async function removeSession(id: string, sessionId: string) {
    return then(api.removeSession(id, sessionId), id);
}
export async function enrol(
    id: string,
    input: { contactId: string; price?: string },
) {
    return then(api.enrol(id, input), id);
}

/**
 * Take someone off a course, and — when asked — void their open invoice
 * too. Two calls, so the answer says which one failed: an enrolment
 * cancelled with its invoice left open is not the same as nothing happening.
 */
export async function cancelEnrollment(
    id: string,
    enrollmentId: string,
    voidInvoiceId?: string,
) {
    const res = await api.cancelEnrollment(id, enrollmentId);
    if (!res.ok) return res;
    if (voidInvoiceId) {
        const voided = await voidInvoiceApi(
            voidInvoiceId,
            "Enrolment cancelled",
        );
        refresh(id);
        if (!voided.ok) {
            return {
                ok: false as const,
                error: `Cancelled, but the invoice is still open: ${voided.error}`,
            };
        }
        return res;
    }
    refresh(id);
    return res;
}
