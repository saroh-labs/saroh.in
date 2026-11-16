import {
    Check,
    Copy,
    Download,
    Eye,
    Facebook,
    ImagePlus,
    Instagram,
    Link2,
    MessageCircle,
    Plus,
    Share2,
    Sparkles,
    X,
} from "lucide-react";
import { Fragment } from "react";
import { cn } from "../cn";
import { Claim } from "../kit/claim";
import { ClosingCTA } from "../kit/closing-cta";
import { PhoneClip } from "../kit/phone-fold";
import { ShareEverywhere } from "../kit/share-everywhere";
import { StickyBar } from "../kit/sticky-bar";
import { SwipeRow } from "../kit/swipe-row";
import { TimeStamp } from "../kit/time-stamp";
import { Container } from "../layout/container";
import { Section } from "../sections/section";

import type { World } from "../content/world";
import { LivePill } from "./reach/app-card";
import { CropToggle, Fold } from "./reach/fold";
import type { InTheAppData } from "./reach/in-the-app";
import { HERO_CTA, PageTop } from "./reach/page-top";
import { Photo } from "./reach/photo";
import { Questions } from "./reach/questions";
import { PanelShot, ReachSteps } from "./reach/reach-steps";
import { Tail } from "./reach/tail";
import type { PageSite } from "./site";
import { Feed, ItemCard, Seg, StateChip, StoryTime } from "./social/pieces";
import { PostCard } from "./social/post-card";
import type { SocialWords } from "./social/words";

const SCENE = "pt-12 min-[760px]:pt-[120px]";
const KINDS = ["photo", "price", "offer", "simple"] as const;
const PANEL = "rounded-mk-card border border-border bg-card";

/** What the site resolves for this page (its `content/` and `lib/`). */
export interface SocialPageProps {
    site: PageSite;
    words: SocialWords;
    world: World;
    /** The level above: "Features", at /features. */
    crumb: { name: string; href: string };
    inTheApp: InTheAppData;
    /** The merchant fonts' class (`--font-site-*`), for the post drawings. */
    fonts: string;
}

/**
 * /features/social, "Share and posts" (boards FSDesk, FSPhone2): one bun
 * box all the way out. Four cards in the bakery's own look, the same four
 * in a salon's, what's worth posting, 1:02 to 1:05 pm, your own post, and
 * Saroh Social (`#saroh-social`, the footer's link) behind its claim.
 */
