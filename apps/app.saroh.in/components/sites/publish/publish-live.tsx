"use client";

import { Button } from "@saroh/ui/button";
import { CopyButton } from "@saroh/ui/copy-button";
import { cn } from "@saroh/ui/lib/utils";
import { Check, ExternalLink } from "lucide-react";

import { ShareLinkButton } from "@/components/shared/share-link/share-link-button";
import { shareLink } from "@/lib/sites/share-links";
import type { WentLive } from "./use-publish";

/**
 * The Publish sheet's result (wave G, DEC-185): the same sheet, turned into
 * where the site now is. A plain statement, announced politely, with the
 * address to copy and the one next thing worth doing, passing it on
 * (Share, and its QR code).
 */
export function PublishLiveBody({ live }: { live: WentLive }) {
    const url = live.address ? `https://${live.address}` : null;
    return (
        <div
            role="status"
            className="grid gap-4 duration-slow ease-out animate-in fade-in-0 motion-reduce:animate-none"
        >
            <div className="flex items-start gap-3">
                <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-success text-success-foreground"
                >
                    <Check className="size-5" />
                </span>
                <div className="min-w-0">
                    <p className="text-balance text-base font-semibold [overflow-wrap:anywhere]">
                        {live.siteName} is live
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Anyone can open it now.
                    </p>
                    {live.record ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                            {live.record}
                        </p>
                    ) : null}
                </div>
            </div>
            {url && live.address ? (
                <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/50 py-1 pl-3 pr-1">
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                        {live.address}
                    </span>
                    <CopyButton
                        value={url}
                        label="Copy address"
                        thing="address"
                        variant="ghost"
                        className="coarse:min-h-11"
                    />
                </div>
            ) : null}
        </div>
    );
}

/** The result's foot: Share link (and its QR code), Done, Open site. */
export function PublishLiveFoot({
    live,
    phone,
    onDone,
}: {
    live: WentLive;
    phone: boolean;
    onDone: () => void;
}) {
    const url = live.address ? `https://${live.address}` : null;
    // The same share button and QR code the first-run screens offer.
    const share = shareLink({ links: { site: url, shop: null, book: null } }, [
        "site",
    ]);
    const open = url ? (
        <Button asChild className={cn(phone && "w-full")}>
            <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink aria-hidden />
                Open site
            </a>
        </Button>
    ) : null;
    return (
        <div
            className={cn(
                "flex gap-2",
                phone ? "flex-col" : "flex-wrap items-center justify-end",
            )}
        >
            {phone ? open : null}
            <div
                className={cn(
                    "flex flex-wrap items-center gap-2",
                    phone && "[&>*]:flex-1",
                )}
            >
                {share ? (
                    <ShareLinkButton link={share} className="mt-0" />
                ) : null}
                <Button type="button" variant="outline" onClick={onDone}>
                    Done
                </Button>
            </div>
            {phone ? null : open}
        </div>
    );
}
