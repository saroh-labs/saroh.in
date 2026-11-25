"use server";

import { writeAsOrg } from "@/lib/api/assert-active-org";
import { voidInvoice as voidInvoiceApi } from "@/lib/invoices/service";

import type { CourseInput } from "./service";
import * as api from "./service";

/**
 * Thin: the API decides who may, and what a course may become. Each write
 * takes the tab's business last and runs as it (`writeAsOrg`); the screen
 * reads Courses again (`useCourseSave`), so nothing is revalidated here.
 */

export async function createCourse(input: CourseInput, orgId: string) {
    return writeAsOrg(orgId, () => api.createCourse(input));
}
export async function updateCourse(
    id: string,
    input: CourseInput,
    orgId: string,
) {
    return writeAsOrg(orgId, () => api.updateCourse(id, input));
}
export async function addSession(id: string, startAt: string, orgId: string) {
    return writeAsOrg(orgId, () => api.addSession(id, startAt));
}
export async function removeSession(
    id: string,
    sessionId: string,
    orgId: string,
) {
    return writeAsOrg(orgId, () => api.removeSession(id, sessionId));
}
export async function enrol(
    id: string,
    input: { contactId: string; price?: string },
    orgId: string,
) {
    return writeAsOrg(orgId, () => api.enrol(id, input));
}

/**
 * Take someone off a course, and — when asked — void their open invoice
 * too. Two calls, so the answer says which one failed: an enrolment
 * cancelled with its invoice left open is not the same as nothing happening.
 */
export async function cancelEnrollment(
    id: string,
    enrollmentId: string,
    voidInvoiceId: string | undefined,
    orgId: string,
) {
    return writeAsOrg(orgId, async () => {
        const res = await api.cancelEnrollment(id, enrollmentId);
        if (!res.ok || !voidInvoiceId) return res;
        const voided = await voidInvoiceApi(
            voidInvoiceId,
            "Enrolment cancelled",
        );
        if (!voided.ok) {
            return {
                ok: false as const,
                error: `Cancelled, but the invoice is still open: ${voided.error}`,
            };
        }
        return res;
    });
}
