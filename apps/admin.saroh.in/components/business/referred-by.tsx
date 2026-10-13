import Link from "next/link";

import type { ReferredByFacts } from "@/lib/businesses";
import { formatDate } from "@/lib/format";

/**
 * "Referred by ‹business›" on a business's page (DEC-156): the business
 * whose referral code its owner arrived with, and the day that was
 * recorded. For operators only: no business's own screens say who it
 * referred or who referred it. It states the fact and nothing that follows
 * from it.
 */
export function ReferredBy({ referredBy }: { referredBy: ReferredByFacts }) {
    return (
        <span>
            <Link
                href={`/businesses/${encodeURIComponent(referredBy.id)}`}
                className="underline underline-offset-4"
            >
                {referredBy.name}
            </Link>
            {referredBy.at ? `, recorded ${formatDate(referredBy.at)}` : null}
        </span>
    );
}
