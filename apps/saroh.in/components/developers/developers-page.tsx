import { CtaLink } from "@/components/shared/buttons/cta-link";
import { HeroActions } from "@/components/shared/buttons/hero-actions";
import { docsHref, DEVELOPERS as page } from "@/content/developers";
import { Arrow } from "@saroh/marketing/arrow";
import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { ButtonLink } from "@saroh/marketing/button";
import { cardLinkClasses } from "@saroh/marketing/card-link";
import { cn } from "@saroh/marketing/cn";
import { CodeSample } from "@saroh/marketing/code-sample";
import { Container } from "@saroh/marketing/container";
import { CtaBand } from "@saroh/marketing/cta-band";
import { FeaturePoints } from "@saroh/marketing/feature-points";
import { FeatureSteps } from "@saroh/marketing/feature-steps";
import { SectionHeading } from "@saroh/marketing/section-heading";

/**
 * /developers (plan 2026-11-13-002, U6; board VFDevelopers), in the feature
 * pages' shape: the hero, How it works, What it does, then the docs and the
 * band. No "Used by": it is written for whoever builds, not a trade.
 *
 * Each step's picture is drawn, not captured: code samples on Ink (Copy
 * puts the sample on the clipboard) and the API keys list as words and
 * boxes, like an integration page's panels.
 *
 * Every link into docs.saroh.in is drawn only while the `docs` switch is
 * on (`docsOn`), so none points at a site that isn't up yet; without it the
 * hero and the band offer the start button. "See AI apps" shows only while
 * that page is built.
 */
export function DevelopersPage({
    docsOn,
    aiAppsOn,
}: {
    docsOn: boolean;
    aiAppsOn: boolean;
}) {
    const readDocs = docsHref(page.readDocs.path);
    return (
        <>
            <Container
                as="header"
                className="grid justify-items-start gap-5 pt-[72px]"
            >
                <Breadcrumbs
                    current="brand"
                    crumbs={[{ name: "Resources" }, { name: page.name }]}
                />
                <h1 className="m-0 max-w-[16ch] font-display text-mk-display font-bold [text-wrap:balance]">
                    {page.headline}
                </h1>
                <p className="m-0 max-w-[60ch] text-mk-lead text-mk-copy [text-wrap:pretty]">
                    {page.sub}
                </p>
                {docsOn ? (
                    <div className="flex flex-wrap gap-3">
                        <ButtonLink href={readDocs}>
                            {page.readDocs.label}
                        </ButtonLink>
                        <CtaLink src="developers" variant="secondary" />
                    </div>
                ) : (
                    <HeroActions src="developers" />
                )}
                <p className="m-0 text-mk-note text-muted-foreground">
                    {page.note}
                </p>
            </Container>

            <Container className="pt-14">
                <figure className="m-0 grid gap-3.5">
                    <div className="grid items-start gap-6 rounded-mk-band border border-border bg-muted p-4 sm:p-7 lg:grid-cols-[1.15fr_1fr]">
                        <CodeSample
                            title={page.hero.title}
                            code={page.hero.code}
                        />
                        <WebhookPanel />
                    </div>
                    <figcaption className="text-sm text-muted-foreground">
                        {page.hero.caption}
                    </figcaption>
                </figure>
            </Container>

            <FeatureSteps
                title={page.howTitle}
                steps={page.steps.map((step) => ({
                    title: step.title,
                    body: step.body,
                    who: step.who,
                    drawn: (
                        <div className="rounded-mk-band border border-border bg-muted p-3.5 sm:p-[22px]">
                            {"code" in step ? (
                                <CodeSample
                                    title={step.code.title}
                                    code={step.code.code}
                                />
                            ) : (
                                <KeysPanel />
                            )}
                        </div>
                    ),
                }))}
            />

            <FeaturePoints points={page.points} />

            {docsOn ? (
                <Container
                    as="section"
                    aria-labelledby="docs"
                    className="grid gap-7 pt-[110px]"
                >
                    <SectionHeading
                        id="docs"
                        title={page.docsTitle}
                        lead={page.docsLead}
                        size="md"
                    />
                    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,230px),1fr))] gap-[18px] p-0">
                        {page.docs.map((doc) => (
                            <li key={doc.path} className="grid">
                                <a
                                    href={docsHref(doc.path)}
                                    className={cardLinkClasses(
                                        "gap-2.5 p-[22px]",
                                    )}
                                >
                                    <span className="text-[17px] font-semibold">
                                        {doc.title}
                                    </span>
                                    <span className="flex-1 text-[14.5px] leading-[1.55] text-mk-copy">
                                        {doc.body}
                                    </span>
                                    <span className="text-[14px] font-semibold text-brand-700">
                                        {doc.cta}
                                        <Arrow />
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </Container>
            ) : null}

            <CtaBand
                title={page.closer}
                body={
                    docsOn
                        ? page.bandBody
                        : page.bandBody.replace(
                              /^Read the docs, then ask/,
                              "Ask",
                          )
                }
                note={docsOn ? "docs.saroh.in" : null}
                className="pt-[120px]"
                actions={
                    <div className="flex flex-wrap gap-3">
                        {docsOn ? (
                            <ButtonLink href={readDocs} variant="saffron">
                                {page.readDocs.label}
                            </ButtonLink>
                        ) : (
                            <CtaLink src="developers-band" variant="saffron" />
                        )}
                        {aiAppsOn ? (
                            <ButtonLink
                                href={page.seeAiApps.href}
                                variant="secondary-on-ink"
                            >
                                {page.seeAiApps.label}
                            </ButtonLink>
                        ) : null}
                    </div>
                }
            />
        </>
    );
}

