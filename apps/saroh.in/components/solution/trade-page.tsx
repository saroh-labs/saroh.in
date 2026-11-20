import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import type { ClaimSwitch } from "@saroh/marketing/feature-switches";
import { PhoneFrame } from "@saroh/marketing/kit/frames";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import type { MomentIcon } from "@saroh/marketing/solutions/moment-types";
import { MomentIconMark } from "@saroh/marketing/solutions/moments";
import type { FeatureLink } from "@saroh/marketing/solutions/trade-page";
import { TradePageLayout } from "@saroh/marketing/solutions/trade-page";
import { TextLink } from "@saroh/marketing/text-link";
import type { NewFeature, SearchPageData } from "@saroh/search-pages";
import {
    AiAsks,
    AlsoSvg,
    bigTile,
    FrameDesk,
    FramePhone,
    newAlso,
    PRESETS,
    smallKeys,
    SmallPicture,
    starterWords,
} from "@saroh/search-pages";
import type { ReactElement, ReactNode } from "react";
import { cloneElement } from "react";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import { PhoneClip } from "@/components/shared/layout/phone-fold";
import type { TradeDay } from "@/content/solutions-days";
import { TRADE_WORDS as W } from "@/content/solutions-trade";
import { Fold } from "@saroh/marketing/home/fold";

export type { FeatureLink };

export interface TradePageProps {
    page: SearchPageData;
    draft?: boolean;
    /** The written day, where there is one. */
    day?: TradeDay;
    /** The `src` of this page's start buttons ("for-home-bakers"). */
    src: string;
    demo?: string;
    /** A related trade's page, when this build has it. */
    pageHref: (slug: string) => string | undefined;
    /** A feature's chip, or undefined while its page is off. */
    feature: (slug: string) => FeatureLink | undefined;
    /** The release switches that are off (U13): the AI section and new Also items follow them. */
    off: readonly string[];
    claimOn: (claim: ClaimSwitch) => boolean;
    freeLine?: ReactNode;
    pricing?: ReactNode;
    /** The trade's gallery template, while Templates is on. */
    template?: {
        slug: string;
        name: string;
        href: string;
        description: string;
    };
    /** How many trades the hub lists. */
    tradeCount: number;
    /** The trade bar's trades: the written days' and the lead ones. */
    bar: readonly { slug: string; label: string }[];
}

const BODY = "m-0 text-[16px] leading-relaxed text-mk-copy";

/** Desk and phone words: one element when they're the same, two when not. */
function Both({ desk, phone }: { desk: string; phone?: string }) {
    if (!phone || phone === desk) return <>{desk}</>;
    return (
        <>
            <span className="max-[759px]:hidden">{desk}</span>
            <span className="min-[760px]:hidden">{phone}</span>
        </>
    );
}

const CHIP_ICON: Record<string, MomentIcon> = {
    cal: "calendar",
    ok: "check",
    bill: "bill",
    person: "customer",
};

