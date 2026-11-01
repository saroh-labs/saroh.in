import "@saroh/search-pages/styles.css";

import type { ToolPageData } from "@saroh/search-pages";
import { ToolPage } from "@saroh/search-pages";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CtaClickArea } from "@/components/shared/buttons/cta-click-area";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { SiteToolGate } from "@/components/tools/tool-gate";
import { cta } from "@/lib/links";
import {
    builtTools,
    isPublished,
    questionsLd,
    searchPages,
    TOOLS_HUB,
} from "@/lib/search-pages";
import { pageMetadata, pageTitle, SITE_URL } from "@/lib/seo";
import { breadcrumbLd, toolLd } from "@/lib/structured-data";

/**
 * `/tools/<tool>` (#1253, DEC-193): one page per tool in
 * `@saroh/search-pages`, drawn by its `<ToolPage>` with the tool from the
 * package's registry. Production builds the live tools only; a preview
 * builds them all, a tool not live with a Draft label and `noindex`
 * (`lib/search-pages.ts`). The two app tools keep their own routes beside
 * this one. Any other slug is a 404.
 */
export const dynamicParams = false;

/** The package's tools this build draws (not the two with their own routes). */
const built = () => builtTools().filter((t) => !t.inApp);

export function generateStaticParams() {
    return built().map((t) => ({ slug: t.slug }));
}

interface Props {
    params: Promise<{ slug: string }>;
}

function builtTool(slug: string): ToolPageData | null {
    return built().some((t) => t.slug === slug)
        ? searchPages.loadToolPage(slug)
        : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const p = builtTool(slug);
    if (!p) return {};
    return {
        ...pageMetadata({
            title: pageTitle(p.title),
            socialTitle: p.name,
            description: p.description,
            path: p.path,
        }),
        ...(!isPublished(p.path) && {
            robots: { index: false, follow: false },
        }),
    };
}

export default async function ToolRoute({ params }: Props) {
    const { slug } = await params;
    const p = builtTool(slug);
    if (!p) notFound();

    const start = cta({ src: `tool-${slug}` });
    return (
        <>
            <JsonLd
                data={[
                    breadcrumbLd([
                        { name: "Home", path: "/" },
                        TOOLS_HUB,
                        { name: p.name, path: p.path },
                    ]),
                    toolLd({
                        name: p.name,
                        description: p.description,
                        url: `${SITE_URL}${p.path}`,
                    }),
                    questionsLd(p.questions),
                ]}
            />
            <SiteToolGate tool={slug}>
                <CtaClickArea src={`tool-${slug}`} mode={start.mode}>
                    <ToolPage
                        page={p}
                        draft={!isPublished(p.path)}
                        links={{
                            home: "/",
                            hub: TOOLS_HUB.path,
                            startFree: start.href,
                            startFreeLabel: start.label,
                        }}
                    />
                </CtaClickArea>
            </SiteToolGate>
        </>
    );
}
