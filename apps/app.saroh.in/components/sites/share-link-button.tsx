"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { showError, showSuccess } from "@saroh/ui/toast";

import { QrButton } from "@/components/qr/qr-button";
import type { ShareKind, ShareLink } from "@/lib/sites/share-links";

/** The saved code each shared page has, and how its button names it. */
const QR: Record<
    ShareKind,
    { kind: "SHOP" | "SITE" | "BOOK"; what: string; from: string }
> = {
    shop: { kind: "SHOP", what: "your online shop", from: "Orders" },
    site: { kind: "SITE", what: "your website", from: "Orders" },
    book: { kind: "BOOK", what: "your booking page", from: "Bookings" },
};

/**
 * A first run's "Share your online shop / website / booking page" (DEC-069,
 * L8): copies the link the API says is live, and says so. The caller only
 * draws it when there is a link (`shareLink`), so it never offers a page
 * nobody can open. Its QR code sits beside it (plan U7): the same page,
 * for a counter or a card.
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
        <span
            className={cn(
                "mt-1 inline-flex flex-wrap items-center justify-center gap-2",
                className,
            )}
        >
            <Button
                type="button"
                variant="outline"
                className="wk-press"
                onClick={() => void copy()}
            >
                {link.label}
            </Button>
            <QrButton
                compact="phone"
                className="h-[38px] coarse:h-11"
                link={{
                    mode: "saved",
                    kind: QR[link.kind].kind,
                    url: link.url,
                    what: QR[link.kind].what,
                    from: QR[link.kind].from,
                }}
            />
        </span>
    );
}