/** A trade without a written day: its sample day on a phone, from its MDX scene. */
function SceneHero({ page }: { page: SearchPageData }) {
    const s = page.scene;
    return (
        <PhoneFrame label={s.heroAlt} width={360}>
            <div className="grid gap-1 px-5 pb-5 pt-2">
                <p className="m-0 flex items-baseline justify-between">
                    <b className="font-display text-[20px] tracking-[-0.02em]">
                        {s.hero.title}
                    </b>
                    <span className="text-[13px] text-mk-copy">
                        {s.hero.count}
                    </span>
                </p>
                <p className="m-0 text-[13px] text-mk-copy">{s.business}</p>
                <ul className="m-0 mt-3 list-none p-0">
                    {s.hero.rows.map((r, i) => (
                        <li
                            key={r.time + r.name}
                            className={cn(
                                "flex gap-3 border-b border-[#EEEBE4] px-2 py-2.5 text-[14px]",
                                i === s.hero.highlight &&
                                    "rounded-[8px] bg-[#FFF9EE]",
                            )}
                        >
                            <span className="w-14 shrink-0 font-mono text-[13px]">
                                {r.time}
                            </span>
                            <b className="min-w-0 flex-1 font-semibold">
                                {r.name}
                            </b>
                            <span className="text-mk-copy">{r.right}</span>
                        </li>
                    ))}
                </ul>
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                    {s.chips.map((c) => (
                        <li
                            key={c.title}
                            className="flex items-center gap-3 rounded-mk-crop bg-background p-3"
                        >
                            <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[#F1EBDF]">
                                <MomentIconMark
                                    icon={CHIP_ICON[c.icon] ?? "check"}
                                    className="size-4"
                                />
                            </span>
                            <span className="grid min-w-0 gap-0.5">
                                <b className="text-[14px] font-semibold">
                                    {c.title}
                                </b>
                                {c.sub ? (
                                    <span className="text-[13px] text-mk-copy">
                                        <Both desk={c.sub} phone={c.phoneSub} />
                                    </span>
                                ) : null}
                            </span>
                            {c.pill ? (
                                <span className="ml-auto shrink-0 rounded-full bg-mk-ok-tint px-2.5 py-1 text-[12px] font-semibold text-mk-ok">
                                    {c.pill}
                                </span>
                            ) : null}
                        </li>
                    ))}
                </ul>
                {s.proof ? (
                    <p className="m-0 mt-2 flex items-center gap-3 rounded-mk-crop border border-border p-3">
                        <span className="grid min-w-0 gap-0.5">
                            <b className="text-[14px] font-semibold">
                                {s.proof.title}
                            </b>
                            <span className="text-[13px] text-mk-copy">
                                {s.proof.sub}
                            </span>
                        </span>
                        {s.proof.pill ? (
                            <span className="ml-auto shrink-0 rounded-full bg-mk-ok-tint px-2.5 py-1 text-[12px] font-semibold text-mk-ok">
                                {s.proof.pill}
                            </span>
                        ) : null}
                    </p>
                ) : null}
            </div>
        </PhoneFrame>
    );
}

/** A problem's `link` word ("Orders", "Website") as a feature's slug. */
const PROBLEM_LINKS: Readonly<Record<string, string>> = {
    website: "website",
    orders: "orders",
    products: "products",
    customers: "customers",
    billing: "billing",
    bookings: "bookings",
    subscriptions: "subscriptions",
    insights: "insights",
    dashboard: "dashboard",
    "ask ai": "ask-ai",
    "ai apps": "ai-apps",
    share: "social",
};
function problemFeature(link?: string): string | undefined {
    return link ? PROBLEM_LINKS[link.toLowerCase()] : undefined;
}

/* ------------------------------------------------------------------ what changes */

function Changes({
    page: p,
    isOn,
    feature,
}: {
    page: SearchPageData;
    isOn: (f: NewFeature) => boolean;
    feature: TradePageProps["feature"];
}) {
    const s = p.scene;
    const T = s.tiles;
    const pre = PRESETS[p.shape];
    const big = bigTile(p);
    const bigWords = T[pre.big] as (typeof T)[string] | undefined;
    const url = p.shape === "orders" ? "app.saroh.in" : s.site;
    const extra = newAlso(p, isOn);
    const alsoItems: ReactElement<{ className?: string }>[] = [
        ...s.also.map((it, i) => (
            <li key={it.title} className="flex gap-3">
                <span className="va-icon">
                    <AlsoSvg
                        icon={
                            it.icon ??
                            (pre.also[i] as
                                (typeof pre.also)[number] | undefined) ??
                            "list"
                        }
                    />
                </span>
                <span className="grid gap-1">
                    <b className="text-[16px] font-semibold">{it.title}</b>
                    <span className="text-[15px] leading-snug text-mk-copy">
                        {it.line}
                    </span>
                </span>
            </li>
        )),
        ...extra.map((it) => {
            const f = feature(it.feature);
            return (
                <li key={it.feature} className="flex gap-3">
                    <span className="va-icon">
                        <AlsoSvg icon={it.icon} />
                    </span>
                    <span className="grid gap-1">
                        {f ? (
                            <TextLink href={f.href} tone="ink" arrow>
                                {it.title}
                            </TextLink>
                        ) : (
                            <b className="text-[16px] font-semibold">
                                {it.title}
                            </b>
                        )}
                        <span className="text-[15px] leading-snug text-mk-copy">
                            {it.line}
                        </span>
                    </span>
                </li>
            );
        }),
    ];
    return (
        // The tiles' drawings are the search pages' own (`.sp` carries their colours).
        // The search pages' tile drawings draw pills and meta at 11 to 11.5px: here every informative word is at least 12px.
        <div className="sp grid grid-cols-[minmax(0,1fr)] gap-12 [&_.vc-av]:!text-[12px] [&_.vc-k]:!text-[12px] [&_.vc-pill]:!text-[12px] [&_.vc-sm]:!text-[12px] [&_[style*='font-size:11']]:!text-[12px]">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-5 min-[760px]:grid-cols-2 min-[1000px]:grid-cols-3">
                {bigWords ? (
                    <article className="grid content-start gap-4 rounded-mk-card border border-border bg-card p-5 min-[760px]:col-span-2 min-[1000px]:col-span-3">
                        <div className="max-[759px]:hidden">
                            <FrameDesk url={url}>{big.desk}</FrameDesk>
                        </div>
                        <div className="min-[760px]:hidden">
                            <FramePhone url={url}>{big.phone}</FramePhone>
                        </div>
                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                            {bigWords.title}
                        </h3>
                        <p className={BODY}>
                            <Both
                                desk={bigWords.line}
                                phone={bigWords.phoneLine}
                            />
                        </p>
                    </article>
                ) : null}
            </div>
            <SwipeRow
                label={p.problemsTitle}
                columns={smallKeys(p).length % 3 === 1 ? 2 : 3}
            >
                {smallKeys(p).map((k) => {
                    const w = T[k] as (typeof T)[string] | undefined;
                    return (
                        <article
                            key={k}
                            className="grid h-full content-start gap-4 rounded-mk-card border border-border bg-card p-5"
                        >
                            <div className="vc-pic" aria-hidden="true">
                                <SmallPicture k={k} p={p} />
                            </div>
                            <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {w?.title}
                            </h3>
                            <p className={BODY}>
                                <Both
                                    desk={w?.line ?? ""}
                                    phone={w?.phoneLine}
                                />
                            </p>
                        </article>
                    );
                })}
            </SwipeRow>
            <figure className="m-0 grid gap-4 rounded-mk-card bg-foreground p-6 text-background min-[760px]:grid-cols-[minmax(0,1fr)_260px] min-[760px]:p-10">
                <blockquote className="m-0">
                    <p className="m-0 font-display text-[24px] font-bold leading-tight tracking-[-0.025em] min-[760px]:text-[36px]">
                        “{s.quote.text}”
                    </p>
                </blockquote>
                <figcaption className="text-[15px] leading-relaxed text-mk-on-ink">
                    {s.quote.caption}
                </figcaption>
            </figure>
            <div className="grid gap-5">
                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                    {W.also}
                </h3>
                <ul className="m-0 grid list-none gap-x-10 gap-y-5 p-0 min-[760px]:grid-cols-2 min-[1000px]:grid-cols-3">
                    {alsoItems.map((li, i) =>
                        i < 3
                            ? li
                            : cloneElement(li, {
                                  className: "flex gap-3 max-[759px]:hidden",
                              }),
                    )}
                </ul>
                {/* A phone: three, then the rest fold (PHONE.md). */}
                {alsoItems.length > 3 ? (
                    <Fold
                        summary={W.allAlso(alsoItems.length)}
                        className="-mt-2 min-[760px]:hidden"
                    >
                        <ul className="m-0 mt-3 grid list-none gap-y-5 p-0">
                            {alsoItems.slice(3)}
                        </ul>
                    </Fold>
                ) : null}
            </div>
            {p.ai && isOn("ai-apps") ? (
                // The asks swipe here (the search page's own track styles assume its layout).
                <div className="max-[899px]:[&_.sp-ai-lines]:!mt-6 max-[899px]:[&_.sp-bento]:!mt-6 max-[899px]:[&_.sp-bento]:-mr-mk-gutter max-[899px]:[&_.sp-bento]:snap-x max-[899px]:[&_.sp-bento]:snap-mandatory max-[899px]:[&_.sp-bento]:!flex-row max-[899px]:[&_.sp-bento]:overflow-x-auto max-[899px]:[&_.sp-bento]:pr-mk-gutter max-[899px]:[&_.sp-bento]:[scrollbar-width:none] [&_.sp-card]:relative max-[899px]:[&_.sp-card]:snap-start max-[899px]:[&_.sp-card]:![flex:0_0_86%] max-[899px]:[&_.sp-sec]:!mt-0">
                    <AiAsks
                        ai={p.ai}
                        isOn={isOn}
                        feature={(f) => feature(f)?.href}
                    />
                </div>
            ) : null}
        </div>
    );
}

/* ------------------------------------------------------------------ the page */

/**
 * A /for/<trade> page: its MDX (`SearchPageData`) and its written day, where
 * there is one, drawn by the shared `TradePageLayout`. The parts only
 * saroh.in's search pages have (their sample day, their "What changes"
 * drawings, their starter list) stay here.
 */
export function TradePage(props: TradePageProps) {
    const { page: p, day, src, demo, feature, off, template, pricing } = props;
    const isOn = (f: NewFeature) => !off.includes(f);
    const starter = starterWords(p);
    const tpl = template
        ? { slug: template.slug, name: template.name }
        : undefined;
    const changes = <Changes page={p} isOn={isOn} feature={feature} />;

    return (
        <TradePageLayout
            slug={p.slug}
            name={p.name}
            h1={p.h1}
            lead={p.lead}
            phoneLead={p.phoneLead}
            words={W}
            hubHref="/for"
            tradeHref={(s) => `/for/${s}`}
            draft={props.draft}
            day={day}
            cta={(place) =>
                place === "hero" ? (
                    <CtaLink src={src} size="kit" template={tpl} />
                ) : place === "closing" ? (
                    <CtaLink src={`${src}-closing`} size="kit" template={tpl} />
                ) : place === "bar" ? (
                    <CtaLink src={`${src}-bar`} size="kit" />
                ) : (
                    <CtaLink
                        src={`${src}-sticky`}
                        size="kit"
                        className="w-full"
                    />
                )
            }
            heroLink={
                p.demo && demo ? { href: demo, label: p.demo } : undefined
            }
            picture={
                <div className="w-full max-w-[360px]">
                    <PhoneClip height={380} label={W.wholeDay}>
                        <SceneHero page={p} />
                    </PhoneClip>
                </div>
            }
            feature={feature}
            claimOn={props.claimOn}
            releaseOn={(r) => !off.includes(r)}
            templatesOn={!off.includes("templates")}
            freeLine={props.freeLine}
            problems={{
                items: p.problems.map((x) => ({
                    quote: x.quote,
                    area: x.area,
                    title: x.title,
                    body: x.body,
                    feature: problemFeature(x.link),
                    link: x.link,
                })),
            }}
            changes={{
                title: p.problemsTitle,
                folded: W.moreTitle(p.plural),
                children: day ? (
                    <>
                        {/* The page's own sample day, kept with its words. */}
                        <div className="flex justify-center">
                            <SceneHero page={p} />
                        </div>
                        {changes}
                    </>
                ) : (
                    changes
                ),
            }}
            starter={{
                title: starter.title,
                line: starter.line,
                rows: p.services,
                template: template
                    ? {
                          title: W.template(template.name),
                          description: template.description,
                          links: [
                              {
                                  href: template.href,
                                  label: W.seeTemplate(template.name),
                              },
                              { href: "/templates", label: W.allTemplates },
                          ],
                      }
                    : undefined,
            }}
            pricing={
                pricing
                    ? { title: W.pricing(p.plural), children: pricing }
                    : undefined
            }
            faq={{
                title: W.questions(p.plural),
                items: p.questions.map((q) => ({
                    q: q.question,
                    a: q.answer.join(" "),
                })),
            }}
            related={{
                title: W.related,
                items: p.related.map((r) => ({
                    slug: r.slug,
                    name: r.name,
                    href: props.pageHref(r.slug),
                })),
            }}
            allTrades={{
                label: W.allTrades(props.tradeCount),
                line: W.allTradesLine,
            }}
            closing={{
                title: p.ctaTitle,
                secondary: (
                    <ButtonLink
                        href={template ? template.href : "/features"}
                        variant="secondary"
                        size="kit"
                    >
                        {template ? W.seeTemplate(template.name) : W.howItWorks}
                    </ButtonLink>
                ),
                note: `${PRESETS[p.shape].close} ${W.noCard}`,
            }}
            bar={props.bar}
        />
    );
}
