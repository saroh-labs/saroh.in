import { ArrowRight, CalendarDays, KeyRound } from "lucide-react";
import type { ReactNode } from "react";

import { home } from "@/content/home";
import { RYE_MONDAY, WORLD } from "@/content/world";

import { cn } from "@saroh/marketing/cn";
import { Container } from "@saroh/marketing/container";
import { SourceChips } from "@saroh/marketing/kit/chip";
import { Claim } from "@saroh/marketing/kit/claim";
import { DrawnPhoto } from "@saroh/marketing/kit/drawn-photo";
import { siteVars } from "@saroh/marketing/kit/site-drawing";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { TimeStamp } from "@saroh/marketing/kit/time-stamp";
import { TextLink } from "@saroh/marketing/text-link";
import { Fold } from "./fold";
import { Tag } from "./tag";

const N = home.news;
const rye = WORLD.lead;
const item = (key: string) => rye.items.find((i) => i.key === key);
const withUnit = (key: string) => {
    const i = item(key);
    return i ? `${i.price}${i.unit ? ` · ${i.unit}` : ""}` : "";
};

/** Which of the four this build shows, and which claims it may make. */
export interface NewsSwitches {
    askAi: boolean;
    share: boolean;
    aiApps: boolean;
    api: boolean;
    claims: {
        askAiPlans: boolean;
        askAiLanguages: boolean;
        askAiWebsite: boolean;
        shareFree: boolean;
        socialPosting: boolean;
    };
}

function Card({
    title,
    badge,
    children,
    className,
}: {
    title: string;
    badge?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <article
            className={cn(
                "flex h-full flex-col rounded-mk-card bg-mk-lamp-2 p-5 min-[760px]:p-[34px]",
                className,
            )}
        >
            <h3 className="m-0 flex flex-wrap items-center gap-2.5 font-display text-mk-kit-h3 font-bold text-mk-lamp-fg">
                {title}
                {badge}
            </h3>
            {children}
        </article>
    );
}

const BODY = "m-0 mt-3 text-[16px] leading-relaxed text-mk-on-ink";
const CHAT =
    "mt-5 flex flex-col gap-3 rounded-mk-card bg-background p-4 text-foreground min-[760px]:p-5";
const BUBBLE =
    "max-w-[85%] self-end rounded-[14px_14px_4px_14px] bg-foreground px-[15px] py-[11px] text-[15px] leading-snug text-background";

