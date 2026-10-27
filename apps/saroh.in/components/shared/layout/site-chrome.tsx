import {
    resourceItems,
    solutionItems,
} from "@/components/shared/nav/nav-items";
import { SiteFooter } from "@/components/shared/nav/site-footer";
import { SiteNav } from "@/components/shared/nav/site-nav";
import { WhatsAppChat } from "@/components/shared/whatsapp/whatsapp-chat";
import { shownLegal, shownResources } from "@/content/resources";
import { env } from "@/env";
import { asksConsent } from "@/lib/ga";
import { resourcesContext } from "@/lib/resources-context";
import { publishList, shownToolLinks, solutionLink } from "@/lib/search-pages";
import { siteTagConfig } from "@/lib/site-tag-config";
import { whatsappNumber } from "@/lib/whatsapp";

/**
 * Marketing Site V2's chrome (plan U18/U19): Paper, a 1280px page with the
 * nav at the top and the footer at the bottom, as every V2 design draws it.
 * The `(site)` layout wraps its pages in it, and the 404 (`app/not-found.tsx`),
 * which renders under the root layout only, wraps itself.
 *
 * The Resources and Tools menus and the footer's Resources, Tools and legal links are worked
 * out here, on the server, from `content/resources.ts` (plan U1): only
 * pages that are published and built.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
    const ctx = resourcesContext();
    const resources = resourceItems(shownResources(ctx));
    // A solution goes to its /for/ page once that is live (DEC-193).
    const published = publishList();
    // The app's tools and the package's, each once published (#1253).
    const tools = shownToolLinks(ctx, published);
    const solutions = solutionItems((slug) => solutionLink(slug, published));
    // "Cookie choices" shows wherever the notice can ask: Google Analytics,
    // an advertising tag (DEC-127) or the recorder (DEC-125).
    const analytics = asksConsent(siteTagConfig());
    return (
        <div className="min-h-screen bg-background text-foreground [line-height:normal]">
            <div className="mx-auto max-w-mk-page overflow-x-clip bg-background">
                <SiteNav
                    resources={resources}
                    tools={tools}
                    solutions={solutions}
                />
                <main id="main">{children}</main>
                <SiteFooter
                    resources={resources}
                    tools={tools}
                    solutions={solutions}
                    legal={shownLegal(ctx)}
                    cookieChoices={analytics}
                />
            </div>
            <WhatsAppChat
                number={whatsappNumber(
                    env.NEXT_PUBLIC_WHATSAPP_CHAT,
                    env.NEXT_PUBLIC_WHATSAPP_NUMBER,
                )}
                asksConsent={analytics}
            />
        </div>
    );
}
