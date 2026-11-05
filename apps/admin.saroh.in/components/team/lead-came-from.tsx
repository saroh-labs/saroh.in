import Link from "next/link";

import { formatDate } from "@/lib/format";
import type { LeadDetail } from "@/lib/saroh-lead-words";
import { SOURCE_LABEL } from "@/lib/saroh-lead-words";

/**
 * When and how a lead came in, with a read-only link to what brought it
 * (admin audit F11): the enquiry on Messages, or the entry on Waitlist.
 * Links only for staff who see every lead (Support, Platform owner), who
 * also hold the personal-data read those screens need.
 */
export function LeadCameFrom({
    lead,
    links,
}: {
    lead: Pick<LeadDetail, "createdAt" | "source" | "email">;
    links: boolean;
}) {
    const address = lead.email ? encodeURIComponent(lead.email) : null;
    const href =
        !links || !address
            ? null
            : lead.source === "WEBSITE"
              ? `/messages?email=${address}`
              : lead.source === "WAITLIST"
                ? `/waitlist?email=${address}`
                : null;
    return (
        <>
            {formatDate(lead.createdAt)} · {SOURCE_LABEL[lead.source]}
            {href && (
                <>
                    {" · "}
                    <Link href={href} className="underline underline-offset-4">
                        {lead.source === "WEBSITE"
                            ? "Read what they wrote"
                            : "See their entry"}
                    </Link>
                </>
            )}
        </>
    );
}
