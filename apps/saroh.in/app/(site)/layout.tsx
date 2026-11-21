import { SiteChrome } from "@/components/shared/layout/site-chrome";

import { SarohDocument, sarohMetadata } from "../saroh-document";

export const metadata = sarohMetadata;

/**
 * Marketing Site V2's chrome (plan U18/U19), in `SiteChrome`, which the 404
 * shares, inside Saroh's document (a root layout: `saroh-document.tsx`).
 *
 * The waitlist (`(standalone)`) and the pricing draft (`(preview)`) draw
 * their own chrome, so they sit outside this group.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
    return (
        <SarohDocument>
            <SiteChrome>{children}</SiteChrome>
        </SarohDocument>
    );
}
