import type { ReactNode } from "react";

import type { SearchPageData } from "../schema";
import { AlsoSvg } from "./icons";
import { AlsoList, Carousel, StartBar } from "./interactive";
import {
    bigTile,
    carouselLabels,
    FrameDesk,
    FramePhone,
    HeroPicture,
    PRESETS,
    ProofCard,
    smallKeys,
    SmallPicture,
} from "./parts";

/**
 * Where the page's links go. The app passes them: saroh.in its real
 * addresses, the admin preview none, so nothing navigates. A link left
 * undefined draws the same, as an `<a>` with no address.
 */
export interface SearchPageLinks {
    /** Start free (the hero, the closing band and the phone's bar). */
    startFree?: string;
    /** The live demo, shown only when the page has demo words. */
    demo?: string;
    /** The breadcrumb's "Solutions". */
    hub?: string;
    /** A related trade's page (a slug from `related`), or undefined when it isn't on the site. */
    page?: (slug: string) => string | undefined;
}

export interface SearchPageProps {
    page: SearchPageData;
    /** A page that isn't live: a small label says so at the top. */
    draft?: boolean;
    links?: SearchPageLinks;
    /** The live Free line under "No card needed to start.", from the catalogue. */
    freeLine?: ReactNode;
    /** The plan cards, from the live catalogue; without them there is no Pricing section. */
    pricing?: ReactNode;
}

/** The trades the product seeds starter services for (apps/api trade-presets.ts: SALON, GYM). */
const STARTER_TRADES = new Set(["salons", "gyms"]);

export function starterWords(p: SearchPageData) {
    const kind = PRESETS[p.shape].kind;
    if (STARTER_TRADES.has(p.slug)) {
        return {
            title:
                p.starter?.title ?? `Start with these ${kind}, ready to edit`,
            line:
                p.starter?.line ??
                `Pick ${p.pickAs} when you start, and Saroh adds these with prices and hours to change. They stay off your site until you press Keep.`,
        };
    }
    return {
        title: p.starter?.title ?? `Add your ${kind} in a few minutes`,
        line:
            p.starter?.line ??
            (kind === "products"
                ? "Add each one once, with its price, sizes and how many you have. Here is how a list might start."
                : "Add each one once, with its time and price. Here is how a list might start."),
    };
}

/** Desk and phone words: one element when they're the same, two (one shown) when not. */
function Both({ desk, phone }: { desk: string; phone?: string }) {
    if (!phone || phone === desk) return <>{desk}</>;
    return (
        <>
            <span className="sp-d">{desk}</span>
            <span className="sp-p">{phone}</span>
        </>
    );
}

