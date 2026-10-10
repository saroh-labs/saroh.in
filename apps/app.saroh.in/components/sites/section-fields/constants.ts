import type { EnquiryFieldType } from "@/lib/sites/service";

export const FIELD_LABEL = "label";

/** The field types an enquiry field may take, with author-facing labels. */
export const ENQUIRY_FIELD_TYPES: { value: EnquiryFieldType; label: string }[] =
    [
        { value: "text", label: "Text" },
        { value: "email", label: "Email" },
        { value: "tel", label: "Phone" },
        { value: "textarea", label: "Long text" },
    ];
