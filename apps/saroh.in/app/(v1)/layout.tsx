import { SiteFooter } from "@/components/site/site-footer";
import { SiteNav } from "@/components/site/site-nav";
import { Toaster } from "sonner";

/**
 * The V1 pages' chrome (/sell, /website, /bookings, /contacts, /insights,
 * /how-it-works, /coming-soon), kept working until the V2 pages replace them
 * (U26 deletes this group). Light only, like the rest of the site.
 */
export default function V1Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[hsl(var(--marketing-canvas))]">
            <Toaster />
            <SiteNav />
            <main id="main">{children}</main>
            <SiteFooter />
        </div>
    );
}
