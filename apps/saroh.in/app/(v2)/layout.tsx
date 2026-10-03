import { SiteFooter } from "@/components/v2/site-footer";
import { SiteNav } from "@/components/v2/site-nav";

/**
 * Marketing Site V2's chrome (plan U18/U19): Paper, a 1280px page with the
 * nav at the top and the footer at the bottom, as every V2 design draws it.
 *
 * The waitlist (`(standalone)`) and the pricing draft (`(preview)`) draw
 * their own chrome, so they sit outside this group.
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
