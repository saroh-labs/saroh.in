import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Arrow } from "@/components/v2/arrow";
import { CtaLink } from "@/components/v2/cta-link";
import { IntegrationSteps } from "@/components/v2/integrations/integration-steps";
import {
    INTEGRATION_SLUGS,
    integrationHref,
    INTEGRATIONS_PATH,
    isIntegrationSlug,
} from "@/content/integrations";
import { integrationMeta, loadIntegration } from "@/lib/integration-docs";
import { pageMetadata } from "@/lib/seo";

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
 */
export const dynamicParams = false;

export function generateStaticParams() {
    return INTEGRATION_SLUGS.map((provider) => ({ provider }));
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

const COUNT = ["zero", "one", "two", "three", "four", "five", "six", "seven"];

const H2 =
    "m-0 font-display text-[26px] font-bold tracking-[-0.02em] [text-wrap:balance]";

const LINK =
    "cursor-pointer rounded-sm text-brand-700 no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]";

export default async function IntegrationPage({ params }: Props) {
    const { provider } = await params;
    if (!isIntegrationSlug(provider)) notFound();
    const { frontmatter: fm, Body } = await loadIntegration(provider);
    const self = integrationHref(provider);
    const links = fm.links.filter((l) => l.href !== self);
    const stepsTitle = `Connect it in ${COUNT[fm.steps.length] ?? fm.steps.length} steps`;

    return (
        <>
            <article className="mx-auto grid max-w-[760px] gap-6 px-6 pt-[72px]">
                <nav aria-label="Breadcrumb">
                    <ol className="m-0 flex list-none items-center gap-2 p-0 text-[14px] text-muted-foreground">
                        <li>
                            <Link
                                href={INTEGRATIONS_PATH}
                                className="cursor-pointer rounded-sm text-muted-foreground no-underline transition-colors duration-fast ease-out hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 focus-visible:[outline-style:solid]"
                            >
                                Integrations
                            </Link>
                        </li>
                        <li aria-hidden>/</li>
                        <li>{fm.category}</li>
                    </ol>
                </nav>
                <h1 className="m-0 font-display text-[clamp(36px,6vw,60px)] font-bold leading-none tracking-[-0.045em]">
                    {fm.name}
                </h1>
                <p className="m-0 text-mk-lead leading-[1.65] text-mk-prose [text-wrap:pretty]">
                    {fm.intro}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <CtaLink
                        src={`integrations-${provider}`}
                        className="h-[50px] px-[22px] text-[15px]"
                    />
                </div>
                <section
                    aria-labelledby="does"
                    className="grid gap-3.5 border-t border-border pt-6"
                >
                    <h2 id="does" className={H2}>
                        {fm.doesTitle}
                    </h2>
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
            </article>

            <section
                aria-labelledby="steps"
                className="grid gap-6 px-mk-gutter pt-14"
            >
                <div className="mx-auto w-full max-w-[760px] border-t border-border px-6 pt-6">
                    <h2 id="steps" className={H2}>
                        {stepsTitle}
                    </h2>
                </div>
                <IntegrationSteps
                    steps={fm.steps}
                    panelPath={fm.panelPath}
                    initialStep={fm.initialStep}
                />
            </section>

            <article className="mx-auto grid max-w-[760px] gap-6 px-6 pt-14">
                <section
                    aria-labelledby="questions"
                    className="grid border-t border-border pt-6"
                >
                    <h2 id="questions" className={`${H2} mb-2`}>
                        Questions
                    </h2>
                    <dl className="m-0">
                        {fm.faq.map((item) => (
                            <div
                                key={item.q}
                                className="grid gap-1.5 border-b border-mk-line-soft py-4"
                            >
                                <dt className="text-mk-body font-semibold">
                                    {item.q}
                                </dt>
                                <dd className="m-0 text-mk-faq leading-[1.65] text-mk-copy [text-wrap:pretty]">
                                    {item.a}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </section>
                {links.length > 0 ? (
                    <div className="flex flex-wrap gap-5 text-[15px]">
                        {links.map((l) => (
                            <Link key={l.href} href={l.href} className={LINK}>
                                {l.label}
                                <Arrow />
                            </Link>
                        ))}
                    </div>
                ) : null}
            </article>
        </>
    );
}
