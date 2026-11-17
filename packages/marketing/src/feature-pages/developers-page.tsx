import type { ReactNode } from "react";

import { ButtonLink } from "../buttons/button";
import { cn } from "../cn";
import { ClosingCTA } from "../kit/closing-cta";
import { StickyBar } from "../kit/sticky-bar";
import { Container } from "../layout/container";
import { cardLinkClasses } from "../links/card-link";
import { TextLink } from "../links/text-link";
import { CodeSample } from "../sections/code-sample";
import { FeaturePoints } from "../sections/feature-points";
import { FeatureSteps } from "../sections/feature-steps";
import { PageHero } from "../sections/page-hero";
import { SectionHeading } from "../sections/section-heading";

interface Code {
    title: string;
    code: string;
}

/** /developers' words, each site's own (its API address, its money, its demos). */
export interface DevelopersWords {
    name: string;
    headline: string;
    sub: string;
    note: string;
    readDocs: { label: string; path: string };
    hero: {
        title: string;
        code: string;
        webhook: {
            business: string;
            path: string;
            name: string;
            url: string;
            deliveriesTitle: string;
            deliveries: readonly {
                event: string;
                line: string;
                result: string;
            }[];
        };
        caption: string;
    };
    howTitle: string;
    steps: readonly {
        title: string;
        body: string;
        who: string;
        visual: string;
        code?: Code;
        storefront?: StorefrontList;
    }[];
    keys: {
        business: string;
        title: string;
        action: string;
        rows: readonly {
            name: string;
            key: string;
            kind: string;
            line: string;
            on: boolean;
        }[];
        note: string;
    };
    points: readonly { title: string; body: string }[];
    docsTitle: string;
    docsLead: string;
    docs: readonly { title: string; body: string; cta: string; path: string }[];
    closer: string;
    bandBody: string;
    seeAiApps: { label: string; href: string };
}

interface StorefrontList {
    title: string;
    rows: readonly { name: string; line: string }[];
}

/**
 * /developers (plan 2026-11-13-002, U6; board VFDevelopers), in the feature
 * pages' shape: the hero, How it works, What it does, then the docs and the
 * band. No "Used by": it is written for whoever builds, not a trade.
 *
 * Each step's picture is drawn, not captured: code samples on Ink (Copy
 * puts the sample on the clipboard) and the API keys list as words and
 * boxes, like an integration page's panels.
 *
 * Every link into the docs site is drawn only while the `docs` switch is
 * on (`docsOn`), so none points at a site that isn't up yet; without it the
 * hero and the band offer the start button. "See AI apps" shows only while
 * that page is built. Shared by both sites (owner, 16 Nov 2026, #13): each
 * passes its words, its docs address and its start button.
 */