function AskAiCard({ c }: { c: NewsSwitches["claims"] }) {
    const [top, next] = RYE_MONDAY.weekSales;
    const change = RYE_MONDAY.priceChange;
    const changed = item(change.item);
    const ask = c.askAiLanguages ? N.askAi.askHi : N.askAi.askEn;
    const say = c.askAiLanguages ? N.askAi.changeHi : N.askAi.changeEn;
    const [cw, from, to, shows] = N.askAi.proposal;
    return (
        <Card
            title={N.askAi.title}
            badge={
                <Claim on={c.askAiPlans}>
                    <span className="inline-flex h-[26px] items-center rounded-full bg-mk-lamp-line px-2.5 font-sans text-[13px] font-semibold tracking-normal text-mk-lamp-fg">
                        {N.askAi.plans}
                    </span>
                </Claim>
            }
        >
            <p className={BODY}>
                {c.askAiLanguages ? N.askAi.languages : N.askAi.plain}{" "}
                {N.askAi.rows}{" "}
                <span className="max-[759px]:hidden">{N.askAi.change}</span>
            </p>
            <div className={CHAT}>
                <p className={cn(BUBBLE, "m-0")}>{ask}</p>
                <div className="max-w-[95%] text-[15px] leading-normal">
                    <b>
                        {item(top.item)?.name}: {top.sold}{" "}
                        {N.askAi.soldThisWeek}
                    </b>{" "}
                    <span className="max-[759px]:hidden">
                        {item(next.item)?.name} {N.askAi.next}
                    </span>
                    <ul className="m-0 mt-2.5 list-none overflow-hidden rounded-mk-crop border border-border bg-card p-0 max-[759px]:hidden">
                        {RYE_MONDAY.weekSales.map((s) => (
                            <li
                                key={s.item}
                                className="grid grid-cols-[1fr_84px_96px] items-center gap-2.5 border-t border-mk-line-row px-3.5 py-2.5 text-[14px] first:border-t-0"
                            >
                                <span>{item(s.item)?.name}</span>
                                <span className="font-mono text-[13px]">
                                    {s.sold} {N.askAi.sold}
                                </span>
                                <span className="font-mono text-[13px]">
                                    {s.total}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <SourceChips
                        className="mt-2.5"
                        sources={[
                            { name: N.askAi.sources[0] },
                            {
                                name: N.askAi.sources[1],
                                dot: "hsl(var(--mk-ok))",
                            },
                        ]}
                    />
                </div>
                <Claim on={c.askAiWebsite}>
                    <div className="flex flex-col gap-3 max-[759px]:hidden">
                        <p className={cn(BUBBLE, "m-0")}>
                            {say[0]} {change.to} {say[1]}
                        </p>
                        <div className="rounded-mk-crop border border-border-strong bg-card px-4 py-3.5">
                            <p className="m-0 text-[14px] text-mk-copy">
                                {cw}{" "}
                                <b className="text-foreground">
                                    {changed?.name}
                                </b>{" "}
                                {from} {change.from} {to} {change.to}. {shows}
                            </p>
                            <p
                                aria-hidden
                                className="m-0 mt-2.5 flex items-center gap-2"
                            >
                                <span className="inline-flex h-11 items-center rounded-mk-kit-btn bg-foreground px-4 text-[15px] font-semibold text-background">
                                    {N.askAi.confirm}
                                </span>
                                <span className="inline-flex h-11 items-center rounded-mk-kit-btn border border-border-strong bg-card px-4 text-[15px] font-semibold">
                                    {N.askAi.notNow}
                                </span>
                                <span className="ml-auto text-[13px] text-muted-foreground">
                                    {N.askAi.undo}
                                </span>
                            </p>
                        </div>
                    </div>
                </Claim>
            </div>
            <Fold
                summary={N.askAi.more}
                tone="on-ink"
                className="mt-2 min-[760px]:hidden"
            >
                <p className="m-0 text-[15px] leading-relaxed text-mk-on-ink">
                    {N.askAi.change}
                </p>
            </Fold>
            <TextLink
                href="/features/ask-ai"
                tone="on-ink"
                arrow
                className="mt-auto self-start pt-3"
            >
                {N.askAi.link}
            </TextLink>
        </Card>
    );
}

/** A post in Rye & Co.'s own look: what Share makes from a product. */
function Post({
    kind,
    label,
    className,
}: {
    kind: "photo" | "simple" | "tag";
    label: string;
    className?: string;
}) {
    const box = item("bun-box");
    const head =
        "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)]";
    return (
        <div
            role="img"
            aria-label={`${box?.name}, ${label}`}
            style={rye.look ? siteVars(rye.look) : undefined}
            className={cn(
                "relative overflow-hidden rounded-[10px] bg-[hsl(var(--site-surface))] font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))] shadow-[0_18px_40px_-16px_rgba(0,0,0,0.6)]",
                className,
            )}
        >
            {kind === "simple" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                    <span className="text-[12px] font-bold tracking-[0.08em]">
                        {rye.name}
                    </span>
                    <b className={cn(head, "text-[22px] leading-tight")}>
                        {box?.name}
                    </b>
                    {box?.photo ? (
                        <DrawnPhoto
                            kind={box.photo}
                            className="size-14 rounded-full"
                        />
                    ) : (
                        <span className="size-14 rounded-full bg-[hsl(var(--site-accent)/0.4)]" />
                    )}
                </div>
            ) : (
                <>
                    {box?.photo ? (
                        <DrawnPhoto
                            kind={box.photo}
                            className="absolute inset-0"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-[hsl(var(--site-accent)/0.35)]" />
                    )}
                    {kind === "tag" ? (
                        <span className="absolute right-3 top-3 flex size-[68px] flex-col items-center justify-center rounded-full bg-[hsl(var(--site-accent))] text-center text-[hsl(var(--site-accent-fg))]">
                            <b className="text-[17px] leading-none">
                                {box?.price}
                            </b>
                            <small className="text-[12px]">{box?.unit}</small>
                        </span>
                    ) : null}
                    <div
                        className={cn(
                            "absolute inset-x-0 bottom-0 grid gap-0.5 p-3",
                            kind === "tag"
                                ? "bg-[hsl(var(--site-fg))] text-[hsl(var(--site-bg))]"
                                : "bg-[hsl(var(--site-surface))]",
                        )}
                    >
                        <span className="text-[12px] font-bold tracking-[0.08em]">
                            {rye.name}
                        </span>
                        <b className={cn(head, "text-[19px] leading-tight")}>
                            {box?.name}
                        </b>
                        <span className="text-[12px]">
                            {kind === "tag" ? rye.site : withUnit("bun-box")}
                        </span>
                    </div>
                </>
            )}
        </div>
    );
}

function ShareCard({ c }: { c: NewsSwitches["claims"] }) {
    const S = N.share;
    const post = RYE_MONDAY.scheduledPost;
    return (
        <Card title={S.title}>
            <p className={BODY}>
                {S.body}
                {c.shareFree ? ` ${S.free}` : ""}
                {c.socialPosting ? `, ${S.social}` : ""}.
            </p>
            <div className="relative mt-4 h-[230px] min-[760px]:h-[300px]">
                <Post
                    kind="photo"
                    label={S.posts[0]}
                    className="absolute left-0 top-12 hidden h-[238px] w-[190px] -rotate-[7deg] min-[760px]:block"
                />
                <Post
                    kind="simple"
                    label={S.posts[1]}
                    className="absolute right-0 top-12 hidden h-[238px] w-[190px] rotate-[7deg] min-[760px]:block"
                />
                <Post
                    kind="tag"
                    label={S.posts[2]}
                    className="absolute left-0 top-0 z-10 h-[212px] w-[170px] min-[760px]:left-1/2 min-[760px]:top-1 min-[760px]:h-[282px] min-[760px]:w-[224px] min-[760px]:-translate-x-1/2"
                />
            </div>
            <Claim on={c.socialPosting}>
                <p className="m-0 mt-2 flex items-center gap-2.5 rounded-mk-crop bg-mk-lamp-line px-3.5 py-3 text-[14px] text-mk-lamp-fg">
                    <CalendarDays aria-hidden className="size-[18px]" />
                    <span className="flex-1">
                        {post.when} · {post.where}
                    </span>
                    <Tag className="bg-[#3E5A45] text-[#F4EBDD]">
                        {S.scheduled}
                    </Tag>
                </p>
            </Claim>
            {c.shareFree || c.socialPosting ? (
                <p className="m-0 mt-2.5 text-[13px] text-mk-lamp-meta">
                    {c.shareFree ? S.noteFree : null}
                    {c.shareFree && c.socialPosting ? " " : null}
                    {c.socialPosting ? S.noteSocial : null}
                </p>
            ) : null}
            <TextLink
                href="/features/social"
                tone="on-ink"
                arrow
                className="mt-auto self-start pt-2"
            >
                {S.link}
            </TextLink>
        </Card>
    );
}

function AiAppsCard() {
    const A = N.aiApps;
    const xmas = RYE_MONDAY.christmas;
    const [plum, hamper] = xmas.items.map((k) => item(k));
    const [lead, and, put] = A.ask;
    return (
        <Card
            title={A.title}
            className="min-[960px]:grid min-[960px]:grid-cols-[230px_1fr] min-[960px]:gap-x-7 [&>h3]:min-[960px]:col-start-1"
        >
            <p className={cn(BODY, "min-[960px]:col-start-1")}>{A.body}</p>
            <div
                className={cn(
                    CHAT,
                    "gap-2.5 min-[960px]:col-start-2 min-[960px]:row-span-3 min-[960px]:row-start-1 min-[960px]:mt-0",
                )}
            >
                <p className="m-0 flex flex-wrap items-center gap-2 text-[13px] text-mk-copy">
                    <TimeStamp
                        at={xmas.at}
                        className="text-[12px] text-muted-foreground"
                    />
                    {A.connected} {rye.name}
                </p>
                <p className={cn(BUBBLE, "m-0 max-w-full")}>
                    {lead} {plum?.name.toLowerCase()} {plum?.unit} {plum?.price}
                    , {and} {hamper?.name} {hamper?.price}. {put}
                </p>
                <div className="text-[15px] leading-normal">
                    {A.answer} <span className="font-mono">{xmas.page}</span>.
                    <ul className="m-0 mt-2.5 list-none overflow-hidden rounded-mk-crop border border-border bg-card p-0">
                        {[plum, hamper].map((i) =>
                            i ? (
                                <li
                                    key={i.key}
                                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2.5 border-t border-mk-line-row px-3.5 py-2.5 text-[14px] first:border-t-0"
                                >
                                    <span>
                                        {i.name}
                                        {i.unit ? `, ${i.unit}` : ""}
                                    </span>
                                    <span className="font-mono text-[13px]">
                                        {i.price}
                                    </span>
                                    <Tag>{A.draft}</Tag>
                                </li>
                            ) : null,
                        )}
                    </ul>
                    <p className="m-0 mt-2 text-[13px] text-muted-foreground">
                        {A.request}
                    </p>
                </div>
            </div>
            <TextLink
                href="/features/ai-apps"
                tone="on-ink"
                arrow
                className="mt-auto self-start pt-3 min-[960px]:col-start-1"
            >
                {A.link}
            </TextLink>
        </Card>
    );
}

function ApiCard() {
    const A = N.api;
    const key = RYE_MONDAY.apiKey;
    const hook = RYE_MONDAY.webhook;
    const row =
        "flex items-center gap-3 border-t border-mk-line-row px-4 py-3 text-[14px] first:border-t-0";
    const ic =
        "flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-mk-hover text-mk-copy";
    return (
        <Card title={A.title}>
            <p className={BODY}>{A.body}</p>
            <ul className="m-0 mt-[18px] list-none overflow-hidden rounded-mk-crop bg-card p-0 text-foreground">
                <li className={row}>
                    <span aria-hidden className={ic}>
                        <KeyRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">
                        <b className="block">{key.name}</b>
                        <span className="font-mono text-[12px] text-muted-foreground">
                            ••••{key.ends} · {A.readOnly}
                        </span>
                    </span>
                    <Tag tone="ok">{A.active}</Tag>
                </li>
                <li className={row}>
                    <span aria-hidden className={ic}>
                        <ArrowRight className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 leading-snug">
                        <b className="block">{hook.event}</b>
                        <span className="text-[13px] text-muted-foreground">
                            {hook.to}
                        </span>
                    </span>
                    <Tag tone="ok">{A.delivered}</Tag>
                </li>
            </ul>
            <TextLink
                href="/developers"
                tone="on-ink"
                arrow
                className="mt-auto self-start pt-3.5"
            >
                {A.link}
            </TextLink>
        </Card>
    );
}

/**
 * "New in Saroh" (`#new`): the one home for the four new things, each
 * drawn: Ask AI, Share, AI apps, and API keys and webhooks. A card shows
 * only while its feature does, and each unlive claim sits behind its claim
 * switch (DEC-221). On a phone the four are a swipe row; on desk two
 * columns, 7 to 5.
 */
export function NewInSaroh({ on }: { on: NewsSwitches }) {
    const cards = [
        on.askAi ? <AskAiCard key="ask" c={on.claims} /> : null,
        on.share ? <ShareCard key="share" c={on.claims} /> : null,
        on.aiApps ? <AiAppsCard key="apps" /> : null,
        on.api ? <ApiCard key="api" /> : null,
    ].filter(Boolean);
    if (cards.length === 0) return null;
    return (
        <section
            id="new"
            aria-labelledby="new-title"
            className="scroll-mt-24 bg-foreground py-12 text-mk-lamp-fg min-[760px]:py-[72px]"
        >
            <Container>
                <div className="grid gap-3 min-[960px]:grid-cols-[minmax(0,1fr)_460px] min-[960px]:items-end min-[960px]:gap-12">
                    <h2
                        id="new-title"
                        className="m-0 font-display text-mk-kit-h2 font-bold"
                    >
                        {N.title}
                        <span
                            aria-hidden
                            className="ml-2.5 inline-block size-2.5 rounded-full bg-brand-500 align-[0.3em] min-[760px]:size-3.5"
                        />
                    </h2>
                    <p className="m-0 text-[16px] leading-normal text-mk-on-ink min-[760px]:text-mk-kit-lead">
                        {N.lede}
                    </p>
                </div>
                <SwipeRow
                    label={N.row}
                    columns={2}
                    className="mt-8 min-[760px]:mt-11 [&>p]:text-mk-lamp-meta min-[760px]:[&>ul]:grid-cols-1 min-[960px]:[&>ul]:grid-cols-[7fr_5fr]"
                >
                    {cards}
                </SwipeRow>
            </Container>
        </section>
    );
}
