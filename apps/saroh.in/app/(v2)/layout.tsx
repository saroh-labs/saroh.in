import { SiteFooter } from "@/components/v2/site-footer";
import { SiteNav } from "@/components/v2/site-nav";

/**
 * Marketing Site V2's chrome (plan U18/U19): Paper, a 1280px page with the
 * nav at the top and the footer at the bottom, as every V2 design draws it.
 *
 * V2 pages live in this route group so they can land one at a time beside the
 * V1 pages in `(v1)`, which keep their own nav. A V2 page that takes over a V1
 * address (Home, `/`) moves out of `(v1)` and into here in the same commit.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground [line-height:normal]">
            <div className="mx-auto max-w-mk-page overflow-x-clip bg-background">
                <SiteNav />
                <main id="main">{children}</main>
                <SiteFooter />
            </div>
        </div>
    );
}
