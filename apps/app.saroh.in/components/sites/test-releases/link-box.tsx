"use client";

import { Button } from "@saroh/ui/button";
import { copyText } from "@saroh/ui/copy-button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, ExternalLink } from "lucide-react";

/** Copy a link; false when the browser refused. */
export const copyLink = copyText;

/**
 * A test release link, shown the one time its address exists (#284): the API
 * keeps only its hash, so this is where it is copied or opened. The address
 * wraps whole rather than truncating: it is the thing being handed on, and
 * its buttons never move (frontend-design-system.md, P2).
 */
export function LinkBox({ url, label }: { url: string; label: string }) {
    return (
        <div className="grid gap-2 rounded-lg border bg-muted px-3 py-2.5">
            <p className="label">{label}</p>
            <code
                data-release-link=""
                className="font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere]"
            >
                {url}
            </code>
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                        void copyLink(url).then((ok) =>
                            ok
                                ? showSuccess("Link copied.")
                                : showError(
                                      "Couldn't copy. Select the link and copy it yourself.",
                                  ),
                        )
                    }
                >
                    <Copy aria-hidden className="size-4" />
                    Copy link
                </Button>
                <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                >
                    <a href={url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink aria-hidden className="size-4" />
                        Open
                    </a>
                </Button>
            </div>
        </div>
    );
}
