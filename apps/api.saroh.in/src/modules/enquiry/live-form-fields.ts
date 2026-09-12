import type { FormField } from "../forms/dto";
import { FIELD_TYPES } from "../forms/dto";

/**
 * The enquiry fields a publication snapshot shows for one form, or `null` when
 * the snapshot carries no enquiry section backed by that form (#281).
 *
 * This is what the visitor was actually shown. The live site draws an enquiry
 * form from the snapshot, so a submission is validated against these fields,
 * not against `Form.fields`, which the editor rewrites on every autosave.
 *
 * Reads defensively. A snapshot is JSON written by whichever build published
 * it, and a shape this build does not recognise means "not found". It must
 * never crash the public submit path.
 */
export function fieldsFromSnapshot(
    snapshot: unknown,
    formId: string,
): FormField[] | null {
    const pages = (snapshot as { pages?: unknown } | null)?.pages;
    if (!Array.isArray(pages)) return null;

    for (const page of pages) {
        const sections = (page as { sections?: unknown } | null)?.sections;
        if (!Array.isArray(sections)) continue;

        for (const section of sections) {
            const s = section as { type?: unknown; content?: unknown } | null;
            if (s?.type !== "enquiry") continue;

            const content = s.content as {
                formId?: unknown;
                fields?: unknown;
            } | null;
            if (content?.formId !== formId) continue;
            if (!Array.isArray(content.fields)) continue;

            const fields = content.fields.filter(isField);
            return fields.length > 0 ? fields : null;
        }
    }
    return null;
}

function isField(value: unknown): value is FormField {
    const f = value as Partial<FormField> | null;
    return (
        typeof f?.name === "string" &&
        typeof f.label === "string" &&
        (FIELD_TYPES as readonly string[]).includes(f.type as string)
    );
}
