"use client";

import { ShareLink as ShareButton } from "@saroh/ui/copy-button";
import { cn } from "@saroh/ui/lib/utils";

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
    return (
        <span
            className={cn(
                "mt-1 inline-flex flex-wrap items-center justify-center gap-2",
                className,
            )}
        >
            <ShareButton
                value={link.url}
                label={link.label}
                shareLabel={link.label}
                size="default"
                icon={false}
            />
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
