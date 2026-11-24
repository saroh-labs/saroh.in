import { Button } from "@saroh/ui/button";
import { IntentLink } from "@saroh/ui/intent-link";
import { Notice } from "@saroh/ui/notice";

import {
    openRequestsText,
    requestsHref,
} from "@/lib/customer-workspace/data-requests-view";

/**
 * The Customers list's one banner while removal requests are open
 * (DEC-172, #1107): how many, and Review, to the Requests tab. It goes when
 * none are open, and only whoever can act on them sees it.
 */
export function OpenRequestsBanner({ count }: { count: number | null }) {
    if (!count || count <= 0) return null;
    return (
        <Notice
            tone="warning"
            className="mb-3"
            align="center"
            action={
                <Button variant="outline" size="sm" asChild>
                    <IntentLink href={requestsHref()}>Review</IntentLink>
                </Button>
            }
        >
            <strong className="font-semibold">
                {openRequestsText(count)}.
            </strong>{" "}
            Remove their details, or close the request with a reason.
        </Notice>
    );
}
