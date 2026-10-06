import { resourceItems } from "@/components/v2/nav-items";
import { SiteFooter } from "@/components/v2/site-footer";
import { SiteNav } from "@/components/v2/site-nav";
import { shownLegal, shownResources } from "@/content/resources";
import { env } from "@/env";
import { gaMeasurementId } from "@/lib/ga";
import { resourcesContext } from "@/lib/resources-context";

/**
 * Marketing Site V2's chrome (plan U18/U19): Paper, a 1280px page with the
 * nav at the top and the footer at the bottom, as every V2 design draws it.
 *
 * The Resources menu and the footer's Resources and legal links are worked
 * out here, on the server, from `content/resources.ts` (plan U1): only
 * pages that are published and built.
 *
 * The waitlist (`(standalone)`) draws its own chrome, so it sits outside
 * this group.
 */
export default function V2Layout({ children }: { children: React.ReactNode }) {
    const ctx = resourcesContext();
    const resources = resourceItems(shownResources(ctx));
    const analytics = !!gaMeasurementId({
        id: env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
        vercelEnv: env.VERCEL_ENV,
    });
    return (
        <div className="min-h-screen bg-background text-foreground [line-height:normal]">
            <div className="mx-auto max-w-mk-page overflow-x-clip bg-background">
                <SiteNav resources={resources} />
                <main id="main">{children}</main>
                <SiteFooter
                    resources={resources}
                    legal={shownLegal(ctx)}
                    cookieChoices={analytics}
                />
            </div>
        </div>
    );
}