export function DevelopersPage({
    words: page,
    docsHref,
    docsHost,
    start,
    docsOn,
    aiAppsOn,
}: {
    words: DevelopersWords;
    docsHref: (path: string) => string;
    /** " docs.saroh.in", the band's last words. */
    docsHost: string;
    /** The site's start button, by its tracking source. */
    start: (src: string, variant?: "primary" | "secondary") => ReactNode;
    docsOn: boolean;
    aiAppsOn: boolean;
}) {
    const readDocs = docsHref(page.readDocs.path);
    return (
        <>
            <PageHero
                crumbs={[{ name: "Resources" }, { name: page.name }]}
                title={page.headline}
                lead={page.sub}
            >
                <div className="flex flex-wrap gap-3">
                    {docsOn ? (
                        <ButtonLink
                            id="developers-cta"
                            href={readDocs}
                            size="kit"
                        >
                            {page.readDocs.label}
                        </ButtonLink>
                    ) : null}
                    <span id={docsOn ? undefined : "developers-cta"}>
                        {start("developers", docsOn ? "secondary" : "primary")}
                    </span>
                </div>
                <p className="m-0 -mt-2 text-[15px] text-muted-foreground">
                    {page.note}
                </p>
            </PageHero>

            <Container>
                <figure className="m-0 grid gap-3.5">
                    <div className="grid items-start gap-6 rounded-mk-card border border-border bg-muted p-4 sm:p-7 lg:grid-cols-[1.15fr_1fr]">
                        <CodeSample
                            title={page.hero.title}
                            code={page.hero.code}
                        />
                        <WebhookPanel hook={page.hero.webhook} />
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
                        <div className="rounded-mk-card border border-border bg-muted p-3.5 sm:p-[22px]">
                            {step.code ? (
                                <div className="grid gap-3.5">
                                    <CodeSample
                                        title={step.code.title}
                                        code={step.code.code}
                                    />
                                    {step.storefront ? (
                                        <Storefront list={step.storefront} />
                                    ) : null}
                                </div>
                            ) : (
                                <KeysPanel keys={page.keys} />
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
                    className="grid gap-10 pt-[72px] min-[760px]:pt-[120px]"
                >
                    <SectionHeading
                        id="docs"
                        title={page.docsTitle}
                        lead={page.docsLead}
                        size="kit-h2"
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
                                    <span className="font-display text-mk-kit-h3 font-bold">
                                        {doc.title}
                                    </span>
                                    <span className="flex-1 text-[15px] leading-[1.55] text-mk-copy">
                                        {doc.body}
                                    </span>
                                    <span className="text-[15px] font-semibold underline decoration-border-strong underline-offset-[3px]">
                                        {doc.cta} →
                                    </span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </Container>
            ) : null}

            <ClosingCTA
                id="developers-start"
                title={page.closer}
                primary={
                    docsOn ? (
                        <ButtonLink href={readDocs} size="kit">
                            {page.readDocs.label}
                        </ButtonLink>
                    ) : (
                        start("developers-band")
                    )
                }
                secondary={
                    aiAppsOn ? (
                        <TextLink href={page.seeAiApps.href} tone="ink" arrow>
                            {page.seeAiApps.label}
                        </TextLink>
                    ) : null
                }
                note={
                    <>
                        {docsOn
                            ? page.bandBody
                            : page.bandBody.replace(
                                  /^Read the docs, then ask/,
                                  "Ask",
                              )}
                        {docsOn ? docsHost : null}
                    </>
                }
            />

            <StickyBar watch="developers-cta">
                {docsOn ? (
                    <ButtonLink href={readDocs} size="kit">
                        {page.readDocs.label}
                    </ButtonLink>
                ) : (
                    start("developers-sticky")
                )}
            </StickyBar>
        </>
    );
}

/** The hero's drawing: a webhook in Settings and its last deliveries. */
function WebhookPanel({ hook }: { hook: DevelopersWords["hero"]["webhook"] }) {
    return (
        <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <BusinessBar name={hook.business} />
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
                <span className="pt-1 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
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
                            <span className="ml-auto rounded-full bg-mk-ok-tint px-2 py-0.5 text-[12px] font-semibold text-mk-ok">
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
function KeysPanel({ keys }: { keys: DevelopersWords["keys"] }) {
    return (
        <div className="mx-auto max-w-[540px] overflow-hidden rounded-xl border border-border bg-card">
            <BusinessBar name={keys.business} />
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
                                    "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold",
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

/** A drawn Settings screen's top bar: the business's letter tile and name. */
function BusinessBar({ name }: { name: string }) {
    return (
        <div className="flex items-center gap-2 border-b border-muted px-4 py-2.5 text-[13px] font-semibold">
            <span
                aria-hidden
                className="grid size-6 place-items-center rounded-md bg-foreground text-[12px] text-background"
            >
                {name.charAt(0)}
            </span>
            {name}
        </div>
    );
}

/**
 * Step 3's second drawing: what the publishable read draws on the salon's
 * own site, in a plain serif, not Saroh's type (a merchant's page).
 */
function Storefront({ list }: { list: StorefrontList }) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-muted px-4 py-3 font-serif text-[17px]">
                {list.title}
            </div>
            <ul className="m-0 grid list-none p-0 text-[13px]">
                {list.rows.map((row) => (
                    <li
                        key={row.name}
                        className="flex items-baseline gap-2 border-t border-muted px-4 py-2 first:border-t-0"
                    >
                        {row.name}
                        <span className="ml-auto text-muted-foreground">
                            {row.line}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