/** A /for/ page: design D on a desk, the clean phone board below 900px. */
export function SearchPage({
    page: p,
    draft = false,
    links = {},
    freeLine,
    pricing,
}: SearchPageProps) {
    const s = p.scene;
    const pre = PRESETS[p.shape];
    const T = s.tiles;
    const keys = smallKeys(p);
    const big = bigTile(p);
    const bigWords = T[pre.big];
    const url = p.shape === "orders" ? "app.saroh.in" : s.site;
    const starter = starterWords(p);
    const ask = /[^?.]*[?.]/.exec(s.quote.caption)?.[0] ?? s.quote.caption;
    const alsoIcons = pre.also;

    return (
        <div className="sp">
            <div className="sp-wrap">
                {draft ? (
                    <p className="sp-draft">Draft — not published yet</p>
                ) : null}

                <section className="sp-hero">
                    <div className="sp-hero-copy">
                        <nav aria-label="Breadcrumb" className="sp-crumb">
                            <a href={links.hub}>Solutions</a>
                            <span aria-hidden="true">/</span>
                            <span aria-current="page">{p.name}</span>
                        </nav>
                        <h1 className="vc-h sp-h1">{p.h1}</h1>
                        <p className="sp-lead">
                            <Both desk={p.lead} phone={p.phoneLead} />
                        </p>
                        <div className="sp-actions">
                            <a className="sp-btn" href={links.startFree}>
                                Start free
                            </a>
                            {p.demo ? (
                                <a className="sp-demo" href={links.demo}>
                                    {p.demo} →
                                </a>
                            ) : null}
                            <span className="sp-note">
                                <span>No card needed to start.</span>
                                {freeLine ? (
                                    <>
                                        {" "}
                                        <span className="sp-free">
                                            {freeLine}
                                        </span>
                                    </>
                                ) : null}
                            </span>
                        </div>
                    </div>
                    <HeroPicture scene={s} />
                    <ProofCard page={p} />
                </section>

                <section className="sp-easier sp-sec">
                    <div className="sp-easier-head">
                        <span className="sp-eyebrow sp-d">What changes</span>
                        <h2 className="vc-h sp-h2-big">{p.problemsTitle}</h2>
                    </div>
                    {bigWords ? (
                        <div className="sp-bigp sp-p">
                            <FramePhone url={url}>{big.phone}</FramePhone>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                }}
                            >
                                <h3 className="vc-tt">{bigWords.title}</h3>
                                <p className="vc-tl">{bigWords.phoneLine}</p>
                            </div>
                        </div>
                    ) : null}
                    <div className="sp-bento">
                        {bigWords ? (
                            <article className="vc-t sp-big sp-d">
                                <FrameDesk url={url}>{big.desk}</FrameDesk>
                                <div className="vc-txt">
                                    <h3 className="vc-tt">{bigWords.title}</h3>
                                    <p className="vc-tl">{bigWords.line}</p>
                                </div>
                            </article>
                        ) : null}
                        <Carousel labels={carouselLabels(p)}>
                            {keys.map((k, i) => {
                                const w = T[k];
                                return (
                                    <article
                                        key={k}
                                        className={`vc-t sp-card ${keys.length === 4 && i === 3 ? "sp-span2" : ""}`}
                                    >
                                        <div
                                            className={`vc-pic ${k === "today" ? "sp-pic-today" : ""}`}
                                            aria-hidden="true"
                                        >
                                            <SmallPicture k={k} p={p} />
                                        </div>
                                        <div className="vc-txt">
                                            <h3 className="vc-tt">
                                                {w?.title}
                                            </h3>
                                            <p className="vc-tl">
                                                <Both
                                                    desk={w?.line ?? ""}
                                                    phone={w?.phoneLine}
                                                />
                                            </p>
                                        </div>
                                    </article>
                                );
                            })}
                        </Carousel>
                        <figure className="sp-quote sp-d">
                            <span
                                aria-hidden="true"
                                className="vc-h"
                                style={{
                                    fontSize: 120,
                                    lineHeight: 0.6,
                                    color: "var(--sp-amber)",
                                    alignSelf: "flex-start",
                                    paddingTop: 30,
                                }}
                            >
                                “
                            </span>
                            <blockquote style={{ margin: 0, flex: 1 }}>
                                <p
                                    className="vc-h"
                                    style={{
                                        fontSize: 40,
                                        lineHeight: 1.12,
                                        letterSpacing: "-0.035em",
                                    }}
                                >
                                    {s.quote.text}
                                </p>
                            </blockquote>
                            <figcaption
                                style={{
                                    flex: "0 0 260px",
                                    fontSize: 15,
                                    lineHeight: 1.55,
                                    color: "var(--sp-on-ink)",
                                }}
                            >
                                {s.quote.caption}
                            </figcaption>
                        </figure>
                    </div>
                </section>

                <section className="sp-sec sp-p">
                    <figure className="sp-quote-p">
                        <blockquote style={{ margin: 0 }}>
                            <p
                                className="vc-h"
                                style={{
                                    fontSize: 24,
                                    lineHeight: 1.3,
                                    letterSpacing: "-0.025em",
                                    fontWeight: 600,
                                }}
                            >
                                “{s.quote.text}”
                            </p>
                        </blockquote>
                        <figcaption
                            style={{ fontSize: 15, color: "var(--sp-muted-2)" }}
                        >
                            {ask.trim()}
                        </figcaption>
                    </figure>
                </section>

                <section className="sp-also sp-sec">
                    <h2 className="sp-also-h">Also in Saroh</h2>
                    <AlsoList count={s.also.length}>
                        {s.also.map((it, i) => (
                            <li key={it.title}>
                                <span className="va-icon">
                                    <AlsoSvg
                                        icon={it.icon ?? alsoIcons[i] ?? "pack"}
                                    />
                                </span>
                                <span className="sp-also-t">
                                    <span className="sp-also-tt">
                                        {it.title}
                                    </span>
                                    <span className="sp-also-tl">
                                        {it.line}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </AlsoList>
                </section>

                <section className="sp-starter sp-sec">
                    <div className="sp-starter-copy">
                        <h2 className="sp-h2">{starter.title}</h2>
                        <p className="sp-starter-line">{starter.line}</p>
                    </div>
                    <ul className="sp-services">
                        {p.services.map((x) => (
                            <li key={x.name}>
                                {x.name} <span>· {x.detail}</span>
                            </li>
                        ))}
                    </ul>
                </section>

                {pricing ? (
                    <section className="sp-pricing sp-sec">
                        <h2 className="sp-h2">Pricing for {p.plural}</h2>
                        {pricing}
                    </section>
                ) : null}

                <section className="sp-faq sp-sec">
                    <h2 className="sp-h2">Questions</h2>
                    <div className="sp-faq-list">
                        {p.questions.map((q, i) => (
                            <details key={q.question} open={i === 0}>
                                <summary>{q.question}</summary>
                                {q.answer.map((a) => (
                                    <p key={a}>{a}</p>
                                ))}
                            </details>
                        ))}
                    </div>
                </section>

                <section className="sp-related">
                    <h2>Also for {p.plural}</h2>
                    <div className="sp-chips">
                        {p.related.map((r) => (
                            <a
                                key={r.slug}
                                className="sp-chip"
                                href={links.page?.(r.slug)}
                            >
                                {r.name}
                            </a>
                        ))}
                    </div>
                </section>

                <section className="sp-cta sp-sec">
                    <div className="sp-cta-copy">
                        <h2 className="sp-cta-h">{p.ctaTitle}</h2>
                        <p className="sp-cta-line sp-d">{pre.close}</p>
                    </div>
                    <div className="sp-cta-act">
                        <a
                            className="sp-btn sp-btn-amber"
                            href={links.startFree}
                        >
                            Start free
                        </a>
                        <span className="sp-cta-note">
                            No card needed to start.
                        </span>
                    </div>
                </section>

                <StartBar>
                    <a className="sp-btn" href={links.startFree}>
                        Start free
                    </a>
                </StartBar>
            </div>
        </div>
    );
}
