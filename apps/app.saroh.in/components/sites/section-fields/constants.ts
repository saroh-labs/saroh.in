import type { EnquiryFieldType } from "@/lib/sites/service";

/**
 * A field's label drawn by hand, in sentence case like `Field`'s own
 * (`@saroh/ui/label`), so one panel never mixes capitals and sentence case.
 */
export const FIELD_LABEL = "text-[0.78125rem] font-medium leading-none";

/** The field types an enquiry field may take, with author-facing labels. */
export const ENQUIRY_FIELD_TYPES: { value: EnquiryFieldType; label: string }[] =
    [
        { value: "text", label: "Text" },
        { value: "email", label: "Email" },
        { value: "tel", label: "Phone" },
        { value: "textarea", label: "Long text" },
    ];
