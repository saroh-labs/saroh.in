import { ArrowDown, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { countWord } from "../content/feature-switches";
import type { World, WorldBusiness, WorldStory } from "../content/world";
import { WORLD_TRADES } from "../content/world";
import { PricingButton } from "../feature-pages/reach/tail";
import type { PageSite } from "../feature-pages/site";
import { Chip } from "../kit/chip";
import { ClosingCTA } from "../kit/closing-cta";
import { PhoneClip } from "../kit/phone-fold";
import { StickyBar } from "../kit/sticky-bar";
import { hourLabel } from "../kit/time";
import { Container } from "../layout/container";
import { Pill } from "../links/pill";
import { TextLink } from "../links/text-link";
import { ring } from "../ring";
import { Mark } from "../sections/mark";
import type { ChapterLink } from "./chapter";
import { Chapter, GroupHead } from "./chapter";
import { ExampleSwitch } from "./example-switch";
import { HeroVisual } from "./hero-visual";
import { MoneyFlow } from "./money-flow";
import {
    AddressPanel,
    AnswerPanel,
    AskListPanel,
    AssistantPanel,
    CardsPanel,
    ClassPanel,
    DraftPanel,
    HomePanel,
    InsightsPanel,
    KeyPanel,
    PaidPanel,
    PayingPanel,
    PaymentsPanel,
    ProductPanel,
    SharePanel,
    ShareToPanel,
    TemplatePanel,
    WebhookPanel,
} from "./panels";
import type { IsOn } from "./rich";
import { gated } from "./rich";
import type {
    Caption,
    ChapterId,
    Gate,
    GroupId,
    HowItWorksWords,
    ReadMore,
} from "./words";

export interface HowItWorksProps {
    words: HowItWorksWords;
    world: World;
    /** The lead business's day: its stock, class, week and the rest. */
    story: WorldStory;
    site: PageSite;
    /** A gate is on: its release switch and its claim switch both are. */
    isOn: IsOn;
    /** A page that isn't a feature page is shown in this build ("/developers"). */
    pageShown: (href: string) => boolean;
    /** A feature is new (the index and Read more mark it). */
    isNew: (slug: string) => boolean;
    /** The lead's trade page has a published day to follow. */
    dayOn: boolean;
    /** The merchants' font variables, for their drawings. */
    className?: string;
}

/** "/features/orders" → "orders", when it names a feature page. */
const slugOf = (href: string) => /^\/features\/([\w-]+)/.exec(href)?.[1];

/**
 * /features, "How it works" (DEC-221; boards HWDesk and HWPhone2): what
 * Saroh keeps, what reaches customers, and how you ask and connect, told in
 * six ownership chapters; how money moves; everything that stays yours;
 * and every feature in one list. A chapter, a drawing, a line or a link of a
 * switched-off feature or an unlive claim is not drawn (DEC-221 decision 1).
 * Static: the trade switch shows drawings already in the HTML. Every name,
 * number and time is the edition's world's; the words are its content's.
 */
export function HowItWorksPage({
    words: W,
    world: WORLD,
    story: STORY,
    site,
    isOn,
    pageShown,
    isNew,
    dayOn,
    className,
}: HowItWorksProps) {
    const { claimOn } = site;
    const rye = WORLD.lead;
    const linkOn = (href: string) => {
        const slug = slugOf(href);
        return slug ? site.featureHref(slug) !== null : pageShown(href);
    };
    const link = (m: ReadMore): ChapterLink => {
        const slug = slugOf(m.href);
        return {
            label: m.label,
            href: m.href,
            isNew: slug ? isNew(slug) : false,
        };
    };
    const featureHref = (slug: string) => site.featureHref(slug) ?? "";

    // ── Facts, from the world ──
    const look = rye.look ?? WORLD.others[0]?.look;
    if (!look) throw new Error("The lead example has no site look");
    const item = (key: string) => {
        const found = rye.items.find((i) => i.key === key);
        if (!found) throw new Error(`No item "${key}" in the world`);
        return found;
    };
    const order = (id: string) => {
        const found = rye.orders?.find((o) => o.id === id);
        if (!found) throw new Error(`No order "${id}" in the world`);
        return found;
    };
    const priced = (i: { price: string; unit?: string }) =>
        i.unit ? `${i.price} · ${i.unit}` : i.price;
    const paidOrder = order(STORY.paidOrder);
    const first = (name: string) => name.split(" ")[0] ?? name;
    const { money } = WORLD;
    const account = W.hero.account(rye.name, money.provider);
    const street = rye.place.split(",")[0] ?? rye.place;
    // "Monday 16 November …" → "Mon 16 November".
    const [weekday = "", date = "", month = ""] = WORLD.today.split(" ");
    const shortDay = weekday.endsWith("day")
        ? `${weekday.slice(0, 3)} ${date} ${month}`
        : WORLD.today;

    // ── The hero's drawing, for each trade ──
    const examples = WORLD_TRADES.flatMap((trade) => {
        const b: WorldBusiness | undefined = [rye, ...WORLD.others].find(
            (x) => x.trade === trade,
        );
        if (!b) return [];
        return [
            {
                id: trade,
                label: W.trades[trade],
                drawing: (
                    <HeroVisual
                        label={W.hero.label(b.name)}
                        look={b.look ?? look}
                        site={b.site}
                        live={W.hero.live}
                        name={b.name}
                        nav={W.hero.nav}
                        line={W.hero.siteLine[b.key] ?? b.name}
                        order={
                            b === rye
                                ? {
                                      id: paidOrder.id,
                                      paid: W.hero.paid,
                                      rows: [
                                          {
                                              label: paidOrder.customer,
                                              value: paidOrder.total,
                                          },
                                          {
                                              label: W.hero.paidInto,
                                              value: account,
                                          },
                                          {
                                              label: W.hero.sarohHolds,
                                              value: W.hero.nothing,
                                              strong: true,
                                          },
                                      ],
                                  }
                                : undefined
                        }
                    />
                ),
            },
        ];
    });

    // ── Each chapter's three drawings ──
    const P = W.panels;
    const bunBox = item(STORY.featured);
    const bunStock = STORY.stock.find((s) => s.item === STORY.featured);
    const low = STORY.stock.find((s) => s.of !== undefined);
    const cakes = STORY.toMake.map(order);
    const unpaid = STORY.unpaidOrder ? order(STORY.unpaidOrder) : undefined;
    const cls = STORY.class;
    const top = item(STORY.topSeller.item);
    const languages = claimOn("ask-ai-languages");
    const christmas = STORY.christmas.items.map(item);

    const drawn: Record<
        ChapterId,
        readonly { panel: ReactNode; caption: number; gate?: Gate }[]
    > = {
        shop: [
            {
                caption: 0,
                panel: (
                    <ProductPanel
                        w={P.product}
                        name={bunBox.name}
                        price={bunBox.price}
                        stock={String(bunStock?.left ?? "")}
                        address={P.product.shows(
                            `${rye.domain ?? rye.site}/shop`,
                        )}
                    />
                ),
            },
            {
                caption: 1,
                panel: (
                    <ClassPanel
                        look={look}
                        business={rye.name}
                        meta={P.booking.meta}
                        name={cls.name}
                        when={`${cls.when} · ${cls.price}`}
                        booked={cls.booked}
                        places={cls.places}
                        placesLine={P.booking.places(cls.booked, cls.places)}
                        pay={P.booking.pay(cls.price)}
                    />
                ),
            },
            {
                caption: 2,
                panel: (
                    <HomePanel
                        title={P.home.title}
                        meta={`${shortDay} · ${hourLabel("07:00")}`}
                        rows={[
                            {
                                title: P.home.toBake(cakes.length),
                                line: cakes.map((o) => o.id).join(", "),
                            },
                            ...(unpaid
                                ? [
                                      {
                                          title: P.home.unpaid(unpaid.customer),
                                          line: `${unpaid.id} · ${unpaid.total}`,
                                          warn: true,
                                          action: P.home.sendLink,
                                      },
                                  ]
                                : []),
                            ...(low?.of !== undefined && low.note !== undefined
                                ? [
                                      {
                                          title: P.home.low(
                                              item(low.item).name,
                                          ),
                                          line: P.home.left(
                                              low.left,
                                              low.of,
                                              low.note,
                                          ),
                                          warn: true,
                                      },
                                  ]
                                : []),
                        ]}
                    />
                ),
            },
        ],
        site: [
            {
                caption: 0,
                panel: (
                    <TemplatePanel
                        title={P.template.title}
                        meta={P.template.meta(
                            P.template.plural[rye.trade] ?? rye.kind,
                        )}
                        caption={P.template.caption}
                        look={look}
                    />
                ),
            },
            {
                caption: 1,
                panel: (
                    <AddressPanel
                        w={P.address}
                        site={rye.site}
                        domain={rye.domain ?? P.address.example}
                    />
                ),
            },
            {
                caption: 2,
                panel: (
                    <DraftPanel
                        w={P.draft}
                        look={look}
                        name={rye.name}
                        nav={W.hero.nav}
                        line={W.hero.siteLine[rye.key] ?? rye.name}
                    />
                ),
            },
        ],
        posts: [
            {
                caption: 0,
                panel: (
                    <SharePanel
                        title={P.share.title}
                        meta={P.share.meta}
                        button={P.share.button}
                        look={look}
                        items={STORY.shareItems.map(item).map((i) => ({
                            name: i.name,
                            price: priced(i),
                            photo: i.photo,
                        }))}
                    />
                ),
            },
            {
                caption: 1,
                panel: (
                    <CardsPanel
                        title={P.cards.title}
                        meta={P.cards.meta}
                        kinds={P.cards.kinds}
                        offer={P.cards.offer}
                        note={P.cards.note}
                        look={look}
                        item={bunBox.name}
                        price={bunBox.price}
                    />
                ),
            },
            {
                caption: 2,
                panel: (
                    <ShareToPanel
                        title={P.shareTo.title}
                        apps={P.shareTo.apps}
                        social={
                            claimOn("social-posting")
                                ? {
                                      line: P.shareTo.social,
                                      addOn: P.shareTo.addOn,
                                      slots: P.shareTo.slots,
                                  }
                                : undefined
                        }
                    />
                ),
            },
        ],
        money: [
            {
                caption: 0,
                panel: (
                    <PaymentsPanel
                        title={P.payments.title}
                        rows={[
                            {
                                name: money.provider,
                                line: P.payments.own(rye.name),
                                state: P.payments.connected,
                                on: true,
                            },
                            ...P.payments.others.map((o) => ({
                                name: o.name,
                                line: o.line,
                                state: P.payments.connect,
                            })),
                        ]}
                    />
                ),
            },
            {
                caption: 1,
                panel: (
                    <PayingPanel
                        label={P.paying.label}
                        business={rye.name}
                        amount={paidOrder.total}
                        line={`${paidOrder.id} · ${paidOrder.items}`}
                        paid={P.paying.paidBy(money.method)}
                    />
                ),
            },
            {
                caption: 2,
                panel: (
                    <PaidPanel
                        order={paidOrder.id}
                        paid={P.paidOrder.paid}
                        rows={[
                            { label: P.paidOrder.paidInto, value: account },
                            {
                                label: P.paidOrder.payoutTo,
                                value: P.paidOrder.herBank,
                            },
                            {
                                label: P.paidOrder.invoice,
                                value: (
                                    <span className="font-mono">
                                        {P.paidOrder.invoiceLine ? (
                                            P.paidOrder.invoiceLine(
                                                paidOrder.invoice,
                                                money.taxName,
                                            )
                                        ) : (
                                            <>
                                                {paidOrder.invoice} ·{" "}
                                                {money.taxName}
                                            </>
                                        )}
                                    </span>
                                ),
                            },
                            {
                                label: P.paidOrder.sarohHolds,
                                value: P.paidOrder.nothing,
                                strong: true,
                            },
                        ]}
                    />
                ),
            },
        ],
        ai: [
            {
                caption: 0,
                gate: { release: "ask-ai" },
                panel: (
                    <AskListPanel
                        title={P.askList.title}
                        button={P.askList.button}
                        about={P.askList.about}
                        questions={P.askList.questions.filter(
                            (q) =>
                                (!q.claim || claimOn(q.claim)) &&
                                (!q.off || !claimOn(q.off)),
                        )}
                    />
                ),
            },
            {
                caption: 1,
                gate: { release: "ask-ai" },
                panel: (
                    <AnswerPanel
                        question={
                            languages
                                ? P.answer.question.hinglish
                                : P.answer.question.english
                        }
                        reply={(languages
                            ? P.answer.reply.hinglish
                            : P.answer.reply.english)(
                            top.name,
                            STORY.topSeller.sold,
                        )}
                        head={P.answer.head}
                        rows={[
                            [
                                top.name,
                                String(STORY.topSeller.sold),
                                STORY.topSeller.takings,
                            ],
                        ]}
                        readFrom={P.answer.readFrom}
                        sources={P.answer.sources}
                    />
                ),
            },
            {
                caption: 2,
                gate: { release: "ai-apps" },
                panel: (
                    <AssistantPanel
                        title={P.assistant.title}
                        on={P.assistant.on}
                        meta={P.assistant.meta(rye.name)}
                        ask={`${P.assistant.ask} ${christmas
                            .map(
                                (i) =>
                                    `${i.name}${i.unit ? ` ${i.unit}` : ""} ${i.price}`,
                            )
                            .join(", ")}.`}
                        reply={P.assistant.reply}
                        added={P.assistant.added(christmas.length, rye.owner)}
                        undo={P.assistant.undo}
                    />
                ),
            },
        ],
        data: [
            {
                caption: 0,
                panel: (
                    <InsightsPanel
                        title={P.insights.title}
                        meta={P.insights.meta}
                        question={P.insights.question}
                        line={P.insights.week(
                            STORY.week.takings,
                            STORY.week.change,
                        )}
                        weeks={P.insights.weeks}
                    />
                ),
            },
            {
                caption: 1,
                gate: { release: "developers" },
                panel: (
                    <KeyPanel
                        title={P.key.title}
                        button={P.key.button}
                        name={P.key.name}
                        token={P.key.token}
                        scopes={P.key.scopes}
                        made={P.key.made(rye.owner)}
                    />
                ),
            },
            {
                caption: 2,
                gate: { release: "developers" },
                panel: (
                    <WebhookPanel
                        title={P.webhook.title}
                        events={P.webhook.events}
                        signed={P.webhook.signed}
                    />
                ),
            },
        ],
    };

    const caption = (c: Caption) =>
        c.off && !isOn(c.off.gate)
            ? { title: c.off.title, body: c.off.body }
            : { title: c.title, body: gated(c.body, isOn) };

    const chapters = W.chapters
        .filter(isOn)
        .map((ch) => {
            const shown = drawn[ch.id].filter((d) => !d.gate || isOn(d.gate));
            const more = ch.more
                .filter((m) => isOn(m) && linkOn(m.href))
                .map(link);
            const aside =
                ch.aside && isOn(ch.aside) && linkOn(ch.aside.href)
                    ? link(ch.aside)
                    : undefined;
            return { ch, shown, more, aside };
        })
        .filter((c) => c.shown.length > 0);
    const firstOfGroup = new Set(
        (Object.keys(W.groups) as GroupId[]).flatMap((g) => {
            const c = chapters.find((x) => x.ch.group === g);
            return c ? [c.ch.id] : [];
        }),
    );
    const foldLabel = (more: readonly ChapterLink[]) => {
        const [a, b] = more.map((m) => m.label);
        if (more.length < 2) return more.length ? a : "";
        if (more.length === 2) return `${a} and ${b}`;
        return W.andMore(a, more.length - 1);
    };
    const BAND: Record<ChapterId, string> = {
        shop: "bg-background",
        site: "bg-mk-hover",
        posts: "bg-background",
        money: "bg-mk-ledger text-mk-ledger-fg",
        ai: "bg-background",
        data: "bg-mk-hover",
    };

    // ── Everything stays yours ──
    const yours = W.yours.rows.filter(isOn).map((r) => ({
        name: r.name,
        body: gated(r.body, isOn),
        chip: r.chip
            .replace("{domain}", rye.domain ?? rye.site)
            .replace("{site}", rye.site),
    }));
    const yoursRow = (r: (typeof yours)[number]) => (
        <li
            key={r.name}
            className="grid gap-1 border-b border-border py-5 min-[760px]:grid-cols-[240px_1fr_auto] min-[760px]:items-center min-[760px]:gap-10 min-[760px]:py-7"
        >
            <b className="text-[18px] font-semibold">{r.name}</b>
            <span className="max-w-[62ch] text-[16px] leading-normal text-mk-copy">
                {r.body}
            </span>
            <span className="hidden w-fit rounded-full border border-border-strong bg-card px-3.5 py-1.5 font-mono text-[13px] min-[760px]:inline-block">
                {r.chip}
            </span>
        </li>
    );

    // ── Every feature ──
    const index = (Object.keys(W.groups) as GroupId[]).map((g) => ({
        id: g,
        ...W.groups[g],
        items: W.index.groups[g]
            .filter(
                (i) =>
                    isOn(i) &&
                    (i.feature
                        ? site.featureHref(i.feature) !== null
                        : linkOn(i.href ?? "")),
            )
            .map((i) => ({
                name: i.name,
                line: i.line,
                href: i.feature ? featureHref(i.feature) : (i.href ?? ""),
                isNew: i.feature ? isNew(i.feature) : false,
            })),
    }));

    const dayPage = rye.tradePage;

    return (
        <div className={className}>
            <StickyBar watch="how-it-works-title">
                {site.start("features-sticky")}
            </StickyBar>

            {/* HERO: h1, lede, the trade switch and a product visual, and the contents. */}
            <Container
                as="section"
                aria-labelledby="how-it-works-title"
                className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-12 pt-10 min-[760px]:gap-12 min-[760px]:pb-[120px] min-[760px]:pt-[88px]"
            >
                <h1
                    id="how-it-works-title"
                    className="m-0 max-w-[16ch] font-display text-mk-kit-h1 font-bold [text-wrap:balance]"
                >
                    {W.title.before}
                    <Mark>{W.title.mark}</Mark>
                    {W.title.after}
                </h1>
                <div className="grid gap-10 min-[960px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[960px]:gap-20">
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-8">
                        <p className="m-0 max-w-[48ch] text-mk-kit-lead text-mk-copy [text-wrap:pretty]">
                            {W.lede
                                .replace("{business}", rye.name)
                                .replace("{street}", street)}
                        </p>
                        <ExampleSwitch
                            legend={W.examplesLegend}
                            options={examples}
                        >
                            <nav
                                aria-label={W.chaptersLabel}
                                data-scroll-x=""
                                className="-mr-mk-gutter flex gap-2 overflow-x-auto pr-mk-gutter [scrollbar-width:none] min-[760px]:hidden [&::-webkit-scrollbar]:hidden"
                            >
                                {chapters.map(({ ch }) => (
                                    <Chip
                                        key={ch.id}
                                        variant="chapter"
                                        href={`#${ch.id}`}
                                    >
                                        {ch.chip}
                                    </Chip>
                                ))}
                                <Chip variant="chapter" href={`#${W.yours.id}`}>
                                    {W.yoursLink}
                                </Chip>
                            </nav>
                        </ExampleSwitch>
                    </div>
                    <nav
                        aria-label={W.contentsLabel}
                        className="hidden content-start gap-6 min-[760px]:grid"
                    >
                        {(Object.keys(W.groups) as GroupId[]).map((g) => {
                            const list = chapters.filter(
                                (c) => c.ch.group === g,
                            );
                            if (!list.length) return null;
                            return (
                                <div key={g} className="grid gap-2">
                                    <p className="m-0 text-[14px] font-medium text-muted-foreground">
                                        {W.groups[g].name}
                                    </p>
                                    <ul className="m-0 list-none border-t border-border p-0">
                                        {list.map(({ ch }) => (
                                            <li
                                                key={ch.id}
                                                className="border-b border-border"
                                            >
                                                <a
                                                    href={`#${ch.id}`}
                                                    className={cn(
                                                        "grid min-h-14 grid-cols-[1fr_1fr_20px] items-center gap-4 py-2 no-underline hover:text-foreground [&:hover_b]:underline",
                                                        ring(),
                                                    )}
                                                >
                                                    <b className="font-display text-[20px] font-bold tracking-[-0.02em] underline-offset-4">
                                                        {ch.name}
                                                    </b>
                                                    <span className="text-[14px] leading-snug text-mk-copy">
                                                        {ch.line}
                                                    </span>
                                                    <ArrowDown
                                                        aria-hidden
                                                        className="size-4 text-mk-copy"
                                                    />
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })}
                        <TextLink href={`#${W.yours.id}`} tone="ink">
                            {W.yoursLink}
                        </TextLink>
                    </nav>
                </div>
            </Container>

            {/* THE CHAPTERS, by kind: records; reaching customers; asking and connecting. */}
            {chapters.map(({ ch, shown, more, aside }) => {
                const onInk = ch.id === "money";
                return (
                    <section
                        key={ch.id}
                        aria-labelledby={`${ch.id}-title`}
                        className={BAND[ch.id]}
                    >
                        <Container className="grid grid-cols-[minmax(0,1fr)] gap-6 py-10 min-[760px]:gap-16 min-[760px]:py-[120px]">
                            {firstOfGroup.has(ch.id) ? (
                                <GroupHead
                                    name={W.groups[ch.group].name}
                                    line={W.groups[ch.group].line}
                                    onInk={onInk}
                                />
                            ) : null}
                            <Chapter
                                id={ch.id}
                                title={ch.title}
                                lead={gated(ch.lead, isOn)}
                                panels={shown.map((d) => d.panel)}
                                captions={shown.map((d) =>
                                    caption(ch.captions[d.caption]),
                                )}
                                readMore={W.readMore}
                                more={more}
                                andMore={foldLabel(more)}
                                aside={aside}
                                newTag={W.newTag}
                                of={W.of}
                                onInk={onInk}
                                before={
                                    ch.id === "money" ? (
                                        <PhoneClip
                                            height={220}
                                            label={W.money.more}
                                            tone="on-ink"
                                        >
                                            <MoneyFlow
                                                label={W.money.label}
                                                at={W.money.at}
                                                from={{
                                                    title: W.money.pays(
                                                        first(
                                                            paidOrder.customer,
                                                        ),
                                                        paidOrder.total,
                                                    ),
                                                    line: W.money.by(
                                                        money.method,
                                                        paidOrder.id,
                                                    ),
                                                }}
                                                via={{
                                                    label: W.money.yourAccount,
                                                    title: account,
                                                    line: W.money.inName(
                                                        rye.owner,
                                                        money.provider,
                                                    ),
                                                }}
                                                to={{
                                                    label: W.money.yourBank,
                                                    title: W.money.bank(
                                                        rye.owner,
                                                    ),
                                                    line: W.money.schedule(
                                                        money.provider,
                                                    ),
                                                }}
                                                saroh={{
                                                    name: W.money.saroh,
                                                    line: W.money.hears(
                                                        paidOrder.id,
                                                        paidOrder.invoice,
                                                        (
                                                            money.taxLine ??
                                                            money.taxName
                                                        ).replace(
                                                            " + ",
                                                            " and ",
                                                        ),
                                                        rye.owner,
                                                    ),
                                                    holds: `${W.money.holds} ${W.money.zero}`,
                                                }}
                                            />
                                        </PhoneClip>
                                    ) : undefined
                                }
                            />
                        </Container>
                    </section>
                );
            })}

            {/* EVERYTHING STAYS YOURS: six rows; on a phone three, then the rest folded. */}
            <Container
                as="section"
                id={W.yours.id}
                aria-labelledby="yours-title"
                className="grid scroll-mt-[calc(var(--mk-nav-h)+16px)] grid-cols-[minmax(0,1fr)] gap-8 py-12 min-[760px]:gap-10 min-[760px]:py-[120px]"
            >
                <div className="grid gap-4 min-[960px]:grid-cols-[1fr_minmax(0,520px)] min-[960px]:items-start min-[960px]:gap-12">
                    <h2
                        id="yours-title"
                        className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        {W.yours.title}
                    </h2>
                    <p className="m-0 text-mk-kit-lead text-mk-copy">
                        {W.yours.lead(countWord(yours.length))}
                    </p>
                </div>
                <div className="border-t border-foreground">
                    <ul className="m-0 list-none p-0">
                        {yours.slice(0, 3).map(yoursRow)}
                    </ul>
                    {yours.length > 3 ? (
                        <details className="mk-fold group">
                            <summary
                                className={cn(
                                    "mt-4 inline-flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold underline decoration-border-strong decoration-1 underline-offset-[3px] min-[760px]:hidden [&::-webkit-details-marker]:hidden",
                                    ring(),
                                )}
                            >
                                {W.yours.foldMore(yours.length - 3)}
                                <ChevronDown
                                    aria-hidden
                                    className="size-4 transition-transform group-open:rotate-180"
                                />
                            </summary>
                            <ul className="m-0 list-none p-0">
                                {yours.slice(3).map(yoursRow)}
                            </ul>
                        </details>
                    ) : null}
                </div>
                {dayOn && dayPage ? (
                    <p className="m-0 flex flex-wrap items-center gap-x-4 border-y border-border py-6 text-[18px] text-mk-copy min-[760px]:mt-8">
                        <span className="max-[759px]:hidden">{W.day.lead}</span>
                        <TextLink
                            href={dayPage}
                            tone="ink"
                            arrow
                            className="text-[18px]"
                        >
                            {W.day.link(rye.name)}
                        </TextLink>
                    </p>
                ) : null}
            </Container>

            {/* EVERY FEATURE, IN ONE LIST, by the three kinds. */}
            <Container
                as="section"
                id={W.index.id}
                aria-labelledby="every-feature-title"
                className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-[72px] min-[760px]:pb-[120px]"
            >
                <div className="grid gap-3">
                    <h2
                        id="every-feature-title"
                        className="m-0 font-display text-mk-kit-h2 font-bold"
                    >
                        {W.index.title}
                    </h2>
                    <p className="m-0 text-mk-kit-lead text-mk-copy">
                        {W.index.lead}
                    </p>
                </div>
                <div className="border-t border-border">
                    {index.map((g) =>
                        g.items.length ? (
                            <details
                                key={g.id}
                                className="mk-fold group border-b border-border py-4 min-[760px]:grid min-[760px]:grid-cols-[320px_1fr] min-[760px]:py-8"
                            >
                                <summary
                                    className={cn(
                                        "flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 min-[760px]:items-start [&::-webkit-details-marker]:hidden",
                                        ring(),
                                    )}
                                >
                                    <span className="grid gap-1">
                                        <span className="flex items-center gap-2">
                                            <b className="text-[18px] font-semibold">
                                                {g.name}
                                            </b>
                                            {g.items.some((i) => i.isNew) ? (
                                                <Pill
                                                    tone="soon"
                                                    className="text-[12px] min-[760px]:hidden"
                                                >
                                                    {W.newTag}
                                                </Pill>
                                            ) : null}
                                        </span>
                                        <span className="text-[14px] text-mk-copy">
                                            <span className="min-[760px]:hidden">
                                                {g.items
                                                    .map((i) => i.name)
                                                    .join(", ")}
                                            </span>
                                            <span className="max-[759px]:hidden">
                                                {g.indexLine}
                                            </span>
                                        </span>
                                    </span>
                                    <ChevronDown
                                        aria-hidden
                                        className="size-5 shrink-0 transition-transform group-open:rotate-180 min-[760px]:hidden"
                                    />
                                </summary>
                                <ul className="m-0 grid list-none gap-x-10 p-0 min-[960px]:grid-cols-2">
                                    {g.items.map((i) => (
                                        <li
                                            key={i.name}
                                            className="border-b border-border last:border-b-0 min-[960px]:[&:nth-last-child(2):nth-child(odd)]:border-b-0"
                                        >
                                            <Link
                                                href={i.href}
                                                className={cn(
                                                    "flex min-h-12 items-baseline gap-3 py-3 no-underline hover:text-foreground [&:hover_b]:underline",
                                                    ring(),
                                                )}
                                            >
                                                <b className="shrink-0 text-[16px] font-semibold underline-offset-4">
                                                    {i.name}
                                                </b>
                                                <span className="flex-1 text-[14px] text-mk-copy">
                                                    {i.line}
                                                </span>
                                                {i.isNew ? (
                                                    <span className="text-[13px] font-semibold text-brand-700">
                                                        {W.newTag}
                                                    </span>
                                                ) : null}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        ) : null,
                    )}
                </div>
            </Container>

            <ClosingCTA
                title={W.close.title}
                primary={site.start("features-close")}
                secondary={
                    <PricingButton open={site.open}>
                        {W.close.pricing}
                    </PricingButton>
                }
                note={W.close.note}
                className="pt-0 min-[760px]:pt-0"
            />
        </div>
    );
}
