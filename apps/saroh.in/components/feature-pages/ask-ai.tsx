import { ButtonLink } from "@saroh/marketing/button";
import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { Chip } from "@saroh/marketing/kit/chip";
import { Claim } from "@saroh/marketing/kit/claim";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { TimeStamp } from "@saroh/marketing/kit/time-stamp";
import { Mark } from "@saroh/marketing/mark";
import { Section } from "@saroh/marketing/section";
import { dayLink } from "@saroh/marketing/world";
import {
    ArrowRight,
    Check,
    ChevronDown,
    Lock,
    Sparkles,
    Undo2,
    X,
} from "lucide-react";

import { CtaLink } from "@/components/shared/buttons/cta-link";
import { askAiWords } from "@/content/reach-ask-ai";
import { WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";

import { MomentCard } from "@saroh/marketing/kit/moment-card";
import { PlanLine } from "@saroh/marketing/kit/plan-line";
import {
    Asked,
    AskPanel,
    Checked,
    ConfirmCard,
    ReadFrom,
    Suggestion,
} from "./ask-ai/panel";
import { Wires } from "./ask-ai/wires";
import { TimeChip } from "./reach/app-card";
import { CropToggle, Fold } from "./reach/fold";
import { InTheApp } from "./reach/in-the-app";
import { shownChips, shownHref } from "./reach/links";
import { HERO_CTA, PageTop } from "./reach/page-top";
import { Questions } from "./reach/questions";

const SCENE = "pt-[72px] min-[760px]:pt-[120px]";
const ROW =
    "grid items-center gap-3 border-t border-mk-line-row px-3.5 text-[14px] first:border-t-0";

/**
 * /features/ask-ai (boards FADesk, FAPhone2): one real answer at 9:45 am,
 * the rows it read on three screens wired into it, and the step it offers;
 * then asking from any screen, acting after you confirm, what stays
 * private, the plans and AI apps. Hinglish, Stock and plan names wait for
 * their claim switches.
 */
function AskAiView() {
    const slug = "ask-ai";
    const languages = claimOn("ask-ai-languages");
    const stockOn = claimOn("ask-ai-stock");
    const plans = claimOn("ask-ai-plans");
    const w = askAiWords({ languages, stockOn, plans });
    const rye = WORLD.lead;
    const h = w.hero;
    const p = h.panel;
    const s = h.slips;
    const aiApps = shownHref("ai-apps");
    const ninePm = rye.day?.find((x) => x.at === "21:00");

    const slip = (
        title: string,
        sub: string,
        source: string,
        body: React.ReactNode,
    ) => (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card shadow-[0_1px_2px_rgba(40,30,15,0.05)]">
            <div className="flex h-11 items-center gap-2 border-b border-mk-line-row px-3.5 text-[15px] font-semibold">
                {title}
                <small className="text-[13px] font-normal text-muted-foreground">
                    {sub}
                </small>
                <ReadFrom
                    sources={[source]}
                    label=""
                    className="ml-auto [&_li>*]:min-h-7 [&_li>*]:px-2.5 [&_li>*]:text-[12.5px]"
                />
            </div>
            {body}
        </div>
    );

    return (
        <div>
            <PageTop
                name={w.name}
                title={
                    <>
                        {w.title.before}
                        <Mark>{w.title.mark}</Mark>
                    </>
                }
                lede={w.lede}
                aside={
                    w.plan ? (
                        <p className="m-0 mt-5 text-[15px] text-mk-copy">
                            {w.plan}
                        </p>
                    ) : null
                }
                actions={
                    <>
                        <span id={HERO_CTA}>
                            <CtaLink src={`feature-${slug}`} size="kit" />
                        </span>
                        <ButtonLink
                            href="/pricing"
                            variant="secondary"
                            size="kit"
                            className="max-[759px]:hidden"
                        >
                            {w.secondary}
                        </ButtonLink>
                    </>
                }
                note={w.note}
            >
                <Wires
                    pairs={[
                        ["s-cus", "p-cus"],
                        ["s-ord", "p-ord"],
                        ...(stockOn ? ([["s-stk", "p-stk"]] as const) : []),
                    ]}
                    className="grid items-start gap-5 min-[1080px]:grid-cols-[390px_1fr_minmax(0,560px)] min-[1080px]:gap-0"
                >
                    {/* Left: the moment and the rows it read. */}
                    <div className="grid gap-4 min-[1080px]:gap-6">
                        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-mk-copy min-[1080px]:block min-[1080px]:border-t-2 min-[1080px]:border-foreground min-[1080px]:pt-4">
                            <TimeChip>
                                <TimeStamp at={h.at} />
                            </TimeChip>
                            <b className="font-semibold text-foreground max-[1079px]:hidden min-[1080px]:ml-2">
                                {h.moment}
                            </b>
                            <span className="min-[1080px]:hidden">
                                {h.phoneLine}
                            </span>
                            <span className="block max-[1079px]:hidden">
                                {h.line}
                            </span>
                        </p>
                        {/* Phone: one row from each screen. */}
                        <div
                            role="img"
                            aria-label={p.label}
                            className="grid gap-2 min-[1080px]:hidden"
                        >
                            {[
                                { src: "Orders", ...s.orders.feed, warn: true },
                                { src: "Customers", ...s.customers.feed },
                                ...(stockOn
                                    ? [{ src: "Stock", ...s.stock.feed }]
                                    : []),
                            ].map((r) => (
                                <div
                                    key={r.src}
                                    className="flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 text-[14px]"
                                >
                                    <ReadFrom
                                        sources={[r.src]}
                                        label=""
                                        className="[&_li>*]:min-h-7 [&_li>*]:px-2 [&_li>*]:text-[12.5px]"
                                    />
                                    <span className="min-w-0 flex-1 truncate">
                                        {r.line}
                                    </span>
                                    <b
                                        className={cn(
                                            "shrink-0 font-semibold",
                                            "warn" in r && "text-mk-warn",
                                        )}
                                    >
                                        {r.end}
                                    </b>
                                </div>
                            ))}
                            <span className="flex items-center justify-center gap-1 text-[13px] text-muted-foreground">
                                <ChevronDown aria-hidden className="size-4" />
                                {h.drop}
                            </span>
                        </div>
                        <div className="hidden gap-6 min-[1080px]:grid">
                            {slip(
                                s.customers.title,
                                s.customers.sub,
                                "Customers",
                                <>
                                    {s.customers.rows.map((r) => (
                                        <div
                                            key={r.name}
                                            data-wire={
                                                r.hi ? "s-cus" : undefined
                                            }
                                            className={cn(
                                                ROW,
                                                "min-h-10 grid-cols-[1fr_90px]",
                                                r.hi
                                                    ? "bg-mk-tint font-semibold shadow-[inset_3px_0_0_hsl(var(--foreground))]"
                                                    : "text-mk-copy",
                                            )}
                                        >
                                            <span>{r.name}</span>
                                            <span className="text-right">
                                                {r.end}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="border-t border-mk-line-row bg-mk-noon px-3.5 py-2.5 text-[13px] text-mk-copy">
                                        {s.customers.note}
                                    </div>
                                </>,
                            )}
                            {slip(
                                s.orders.title,
                                s.orders.sub,
                                "Orders",
                                s.orders.rows.slice(0, 4).map((r) => (
                                    <div
                                        key={r.id}
                                        data-wire={r.hi ? "s-ord" : undefined}
                                        className={cn(
                                            ROW,
                                            "min-h-10 grid-cols-[76px_1fr_70px]",
                                            r.hi
                                                ? "bg-mk-tint font-semibold shadow-[inset_3px_0_0_hsl(var(--foreground))]"
                                                : "text-mk-copy",
                                        )}
                                    >
                                        <span>{r.id}</span>
                                        <span className="truncate">
                                            {r.name}
                                        </span>
                                        <span
                                            className={cn(
                                                "text-right",
                                                r.end !== "Paid" &&
                                                    "text-mk-warn",
                                            )}
                                        >
                                            {r.end}
                                        </span>
                                    </div>
                                )),
                            )}
                            <Claim on={stockOn}>
                                {slip(
                                    s.stock.title,
                                    s.stock.sub,
                                    "Stock",
                                    <>
                                        <div
                                            className={cn(
                                                ROW,
                                                "min-h-8 grid-cols-[1fr_80px] bg-mk-noon text-[12.5px] font-semibold text-muted-foreground",
                                            )}
                                        >
                                            <span>{s.stock.head[0]}</span>
                                            <span className="text-right">
                                                {s.stock.head[1]}
                                            </span>
                                        </div>
                                        {s.stock.rows.map((r, i) => (
                                            <div
                                                key={r.name}
                                                data-wire={
                                                    i === 0
                                                        ? "s-stk"
                                                        : undefined
                                                }
                                                className={cn(
                                                    ROW,
                                                    "min-h-10 grid-cols-[1fr_80px]",
                                                    r.hi
                                                        ? "bg-mk-tint font-semibold"
                                                        : "text-mk-copy",
                                                )}
                                            >
                                                <span>{r.name}</span>
                                                <span className="text-right font-mono">
                                                    {r.end}
                                                </span>
                                            </div>
                                        ))}
                                    </>,
                                )}
                            </Claim>
                            <p className="m-0 ml-auto max-w-[220px] text-[14px] text-mk-copy">
                                <b className="block text-foreground">
                                    {h.next.title}
                                </b>
                                {h.next.body}
                            </p>
                        </div>
                    </div>
                    <div aria-hidden className="hidden min-[1080px]:block" />
                    {/* Right: the answer. */}
                    <CropToggle label={p.more} height={340} until={1080}>
                        <AskPanel title={p.title} label={p.label}>
                            <span className="w-fit rounded-full bg-mk-hover px-2.5 py-1 text-[13px] font-semibold">
                                {p.about}
                            </span>
                            <Asked>{p.q}</Asked>
                            <Checked>{p.checked}</Checked>
                            <p className="m-0 text-[18px] font-semibold leading-snug">
                                {p.lead}
                            </p>
                            <p
                                data-wire="p-cus"
                                className="m-0 -mt-1.5 text-[15px] leading-normal text-mk-copy"
                            >
                                {p.why}
                            </p>
                            <div className="overflow-hidden rounded-xl border border-border text-[14px]">
                                <div
                                    className={cn(
                                        ROW,
                                        "min-h-8 grid-cols-[70px_1fr_64px_70px] bg-mk-noon text-[12.5px] font-semibold text-muted-foreground",
                                    )}
                                >
                                    {p.head.map((x, i) => (
                                        <span
                                            key={x}
                                            className={cn(
                                                i > 1 && "text-right",
                                            )}
                                        >
                                            {x}
                                        </span>
                                    ))}
                                </div>
                                {p.rows.map((r) => (
                                    <div
                                        key={r.id}
                                        data-wire={r.from ? "p-ord" : undefined}
                                        className={cn(
                                            ROW,
                                            "min-h-10 grid-cols-[70px_1fr_64px_70px]",
                                            r.from && "bg-mk-tint",
                                        )}
                                    >
                                        <span>{r.id}</span>
                                        <span className="truncate">
                                            {r.customer}
                                        </span>
                                        <span className="text-right">
                                            {r.total}
                                        </span>
                                        <span
                                            className={cn(
                                                "text-right",
                                                r.paid !== "Paid" &&
                                                    "font-semibold text-mk-warn",
                                            )}
                                        >
                                            {r.paid}
                                        </span>
                                    </div>
                                ))}
                                {stockOn ? (
                                    <>
                                        <div
                                            className={cn(
                                                ROW,
                                                "min-h-8 grid-cols-[1fr_64px_70px] border-t border-mk-line-row bg-mk-noon text-[12px] font-semibold text-muted-foreground",
                                            )}
                                        >
                                            {p.stockHead.map((x, i) => (
                                                <span
                                                    key={x}
                                                    className={cn(
                                                        i > 0 && "text-right",
                                                    )}
                                                >
                                                    {x}
                                                </span>
                                            ))}
                                        </div>
                                        {p.stockRows.map((r, i) => (
                                            <div
                                                key={r.name}
                                                data-wire={
                                                    i === 0
                                                        ? "p-stk"
                                                        : undefined
                                                }
                                                className={cn(
                                                    ROW,
                                                    "min-h-10 grid-cols-[1fr_64px_70px] bg-mk-tint",
                                                )}
                                            >
                                                <span>{r.name}</span>
                                                <span className="text-right">
                                                    {r.need}
                                                </span>
                                                <span className="text-right">
                                                    {r.have}
                                                </span>
                                            </div>
                                        ))}
                                    </>
                                ) : null}
                            </div>
                            <ReadFrom
                                sources={p.sources}
                                label={p.from}
                                tail={p.where}
                            />
                            <ConfirmCard
                                head={p.card.head}
                                title={p.card.title}
                                kv={p.card.kv}
                                note={p.card.note}
                                buttons={p.card.buttons}
                            />
                        </AskPanel>
                    </CropToggle>
                </Wires>
                <p className="m-0 mt-6 text-[14px] text-mk-copy">{h.example}</p>
                <nav
                    aria-label="On this page"
                    className="-mr-mk-gutter mt-6 flex gap-2 overflow-x-auto pr-mk-gutter [scrollbar-width:none] min-[760px]:hidden"
                >
                    {w.chapters.map(([id, label]) => (
                        <Chip key={id} variant="chapter" href={`#${id}`}>
                            {label}
                        </Chip>
                    ))}
                </nav>
            </PageTop>

            {/* Ask from wherever you are. */}
            <Section
                id={w.where.id}
                titleId="anywhere-title"
                title={w.where.title}
                lead={w.where.lead}
                size="kit-h2"
                className={cn(SCENE, "scroll-mt-24")}
            >
                <div className="mt-10 grid gap-x-7 gap-y-10 min-[760px]:mt-12 min-[1080px]:grid-cols-2">
                    {w.where.screens.map((sc, i) => (
                        <div
                            key={sc.name}
                            className={cn(i > 0 && "max-[759px]:hidden")}
                        >
                            <div className="mb-2.5 flex items-baseline gap-2.5 text-[15px]">
                                <b className="font-semibold">{sc.name}</b>
                                <span className="text-[13.5px] text-muted-foreground">
                                    {sc.sub}
                                </span>
                            </div>
                            <div
                                role="img"
                                aria-label={sc.label}
                                className="relative grid overflow-hidden rounded-mk-card border border-border bg-mk-noon max-[759px]:max-h-[420px] min-[760px]:grid-cols-[1fr_1.1fr]"
                            >
                                <div className="hidden p-4 min-[760px]:block">
                                    <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                                        <i className="inline-flex size-[22px] items-center justify-center rounded-md bg-foreground text-[12px] not-italic text-background">
                                            {rye.name.charAt(0)}
                                        </i>
                                        {rye.name}
                                        {"page" in sc ? (
                                            <span className="font-normal text-muted-foreground">
                                                {sc.page}
                                            </span>
                                        ) : null}
                                    </div>
                                    <h4 className="m-0 font-display text-[20px] font-bold">
                                        {sc.h}
                                    </h4>
                                    <small className="text-[13px] text-muted-foreground">
                                        {sc.small}
                                    </small>
                                    <div className="mt-2.5">
                                        {sc.lines.map(([a, b]) => (
                                            <div
                                                key={a}
                                                className="flex justify-between border-t border-mk-line-row py-2 text-[13.5px]"
                                            >
                                                <span>{a}</span>
                                                <b className="font-medium">
                                                    {b}
                                                </b>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="m-2 min-[760px]:ml-0">
                                    <AskPanel
                                        title={w.where.ask}
                                        icons={3}
                                        className="h-full"
                                    >
                                        {"about" in sc ? (
                                            <span className="flex w-fit items-center gap-1 rounded-full bg-mk-hover px-2.5 py-1 text-[13px] font-semibold">
                                                {sc.about}
                                                <X
                                                    aria-hidden
                                                    className="size-3.5"
                                                />
                                            </span>
                                        ) : (
                                            <p className="m-0 text-[16px] font-semibold">
                                                {sc.lead}
                                            </p>
                                        )}
                                        <div>
                                            {sc.sugs.map((g) => (
                                                <Suggestion key={g.t} {...g} />
                                            ))}
                                        </div>
                                        <p className="m-0 text-[13px] leading-snug text-muted-foreground">
                                            {sc.name === "Home"
                                                ? w.where.hintHome
                                                : w.where.hintPage}
                                        </p>
                                    </AskPanel>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <Fold phone label={w.where.phoneMore} className="mt-3">
                    <ul>
                        {w.where.screens.slice(1).map((sc) => (
                            <li key={sc.name}>
                                <b className="font-semibold text-foreground">
                                    {sc.name}
                                </b>{" "}
                                ({sc.sub}):{" "}
                                {sc.sugs.map((g) => g.t).join(" · ")}
                            </li>
                        ))}
                    </ul>
                </Fold>
                <div className="mt-12 rounded-mk-card border border-border bg-card p-5 min-[760px]:p-6">
                    <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                        {w.where.asked}
                    </h3>
                    <ul className="m-0 mt-4 grid list-none gap-3 p-0 min-[1080px]:grid-cols-2">
                        {w.where.questions.map((q) => (
                            <li
                                key={q.q}
                                className="grid gap-2 border-t border-mk-line-row pt-3 min-[760px]:flex min-[760px]:items-center min-[760px]:justify-between"
                            >
                                <span className="w-fit rounded-[14px_14px_4px_14px] bg-foreground px-[13px] py-2 text-[14.5px] text-background">
                                    {q.q}
                                </span>
                                <ReadFrom sources={q.from} label="Read from" />
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="m-0 mt-6 max-w-[62ch] text-[15px] leading-normal text-mk-copy">
                    {w.where.history}
                </p>
            </Section>

            {/* It acts, after you confirm. */}
            <Section
                id={w.acts.id}
                titleId="acts-title"
                title={w.acts.title}
                lead={w.acts.lead}
                size="kit-h2"
                className={cn(SCENE, "scroll-mt-24")}
            >
                <SwipeRow
                    label={w.acts.title}
                    columns={3}
                    className="mt-10 min-[760px]:mt-12"
                >
                    {[0, 1, 2].map((i) => {
                        const st = w.acts.steps[i];
                        return (
                            <div
                                key={i}
                                className="grid h-full content-start gap-3"
                            >
                                <h3 className="m-0 flex items-center gap-2.5 text-[15px] font-semibold">
                                    <TimeChip>
                                        <TimeStamp at={st.at} />
                                    </TimeChip>
                                    {st.title}
                                </h3>
                                <AskPanel className="h-full">
                                    {i === 0 ? (
                                        <>
                                            <Asked>{w.acts.q}</Asked>
                                            <Checked>{w.acts.checked}</Checked>
                                            <p className="m-0 text-[16px] font-semibold leading-snug">
                                                {w.acts.lead1}
                                            </p>
                                            <div className="grid gap-2">
                                                {w.acts.slots.map(
                                                    ([d, t], j) => (
                                                        <div
                                                            key={d}
                                                            className={cn(
                                                                "flex items-center justify-between rounded-xl border px-3 py-2.5",
                                                                j === 0
                                                                    ? "border-foreground"
                                                                    : "border-border",
                                                            )}
                                                        >
                                                            <div className="text-[14px]">
                                                                <b className="block font-semibold">
                                                                    {d}
                                                                </b>
                                                                <span className="text-mk-copy">
                                                                    {t}
                                                                </span>
                                                            </div>
                                                            <span className="inline-flex h-9 items-center rounded-[9px] border border-border-strong px-3 text-[13.5px] font-semibold">
                                                                {
                                                                    w.acts
                                                                        .bookHere
                                                                }
                                                            </span>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        </>
                                    ) : i === 1 ? (
                                        <>
                                            <p className="m-0 text-[16px] font-semibold">
                                                {w.acts.lead2}
                                            </p>
                                            <ConfirmCard
                                                head={w.acts.newBooking}
                                                title={w.acts.what}
                                                kv={w.acts.kv}
                                                note={w.acts.told}
                                                buttons={w.acts.book}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <ConfirmCard
                                                done
                                                head={w.acts.booked}
                                                title={w.acts.doneTitle}
                                                kv={w.acts.doneKv}
                                                note={w.acts.doneNote}
                                                buttons={[
                                                    <>
                                                        <Undo2
                                                            aria-hidden
                                                            className="size-4"
                                                        />
                                                        {w.acts.done[0]}
                                                    </>,
                                                    w.acts.done[1],
                                                ]}
                                            />
                                            <span className="inline-flex h-11 w-fit items-center gap-2 rounded-full border-[1.5px] border-foreground px-4 text-[14.5px] font-semibold">
                                                <Sparkles
                                                    aria-hidden
                                                    className="size-4"
                                                />
                                                {w.acts.again}
                                            </span>
                                        </>
                                    )}
                                </AskPanel>
                            </div>
                        );
                    })}
                </SwipeRow>
                <ul className="m-0 mt-10 grid list-none gap-x-10 p-0 min-[760px]:grid-cols-2">
                    {[
                        ...w.acts.can.map((c) => ({ c, no: false })),
                        { c: w.acts.never, no: true },
                    ].map(({ c, no }) => (
                        <li
                            key={c[0]}
                            className="flex items-center gap-3 border-t border-border py-3.5 text-[15.5px]"
                        >
                            {no ? (
                                <X
                                    aria-hidden
                                    className="size-[18px] text-mk-warn"
                                />
                            ) : (
                                <Check
                                    aria-hidden
                                    className="size-[18px] text-mk-ok"
                                />
                            )}
                            <span className="flex-1">{c[0]}</span>
                            <span className="text-right text-[13.5px] text-muted-foreground">
                                {c[1]}
                            </span>
                        </li>
                    ))}
                </ul>
            </Section>

            {/* What stays private. */}
            <section
                id={w.private.id}
                aria-labelledby="private-title"
                className="mt-[72px] scroll-mt-24 bg-mk-hover min-[760px]:mt-[140px]"
            >
                <Container className="py-[72px] min-[760px]:pb-[110px] min-[760px]:pt-[120px]">
                    <h2
                        id="private-title"
                        className="m-0 font-display text-mk-kit-h2 font-bold"
                    >
                        {w.private.title}
                    </h2>
                    <div className="mt-10 grid gap-8 min-[1080px]:grid-cols-2 min-[1080px]:gap-x-16">
                        <div className="min-[1080px]:row-span-2">
                            <b className="block text-[19px] font-semibold">
                                {w.private.role.title}
                            </b>
                            <p className="m-0 mt-2 text-[16px] leading-normal text-mk-copy">
                                {w.private.role.body}
                            </p>
                            <div className="mt-5 grid gap-3 rounded-mk-card border border-border bg-card p-4">
                                <span className="w-fit rounded-full bg-mk-hover px-2.5 py-1 text-[12.5px] font-semibold text-mk-copy">
                                    {w.private.staff.who}
                                </span>
                                <Asked>{w.private.staff.q}</Asked>
                                <p className="m-0 text-[14.5px]">
                                    {w.private.staff.a}
                                </p>
                            </div>
                        </div>
                        {[w.private.yours, w.private.who].map((x) => (
                            <div key={x.title}>
                                <b className="block text-[19px] font-semibold">
                                    {x.title}
                                </b>
                                <p className="m-0 mt-2 text-[16px] leading-normal text-mk-copy">
                                    {x.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </Container>
            </section>

            {/* Plans: one line, the Free and limit panels folded. */}
            <Container
                as="section"
                id={w.plans.id}
                aria-label={w.plans.compare}
                className={cn(SCENE, "scroll-mt-24")}
            >
                <PlanLine
                    compare={{ label: w.plans.compare, href: "/pricing" }}
                    className="text-[18px]"
                >
                    {w.plans.line}
                </PlanLine>
                <Claim on={plans}>
                    <Fold
                        label={w.plans.fold}
                        className="mt-4 max-w-[62ch] [&_summary>span]:whitespace-normal"
                    >
                        <div className="grid gap-6 min-[760px]:grid-cols-2">
                            <figure className="m-0 grid gap-3">
                                <AskPanel
                                    title="Ask AI"
                                    label={w.plans.free.label}
                                >
                                    <p className="m-0 flex items-center gap-2 text-[18px] font-semibold">
                                        <Lock
                                            aria-hidden
                                            className="size-[18px]"
                                        />
                                        {w.plans.free.lead}
                                    </p>
                                    <p className="m-0 text-[14.5px] text-mk-copy">
                                        {w.plans.free.sub}
                                    </p>
                                    {w.plans.free.ex.map(([q, a], i) => (
                                        <div
                                            key={q}
                                            className="rounded-xl bg-mk-noon px-3 py-2.5 text-[14px]"
                                        >
                                            <span className="block text-mk-copy">
                                                {q}
                                            </span>
                                            <b className="font-semibold">
                                                {i === 1 ? (
                                                    <s className="mr-1.5 font-normal text-muted-foreground">
                                                        {w.plans.free.was}
                                                    </s>
                                                ) : null}
                                                {a}
                                            </b>
                                        </div>
                                    ))}
                                    <p className="m-0 text-[13px] text-muted-foreground">
                                        {w.plans.free.examples}
                                    </p>
                                </AskPanel>
                                <figcaption className="text-[14px] text-mk-copy">
                                    <b className="text-foreground">
                                        {w.plans.free.cap[0]}
                                    </b>{" "}
                                    {w.plans.free.cap[1]}
                                </figcaption>
                            </figure>
                            <figure className="m-0 grid gap-3">
                                <AskPanel
                                    title="Ask AI"
                                    label={w.plans.limit.label}
                                >
                                    <span className="w-fit rounded-full bg-mk-hover px-2.5 py-1 text-[13px] font-semibold">
                                        {w.plans.limit.about}
                                    </span>
                                    <Asked>{w.plans.limit.q}</Asked>
                                    <div className="rounded-xl border border-border bg-mk-noon p-3">
                                        <b className="block text-[15px] font-semibold">
                                            {w.plans.limit.title}
                                        </b>
                                        <p className="m-0 mt-1 text-[14px] text-mk-copy">
                                            {w.plans.limit.sub}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-[14px] text-muted-foreground">
                                        {w.plans.limit.input}
                                    </div>
                                    <div className="flex justify-between text-[13px]">
                                        <span className="font-semibold text-mk-warn">
                                            {w.plans.limit.left}
                                        </span>
                                        <span className="underline underline-offset-2">
                                            {w.plans.limit.data}
                                        </span>
                                    </div>
                                </AskPanel>
                                <figcaption className="text-[14px] text-mk-copy">
                                    <b className="text-foreground">
                                        {w.plans.limit.cap[0]}
                                    </b>{" "}
                                    {w.plans.limit.cap[1]}
                                </figcaption>
                            </figure>
                        </div>
                    </Fold>
                </Claim>
            </Container>

            {/* AI apps, the next step. */}
            {aiApps ? (
                <Container
                    as="section"
                    aria-labelledby="mcp-title"
                    className={SCENE}
                >
                    <div className="grid items-center gap-8 rounded-[20px] border border-border bg-card px-5 py-7 min-[760px]:px-10 min-[760px]:py-9 min-[1080px]:grid-cols-[1fr_440px] min-[1080px]:gap-14">
                        <div className="min-w-0">
                            <h2
                                id="mcp-title"
                                className="m-0 font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                            >
                                {w.mcp.title}
                            </h2>
                            <p className="m-0 mt-4 text-[16px] leading-normal text-mk-copy">
                                {w.mcp.body}
                            </p>
                            <ButtonLink
                                href={aiApps}
                                size="kit"
                                className="mt-6"
                            >
                                {w.mcp.link}
                                <ArrowRight aria-hidden className="size-4" />
                            </ButtonLink>
                            <p className="m-0 mt-6 border-t border-border pt-4 text-[15px] leading-normal text-mk-copy">
                                <b className="text-foreground">
                                    {w.mcp.rule.bold}
                                </b>{" "}
                                {w.mcp.rule.text}
                            </p>
                        </div>
                        <div
                            role="img"
                            aria-label={w.mcp.label}
                            className="grid min-w-0 gap-3 rounded-mk-card border border-border bg-mk-noon p-[18px]"
                        >
                            <div className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
                                <i
                                    aria-hidden
                                    className="block size-2 rounded-full bg-mk-ok"
                                />
                                {w.mcp.who}
                            </div>
                            <Asked>{w.mcp.q}</Asked>
                            <p className="m-0 font-serif text-[15px] leading-normal">
                                {w.mcp.a}
                            </p>
                        </div>
                    </div>
                </Container>
            ) : null}

            <InTheApp
                slug="ask-ai"
                words={w.inTheApp}
                hide={languages ? undefined : /Hinglish|Hindi/}
            />

            <Container
                as="section"
                aria-label={w.works}
                className={cn(SCENE, "grid gap-5")}
            >
                {ninePm ? (
                    <MomentCard
                        at={w.moment.at}
                        line={
                            <>
                                {w.moment.before}
                                {w.moment.q ? (
                                    <span className="rounded-md bg-foreground px-1.5 py-0.5 text-background">
                                        {w.moment.q}
                                    </span>
                                ) : null}
                                {w.moment.after}
                            </>
                        }
                        link={{
                            label: w.moment.link,
                            href: dayLink(rye, ninePm),
                        }}
                    />
                ) : null}
                <nav
                    aria-label={w.works}
                    className="flex flex-wrap items-center gap-2.5"
                >
                    <span className="mr-1.5 text-[15px] text-muted-foreground">
                        {w.works}
                    </span>
                    {shownChips([
                        ["dashboard", "Home"],
                        "insights",
                        "bookings",
                        "ai-apps",
                    ]).map((c) => (
                        <Chip key={c.href} href={c.href}>
                            {c.name}
                        </Chip>
                    ))}
                </nav>
            </Container>

            <Questions items={w.faq} ask={w.askUs} />

            <ClosingCTA
                title={w.close.title}
                primary={<CtaLink src={`feature-${slug}-close`} size="kit" />}
                secondary={
                    ninePm ? (
                        <ButtonLink
                            href={dayLink(rye, ninePm)}
                            variant="secondary"
                            size="kit"
                        >
                            {w.moment.link}
                        </ButtonLink>
                    ) : null
                }
                className="pt-[96px] min-[760px]:pt-[150px]"
            />
            <StickyBar watch={HERO_CTA}>
                <CtaLink
                    src={`feature-${slug}-sticky`}
                    size="kit"
                    className="w-full"
                />
            </StickyBar>
        </div>
    );
}

/** The registry's entry (`registry.ts`): the page, drawn on the server. */
export const AskAiPage = () => Promise.resolve(<AskAiView />);
