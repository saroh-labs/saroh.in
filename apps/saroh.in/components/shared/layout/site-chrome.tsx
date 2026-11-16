import {
    FEATURE_ITEMS,
    resourceItems,
    SOLUTION_ITEMS,
    solutionItems,
} from "@/components/shared/nav/nav-items";
import { SiteFooter } from "@/components/shared/nav/site-footer";
import { SiteNav } from "@/components/shared/nav/site-nav";
import { WhatsAppChat } from "@/components/shared/whatsapp/whatsapp-chat";
import { shownLegal, shownResources } from "@/content/resources";
import { env } from "@/env";
import { docPages } from "@/lib/docs-pages";
import { asksConsent } from "@/lib/ga";
import { resourcesContext } from "@/lib/resources-context";
import { docHubLinks } from "@/lib/search-page-route";
import type { PublishList } from "@/lib/search-pages";
import {
    builtSearchPages,
    builtTools,
    footerToolLinks,
    liveTools,
    publishList,
    shownToolLinks,
    solutionLink,
    solutionMenuItems,
    TOOLS_HUB,
    tradesHubLinks,
} from "@/lib/search-pages";
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
export function SiteChrome({
    children,
    banner,
    preview = false,
}: {
    children: React.ReactNode;
    /** A bar above the nav: the staff pricing preview's (DEC-195, A22). */
    banner?: React.ReactNode;
    /**
     * The staff preview (`/pricing/draft`): the nav and footer bare, with no
     * menus, legal links or WhatsApp, and nothing read for them.
     */
    preview?: boolean;
}) {
    if (preview) {
        return (
            <Shell banner={banner}>
                <SiteNav features={FEATURE_ITEMS} solutions={SOLUTION_ITEMS} />
                <main id="main">{children}</main>
                <SiteFooter />
            </Shell>
        );
    }
    const ctx = resourcesContext();
    // A solution goes to its /for/ page once that is live (DEC-193).
    const published = menusList(publishList(), ctx.preview);
    // Then the GST, guides and downloads hubs, each once a page is live.
    const resources = [
        ...resourceItems(shownResources(ctx)),
        ...docHubLinks(published),
    ];
    // The app's tools and the package's, each once published (#1253).
    const tools = shownToolLinks(ctx, published);
    const toolsHub =
        liveTools(published).length > 0
            ? { name: "See all free tools", href: TOOLS_HUB.path }
            : undefined;
    const tradesHub = tradesHubLinks(published);
    const solutions = [
        ...solutionItems((slug) => solutionLink(slug, published)),
        ...tradesHub,
    ];
    // "Cookie choices" shows wherever the notice can ask: Google Analytics,
    // an advertising tag (DEC-127) or the recorder (DEC-125).
    const analytics = asksConsent(siteTagConfig());
    return (
        <Shell
            banner={banner}
            after={
                <WhatsAppChat
                    number={whatsappNumber(
                        env.NEXT_PUBLIC_WHATSAPP_CHAT,
                        env.NEXT_PUBLIC_WHATSAPP_NUMBER,
                    )}
                    asksConsent={analytics}
                />
            }
        >
            <SiteNav
                features={FEATURE_ITEMS}
                resources={resources}
                tools={tools}
                solutions={solutions}
                solutionMenu={solutionMenuItems(published) ?? undefined}
                allTrades={
                    tradesHub[0]
                        ? { name: tradesHub[0].name, href: tradesHub[0].href }
                        : undefined
                }
                allTools={toolsHub}
            />
            <main id="main">{children}</main>
            <SiteFooter
                resources={resources}
                tools={[
                    ...footerToolLinks(tools),
                    ...(toolsHub ? [{ ...toolsHub, line: "" }] : []),
                ]}
                solutions={solutions}
                legal={shownLegal(ctx)}
                cookieChoices={analytics}
            />
        </Shell>
    );
}

/**
 * Paper, and what sits outside the page (the WhatsApp button). The page is
 * as wide as the window, so the redesign's bands (`Section`'s `tone`) run
 * edge to edge; each section keeps its own 1280px column (`Container`).
 */
function Shell({
    banner,
    after,
    children,
}: {
    banner?: React.ReactNode;
    after?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-foreground [line-height:normal]">
            <div className="overflow-x-clip bg-background">
                {banner}
                {children}
            </div>
            {after}
        </div>
    );
}

/**
 * What the menus and footer count as live. On a preview with
 * `RESOURCES_PREVIEW` on (never production, `previewOn`), every page this
 * build has, so local review reaches every trade, tool, guide, GST page and
 * download from the nav (owner, 16 Nov 2026); otherwise the publish list.
 */
export function menusList(list: PublishList, preview: boolean): PublishList {
    if (!preview || !list.preview) return list;
    return {
        ...list,
        live: [
            ...builtSearchPages(list).map((p) => p.path),
            ...builtTools(list).map((p) => p.path),
            ...(["guides", "gst", "downloads"] as const).flatMap((id) =>
                docPages.list(id).map((p) => p.path),
            ),
        ],
    };
}
