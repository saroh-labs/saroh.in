import { EnquiryCard } from "@/components/crm/enquiry-card";
import { Empty, Failed } from "@/components/customers/detail/parts";
import type { EnquiryEntry } from "@/lib/crm/enquiries";

/**
 * What they wrote through the site's forms, on the person page's
 * Enquiries tab (#869): the answers of each enquiry, newest first. One
 * that could not be read says so; none is said in words.
 */
export function EnquiriesPanel({
    enquiries,
    knownEmail,
    first,
}: {
    /** Null when they could not be read. */
    enquiries: EnquiryEntry[] | null;
    /** The person's email, already in the header; not repeated here. */
    knownEmail: string | null;
    first: string;
}) {
    if (!enquiries) return <Failed what="Enquiries" />;
    if (enquiries.length === 0) {
        return (
            <Empty title="No enquiries yet">
                {`When ${first} writes through a form on your site, what they wrote shows here.`}
            </Empty>
        );
    }
    return <EnquiryCard enquiries={enquiries} knownEmail={knownEmail} />;
}
