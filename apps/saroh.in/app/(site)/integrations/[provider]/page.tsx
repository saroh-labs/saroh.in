import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { IntegrationSteps } from "@/components/integrations/integration-steps";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { JsonLd } from "@/components/shared/layout/json-ld";
import { helpHref, liveArticles, summarise } from "@/content/help";
import {
    integrationHref,
    INTEGRATIONS_PATH,
    isIntegrationSlug,
    shownIntegrationSlugs,
} from "@/content/integrations";
import { featuresOff } from "@/lib/feature-switches";
import { numberWord } from "@/lib/format/number-words";
import { helpArticles } from "@/lib/help-docs";
import { integrationMeta, loadIntegration } from "@/lib/integration-docs";
import { resourcesContext } from "@/lib/resources-context";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbLd } from "@/lib/structured-data";
import { Arrow } from "@saroh/marketing/arrow";
import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { Article, Container } from "@saroh/marketing/container";
import { Faq } from "@saroh/marketing/faq";
import { PageTitle } from "@saroh/marketing/page-title";
import { SectionHeading } from "@saroh/marketing/section-heading";
import { textLinkClasses } from "@saroh/marketing/text-link";

/**
 * One integration's page (Resources plan U3, design "Saroh Resources -
 * Integrations - Razorpay"): ONE template for every provider, its words in
 * `content/integrations/<slug>.mdx`. Built at build time; any other slug is
 * a 404.
 *
 * The design's "Available on every plan, Free included." line and its
 * "Is it on the Free plan?" answer are left out: no page names what a plan
 * contains until Pricing is published (DESIGN.md, DEC-078), and plan
 * contents are set in the admin (MARKETING_CLAIMS D3). The design's
 * "Help: Connect …" link waits for Help (U5, 17 Oct).
 *
 * The AI apps' pages (Claude, ChatGPT; plan 2026-11-13-002 U7) are built
 * only while the `ai-apps` switch is on, and point to what AI apps can do.
 * A link to a Help article is drawn only once that article is live, so the
 * pages can name their Help before it is written (U9).
 */
export const dynamicParams = false;

export function generateStaticParams() {
    // Only the shown pages: a switched-off one is never built (404).
    return shownIntegrationSlugs(featuresOff()).map((provider) => ({
        provider,
    }));
}

interface Props {
    params: Promise<{ provider: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { provider } = await params;
    if (!isIntegrationSlug(provider)) return {};
    const fm = integrationMeta(provider);
    return pageMetadata({
        title: fm.title,
        socialTitle: `${fm.name} · Saroh integrations`,
        description: fm.description,
        path: integrationHref(provider),
    });
}

export default async function IntegrationPage({ params }: Props) {
    const { provider } = await params;
    if (
        !isIntegrationSlug(provider) ||
        !shownIntegrationSlugs(featuresOff()).includes(provider)
    ) {
        notFound();
    }
    const { frontmatter: fm, Body } = await loadIntegration(provider);
    const self = integrationHref(provider);
    const liveHelp = liveArticles(
        helpArticles().map(summarise),
        resourcesContext(),
    ).map((a) => helpHref(a.slug));
    const links = fm.links.filter(
        (l) =>
            l.href !== self &&
            (!l.href.startsWith("/help/") || liveHelp.includes(l.href)),
    );
    const stepsTitle = `Connect it in ${numberWord(fm.steps.length)} steps`;

    return (
        <>
            <Article>
                {/* The trail drawn below, ending on this page. */}
                <JsonLd
                    data={breadcrumbLd([
                        { name: "Integrations", path: INTEGRATIONS_PATH },
                        { name: fm.category },
                        { name: fm.name, path: self },
                    ])}
                />
                <Breadcrumbs
                    crumbs={[
                        { name: "Integrations", href: INTEGRATIONS_PATH },
                        { name: fm.category },
                    ]}
                />
                <PageTitle size="article">{fm.name}</PageTitle>
                <p className="m-0 text-mk-lead leading-[1.65] text-mk-prose [text-wrap:pretty]">
                    {fm.intro}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <CtaLink
                        src={`integrations-${provider}`}
                        className="h-[50px] px-[22px] text-[15px]"
                    />
                    {fm.category === "AI apps" ? (
                        <Link
                            href="/features/ai-apps"
                            className={textLinkClasses({
                                className:
                                    "inline-flex min-h-11 items-center text-[15px]",
                            })}
                        >
                            See what AI apps can do
                            <Arrow />
                        </Link>
                    ) : null}
                </div>
                <section
                    aria-labelledby="does"
                    className="grid gap-3.5 border-t border-border pt-6"
                >
                    <SectionHeading
                        id="does"
                        title={fm.doesTitle}
                        size="article"
                    />
                    <Body
                        components={{
                            p: (props) => (
                                <p
                                    className="m-0 text-mk-body leading-[1.7] text-mk-prose [text-wrap:pretty]"
                                    {...props}
                                />
                            ),
                            strong: (props) => (
                                <strong
                                    className="font-semibold text-foreground"
                                    {...props}
                                />
                            ),
                        }}
                    />
                </section>
            </Article>

            <section
                aria-labelledby="steps"
                className="grid gap-6 px-mk-gutter pt-14"
            >
                <Container
                    width="article"
                    className="border-t border-border pt-6"
                >
                    <SectionHeading
                        id="steps"
                        title={stepsTitle}
                        size="article"
                    />
                </Container>
                <IntegrationSteps
                    steps={fm.steps}
                    panelPath={fm.panelPath}
                    initialStep={fm.initialStep}
                />
            </section>

            <Container
                as="article"
                width="article"
                className="grid gap-6 pt-14"
            >
                <Faq
                    items={fm.faq}
                    id="questions"
                    size="article"
                    // Inside the article's column: its width and gutter.
                    className="max-w-none px-0 pt-0"
                />
                {links.length > 0 ? (
                    <div className="flex flex-wrap gap-5 text-[15px]">
                        {links.map((l) => (
                            <Link
                                key={l.href}
                                href={l.href}
                                className={textLinkClasses()}
                            >
                                {l.label}
                                <Arrow />
                            </Link>
                        ))}
                    </div>
                ) : null}
            </Container>
        </>
    );
}
