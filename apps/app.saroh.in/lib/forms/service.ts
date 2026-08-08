import { apiFetch, getActiveOrgId, readError } from "@/lib/api/http";

/**
 * Enquiry-Form data access for app.saroh.in (S3-004). An enquiry section in the
 * site editor is backed by a Form on api.saroh.in — the Form is what the PUBLIC
 * submit endpoint validates a visitor's submission against and derives the
 * owning organization from. This module keeps that Form in sync with the
 * section's authored fields.
 *
 * Every call is org-scoped exactly like `lib/sites/service.ts`: the active
 * organization id (from the `active_org` cookie) is used both in the path
 * (`/organizations/:organizationId/forms`) and forwarded as the
 * `x-organization-id` header, and the session cookie is forwarded so
 * api.saroh.in derives the user and enforces membership + `form:write`.
 * Server-only: imports next/headers (via the shared HTTP plumbing).
 *
 * The app never imports @saroh/database — the field descriptor type below is a
 * hand-maintained mirror of the forms API DTO, reached only through the API.
 */

// ---------------------------------------------------------------------------
// Types — mirror of the forms API field descriptor
// ---------------------------------------------------------------------------

/** The field types a Form supports (mirrors the forms API `FIELD_TYPES`). */
export type FormFieldType = "text" | "email" | "tel" | "textarea";

/** One field descriptor in a Form (and in the enquiry section it backs). */
export interface FormField {
    name: string;
    label: string;
    type: FormFieldType;
    required?: boolean;
}

/** A Form as returned by the forms API (only the fields the editor needs). */
export interface Form {
    id: string;
    name: string;
    fields: FormField[];
    status?: string;
}

/**
 * Discriminated result mirroring `SitesResult` so callers surface a message.
 * (`field` is unused today but kept for shape-parity with the sites client.)
 */
export type FormsResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; field?: string };

/** The input to {@link ensureFormForSection}. */
export interface EnsureFormInput {
    /** The existing backing Form id, when the section already has one. */
    formId?: string;
    /** A human name for the Form (usually the site/section title). */
    name: string;
    /** The section's fields — become the Form's `fields` verbatim. */
    fields: FormField[];
}

// ---------------------------------------------------------------------------
// Fetch plumbing (org-scoped base; shared apiFetch/readError from @/lib/api/http)
// ---------------------------------------------------------------------------

/** Base path for the active org's forms, or null when no org is active. */
async function formsBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/forms` : null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a Form for the active org from the section's name + fields. */
async function createForm(
    base: string,
    input: EnsureFormInput,
): Promise<FormsResult<{ formId: string }>> {
    const res = await apiFetch(base, {
        method: "POST",
        body: JSON.stringify({ name: input.name, fields: input.fields }),
    });
    const data = (await res.json().catch(() => null)) as
        | (Partial<Form> & { message?: string; error?: string })
        | null;
    if (res.ok && data?.id) {
        return { ok: true, data: { formId: data.id } };
    }
    return { ok: false, error: readError(data, "Could not create the form") };
}

/** PATCH an existing Form's name + fields so it matches the section. */
async function patchForm(
    base: string,
    formId: string,
    input: EnsureFormInput,
): Promise<FormsResult<{ formId: string }>> {
    const res = await apiFetch(`${base}/${formId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: input.name, fields: input.fields }),
    });
    const data = (await res.json().catch(() => null)) as
        | (Partial<Form> & { message?: string; error?: string })
        | null;
    if (res.ok && data?.id) {
        return { ok: true, data: { formId: data.id } };
    }
    return { ok: false, error: readError(data, "Could not update the form") };
}

/**
 * Ensure a Form exists and matches the enquiry section's fields, returning the
 * Form id to write back into the section content:
 *
 *   - no `formId` → create a new Form (POST) and return its id;
 *   - a `formId`  → PATCH that Form's name + fields to match, keeping ids stable.
 *
 * The Form is the source of truth the PUBLIC submit endpoint validates against,
 * so the editor MUST call this on save to keep the two in sync. Returns a typed
 * error (never throws) so the editor can surface a toast — including the
 * missing-active-org case.
 */
export async function ensureFormForSection(
    input: EnsureFormInput,
): Promise<FormsResult<{ formId: string }>> {
    const base = await formsBase();
    if (!base) return { ok: false, error: "No active organization." };
    if (input.fields.length === 0) {
        return {
            ok: false,
            error: "An enquiry form needs at least one field.",
        };
    }
    return input.formId
        ? patchForm(base, input.formId, input)
        : createForm(base, input);
}