export function SocialView({
    site,
    words,
    world,
    crumb,
    inTheApp,
    fonts,
}: SocialPageProps) {
    const slug = "social";
    const everyPlan = site.claimOn("share-every-plan");
    const posting = site.claimOn("social-posting");
    const insights = site.claimOn("share-insights");
    const w = words;
    const lead = world.lead;
    const leadLook = w.looks.lead;
    const otherLook = w.looks.other;
    const card = w.cards.lead;
    const s = w.story;
    const k = w.social;

    return (
        <div className={fonts}>
            <PageTop
                crumb={crumb}
                words={w}
                start={site.start(`feature-${slug}`)}
                secondaryHref={`#${s.id}`}
                aside={
                    <Claim on={everyPlan}>
                        <p className="m-0 flex items-center gap-2 text-[15px] text-mk-copy max-[1079px]:mt-5">
                            <Check
                                aria-hidden
                                className="size-[18px] text-mk-ok"
                            />
                            {w.free}
                        </p>
                    </Claim>
                }
                stacked
            >
                <CropToggle label={w.stage.more} height={330}>
                    <div
                        role="group"
                        aria-label={w.stage.label}
                        className="rounded-mk-card bg-mk-hover/60 p-4 min-[760px]:p-7"
                    >
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[14px] bg-card py-3 pl-3 pr-3.5 shadow-[0_1px_2px_rgba(40,30,15,0.06),0_10px_24px_-14px_rgba(40,30,15,0.25)] min-[760px]:flex-none">
                                <Photo
                                    kind="buns"
                                    className="size-[52px] shrink-0 rounded-[9px]"
                                />
                                <div className="min-w-0">
                                    <b className="flex items-center gap-2 text-[17px] font-semibold">
                                        {w.stage.product}
                                        <LivePill className="max-[759px]:hidden">
                                            {w.stage.live}
                                        </LivePill>
                                    </b>
                                    <small className="block text-[13.5px] text-muted-foreground">
                                        <span className="min-[760px]:hidden">
                                            {w.stage.phoneNote}
                                        </span>
                                        <span className="max-[759px]:hidden">
                                            {w.stage.productNote}
                                        </span>
                                    </small>
                                </div>
                                <span className="ml-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] bg-foreground px-4 text-[15px] font-semibold text-background shadow-[0_0_0_3px_#fff,0_0_0_5px_hsl(var(--foreground))] min-[760px]:ml-2.5">
                                    <Share2 aria-hidden className="size-4" />
                                    {w.stage.share}
                                </span>
                            </div>
                            <span
                                aria-hidden
                                className="relative mx-1.5 hidden h-0.5 flex-1 border-t-2 border-dashed border-border-strong min-[1080px]:block"
                            />
                            <div className="hidden items-center gap-3 text-[15px] font-semibold min-[1080px]:flex">
                                {w.stage.pick}
                                <Seg items={w.stage.sizes} on={0} />
                            </div>
                        </div>
                        <SwipeRow
                            label={w.stage.label}
                            columns={4}
                            of={w.stage.of}
                            bleed={false}
                            className="mt-7"
                        >
                            {KINDS.map((kind) => (
                                <figure
                                    key={kind}
                                    className="m-0 grid justify-items-center gap-3.5"
                                >
                                    <ItemCard
                                        set={card}
                                        look={leadLook}
                                        kind={kind}
                                        photo="buns"
                                        className={cn(
                                            "w-full max-w-[254px]",
                                            kind === "price" &&
                                                "rounded-[var(--site-radius)] outline outline-[3px] outline-offset-[5px] outline-foreground",
                                        )}
                                    />
                                    <figcaption
                                        className={cn(
                                            "flex min-h-7 items-center gap-1.5 text-[15px] font-semibold",
                                            kind === "price"
                                                ? "text-foreground"
                                                : "text-mk-copy",
                                        )}
                                    >
                                        {kind === "price" ? (
                                            <Check
                                                aria-hidden
                                                className="size-4 text-mk-ok"
                                            />
                                        ) : null}
                                        {w.stage.styles[kind]}
                                    </figcaption>
                                </figure>
                            ))}
                        </SwipeRow>
                        <p className="m-0 mt-6 text-[15px] text-mk-copy">
                            {w.stage.note}
                        </p>
                    </div>
                </CropToggle>
            </PageTop>

            {/* The same four in a salon's look. */}
            <Container
                as="section"
                aria-labelledby="salon-title"
                className="pt-12 min-[760px]:pt-16"
            >
                <div className="grid items-center gap-8 rounded-mk-card border border-border bg-card p-5 min-[760px]:p-8 min-[1080px]:grid-cols-[1fr_auto]">
                    <div>
                        <h2
                            id="salon-title"
                            className="m-0 max-w-[18ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                        >
                            {w.salon.title}
                        </h2>
                        <p className="m-0 mt-3.5 max-w-[46ch] text-[17px] leading-normal text-mk-copy">
                            {w.salon.lead}
                        </p>
                        <p className="m-0 mt-5 flex items-center gap-2.5 text-[14px] text-mk-copy">
                            <span aria-hidden className="flex">
                                {[
                                    otherLook.look?.bg,
                                    otherLook.look?.accent,
                                    otherLook.look?.fg,
                                ].map((c, i) => (
                                    <i
                                        key={i}
                                        className={cn(
                                            "block size-[22px] rounded-full border-2 border-card",
                                            i > 0 && "-ml-1.5",
                                        )}
                                        style={{ background: `hsl(${c})` }}
                                    />
                                ))}
                            </span>
                            {w.salon.site}
                        </p>
                    </div>
                    {/* Desk: the four in her look. Phone: hers beside Rye's, the four folded. */}
                    <div className="hidden gap-[18px] min-[760px]:flex">
                        {KINDS.map((kind) => (
                            <figure
                                key={kind}
                                className="m-0 grid w-[150px] justify-items-center gap-2.5 text-[13.5px] font-semibold text-mk-copy"
                            >
                                <ItemCard
                                    set={w.cards.other}
                                    look={otherLook}
                                    kind={kind}
                                    photo="salon"
                                    className="w-full"
                                />
                                {w.stage.styles[kind]}
                            </figure>
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3.5 min-[760px]:hidden">
                        {[
                            {
                                set: card,
                                look: leadLook,
                                photo: "buns" as const,
                                who: w.salon.duo[0],
                            },
                            {
                                set: w.cards.other,
                                look: otherLook,
                                photo: "salon" as const,
                                who: w.salon.duo[1],
                            },
                        ].map((d) => (
                            <figure
                                key={d.who.name}
                                className="m-0 grid gap-2 text-[13px] text-mk-copy"
                            >
                                <ItemCard
                                    set={d.set}
                                    look={d.look}
                                    kind="price"
                                    photo={d.photo}
                                    className="w-full"
                                />
                                <span>
                                    <b className="font-semibold text-foreground">
                                        {d.who.name}
                                    </b>{" "}
                                    · {d.who.kind}
                                </span>
                            </figure>
                        ))}
                    </div>
                </div>
                <Fold phone label={w.salon.phoneMore} className="mt-3">
                    <div className="grid grid-cols-2 gap-3">
                        {KINDS.map((kind) => (
                            <figure
                                key={kind}
                                className="m-0 grid gap-1.5 text-center text-[13px]"
                            >
                                <ItemCard
                                    set={w.cards.other}
                                    look={otherLook}
                                    kind={kind}
                                    photo="salon"
                                    className="w-full"
                                />
                                {w.stage.styles[kind]}
                            </figure>
                        ))}
                    </div>
                </Fold>
            </Container>

            {/* What's worth posting (and Ask AI's answer). */}
            <Claim on={insights}>
                <Section
                    titleId="worth-title"
                    title={w.worth.title}
                    lead={w.worth.lead}
                    size="kit-h2"
                    className={SCENE}
                >
                    <div className="mt-10 grid items-start gap-7 min-[760px]:mt-12 min-[1080px]:grid-cols-[1fr_420px]">
                        <div
                            role="img"
                            aria-label={w.worth.label}
                            className={cn(
                                PANEL,
                                "relative overflow-hidden p-5 max-[759px]:max-h-[440px] min-[760px]:p-6",
                            )}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <small className="block text-[13px] text-muted-foreground">
                                        {w.worth.small}
                                    </small>
                                    <h3 className="m-0 font-display text-[28px] font-bold tracking-[-0.025em]">
                                        {w.worth.page}
                                    </h3>
                                    <p className="m-0 mt-0.5 hidden text-[14.5px] text-mk-copy min-[760px]:block">
                                        {w.worth.pageLine}
                                    </p>
                                </div>
                                <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-[10px] bg-foreground px-4 text-[14.5px] font-semibold text-background">
                                    <Plus aria-hidden className="size-4" />
                                    {w.worth.newPost}
                                </span>
                            </div>
                            <div className="mt-[26px] flex flex-wrap items-baseline gap-x-3 text-[18px] font-semibold">
                                {w.worth.head}
                                <small className="text-[13.5px] font-normal text-muted-foreground">
                                    {w.worth.headNote}
                                </small>
                            </div>
                            <div className="mt-3 grid gap-3.5">
                                {w.worth.ideas.map((idea) => (
                                    <div
                                        key={idea.name}
                                        className="relative flex gap-3.5 rounded-[14px] border border-border bg-card p-3.5"
                                    >
                                        {idea.kind === "text" ? (
                                            leadLook.look ? (
                                                <PostCard
                                                    look={leadLook.look}
                                                    band={leadLook.band}
                                                    kind="text"
                                                    fill="band"
                                                    photo="buns"
                                                    label={idea.name}
                                                    className="w-[72px] shrink-0"
                                                    words={{
                                                        label: lead.name,
                                                        name: idea.name.split(
                                                            ",",
                                                        )[0],
                                                        web: lead.site,
                                                    }}
                                                />
                                            ) : null
                                        ) : (
                                            <ItemCard
                                                set={card}
                                                look={leadLook}
                                                kind={idea.kind}
                                                photo="buns"
                                                className="w-[72px] shrink-0"
                                            />
                                        )}
                                        <div className="min-w-0">
                                            <b className="block pr-6 text-[15.5px] font-semibold leading-snug">
                                                {idea.name}
                                            </b>
                                            <p className="m-0 mb-3 mt-1 text-[13.5px] leading-snug text-mk-copy">
                                                {idea.line}
                                            </p>
                                            <span className="inline-flex h-[38px] items-center whitespace-nowrap rounded-[9px] bg-foreground px-3.5 text-[13.5px] font-semibold text-background">
                                                {w.worth.make}
                                            </span>
                                        </div>
                                        <X
                                            aria-hidden
                                            className="absolute right-3 top-3 size-4 text-muted-foreground"
                                        />
                                    </div>
                                ))}
                            </div>
                            <div
                                aria-hidden
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-card min-[760px]:hidden"
                            />
                        </div>
                        <PhoneClip height={200} label={w.worth.askMore}>
                            <div
                                role="img"
                                aria-label={w.worth.ask.label}
                                className={cn(
                                    PANEL,
                                    "flex flex-col gap-2.5 px-[22px] py-5",
                                )}
                            >
                                <div className="flex items-center gap-2 text-[15px] font-semibold">
                                    <Sparkles
                                        aria-hidden
                                        className="size-[18px] text-brand-700"
                                    />
                                    {w.worth.ask.title}
                                </div>
                                <div className="max-w-[82%] self-end rounded-[14px_14px_4px_14px] bg-foreground px-[13px] py-[9px] text-[15px] text-background">
                                    {w.worth.ask.q}
                                </div>
                                <div>
                                    <b className="block text-[17px] font-semibold">
                                        {w.worth.ask.a}
                                    </b>
                                    <span className="text-[15px]">
                                        {w.worth.ask.more}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                                    {w.worth.ask.from}
                                    {w.worth.ask.sources.map((src) => (
                                        <span
                                            key={src}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-background px-2.5 text-[13px] font-semibold text-mk-copy"
                                        >
                                            <i
                                                aria-hidden
                                                className="block size-[7px] rounded-full bg-brand-500"
                                            />
                                            {src}
                                        </span>
                                    ))}
                                </div>
                                <span className="mt-1 inline-flex h-11 items-center gap-2 self-start rounded-full border-[1.5px] border-foreground bg-card px-4 text-[14.5px] font-semibold">
                                    <Sparkles aria-hidden className="size-4" />
                                    {w.worth.ask.follow}
                                </span>
                                {w.worth.ask.plans ? (
                                    <p className="m-0 text-[13.5px] text-muted-foreground">
                                        {w.worth.ask.plans}
                                    </p>
                                ) : null}
                            </div>
                        </PhoneClip>
                    </div>
                    <p className="m-0 mt-4 text-[15px] text-mk-copy min-[760px]:hidden">
                        {w.worth.phoneAlso}
                    </p>
                </Section>
            </Claim>

            {/* One bun box, 1:02 to 1:04 pm. */}
            <Section
                id={s.id}
                titleId="bunbox-title"
                title={s.title}
                lead={s.lead}
                size="kit-h2"
                className={cn(SCENE, "scroll-mt-24")}
            >
                <SwipeRow
                    label={s.title}
                    columns={1}
                    of={s.of}
                    className="mt-10 min-[760px]:mt-14 [&>ul]:min-[760px]:gap-[88px]"
                >
                    <StoryRow
                        at={s.card.at}
                        title={s.card.title}
                        body={s.card.body}
                    >
                        <div
                            className={cn(
                                PANEL,
                                "grid gap-7 px-5 py-6 min-[760px]:px-[30px] min-[760px]:py-7",
                            )}
                        >
                            <div className="hidden flex-wrap items-center gap-6 min-[1080px]:flex">
                                <div className="grid gap-2.5 text-[15px] font-semibold">
                                    {s.card.another}
                                    <Seg items={s.card.seg} on={0} />
                                </div>
                                <div className="ml-auto flex gap-3">
                                    {KINDS.map((kind) => (
                                        <figure
                                            key={kind}
                                            className={cn(
                                                "m-0 grid justify-items-center gap-2 rounded-[10px] border-2 p-1.5 text-[13px] font-medium text-mk-copy",
                                                kind === "price"
                                                    ? "border-foreground font-semibold text-foreground"
                                                    : "border-transparent",
                                            )}
                                        >
                                            <ItemCard
                                                set={card}
                                                look={leadLook}
                                                kind={kind}
                                                photo="buns"
                                                className="w-16"
                                            />
                                            {w.stage.styles[kind]}
                                        </figure>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-end justify-center gap-4 min-[760px]:gap-9">
                                {s.card.sizes.map((z) => (
                                    <figure
                                        key={z.size}
                                        className={cn(
                                            "m-0 grid gap-2.5 text-[13px] text-muted-foreground",
                                            z.size === "story"
                                                ? "w-[22%] min-[760px]:w-[141px]"
                                                : "w-[32%] min-[760px]:w-[200px]",
                                        )}
                                    >
                                        <ItemCard
                                            set={card}
                                            look={leadLook}
                                            kind="price"
                                            photo="buns"
                                            size={z.size}
                                            className="w-full"
                                        />
                                        <span>
                                            <b className="text-[14px] font-semibold text-foreground">
                                                {z.name}
                                            </b>{" "}
                                            {z.ratio}
                                        </span>
                                    </figure>
                                ))}
                            </div>
                        </div>
                    </StoryRow>
                    <StoryRow
                        at={s.caption.at}
                        title={s.caption.title}
                        body={s.caption.body}
                    >
                        <div className="grid items-start gap-7 rounded-mk-card border border-border bg-mk-hover/70 px-5 py-6 min-[760px]:px-[30px] min-[760px]:py-7 min-[1080px]:grid-cols-[300px_1fr]">
                            <Feed {...w.feed} className="max-[1079px]:hidden">
                                <ItemCard
                                    set={card}
                                    look={leadLook}
                                    kind="price"
                                    photo="buns"
                                    flat
                                    className="w-full"
                                />
                            </Feed>
                            <div className="grid gap-3.5">
                                <div className="hidden items-center gap-3.5 rounded-[14px] border border-border bg-card p-3 min-[760px]:flex">
                                    <Photo
                                        kind="buns"
                                        className="size-10 shrink-0 rounded-[9px]"
                                    />
                                    <div>
                                        <b className="text-[15px] font-semibold">
                                            {s.caption.product}
                                        </b>
                                        <small className="block text-[13.5px] text-muted-foreground">
                                            {s.caption.productNote}
                                        </small>
                                    </div>
                                </div>
                                <div className="rounded-[14px] bg-card p-4">
                                    <div className="flex items-center justify-between text-[15px] font-semibold">
                                        {s.caption.head}
                                        <span className="inline-flex h-9 items-center rounded-[9px] bg-foreground px-3.5 text-[14px] text-background">
                                            {s.caption.done}
                                        </span>
                                    </div>
                                    <div className="mt-3.5 flex flex-wrap gap-2">
                                        {s.caption.kinds.map((c) => (
                                            <span
                                                key={c}
                                                className={cn(
                                                    "inline-flex h-[34px] items-center rounded-full border px-[13px] text-[13.5px] font-medium",
                                                    c === s.caption.on
                                                        ? "border-foreground bg-foreground font-semibold text-background"
                                                        : "border-border bg-card text-mk-copy",
                                                )}
                                            >
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-3 rounded-[10px] border border-border p-3 text-[14.5px] leading-normal">
                                        {s.caption.text}
                                        <br />
                                        <span className="mt-2.5 inline-flex h-[30px] max-w-full items-center gap-1.5 truncate rounded-full border border-border bg-mk-noon px-2.5 font-mono text-[12.5px] text-mk-copy">
                                            <Link2
                                                aria-hidden
                                                className="size-3.5 shrink-0"
                                            />
                                            {s.caption.link}
                                        </span>
                                    </div>
                                    <p className="m-0 mt-2.5 text-[13px] leading-[1.45] text-muted-foreground">
                                        {s.caption.note}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </StoryRow>
                    <StoryRow
                        at={s.share.at}
                        title={s.share.title}
                        body={s.share.body}
                    >
                        <div
                            className={cn(
                                PANEL,
                                "grid items-center gap-7 px-5 py-6 min-[760px]:px-[30px] min-[760px]:py-7 min-[1080px]:grid-cols-[1fr_250px]",
                            )}
                        >
                            <div>
                                <h4 className="m-0 text-[16px] font-semibold">
                                    {s.share.head}
                                </h4>
                                <div className="mt-2.5 flex min-h-14 items-center gap-3 rounded-xl bg-foreground px-4 text-background">
                                    <Download aria-hidden className="size-5" />
                                    <div>
                                        <b className="block text-[15px] font-semibold">
                                            {s.share.download[0]}
                                        </b>
                                        <small className="block text-[13px] text-background/80">
                                            {s.share.download[1]}
                                        </small>
                                    </div>
                                </div>
                                <div className="mt-2.5 flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4">
                                    <Copy aria-hidden className="size-5" />
                                    <div>
                                        <b className="block text-[15px] font-semibold">
                                            {s.share.copy[0]}
                                        </b>
                                        <small className="block text-[13px] text-muted-foreground">
                                            {s.share.copy[1]}
                                        </small>
                                    </div>
                                </div>
                                <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                                    {s.share.apps.map((a, i) => (
                                        <div
                                            key={a}
                                            className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4"
                                        >
                                            {i === 0 ? (
                                                <MessageCircle
                                                    aria-hidden
                                                    className="size-5"
                                                />
                                            ) : (
                                                <Facebook
                                                    aria-hidden
                                                    className="size-5"
                                                />
                                            )}
                                            <b className="text-[15px] font-semibold">
                                                {a}
                                            </b>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="text-center">
                                <div
                                    aria-hidden
                                    className="flex justify-center gap-3"
                                >
                                    {[Instagram, MessageCircle, Facebook].map(
                                        (Icon, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex size-14 items-center justify-center rounded-2xl border border-border bg-card"
                                            >
                                                <Icon className="size-6" />
                                            </span>
                                        ),
                                    )}
                                </div>
                                <p className="m-0 mt-3.5 text-[14px] leading-normal text-mk-copy">
                                    {s.share.phone}
                                </p>
                            </div>
                        </div>
                    </StoryRow>
                </SwipeRow>
            </Section>

            {/* 1:05 pm: posted. */}
            <section
                aria-labelledby="posted-title"
                className="mt-12 bg-mk-hover min-[760px]:mt-[140px]"
            >
                <Container className="grid items-center gap-10 py-12 min-[760px]:py-[110px] min-[1080px]:grid-cols-[420px_1fr] min-[1080px]:gap-16">
                    <div className="order-2 grid justify-items-center min-[1080px]:order-none">
                        <PhoneClip height={320} label={w.posted.more}>
                            <div
                                role="img"
                                aria-label={w.posted.label}
                                className="relative w-full max-w-[270px] rounded-[44px] bg-foreground p-2.5 shadow-mk-hero min-[760px]:max-w-[330px]"
                            >
                                <span
                                    aria-hidden
                                    className="absolute left-1/2 top-4 z-[3] h-[22px] w-[84px] -translate-x-1/2 rounded-xl bg-foreground"
                                />
                                <div className="overflow-hidden rounded-[36px] bg-card pb-6 pt-8">
                                    <Feed {...w.feed} className="rounded-none">
                                        <ItemCard
                                            set={card}
                                            look={leadLook}
                                            kind="price"
                                            photo="buns"
                                            flat
                                            className="w-full"
                                        />
                                    </Feed>
                                </div>
                            </div>
                        </PhoneClip>
                    </div>
                    <div>
                        <StoryTime white>
                            <TimeStamp at={w.posted.at} />
                        </StoryTime>
                        <h2
                            id="posted-title"
                            className="m-0 mt-5 font-display text-mk-kit-h2 font-bold"
                        >
                            {w.posted.title}
                        </h2>
                        <ul className="m-0 mt-6 list-none p-0">
                            {w.posted.ticks.map((t) => (
                                <li
                                    key={t}
                                    className="flex items-center gap-3 py-[7px] text-[17px]"
                                >
                                    <i className="inline-flex size-7 items-center justify-center rounded-full bg-mk-ok-tint text-mk-ok">
                                        <Check aria-hidden className="size-4" />
                                    </i>
                                    {t}
                                </li>
                            ))}
                        </ul>
                        <div
                            aria-hidden
                            className="mt-[22px] flex flex-wrap gap-2.5"
                        >
                            {w.posted.buttons.map((b, i) => (
                                <span
                                    key={b}
                                    className={cn(
                                        "inline-flex h-[46px] items-center gap-2 rounded-[10px] border px-4 text-[15px] font-semibold",
                                        i === 0
                                            ? "border-foreground bg-foreground text-background"
                                            : "border-border-strong bg-card",
                                        i === 2 && "max-[759px]:hidden",
                                    )}
                                >
                                    {i === 1 ? (
                                        <MessageCircle className="size-4" />
                                    ) : null}
                                    {b}
                                </span>
                            ))}
                        </div>
                        <Claim on={insights}>
                            <div className="mt-9 grid grid-cols-[auto_1fr] items-center gap-[22px] border-t border-border-strong pt-7">
                                <div className="relative w-[110px] rounded-[14px] bg-mk-hover p-2.5 min-[760px]:w-[150px]">
                                    <StateChip>{w.posted.shared}</StateChip>
                                    <ItemCard
                                        set={card}
                                        look={leadLook}
                                        kind="price"
                                        photo="buns"
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <StoryTime white>
                                        <TimeStamp at={w.posted.laterAt} />
                                    </StoryTime>
                                    <b className="mt-3 block text-[18px] font-semibold">
                                        {w.posted.laterName}
                                    </b>
                                    <div className="mt-0.5 text-[14.5px] text-mk-copy">
                                        {w.posted.laterWhen}
                                    </div>
                                    <Visits
                                        visits={w.posted.visits}
                                        example={w.posted.example}
                                    />
                                    <p className="m-0 mt-2.5 hidden text-[14px] leading-normal text-muted-foreground min-[760px]:block">
                                        {w.posted.visitsNote}
                                    </p>
                                </div>
                            </div>
                        </Claim>
                    </div>
                </Container>
            </section>

            {/* Your own post. */}
            <Section
                titleId="own-title"
                title={w.own.title}
                lead={w.own.lead}
                size="kit-h2"
                className={SCENE}
            >
                <div
                    role="img"
                    aria-label={w.own.label}
                    className={cn(
                        PANEL,
                        "relative mt-10 grid items-start gap-6 overflow-hidden p-5 max-[759px]:max-h-[420px] min-[760px]:mt-12 min-[760px]:p-6 min-[1080px]:grid-cols-[330px_1fr]",
                    )}
                >
                    <Feed
                        handle={w.feed.handle}
                        initials={w.feed.initials}
                        caption={w.own.caption}
                        inBio={w.feed.inBio}
                        className="order-2 border border-border min-[1080px]:order-none"
                    >
                        {leadLook.look ? (
                            <PostCard
                                look={leadLook.look}
                                band={leadLook.band}
                                kind="text"
                                fill="accent"
                                photo="buns"
                                flat
                                label={w.own.headline}
                                className="w-full"
                                words={{
                                    label: lead.name,
                                    name: w.own.headline,
                                    web: lead.site,
                                }}
                            />
                        ) : null}
                    </Feed>
                    <div>
                        <div className="text-[14px] font-semibold">
                            {w.own.ask}
                        </div>
                        <div className="mt-2 flex h-[54px] items-center rounded-xl border-[1.5px] border-foreground px-3.5 text-[17px] font-medium">
                            {w.own.headline}
                            <i
                                aria-hidden
                                className="ml-0.5 block h-[22px] w-[1.5px] bg-foreground"
                            />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[13px] text-muted-foreground">
                            <span>{w.own.hint}</span>
                            <span className="font-mono">{w.own.count}</span>
                        </div>
                        <span className="mt-3.5 inline-flex h-[42px] items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 text-[14px] font-semibold">
                            <ImagePlus aria-hidden className="size-4" />
                            {w.own.photo}
                        </span>
                        <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[14px] text-mk-copy">
                            {w.own.linkTo}
                            <span className="inline-flex h-10 items-center gap-2 rounded-[9px] border border-border bg-card px-3 font-medium text-foreground">
                                {w.own.linkPage}
                            </span>
                        </div>
                        <div className="mt-3.5 flex items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 py-3 text-[13.5px] text-mk-copy">
                            <Check
                                aria-hidden
                                className="size-[15px] text-mk-ok"
                            />
                            {w.own.saved}{" "}
                            <b className="font-semibold text-foreground">
                                {w.own.yours}
                            </b>
                        </div>
                    </div>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-card min-[760px]:hidden"
                    />
                </div>
                {/* The posts list, once: shown on desk, folded on a phone. */}
                <PhoneClip height={240} label={w.own.phoneMore}>
                    <div className="mt-3 min-[760px]:mt-0">
                        <h3 className="m-0 text-[18px] font-semibold min-[760px]:mt-11">
                            {w.own.listTitle}
                        </h3>
                        <ul className="m-0 mt-3 grid list-none grid-cols-3 gap-3.5 p-0 min-[1080px]:grid-cols-5">
                            {w.own.list.map((p) => (
                                <li key={p.name}>
                                    <div className="relative flex justify-center rounded-xl bg-mk-hover p-2">
                                        <StateChip draft={p.state === "Draft"}>
                                            {p.state}
                                        </StateChip>
                                        {p.kind === "text" ? (
                                            leadLook.look ? (
                                                <PostCard
                                                    look={leadLook.look}
                                                    band={leadLook.band}
                                                    kind="text"
                                                    fill={p.fill}
                                                    photo="buns"
                                                    label={p.card ?? p.name}
                                                    className="w-[118px]"
                                                    words={{
                                                        label: lead.name,
                                                        name: p.card ?? p.name,
                                                        line:
                                                            "line" in p
                                                                ? p.line
                                                                : undefined,
                                                        web: lead.site,
                                                    }}
                                                />
                                            ) : null
                                        ) : (
                                            <ItemCard
                                                set={card}
                                                look={leadLook}
                                                kind={p.kind}
                                                photo="buns"
                                                className="w-[118px]"
                                            />
                                        )}
                                    </div>
                                    <b className="mt-2.5 block text-[14px] font-semibold leading-snug">
                                        {p.name}
                                    </b>
                                    <small className="block text-[12.5px] text-mk-copy">
                                        {p.when}
                                    </small>
                                    {"visits" in p && p.visits ? (
                                        <Claim on={insights}>
                                            <Visits
                                                visits={p.visits}
                                                example={w.posted.example}
                                                small
                                            />
                                        </Claim>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                        <Claim on={insights}>
                            <p className="m-0 mt-[18px] text-[13px] text-muted-foreground">
                                {w.own.foot}
                            </p>
                        </Claim>
                    </div>
                </PhoneClip>
            </Section>

            {/* Saroh Social, the add-on (the footer links here). */}
            <Container
                as="section"
                id={k.id}
                aria-labelledby="social-title"
                className={cn(SCENE, "scroll-mt-24")}
            >
                {posting ? (
                    <>
                        <h2
                            id="social-title"
                            className="m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                        >
                            {k.title}
                        </h2>
                        <p className="m-0 mt-5 max-w-[62ch] text-mk-kit-lead text-mk-copy">
                            {k.lead}
                        </p>
                        <span className="mt-4 inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13.5px] font-semibold">
                            <i
                                aria-hidden
                                className="block size-2.5 rounded-[3px] bg-[#7B3F75]"
                            />
                            {k.pill}
                        </span>
                        <SocialWeek k={k} card={card} look={leadLook} />
                        <div className="mt-11 hidden gap-10 min-[760px]:grid min-[1080px]:grid-cols-3">
                            {k.points.map((p) => (
                                <div
                                    key={p.title}
                                    className="border-t border-border pt-[18px]"
                                >
                                    <b className="block font-display text-mk-kit-h3 font-bold">
                                        {p.title}
                                    </b>
                                    <p className="m-0 mt-2 text-[15.5px] leading-normal text-mk-copy">
                                        {p.body}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <Fold
                            phone
                            label={k.phoneMore}
                            meta={k.phoneMoreMeta}
                            className="mt-3"
                        >
                            <p className="m-0">
                                {k.lead} {k.phoneWeek}
                            </p>
                            {k.points.map((p) => (
                                <p key={p.title} className="m-0 mt-2">
                                    <b className="font-semibold text-foreground">
                                        {p.title}.
                                    </b>{" "}
                                    {p.body}
                                </p>
                            ))}
                        </Fold>
                    </>
                ) : (
                    <div className="flex flex-wrap items-center gap-3">
                        <h2
                            id="social-title"
                            className="m-0 font-display text-mk-kit-h3 font-bold"
                        >
                            {k.notYetTitle}
                        </h2>
                        <Claim on={false} notYet={k.notYet}>
                            {null}
                        </Claim>
                    </div>
                )}
            </Container>

            <ReachSteps
                data={inTheApp}
                picture={(step) => {
                    const shot = site.shot(step.shot, step.alt);
                    return shot ? <PanelShot shot={shot} /> : null;
                }}
            />

            <Tail
                line={w.tail.plan}
                compare={
                    site.open
                        ? { label: w.tail.compare, href: "/pricing" }
                        : null
                }
            />

            <Questions items={w.faq} ask={w.askUs} />

            <ClosingCTA
                title={w.close.title}
                visual={
                    lead.look ? (
                        <ShareEverywhere
                            words={w.close.share}
                            business={{
                                name: lead.name,
                                site: lead.site,
                                look: lead.look,
                            }}
                        />
                    ) : undefined
                }
                primary={site.start(`feature-${slug}-close`)}
                note={w.close.note}
                className="mt-[72px] min-[760px]:mt-[120px]"
            />
            <StickyBar watch={HERO_CTA}>
                {site.start(`feature-${slug}-sticky`, "w-full")}
            </StickyBar>
        </div>
    );
}

/** One minute of the bun box's story: the time, the step, and its screen. */
function StoryRow({
    at,
    title,
    body,
    children,
}: {
    at: string;
    title: string;
    body: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid gap-6 min-[1080px]:grid-cols-[360px_1fr] min-[1080px]:gap-14">
            <div>
                <StoryTime>
                    <TimeStamp at={at} />
                </StoryTime>
                <h3 className="m-0 mt-5 font-display text-mk-kit-h2 font-bold">
                    {title}
                </h3>
                <p className="m-0 mt-3.5 text-[16.5px] leading-normal text-mk-copy">
                    {body}
                </p>
            </div>
            {children}
        </div>
    );
}

function Visits({
    visits,
    example,
    small,
}: {
    visits: string;
    example: string;
    small?: boolean;
}) {
    return (
        <div
            className={cn(
                "mt-2 inline-flex items-center gap-1.5 font-semibold text-mk-ok",
                small ? "mt-1 text-[12.5px]" : "text-[14.5px]",
            )}
        >
            <Eye aria-hidden className={small ? "size-3.5" : "size-4"} />
            {visits}
            <span className="rounded bg-mk-hover px-1.5 text-[12px] font-medium text-mk-copy">
                {example}
            </span>
        </div>
    );
}

/** Saroh Social's week in the business Calendar: bookings, posts and good times. */
function SocialWeek({
    k,
    card,
    look,
}: {
    k: SocialWords["social"];
    card: SocialWords["cards"]["lead"];
    look: SocialWords["looks"]["lead"];
}) {
    const ROW = 58;
    return (
        <div
            role="img"
            aria-label={k.label}
            className={cn(
                PANEL,
                "mt-6 grid overflow-hidden min-[760px]:mt-12 min-[1080px]:grid-cols-[1fr_380px]",
            )}
        >
            <div className="hidden min-[1080px]:block">
                <div className="flex items-center gap-4 border-b border-mk-line-row px-5 py-[18px]">
                    <h4 className="m-0 font-display text-[24px] font-bold tracking-[-0.025em]">
                        {k.week}
                    </h4>
                    <Seg items={k.views} on={1} />
                    <span className="ml-auto flex items-center gap-3.5 text-[13px] text-mk-copy">
                        <span className="inline-flex items-center gap-1.5">
                            <i className="inline-block size-2.5 rounded-sm bg-[#7B3F75]" />
                            {k.legend[0]}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <u className="inline-block w-[18px] border-t-[1.5px] border-dashed border-border-strong" />
                            {k.legend[1]}
                        </span>
                    </span>
                </div>
                <div className="grid grid-cols-[56px_repeat(7,1fr)]">
                    <div />
                    {k.days.map(([d, n], i) => (
                        <div
                            key={d}
                            className={cn(
                                "border-b border-l border-border px-2 pb-2 pt-2.5 text-[12.5px] text-mk-copy",
                                i === 0 &&
                                    "shadow-[inset_0_2px_0_hsl(var(--mk-warn))]",
                            )}
                        >
                            <b
                                className={cn(
                                    "text-[12px] font-semibold tracking-[0.06em]",
                                    i === 0 && "text-mk-warn",
                                )}
                            >
                                {d}
                            </b>
                            <span className="ml-1 text-[17px] font-semibold text-foreground">
                                {n}
                            </span>
                            <em className="mt-1 block text-[12.5px] font-semibold not-italic text-foreground">
                                {k.addPost}
                            </em>
                        </div>
                    ))}
                    <div>
                        {k.hours.map((h) => (
                            <div
                                key={h}
                                className="h-[58px] border-b border-mk-line-row pr-2 pt-1 text-right text-[12px] text-muted-foreground"
                            >
                                {h}
                            </div>
                        ))}
                    </div>
                    {k.days.map(([d], day) => (
                        <div
                            key={d}
                            className="relative border-l border-mk-line-row"
                        >
                            {k.hours.map((h) => (
                                <div
                                    key={h}
                                    className="h-[58px] border-b border-mk-line-row"
                                />
                            ))}
                            {k.goodDays.includes(day) ? (
                                <div
                                    className="absolute inset-x-0 border-t-[1.5px] border-dashed border-border-strong"
                                    style={{ top: ROW * 4 + 30 }}
                                >
                                    <span className="absolute -top-[17px] right-1 bg-card px-0.5 text-[12px] font-semibold text-[#7B3F75]">
                                        {k.goodTime}
                                    </span>
                                </div>
                            ) : null}
                            {k.events
                                .filter((e) => e.day === day)
                                .map((e) => (
                                    <div
                                        key={e.name + e.time}
                                        className="absolute inset-x-1 overflow-hidden whitespace-nowrap rounded-[7px] border border-l-[3px] border-border border-l-[#8A4B1F] bg-card px-[7px] py-[5px] text-[12px] leading-tight text-mk-copy"
                                        style={{
                                            top: e.at * ROW + 8,
                                            height: 46,
                                        }}
                                    >
                                        <b className="block truncate text-[12.5px] font-semibold text-foreground">
                                            {e.name}
                                        </b>
                                        {e.time}
                                    </div>
                                ))}
                            {k.posts
                                .filter((p) => p.day === day)
                                .map((p) => (
                                    <div
                                        key={p.kind}
                                        className={cn(
                                            "absolute inset-x-1 z-[2] flex h-11 items-center gap-1.5 rounded-[7px] border border-l-[3px] border-border border-l-[#7B3F75] bg-card px-1.5",
                                            p.on && "ring-2 ring-foreground",
                                        )}
                                        style={{ top: ROW * 4 + 26 }}
                                    >
                                        <ItemCard
                                            set={card}
                                            look={look}
                                            kind={p.kind}
                                            photo="buns"
                                            className="w-[22px] shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <b className="block text-[12.5px] font-semibold leading-tight">
                                                {k.postShort}
                                            </b>
                                            <small className="block whitespace-nowrap text-[12px] text-mk-copy">
                                                {k.postAt}
                                            </small>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ))}
                </div>
            </div>
            <div className="bg-card px-[22px] pb-6 pt-[22px] min-[1080px]:border-l min-[1080px]:border-border">
                <h4 className="m-0 font-display text-[24px] font-bold tracking-[-0.025em]">
                    {k.panel.day}
                </h4>
                <div className="text-[14px] text-muted-foreground">
                    {k.panel.meta}
                </div>
                <div className="mt-5 flex items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.04em] text-mk-copy">
                    <i
                        aria-hidden
                        className="block size-2 rounded-sm bg-[#7B3F75]"
                    />
                    {k.panel.posts}
                </div>
                <div className="mt-3 flex gap-3.5">
                    <ItemCard
                        set={card}
                        look={look}
                        kind="price"
                        photo="buns"
                        className="w-[76px] shrink-0"
                    />
                    <div>
                        <b className="block text-[16px] font-semibold">
                            {card.name}
                        </b>
                        <small className="block text-[13.5px] leading-snug text-mk-copy">
                            {k.panel.when}
                        </small>
                        <small className="block text-[13.5px] leading-snug text-mk-copy">
                            {k.panel.where}
                        </small>
                    </div>
                </div>
                <div className="mt-3 flex gap-2">
                    <span className="inline-flex h-10 items-center rounded-[9px] border border-border bg-card px-3.5 text-[14px] font-semibold">
                        {k.panel.edit}
                    </span>
                    <span className="inline-flex h-10 items-center rounded-[9px] bg-foreground px-3.5 text-[14px] font-semibold text-background">
                        {k.panel.now}
                    </span>
                </div>
                <div className="mt-[18px] hidden h-11 items-center justify-center gap-2 rounded-[10px] border border-border text-[14px] font-semibold min-[760px]:flex">
                    <Plus aria-hidden className="size-4" />
                    {k.panel.schedule}
                </div>
                <div className="mt-[22px] hidden items-center gap-1.5 text-[12.5px] font-semibold tracking-[0.04em] text-mk-copy min-[760px]:flex">
                    <i
                        aria-hidden
                        className="block size-2 rounded-sm bg-[#8A4B1F]"
                    />
                    {k.panel.bookings}
                </div>
                <div className="hidden min-[760px]:block">
                    {k.panel.rows.map(([at, who, what]) => (
                        <Fragment key={at}>
                            <div className="mt-2 grid grid-cols-[76px_1fr] gap-2.5 border-t border-mk-line-row py-3 text-[14px]">
                                <span className="font-mono text-mk-copy">
                                    {at}
                                </span>
                                <div>
                                    <b className="block font-semibold">{who}</b>
                                    <small className="text-[13px] text-muted-foreground">
                                        {what}
                                    </small>
                                </div>
                            </div>
                        </Fragment>
                    ))}
                </div>
            </div>
        </div>
    );
}
