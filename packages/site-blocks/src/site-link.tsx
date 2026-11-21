import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * A card's or button's link. A page on this same site goes through
 * `next/link`, so the header and footer stay while the next page loads
 * instead of the whole site blanking; anything else (another site, `tel:`,
 * `mailto:`, WhatsApp, `#on-this-page`) stays a plain `<a>`. Both render the
 * same `<a href>` in the server HTML. In the editor's canvas the preview
 * stops every click before it reaches either (`section-preview.tsx`).
 */
export function SiteLink({
    href,
    ...props
}: ComponentProps<"a"> & { href: string }) {
    return isSitePath(href) ? (
        <Link href={href} {...props} />
    ) : (
        <a href={href} {...props} />
    );
}

export const isSitePath = (href: string): boolean =>
    href.startsWith("/") && !href.startsWith("//");
