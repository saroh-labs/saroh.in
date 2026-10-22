"use client";

import { Button } from "@saroh/ui/button";
import { TextLink } from "@saroh/ui/text-link";

import { ShareLinkButton } from "@/components/shared/share-link/share-link-button";
import { shareLink } from "@/lib/sites/share-links";
import type { WentLive as WentLiveFacts } from "./use-publish";

/**
 * The publish check's finished state, the first time a site goes live
 * (wave G). The same takeover, not another surface: it says the site is
 * live, shows its address as a link that opens it, and offers the one next
 * thing worth doing, passing the address on (Share, and its QR code).
 *
 * Announced politely, with nothing to celebrate at: a plain statement of
 * where the site now is. Every later publish closes the check with the
 * toast, as before.
 */
export function WentLive({
    siteName,
    live,
    onClose,
}: {
    siteName: string;
    live: WentLiveFacts;
    onClose: () => void;
}) {
    const url = live.address ? `https://${live.address}` : null;
    // The same share button and QR code the first-run screens offer.
    const share = shareLink({ links: { site: url, shop: null, book: null } }, [
        "site",
    ]);

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
            <header className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b px-4">
                <h1 className="min-w-0 truncate text-sm font-semibold">
                    {siteName} is live
                </h1>
                <Button type="button" size="sm" onClick={onClose}>
                    Back to editing
                </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div
                    role="status"
                    className="mx-auto max-w-2xl px-6 py-10 duration-slow ease-out animate-in fade-in-0 motion-reduce:animate-none"
                >
                    <h2 className="text-balance font-display text-2xl font-semibold [overflow-wrap:anywhere]">
                        {siteName} is live.
                    </h2>
                    {url && live.address ? (
                        <p className="mt-3 text-sm [overflow-wrap:anywhere]">
                            Anyone can open it now at{" "}
                            <TextLink href={url} external>
                                {live.address}
                            </TextLink>
                        </p>
                    ) : (
                        <p className="mt-3 text-sm">Anyone can open it now.</p>
                    )}
                    {live.record ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                            {live.record}
                        </p>
                    ) : null}
                    {share ? (
                        <div className="mt-8 border-t pt-6">
                            <p className="text-sm">
                                Send the address to the people who already know
                                you, or print its QR code for your counter.
                            </p>
                            <ShareLinkButton
                                link={share}
                                className="mt-3 justify-start"
                            />
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
