import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { Chip, SourceChips } from "@saroh/marketing/kit/chip";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { CroppedCard } from "@saroh/marketing/kit/cropped-card";
import { MomentCard } from "@saroh/marketing/kit/moment-card";
import { PlanLine } from "@saroh/marketing/kit/plan-line";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { hourLabel } from "@saroh/marketing/kit/time";
import { TimeStamp } from "@saroh/marketing/kit/time-stamp";
import { Mark } from "@saroh/marketing/mark";
import { ring } from "@saroh/marketing/ring";
import { TextLink } from "@saroh/marketing/text-link";
import type { WorldBusiness, WorldHour } from "@saroh/marketing/world";
import { dayLink } from "@saroh/marketing/world";
import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { OrdersMoments } from "@/components/feature-pages/orders-moments";
import { heroPlanLine } from "@/components/feature/feature-hero";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { ShotImage } from "@/components/shared/media/shot-image";
import { featureHelpLinks } from "@/content/feature-help";
import type { KeepSlug } from "@/content/feature-keep";
import { KEEP, KEEP_WORDS } from "@/content/feature-keep";
import { ORDERS_MOMENTS } from "@/content/feature-orders";
import { featureHref, featureList, features } from "@/content/features";
import { summarise } from "@/content/help";
import { shots } from "@/content/shots";
import { solutions } from "@/content/solutions";
import { WORLD } from "@/content/world";
import { claimOn, featuresOff } from "@/lib/feature-switches";
import { helpArticles } from "@/lib/help-docs";
import { LAUNCH_MODE } from "@/lib/links";
import { readLivePricing } from "@/lib/pricing";
import { resourcesContext } from "@/lib/resources-context";
import { isPublished, solutionLink } from "@/lib/search-pages";

const H2 =
    "m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]";
const PAD = "py-[72px] min-[760px]:py-[120px]";

/** The headline with the Saffron mark under its one word. */
function marked(headline: string, word: string): ReactNode {
    const at = headline.lastIndexOf(word);
    if (at < 0) return headline;
    return (
        <>
            {headline.slice(0, at)}
            <Mark>{word}</Mark>
            {headline.slice(at + word.length)}
        </>
    );
}

/** The page's one moment: its own words, else the world's hour for the feature. */
function momentOf(
    slug: KeepSlug,
): { business: WorldBusiness; hour: WorldHour } | null {
    const own = KEEP_WORDS[slug].moment;
    const lead = WORLD.lead;
    if (own) return { business: lead, hour: { at: own.at, line: own.line } };
    for (const business of [lead, ...WORLD.others]) {
        const hour = business.day?.find((h) => h.feature === slug);
        if (hour) return { business, hour };
    }
    return null;
}

/**
 * A record feature's page (DEC-221 "Keep"; boards FODesk and FOPhone2): the
 * promise and a moment, the real screen cropped to what matters; how it
 * works, step by step with its Help links; what it does; what happens
 * around it (the features it moves); the extender bands it has (Ask); one
 * moment from the day; plans in a line; who uses it; questions; and the
 * close. Every word the page had before stays (`content/features.ts`); the
 * template's own words are in `content/feature-keep.ts`.
 */
