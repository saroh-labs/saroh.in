import "@saroh/search-pages/styles.css";

import { ToolsHub } from "@saroh/search-pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { routeExists } from "@/content/resources";
import { cta } from "@/lib/links";
import { resourcesContext } from "@/lib/resources-context";
import { builtTools, liveTools, TOOLS_HUB } from "@/lib/search-pages";
import { pageMetadata, pageTitle } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";

const HUB_DESCRIPTION =
    "Free tools for small businesses in India: GST, billing, QR codes, WhatsApp links and more. Each one works in your browser.";

/** A tool counts as new for this long after its words were last changed. */
const NEW_FOR_DAYS = 45;

/**
 * `/tools` (#1253; design Hub.dc.html): the free tools this build has, in
 * the hub's sections, the two app tools among them once they're live. With
 * none it is a 404, and nothing links it; a preview's hub of drafts only is
 * `noindex`.
 */
export function generateMetadata(): Metadata {
    return {
        ...pageMetadata({
            title: pageTitle("Free tools for small businesses in India"),
            description: HUB_DESCRIPTION,
            path: TOOLS_HUB.path,
        }),
        ...(liveTools().length === 0 && {
            robots: { index: false, follow: false },
        }),
    };
}

export default function ToolsHubPage() {
    const { routes, now } = resourcesContext();
    // Only tools whose page this build has (an app tool's route may be off).
    const tools = builtTools().filter((t) => routeExists(t.path, routes));
    if (tools.length === 0) notFound();
    // shortcut: "new" is by the content file's date, not when it went live; upgrade if the publish list ever says when.
    const since = now.getTime() - NEW_FOR_DAYS * 86_400_000;
    const start = cta({ src: "tools-hub" });
    return (
        <>
            <JsonLd
                data={[breadcrumbLd([{ name: "Home", path: "/" }, TOOLS_HUB])]}
            />
            <CtaClickArea src={"tools-hub"} mode={start.mode}>
                <ToolsHub
                    tools={tools}
                    home="/"
                    startFree={start.href}
                    startFreeLabel={start.label}
                    isNew={(t) =>
                        !t.inApp && new Date(t.updated).getTime() >= since
                    }
                />
            </CtaClickArea>
        </>
    );
}
