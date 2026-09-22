import { parseSectionContent } from "@saroh/block-contract";

import type { EnsureFormInput } from "@/lib/forms/service";
import type { Section } from "@/lib/sites/service";

/** What `ensureFormForSection` answers: the Form's id, or why it failed. */
type EnsureForm = (
    input: EnsureFormInput,
) => Promise<
    { ok: true; data: { formId: string } } | { ok: false; error: string }
>;

/**
 * Keep every enquiry section's backing Form in step before a save, stamping
 * the Form's id into the section so the save and the publish carry it.
 *
 * An unfinished enquiry section is skipped: it is held back from the save
 * (#328), so its Form is not synced yet either. Syncing it anyway failed on
 * the empty field and stopped the WHOLE save, which is the very thing
 * holding back is for (review of #328). It syncs on the save after it is
 * finished.
 *
 * `ensure` is the server action, passed in so this can be tested without one.
 */
export async function syncEnquiryForms(
    current: Section[],
    siteName: string,
    ensure: EnsureForm,
): Promise<
    | { ok: true; sections: Section[] }
    | { ok: false; index: number; error: string }
> {
    const next = [...current];
    for (let i = 0; i < next.length; i++) {
        const section = next[i];
        if (section.type !== "enquiry") continue;
        if (
            !parseSectionContent(
                section.type,
                section.contractVersion,
                section.content,
            ).success
        ) {
            continue;
        }
        const content = section.content;
        const res = await ensure({
            formId: content.formId,
            name:
                [content.title?.trim()].find((s) => s) ?? `${siteName} enquiry`,
            fields: content.fields,
        });
        if (!res.ok) {
            return { ok: false, index: i, error: res.error };
        }
        next[i] = {
            ...section,
            content: { ...content, formId: res.data.formId },
        };
    }
    return { ok: true, sections: next };
}
