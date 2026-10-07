import { prisma } from "@saroh/database";

/**
 * What someone wrote through an enquiry form, as the workspace reads it
 * (UX-002).
 *
 * The raw `Submission.data` is keyed by the form's field names; the lead,
 * the contact and the owner's notification all need it as the person sees
 * it: each field's label and what was typed, in the form's order. Before
 * this the message was stored and shown nowhere.
 */

/** One answer: the field's label and what was typed. */
export interface EnquiryAnswer {
    name: string;
    label: string;
    value: string;
}

/** One entry sent through a form, readable. */
export interface EnquiryEntry {
    id: string;
    createdAt: string;
    formId: string;
    formName: string | null;
    answers: EnquiryAnswer[];
}

/** How many entries a lead or contact page shows; the latest first. */
export const ENQUIRY_ENTRIES_SHOWN = 20;

/** A submitted value as text; null for an empty or unreadable one. */
function asText(value: unknown): string | null {
    if (typeof value === "string") return value.trim() || null;
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return null;
}

/**
 * The answers in a submission, labelled by the form's fields and in their
 * order; any value the fields no longer describe (a field since removed in
 * the editor) follows under its own name, so nothing typed is hidden.
 */
export function readableAnswers(
    data: unknown,
    formFields: unknown,
): EnquiryAnswer[] {
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];
    const values = data as Record<string, unknown>;
    const fields = Array.isArray(formFields)
        ? formFields.filter(
              (f): f is { name: string; label?: unknown } =>
                  !!f &&
                  typeof f === "object" &&
                  typeof (f as { name?: unknown }).name === "string",
          )
        : [];
    const out: EnquiryAnswer[] = [];
    const seen = new Set<string>();
    for (const field of fields) {
        seen.add(field.name);
        const value = asText(values[field.name]);
        if (value === null) continue;
        const label =
            typeof field.label === "string" && field.label.trim()
                ? field.label.trim()
                : field.name;
        out.push({ name: field.name, label, value });
    }
    for (const [name, raw] of Object.entries(values)) {
        if (seen.has(name)) continue;
        const value = asText(raw);
        if (value !== null) out.push({ name, label: name, value });
    }
    return out;
}

/**
 * A short line of what they wrote, for a notification or an email: the
 * answers other than their email address, the longest first (most often
 * the message), cut to `max` characters. Null when there is nothing but
 * the address.
 */
export function enquiryPreview(
    answers: EnquiryAnswer[],
    emailFieldNames: string[] = ["email"],
    max = 280,
): string | null {
    const said = answers
        .filter((a) => !emailFieldNames.includes(a.name))
        .sort((a, b) => b.value.length - a.value.length)
        .map((a) => a.value.replace(/\s+/g, " "));
    if (said.length === 0) return null;
    const text = said.join(" · ");
    return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The names of a form's email fields (always at least one on a valid form). */
export function emailFieldNames(formFields: unknown): string[] {
    if (!Array.isArray(formFields)) return ["email"];
    const names = formFields
        .filter(
            (f): f is { name: string; type: string } =>
                !!f &&
                typeof f === "object" &&
                (f as { type?: unknown }).type === "email" &&
                typeof (f as { name?: unknown }).name === "string",
        )
        .map((f) => f.name);
    return names.length > 0 ? names : ["email"];
}

/**
 * The latest entries for one lead or one contact, within the business.
 * Callers have already authorized the read of that lead or contact.
 */
export async function enquiryEntriesFor(
    organizationId: string,
    owner: { leadId: string } | { contactId: string },
): Promise<EnquiryEntry[]> {
    const rows = await prisma.submission.findMany({
        where: { organizationId, ...owner },
        orderBy: { createdAt: "desc" },
        take: ENQUIRY_ENTRIES_SHOWN,
        select: {
            id: true,
            createdAt: true,
            data: true,
            formId: true,
            form: { select: { name: true, fields: true } },
        },
    });
    return rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        formId: r.formId,
        formName: r.form.name,
        answers: readableAnswers(r.data, r.form.fields),
    }));
}
