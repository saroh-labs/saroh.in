import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { ButtonLink } from "../buttons/button";
import { cn } from "../cn";
import type { WorldOrder } from "../content/world";
import { Chip, SourceChips } from "../kit/chip";
import { ClosingCTA } from "../kit/closing-cta";
import { CroppedCard } from "../kit/cropped-card";
import { StickyBar } from "../kit/sticky-bar";
import { TimeStamp } from "../kit/time-stamp";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import type { ShotView } from "../media/shot";
import { ShotImage } from "../media/shot-image";
import { ring } from "../ring";
import { Mark } from "../sections/mark";
import { SplitHero } from "../sections/split-hero";
import { Tail } from "./reach/tail";
import type { PageSite } from "./site";

/** Words every Keep page shares (each edition's `content/feature-keep.ts`). */
export interface KeepTemplateWords {
    crumb: string;
    /** "See 9 am at Rye & Co.": the hero's day button. */
    secondary: (hour: string, business: string) => string;
    heroNote: string;
    chapters: string;
    chapterNames: {
        how: string;
        points: string;
        ask: string;
        faq: string;
    };
    pointsTitle: string;
    morePoints: (n: number) => string;
    compare: string;
    faqTitle: string;
    faqAsk: { lead: string; label: string; href: string };
    allQuestions: string;
    readFrom: string;
    of: string;
}

/** The Ask band, its switches already worked out by the site. */
export interface KeepAsk {
    title: string;
    body: string;
    /** The link's words, with its plan named only while that claim is on. */
    link: string;
    href: string;
    exchanges: readonly {
        q: string;
        a: string;
        /** The order the answer points at, from the world, and its note. */
        order?: { id: string; customer: string; total: string; note: string };
        sources: readonly string[];
    }[];
}

/**
 * The Ask band from an edition's words: its link, and each answer's order
 * looked up in the world for its customer and total (with the words' note).
 */
export function keepAsk<
    A extends {
        exchanges: readonly (Omit<KeepAsk["exchanges"][number], "order"> & {
            order?: { id: string; note: string };
        })[];
    },
>(
    ask: A,
    href: string,
    orders: readonly WorldOrder[] | undefined,
): Omit<A, "exchanges"> & Pick<KeepAsk, "href" | "exchanges"> {
    return {
        ...ask,
        href,
        exchanges: ask.exchanges.map((x) => {
            const o = x.order
                ? orders?.find((r) => r.id === x.order?.id)
                : undefined;
            return {
                ...x,
                order:
                    o && x.order
                        ? {
                              id: o.id,
                              customer: o.customer,
                              total: o.total,
                              note: x.order.note,
                          }
                        : undefined,
            };
        }),
    };
}

export interface KeepPageProps {
    slug: string;
    words: KeepTemplateWords;
    site: Pick<PageSite, "start">;
    /** The feature's own words (`content/features.ts`). */
    feature: {
        name: string;
        headline: string;
        sub: string;
        howTitle: string;
        cardLine: string;
        closer: string;
        steps: readonly {
            title: string;
            body: string;
            who: string;
            shot: ShotView;
        }[];
        /** With their plan notes already added where the site may say them. */
        points: readonly { title: string; body: string }[];
    };
    /** The headline's word the Saffron mark sits under. */
    mark: string;
    /** The time-stamped scene above the hero shot. */
    scene?: { at: string; line: string };
    hero: ShotView;
    /** The hero's day button, where the day's page is live. */
    day: { href: string; label: string } | null;
    /** The "How to …" links to Help. */
    help: readonly { href: string; label: string }[];
    ask: KeepAsk | null;
    /** The plan sentence, from the site's catalogue or plan rule. */
    planLine: ReactNode;
    compareHref: string;
    /** "Tell me when" where no plan is on sale; else the words' "Compare plans". */
    compareLabel?: string;
    faq?: readonly { q: string; a: string }[];
    /** In place of the hero note: what works today, on a Limited page. */
    note?: string;
    /** "Not available yet", on each step and point of a page that can't be used yet. */
    notYet?: string;
    /** Where Features lives: "/features". */
    featuresHref?: string;
    /** A feature's own moments under the hero (Orders: `OrdersMoments`). */
    moments?: ReactNode;
}