export async function KeepPage({ slug }: { slug: KeepSlug }) {
    const feature = features[slug];
    const words = KEEP_WORDS[slug];
    const catalog = LAUNCH_MODE === "open" ? await readLivePricing() : null;
    const context = resourcesContext();
    const help = featureHelpLinks(slug, helpArticles().map(summarise), context);
    const off = featuresOff();
    const shown = new Set(featureList.map((f) => f.slug));
    const around = feature.worksWith.filter((s) => shown.has(s));

    const moment = momentOf(slug);
    const day =
        moment?.business.tradePage && isPublished(moment.business.tradePage)
            ? {
                  href: dayLink(moment.business, moment.hour),
                  label: KEEP.secondary(
                      hourLabel(moment.hour.at),
                      moment.business.name,
                  ),
              }
            : null;

    const ask =
        words.ask && !off.includes("ask-ai")
            ? {
                  ...words.ask,
                  exchanges: words.ask.exchanges.filter((x) =>
                      (x.claims ?? []).every((c) => claimOn(c)),
                  ),
                  link:
                      !words.ask.link.claim || claimOn(words.ask.link.claim)
                          ? words.ask.link.label
                          : words.ask.link.fallback,
              }
            : null;

    const chapters = [
        { id: "how", name: KEEP.chapterNames.how },
        { id: "points", name: KEEP.chapterNames.points },
        ...(around.length
            ? [{ id: "around", name: KEEP.chapterNames.around }]
            : []),
        ...(ask ? [{ id: "ask", name: KEEP.chapterNames.ask }] : []),
        ...(words.faq ? [{ id: "faq", name: KEEP.chapterNames.faq }] : []),
    ];
    const heroShot = shots[feature.hero.shot];
    // A point's plan note only once the launch switch is open (DEC-136).
    const points = feature.points.map((p) => ({
        title: p.title,
        body:
            LAUNCH_MODE === "open" && p.openNote
                ? `${p.body} ${p.openNote}`
                : p.body,
    }));
    const ctaId = `${slug}-hero-cta`;
    const scroll = "scroll-mt-[calc(var(--mk-nav-h)+16px)]";

    return (
        <>
            <StickyBar watch={ctaId}>
                <CtaLink src={`feature-${slug}-sticky`} size="kit" />
            </StickyBar>

            {/* SLOT 1 · HERO: the promise, a moment, then the real screen cropped. */}
            <Container
                as="section"
                aria-labelledby={`${slug}-title`}
                className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-[72px] pt-8 min-[760px]:gap-12 min-[760px]:pb-[120px] min-[760px]:pt-12"
            >
                <Breadcrumbs
                    crumbs={[
                        { name: KEEP.crumb, href: "/features" },
                        { name: feature.name },
                    ]}
                    current="plain"
                    className="[&_[aria-current]]:font-semibold [&_[aria-current]]:text-foreground"
                />
                <div className="grid gap-6 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,440px)] min-[960px]:items-end min-[960px]:gap-16">
                    <h1
                        id={`${slug}-title`}
                        className="m-0 max-w-[16ch] font-display text-mk-kit-h1 font-bold [text-wrap:balance]"
                    >
                        {marked(feature.headline, words.mark)}
                    </h1>
                    <div className="grid gap-6">
                        <p className="m-0 text-mk-kit-lead text-mk-copy [text-wrap:pretty]">
                            {feature.sub}
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <span id={ctaId}>
                                <CtaLink src={`feature-${slug}`} size="kit" />
                            </span>
                            {day ? (
                                <ButtonLink
                                    href={day.href}
                                    variant="secondary"
                                    size="kit"
                                    className="bg-card"
                                >
                                    {day.label}
                                </ButtonLink>
                            ) : null}
                        </div>
                        <p className="m-0 text-[14px] text-muted-foreground">
                            {KEEP.heroNote}
                        </p>
                    </div>
                </div>
                <nav
                    aria-label={KEEP.chapters}
                    className="-mr-mk-gutter flex gap-2 overflow-x-auto pr-mk-gutter [scrollbar-width:none] min-[760px]:hidden [&::-webkit-scrollbar]:hidden"
                >
                    {chapters.map((c) => (
                        <Chip key={c.id} variant="chapter" href={`#${c.id}`}>
                            {c.name}
                        </Chip>
                    ))}
                </nav>
                {words.scene ? (
                    <p className="m-0 flex max-w-[70ch] gap-4 text-[18px] leading-normal text-mk-copy">
                        <TimeStamp
                            at={words.scene.at}
                            className="shrink-0 pt-0.5 text-[15px] text-brand-700"
                        />
                        <span>{words.scene.line}</span>
                    </p>
                ) : null}
                <CroppedCard height={600} className="shadow-mk-hero">
                    <div data-shot={feature.hero.shot}>
                        <ShotImage
                            shot={heroShot}
                            alt={feature.hero.alt ?? heroShot.alt}
                            sizes="(min-width: 1280px) 1200px, 100vw"
                            priority
                            priorityFrom="(min-width: 760px)"
                        />
                    </div>
                </CroppedCard>
            </Container>

            {/* Orders' own moments (FODesk): the order taken, then one opened. */}
            {slug === "orders" ? <OrdersMoments data={ORDERS_MOMENTS} /> : null}

            {/* SLOT 2 · HOW IT WORKS: each step beside its screen, then Help. */}
            <Container
                as="section"
                id="how"
                aria-labelledby={`${slug}-how`}
                className={cn(
                    "grid gap-10 pt-0 min-[760px]:gap-14",
                    PAD,
                    scroll,
                )}
            >
                <h2 id={`${slug}-how`} className={H2}>
                    {feature.howTitle}
                </h2>
                {/* A phone: the steps swipe, one in full and the next peeking (PHONE.md). */}
                <ol
                    aria-label={feature.howTitle}
                    className="m-0 grid list-none gap-12 p-0 max-[759px]:-mr-mk-gutter max-[759px]:flex max-[759px]:snap-x max-[759px]:snap-mandatory max-[759px]:gap-3 max-[759px]:overflow-x-auto max-[759px]:pr-mk-gutter max-[759px]:[scrollbar-width:none] min-[760px]:gap-20"
                >
                    {feature.steps.map((step, i) => {
                        const shot = shots[step.shot];
                        return (
                            <li
                                key={step.title}
                                className="grid content-start gap-5 max-[759px]:w-[calc(100%-24px)] max-[759px]:shrink-0 max-[759px]:snap-start min-[960px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] min-[960px]:items-center min-[960px]:gap-16"
                            >
                                <div
                                    className={cn(
                                        "grid content-start gap-2",
                                        i % 2 && "min-[960px]:order-2",
                                    )}
                                >
                                    <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                        {step.title}
                                    </h3>
                                    <p className="m-0 text-[16px] leading-relaxed text-mk-copy">
                                        {step.body}
                                    </p>
                                    <p className="m-0 font-mono text-[13px] text-muted-foreground">
                                        {step.who}
                                    </p>
                                </div>
                                <div
                                    data-shot={step.shot}
                                    className="overflow-hidden rounded-mk-crop border border-border bg-card shadow-mk-panel"
                                >
                                    <ShotImage
                                        shot={shot}
                                        alt={step.alt ?? shot.alt}
                                        sizes="(min-width: 960px) 700px, 100vw"
                                    />
                                </div>
                            </li>
                        );
                    })}
                </ol>
                {help.length ? (
                    <ul className="m-0 flex list-none flex-wrap gap-x-8 gap-y-1 border-t border-border p-0 pt-6">
                        {help.map((h) => (
                            <li key={h.href}>
                                <TextLink href={h.href} tone="ink" arrow>
                                    {h.label}
                                </TextLink>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </Container>

            {/* WHAT IT DOES: the points; on a phone three, then the rest folded. */}
            <Container
                as="section"
                id="points"
                aria-labelledby={`${slug}-points`}
                className={cn("grid gap-8 pt-0", PAD, scroll)}
            >
                <h2 id={`${slug}-points`} className={H2}>
                    {KEEP.pointsTitle}
                </h2>
                <div className="border-t border-border pt-8">
                    <PointList points={points.slice(0, 3)} />
                    {feature.points.length > 3 ? (
                        <details className="mk-fold group">
                            <Fold>{KEEP.morePoints(points.length - 3)}</Fold>
                            <PointList
                                points={points.slice(3)}
                                className="mt-6 min-[760px]:mt-10"
                            />
                        </details>
                    ) : null}
                </div>
            </Container>

            {/* SLOT 4 · AROUND IT: the records it moves, each its own page. */}
            {around.length ? (
                <Container
                    as="section"
                    id="around"
                    aria-labelledby={`${slug}-around`}
                    className={cn("grid gap-10 pt-0", PAD, scroll)}
                >
                    <div className="grid gap-4">
                        <h2 id={`${slug}-around`} className={H2}>
                            {KEEP.aroundTitle}
                        </h2>
                        <p className="m-0 max-w-[60ch] text-mk-kit-lead text-mk-copy">
                            {feature.worksLead}
                        </p>
                    </div>
                    <div className="grid gap-6 min-[960px]:grid-cols-[260px_1fr] min-[960px]:items-center min-[960px]:gap-16">
                        <div className="grid gap-1 rounded-mk-card bg-foreground px-6 py-5 text-background">
                            <b className="font-display text-[24px] font-bold">
                                {feature.name}
                            </b>
                            <span className="text-[14px] text-mk-on-ink">
                                {feature.cardLine}
                            </span>
                        </div>
                        <ul className="m-0 list-none border-t border-border p-0">
                            {around.map((s) => (
                                <li key={s} className="border-b border-border">
                                    <Link
                                        href={featureHref(s)}
                                        className={cn(
                                            "grid min-h-16 grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 no-underline hover:text-foreground min-[760px]:grid-cols-[240px_1fr_auto] [&:hover_h3]:underline",
                                            ring(),
                                        )}
                                    >
                                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold underline-offset-4">
                                            {features[s].name}
                                        </h3>
                                        <span className="col-start-1 text-[16px] text-mk-copy min-[760px]:col-start-2 min-[760px]:row-start-1">
                                            {features[s].cardLine}
                                        </span>
                                        <ArrowRight
                                            aria-hidden
                                            className="col-start-2 row-span-2 row-start-1 size-5 min-[760px]:col-start-3 min-[760px]:row-span-1"
                                        />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </Container>
            ) : null}

            {/* SLOT 5 · EXTENDER: Ask, on Ink. */}
            {ask ? (
                <Container
                    as="section"
                    id="ask"
                    aria-labelledby={`${slug}-ask`}
                    className={cn("pb-12 min-[760px]:pb-[120px]", scroll)}
                >
                    <div className="grid gap-8 rounded-mk-card bg-foreground px-5 py-10 text-background min-[760px]:px-14 min-[760px]:py-12 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,660px)] min-[960px]:gap-12">
                        <div className="grid content-start gap-4">
                            <h2
                                id={`${slug}-ask`}
                                className="m-0 font-display text-mk-kit-h2 font-bold text-background"
                            >
                                {ask.title}
                            </h2>
                            <p className="m-0 text-[16px] leading-relaxed text-mk-on-ink">
                                {ask.body}
                            </p>
                            <TextLink
                                href={featureHref("ask-ai")}
                                tone="on-ink"
                                arrow
                            >
                                {ask.link}
                            </TextLink>
                        </div>
                        <ul className="m-0 grid list-none gap-4 p-0 max-[759px]:-mr-5 max-[759px]:flex max-[759px]:snap-x max-[759px]:snap-mandatory max-[759px]:gap-3 max-[759px]:overflow-x-auto max-[759px]:pr-5 max-[759px]:[scrollbar-width:none]">
                            {ask.exchanges.map((x) => {
                                const o = x.order
                                    ? WORLD.lead.orders?.find(
                                          (r) => r.id === x.order?.id,
                                      )
                                    : undefined;
                                return (
                                    <li
                                        key={x.q}
                                        className="grid content-start gap-3 rounded-mk-card border border-mk-on-ink-line bg-mk-on-ink-hover p-5 max-[759px]:w-[calc(100%-24px)] max-[759px]:shrink-0 max-[759px]:snap-start"
                                    >
                                        <p className="m-0 justify-self-end rounded-xl bg-background px-3.5 py-2 text-[15px] text-foreground">
                                            {x.q}
                                        </p>
                                        <p className="m-0 text-[16px] leading-relaxed">
                                            {x.a}
                                        </p>
                                        {o && x.order ? (
                                            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-mk-on-ink-line px-4 py-2.5 text-[14px]">
                                                <span className="font-mono">
                                                    {o.id}
                                                </span>
                                                <span className="flex-1">
                                                    {o.customer} · {o.total}
                                                </span>
                                                <span className="font-semibold text-mk-on-ink-accent">
                                                    {x.order.note}
                                                </span>
                                            </p>
                                        ) : null}
                                        <SourceChips
                                            label={KEEP.readFrom}
                                            sources={x.sources.map((name) => ({
                                                name,
                                            }))}
                                            className="text-mk-on-ink [&_a]:bg-transparent [&_a]:text-background [&_span[class*=border]]:border-mk-on-ink-line [&_span[class*=border]]:bg-transparent [&_span[class*=border]]:text-background"
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </Container>
            ) : null}

            {/* THE ENDING: one moment, plans in a line, who uses it. */}
            <Container className="grid gap-8 pb-[72px] min-[760px]:pb-[96px]">
                {moment && day ? (
                    <MomentCard
                        at={moment.hour.at}
                        line={moment.hour.line}
                        link={day}
                    />
                ) : null}
                <PlanLine compare={{ label: KEEP.compare, href: "/pricing" }}>
                    {heroPlanLine(feature, catalog)}
                </PlanLine>
                {feature.usedBy.length ? (
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[14px] text-muted-foreground">
                            {KEEP.usedBy}
                        </span>
                        {feature.usedBy.map((s) => (
                            <Chip
                                key={s}
                                variant="filter"
                                href={solutionLink(s)}
                            >
                                {solutions[s].longName}
                            </Chip>
                        ))}
                    </div>
                ) : null}
            </Container>

            {/* QUESTIONS: every answer in the HTML; three, then the rest folded on a phone. */}
            {words.faq ? (
                <Container
                    as="section"
                    id="faq"
                    aria-labelledby={`${slug}-faq`}
                    className={cn(
                        "grid gap-8 pb-[72px] min-[760px]:pb-[96px] min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,720px)] min-[960px]:gap-16",
                        scroll,
                    )}
                >
                    <div className="grid content-start gap-3">
                        <h2 id={`${slug}-faq`} className={H2}>
                            {KEEP.faqTitle}
                        </h2>
                        <p className="m-0 flex items-center gap-2 text-[16px] text-mk-copy">
                            {KEEP.faqAsk.lead}
                            <TextLink href={KEEP.faqAsk.href} tone="ink" arrow>
                                {KEEP.faqAsk.label}
                            </TextLink>
                        </p>
                    </div>
                    <div className="border-t border-border">
                        {words.faq.slice(0, 3).map((f, i) => (
                            <Question
                                key={f.q}
                                q={f.q}
                                a={f.a}
                                open={i === 0}
                            />
                        ))}
                        {words.faq.length > 3 ? (
                            <details className="mk-fold group/all">
                                <summary
                                    className={cn(
                                        "flex min-h-14 cursor-pointer list-none items-center justify-between border-b border-border font-semibold min-[760px]:hidden [&::-webkit-details-marker]:hidden",
                                        ring(),
                                    )}
                                >
                                    {KEEP.allQuestions}
                                    <ChevronDown
                                        aria-hidden
                                        className="size-4 transition-transform group-open/all:rotate-180"
                                    />
                                </summary>
                                {words.faq.slice(3).map((f) => (
                                    <Question key={f.q} q={f.q} a={f.a} />
                                ))}
                            </details>
                        ) : null}
                    </div>
                </Container>
            ) : null}

            <ClosingCTA
                title={feature.closer}
                primary={<CtaLink src={`feature-${slug}-band`} size="kit" />}
                className="pt-0 min-[760px]:pt-0"
            />
        </>
    );
}

function Fold({ children }: { children: ReactNode }) {
    return (
        <summary
            className={cn(
                "mt-6 inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold underline decoration-border-strong decoration-1 underline-offset-[3px] min-[760px]:hidden [&::-webkit-details-marker]:hidden",
                ring(),
            )}
        >
            {children}
            <ChevronDown
                aria-hidden
                className="size-4 transition-transform group-open:rotate-180"
            />
        </summary>
    );
}

function PointList({
    points,
    className,
}: {
    points: readonly { title: string; body: string }[];
    className?: string;
}) {
    return (
        <ul
            className={cn(
                "m-0 grid list-none gap-6 p-0 min-[760px]:grid-cols-2 min-[760px]:gap-x-10 min-[760px]:gap-y-10 min-[1100px]:grid-cols-3",
                className,
            )}
        >
            {points.map((p) => (
                <li key={p.title} className="grid content-start gap-1.5">
                    <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                        {p.title}
                    </h3>
                    <p className="m-0 text-[16px] leading-relaxed text-mk-copy">
                        {p.body}
                    </p>
                </li>
            ))}
        </ul>
    );
}

function Question({
    q,
    a,
    open = false,
}: {
    q: string;
    a: string;
    open?: boolean;
}) {
    return (
        <details className="group border-b border-border" open={open}>
            <summary
                className={cn(
                    "flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-[18px] font-semibold [&::-webkit-details-marker]:hidden",
                    ring(),
                )}
            >
                {q}
                <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 transition-transform group-open:rotate-180"
                />
            </summary>
            <p className="m-0 max-w-[65ch] pb-6 text-[16px] leading-relaxed text-mk-copy">
                {a}
            </p>
        </details>
    );
}
