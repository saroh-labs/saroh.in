import { SiteChrome } from "@/components/v2/site-chrome";

/**
 * Marketing Site V2's chrome (plan U18/U19), in `SiteChrome`, which the 404
 * shares.
 *
 * The waitlist (`(standalone)`) and the pricing draft (`(preview)`) draw
 * their own chrome, so they sit outside this group.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
    return <SiteChrome>{children}</SiteChrome>;
}