const H2 =
    "m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]";
const PAD = "py-12 min-[760px]:py-[120px]";

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

/**
 * A record feature's page (DEC-221 "Keep"; boards FODesk and FOPhone2): the
 * promise and a moment, the real screen cropped to what matters; how it
 * works, step by step with its Help links; what it does; the extender
 * bands it has (Ask); plans in a line; questions; and the close. Every word and fact comes in as props: each edition's site works
 * out its switches, shots, links and world, and this draws them.
 */
export function KeepPage({
    slug,
    words: KEEP,
    site,
    feature,
    mark,
    scene,
    hero,
    day,
    help,
    ask,
    planLine,
    compareHref,
    compareLabel,
    faq,
    note,
    notYet,
    featuresHref = "/features",
    moments,
}: KeepPageProps) {
    const points = feature.points;
    const chapters = [
        { id: "how", name: KEEP.chapterNames.how },
        { id: "points", name: KEEP.chapterNames.points },
        ...(ask ? [{ id: "ask", name: KEEP.chapterNames.ask }] : []),
        ...(faq?.length ? [{ id: "faq", name: KEEP.chapterNames.faq }] : []),
    ];
    const ctaId = `${slug}-hero-cta`;
    const scroll = "scroll-mt-[calc(var(--mk-nav-h)+16px)]";

    return (
        <>
            <StickyBar watch={ctaId}>
                {site.start(`feature-${slug}-sticky`)}
            </StickyBar>

            {/* SLOT 1 · HERO: the promise, a moment, then the real screen cropped. */}
            <SplitHero
                id={`${slug}-title`}
                crumbs={[
                    { name: KEEP.crumb, href: featuresHref },
                    { name: feature.name },
                ]}
                crumbsClassName="[&_[aria-current]]:font-semibold [&_[aria-current]]:text-foreground"
                title={marked(feature.headline, mark)}
                lede={feature.sub}
                primary={
                    <span id={ctaId}>{site.start(`feature-${slug}`)}</span>
                }
                secondary={
                    day ? (
                        <ButtonLink
                            href={day.href}
                            variant="secondary"
                            size="kit"
                            className="bg-card"
                        >
                            {day.label}
                        </ButtonLink>
                    ) : null
                }
                foot={note ?? KEEP.heroNote}
                className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-12 pt-8 min-[760px]:gap-12 min-[760px]:pb-[120px] min-[760px]:pt-12"
                gridClassName="pt-0 min-[760px]:pt-0 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,440px)] min-[960px]:gap-16"
            >
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
                {scene ? (
                    <p className="m-0 flex max-w-[70ch] gap-4 text-[18px] leading-normal text-mk-copy">
                        <TimeStamp
                            at={scene.at}
                            className="shrink-0 pt-0.5 text-[15px] text-brand-700"
                        />
                        <span>{scene.line}</span>
                    </p>
                ) : null}
                <CroppedCard height={600} className="shadow-mk-hero">
                    <div data-shot={hero.id}>
                        <ShotImage
                            shot={hero.image}
                            alt={hero.alt ?? hero.image.alt}
                            sizes="(min-width: 1280px) 1200px, 100vw"
                            priority
                            priorityFrom="(min-width: 760px)"
                        />
                    </div>
                </CroppedCard>
            </SplitHero>

            {/* Orders' own moments (FODesk): the order taken, then one opened. */}
            {moments}

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
                        const shot = step.shot;
                        return (
                            <li
                                key={step.title}
                                className={cn(
                                    "grid content-start gap-5 max-[759px]:w-[calc(100%-24px)] max-[759px]:shrink-0 max-[759px]:snap-start min-[960px]:items-start min-[960px]:gap-16",
                                    // The shot keeps the wide column on either side.
                                    i % 2
                                        ? "min-[960px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]"
                                        : "min-[960px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]",
                                )}
                            >
                                <div
                                    className={cn(
                                        "grid content-start gap-3 min-[960px]:pt-4",
                                        i % 2 && "min-[960px]:order-2",
                                    )}
                                >
                                    {/* Bigger than the kit's h3 so a step reads as a heading over its body (owner, 16 Nov 2026). */}
                                    <h3 className="m-0 font-display text-mk-card-lg font-bold [text-wrap:balance] min-[960px]:text-mk-h2-article">
                                        {step.title}
                                        {notYet ? (
                                            <NotYet label={notYet} />
                                        ) : null}
                                    </h3>
                                    <p className="m-0 text-[16px] leading-relaxed text-mk-copy">
                                        {step.body}
                                    </p>
                                    <p className="m-0 text-mk-note text-muted-foreground">
                                        {step.who}
                                    </p>
                                </div>
                                <div
                                    data-shot={shot.id}
                                    className="aspect-[16/10] overflow-hidden rounded-mk-crop border border-border bg-card shadow-mk-panel"
                                >
                                    {/* One frame for every step (owner, 16 Nov 2026); a capture is 16:10 too, so nothing is cut. */}
                                    <ShotImage
                                        shot={shot.image}
                                        alt={shot.alt ?? shot.image.alt}
                                        sizes="(min-width: 960px) 700px, 100vw"
                                        className="h-full object-cover object-left-top"
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
                    <PointList points={points.slice(0, 3)} notYet={notYet} />
                    {points.length > 3 ? (
                        <details className="mk-fold group">
                            <Fold>{KEEP.morePoints(points.length - 3)}</Fold>
                            <PointList
                                points={points.slice(3)}
                                notYet={notYet}
                                className="mt-6 min-[760px]:mt-10"
                            />
                        </details>
                    ) : null}
                </div>
            </Container>

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
                            <TextLink href={ask.href} tone="on-ink" arrow>
                                {ask.link}
                            </TextLink>
                        </div>
                        <ul className="m-0 grid list-none gap-4 p-0 max-[759px]:-mr-5 max-[759px]:flex max-[759px]:snap-x max-[759px]:snap-mandatory max-[759px]:gap-3 max-[759px]:overflow-x-auto max-[759px]:pr-5 max-[759px]:[scrollbar-width:none]">
                            {ask.exchanges.map((x) => {
                                const o = x.order;
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
                                        {o ? (
                                            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-mk-on-ink-line px-4 py-2.5 text-[14px]">
                                                <span className="font-mono">
                                                    {o.id}
                                                </span>
                                                <span className="flex-1">
                                                    {o.customer} · {o.total}
                                                </span>
                                                <span className="font-semibold text-mk-on-ink-accent">
                                                    {o.note}
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

            {/* THE ENDING: plans in a line (the shared feature-page ending). */}
            <Tail
                line={planLine}
                compare={{
                    label: compareLabel ?? KEEP.compare,
                    href: compareHref,
                }}
                className="pb-12 pt-0 min-[760px]:pb-[96px] min-[760px]:pt-0"
            />

            {/* QUESTIONS: every answer in the HTML; three, then the rest folded on a phone. */}
            {faq?.length ? (
                <Container
                    as="section"
                    id="faq"
                    aria-labelledby={`${slug}-faq`}
                    className={cn(
                        "grid gap-8 pb-12 min-[760px]:pb-[96px] min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,720px)] min-[960px]:gap-16",
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
                        {faq.slice(0, 3).map((f, i) => (
                            <Question
                                key={f.q}
                                q={f.q}
                                a={f.a}
                                open={i === 0}
                            />
                        ))}
                        {faq.length > 3 ? (
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
                                {faq.slice(3).map((f) => (
                                    <Question key={f.q} q={f.q} a={f.a} />
                                ))}
                            </details>
                        ) : null}
                    </div>
                </Container>
            ) : null}

            <ClosingCTA
                title={feature.closer}
                primary={site.start(`feature-${slug}-band`)}
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
    notYet,
    className,
}: {
    points: readonly { title: string; body: string }[];
    notYet?: string;
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
                        {notYet ? <NotYet label={notYet} /> : null}
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

/** "Not available yet", beside a part a page can't offer today. */
function NotYet({ label }: { label: string }) {
    return (
        <span className="ml-2 inline-flex h-6 items-center rounded-full bg-mk-hover px-2.5 align-middle font-sans text-[12px] font-semibold tracking-normal text-mk-copy">
            {label}
        </span>
    );
}