/** The hero's drawing: a webhook in Settings and its last deliveries. */
function WebhookPanel() {
    const hook = page.hero.webhook;
    return (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-muted px-4 py-2.5 text-[13px] font-semibold">
                {hook.business}
            </div>
            <div className="grid gap-2.5 px-4 py-4 sm:px-[18px]">
                <span className="text-[12.5px] text-muted-foreground">
                    {hook.path}
                </span>
                <span className="flex items-center gap-2">
                    <span className="text-[14.5px] font-semibold">
                        {hook.name}
                    </span>
                    <span className="ml-auto rounded-full bg-mk-ok-tint px-2 py-0.5 text-[12px] font-semibold text-mk-ok">
                        On
                    </span>
                </span>
                <span className="font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]">
                    {hook.url}
                </span>
                <span className="pt-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {hook.deliveriesTitle}
                </span>
                <ul className="m-0 grid list-none p-0">
                    {hook.deliveries.map((d) => (
                        <li
                            key={d.event}
                            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-muted py-2"
                        >
                            <code className="font-mono text-[12px]">
                                {d.event}
                            </code>
                            <span className="text-[12.5px] text-muted-foreground">
                                {d.line}
                            </span>
                            <span className="ml-auto rounded-full bg-mk-ok-tint px-2 py-0.5 text-[11.5px] font-semibold text-mk-ok">
                                {d.result}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

/** The first step's drawing: the API keys list, as Settings shows it. */
function KeysPanel() {
    const keys = page.keys;
    return (
        <div className="mx-auto max-w-[540px] overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-muted px-4 py-2.5 text-[13px] font-semibold">
                {keys.business}
            </div>
            <div className="grid gap-2 px-4 py-4 sm:px-[18px]">
                <span className="flex items-center gap-2">
                    <span className="font-display text-[19px] font-bold">
                        {keys.title}
                    </span>
                    <span
                        aria-hidden
                        className="ml-auto inline-flex h-8 items-center rounded-mk-control bg-foreground px-3 text-[12.5px] font-semibold text-background"
                    >
                        {keys.action}
                    </span>
                </span>
                <ul className="m-0 grid list-none p-0">
                    {keys.rows.map((row) => (
                        <li
                            key={row.name}
                            className="flex items-start gap-3 border-t border-muted py-2.5"
                        >
                            <span className="grid min-w-0 gap-0.5">
                                <span className="text-[14px] font-semibold">
                                    {row.name}
                                </span>
                                <span className="font-mono text-[12px] text-muted-foreground">
                                    {row.key}
                                </span>
                                <span className="text-[12.5px] text-muted-foreground">
                                    {row.line}
                                </span>
                            </span>
                            <span
                                className={cn(
                                    "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold",
                                    row.on
                                        ? "bg-mk-ok-tint text-mk-ok"
                                        : "bg-muted text-muted-foreground",
                                )}
                            >
                                {row.kind}
                            </span>
                        </li>
                    ))}
                </ul>
                <span className="text-[12.5px] text-muted-foreground">
                    {keys.note}
                </span>
            </div>
        </div>
    );
}
