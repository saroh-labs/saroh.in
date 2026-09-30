"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";

import type { ShareLink } from "@/lib/sites/share-links";

/**
 * A first run's "Share your online shop / website / booking page" (DEC-069,
 * L8): copies the link the API says is live, and says so. The caller only
 * draws it when there is a link (`shareLink`), so it never offers a page
 * nobody can open.
 */
export function ShareLinkButton({
    link,
    className,
}: {
    link: ShareLink;
    className?: string;
}) {
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(link.url);
            showSuccess(link.copied, link.url);
        } catch {
            showError(
                "Couldn't copy the link. Select it and copy it instead.",
                link.url,
            );
        }
    };
    return (
        <Button
            type="button"
            variant="outline"
            className={cn("wk-press mt-1", className)}
            onClick={() => void copy()}
        >
            {link.label}
        </Button>
    );
}
