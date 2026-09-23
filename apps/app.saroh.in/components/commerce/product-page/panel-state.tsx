import { Button } from "@saroh/ui/button";
import { FailedState, PermissionDeniedState } from "@saroh/ui/data-state";
import Link from "next/link";

/**
 * A panel of the product page that did not arrive: it could not be read
 * (retry, and say the rest of the page is current) or this role may not see
 * it (say so, and who can change it). Never a zero, never an empty list.
 */
export function PanelFailed({
    what,
    retryHref,
    note,
}: {
    what: string;
    retryHref: string;
    note?: string;
}) {
    return (
        <FailedState
            title={`Couldn't load ${what}`}
            description={
                note ??
                "The rest of the product loaded; only this did not. Nothing about the product has changed."
            }
            action={
                <Button asChild variant="outline">
                    <Link href={retryHref}>Try again</Link>
                </Button>
            }
        />
    );
}

export function PanelForbidden({ what }: { what: string }) {
    return (
        <PermissionDeniedState
            title={`Your role can't see ${what}`}
            description="Everything else about the product is here. An owner or admin can change what your role reaches in Team."
        />
    );
}
