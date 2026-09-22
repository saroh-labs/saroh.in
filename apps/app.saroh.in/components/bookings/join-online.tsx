"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { Copy, Video } from "lucide-react";

/**
 * "Join online" for a booking on an online service (ADR-007): the link it
 * was booked with, and a way to copy it for a message to the person.
 */
export function JoinOnline({ url }: { url: string }) {
    async function copy() {
        try {
            await navigator.clipboard.writeText(url);
            showSuccess("Link copied");
        } catch {
            showError(
                "Could not copy the link. Select it and copy it instead.",
            );
        }
    }

    return (
        <div className="mt-4 grid gap-2 rounded-md border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
                <Video className="size-4 text-muted-foreground" aria-hidden />
                Online
            </p>
            <p className="break-all text-[12.5px] text-muted-foreground">
                {url}
            </p>
            <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                    <a href={url} target="_blank" rel="noopener noreferrer">
                        Join online
                    </a>
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copy()}
                >
                    <Copy className="mr-1.5 size-3.5" aria-hidden />
                    Copy link
                </Button>
            </div>
        </div>
    );
}
