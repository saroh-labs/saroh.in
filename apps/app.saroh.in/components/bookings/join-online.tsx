"use client";

import { Button } from "@saroh/ui/button";
import { ShareLink } from "@saroh/ui/copy-button";
import { Video } from "lucide-react";

/**
 * "Join online" for a booking on an online service (ADR-007): the link it
 * was booked with, and a way to copy it for a message to the person.
 */
export function JoinOnline({ url }: { url: string }) {
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
                {/* To send to the person: the share sheet on a phone. */}
                <ShareLink value={url} text="Your link to join online" />
            </div>
        </div>
    );
}
