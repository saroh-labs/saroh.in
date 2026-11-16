import {
    Check,
    ChevronRight,
    ExternalLink,
    Eye,
    Info,
    Lock,
    X,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { ButtonLink } from "../buttons/button";
import { cn } from "../cn";
import { dayLink } from "../content/world";
import { ClosingCTA } from "../kit/closing-cta";
import { PhoneClip, PhoneFold } from "../kit/phone-fold";
import { StickyBar } from "../kit/sticky-bar";
import { SwipeRow } from "../kit/swipe-row";
import { TimeStamp } from "../kit/time-stamp";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { AppList } from "../sections/app-list";
import { Mark } from "../sections/mark";
import { Section } from "../sections/section";
import { SplitHero } from "../sections/split-hero";

import type { FeatureAppList } from "../content/types";
import type { World } from "../content/world";
import type { AiAppsWords } from "./ai-apps/words";
import { DraftPill, LivePill } from "./reach/app-card";
import { CropToggle } from "./reach/fold";
import type { InTheAppData } from "./reach/in-the-app";
import { InTheApp } from "./reach/in-the-app";
import { HERO_CTA } from "./reach/page-top";
import { Photo, photoFor } from "./reach/photo";
import { Questions } from "./reach/questions";
import { Tail } from "./reach/tail";
import type { PageSite } from "./site";

const SCENE = "pt-12 min-[760px]:pt-[120px]";
const PANEL = "overflow-hidden rounded-mk-card border border-border bg-card";

/** What the site resolves for this page (its `content/` and `lib/`). */
export interface AiAppsPageProps {
    site: PageSite;
    words: AiAppsWords;
    world: World;
    /** The level above: "Features", at /features. */
    crumb: { name: string; href: string };
    inTheApp: InTheAppData;
    /** "Apps you can use": the words and the site's AI app cards. */
    apps?: {
        words: FeatureAppList;
        list: ComponentProps<typeof AppList>["apps"];
    } | null;
    /** The site's page for developers; null where it has none (links none). */
    developersHref?: string | null;
}

/**
 * /features/ai-apps (boards FMDesk, FMPhone2): one Claude chat at closing
 * time, what lands in Saroh, Ask AI or AI apps, connecting in three moves,
 * what it can and can't do. Tool names are the MCP server's own, small in
 * the chat; the full list is for developers, not on this page (#41). A plan named beside AI apps waits
 * for `ai-apps-plans`.
 */
export function AiAppsView({
    site,
    words,
    world,
    crumb,
    inTheApp,
    apps,
    developersHref = "/developers",
}: AiAppsPageProps) {
    const slug = "ai-apps";
    const w = words;
    const lead = world.lead;
    const sixPm = lead.day?.find((h) => h.at === "18:00");
    const momentHref = sixPm ? dayLink(lead, sixPm) : null;
    const askAi = site.featureHref("ask-ai");
    const help = inTheApp.help;
    const chatgptHelp = help.find((h) => /chatgpt/i.test(h.href));
    const c = w.chat;

    return (
        <div>
            {/* Hero: the words beside the chat. */}
            <SplitHero
                id="page-title"
                crumbs={[crumb, { name: w.name }]}
                crumbsClassName="pt-6"
                layout="beside"
                title={
                    <>
                        {w.title.before}
                        <Mark>{w.title.mark}</Mark>
                    </>
                }
                titleClassName="max-w-[14ch]"
                lede={w.lede}
                note={
                    <p className="m-0 mt-4 text-[15px] text-mk-copy">
                        {w.apps}
                    </p>
                }
                primary={
                    <span id={HERO_CTA}>{site.start(`feature-${slug}`)}</span>
                }
                secondary={
                    <ButtonLink
                        href={`#${w.connect.id}`}
                        variant="secondary"
                        size="kit"
                        className="max-[759px]:hidden"
                    >
                        {w.secondary}
                    </ButtonLink>
                }
                foot={w.note}
                gridClassName="gap-10 min-[1080px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[1080px]:gap-16"
                picture={
                    <div className="min-w-0">
                        <CropToggle label={c.phoneMore} height={300}>
                            <Chat w={w} />
                        </CropToggle>
                        <p className="m-0 mt-3 text-[13.5px] text-muted-foreground">
                            {c.cap}{" "}
                            {momentHref ? (
                                <TextLink
                                    href={momentHref}
                                    tone="ink"
                                    arrow
                                    className="min-h-0 text-[14px]"
                                >
                                    {c.momentLink}
                                </TextLink>
                            ) : null}
                        </p>
                    </div>
                }
            />

            {/* Which should you use? */}
            <Container className="pt-12 min-[760px]:pt-16">
                <p className="m-0 rounded-mk-card border border-border bg-card px-5 py-5 text-[16px] leading-normal text-mk-copy shadow-[inset_3px_0_0_hsl(var(--brand-500))] min-[760px]:px-7 min-[760px]:text-[17px]">
                    <b className="text-foreground">{w.rule.bold}</b>{" "}
                    {w.rule.text}{" "}
                    {askAi ? (
                        <TextLink
                            href={askAi}
                            tone="ink"
                            arrow
                            className="min-h-0"
                        >
                            {w.rule.link}
                        </TextLink>
                    ) : null}
                </p>
            </Container>

            {/* What lands in Saroh. */}
            <Section
                titleId="land-title"
                title={w.land.title}
                lead={w.land.lead}
                size="kit-h2"
                className={SCENE}
            >
                <SwipeRow
                    label={w.land.title}
                    columns={2}
                    className="mt-10 min-[760px]:mt-12"
                >
                    <Landed
                        after={w.land.products.after}
                        when={w.land.products.when}
                    >
                        <div
                            role="img"
                            aria-label={w.land.products.label}
                            className={PANEL}
                        >
                            <Crumb parts={w.land.products.crumb} />
                            <div className="flex items-baseline gap-3 px-4 pt-3">
                                <h4 className="m-0 font-display text-[22px] font-bold">
                                    {w.land.products.title}
                                </h4>
                                <span className="text-[13.5px] text-muted-foreground">
                                    {w.land.products.count}
                                </span>
                            </div>
                            <div className="mt-3 text-[14px]">
                                <div className="grid grid-cols-[1fr_70px_70px] gap-2 border-y border-mk-line-row bg-mk-noon px-4 py-2 text-[12px] font-semibold tracking-[0.04em] text-muted-foreground">
                                    {w.land.products.head.map((x, i) => (
                                        <span
                                            key={x}
                                            className={cn(
                                                i === 2 && "text-right",
                                            )}
                                        >
                                            {x}
                                        </span>
                                    ))}
                                </div>
                                {w.land.products.rows.map((r) => (
                                    <div
                                        key={r.key}
                                        className={cn(
                                            "grid grid-cols-[1fr_70px_70px] items-center gap-2 border-t border-mk-line-row px-4 py-2.5 first-of-type:border-t-0",
                                            r.isNew && "bg-mk-tint",
                                        )}
                                    >
                                        <span className="flex min-w-0 items-center gap-2.5">
                                            <Photo
                                                kind={photoFor(r.key)}
                                                className="size-9 shrink-0 rounded-md"
                                            />
                                            <span className="min-w-0">
                                                <span className="block truncate">
                                                    {r.name}
                                                </span>
                                                <small className="block text-[12.5px] text-muted-foreground">
                                                    {w.land.products.where}
                                                </small>
                                            </span>
                                        </span>
                                        <span>
                                            {r.state === "Draft" ? (
                                                <DraftPill>{r.state}</DraftPill>
                                            ) : (
                                                <LivePill>{r.state}</LivePill>
                                            )}
                                        </span>
                                        <span className="text-right font-mono">
                                            {r.price}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <p className="m-0 border-t border-mk-line-row bg-mk-noon px-4 py-3 text-[13.5px] text-mk-copy">
                                {w.land.products.foot}
                            </p>
                        </div>
                    </Landed>
                    <Landed
                        after={w.land.request.after}
                        when={w.land.request.when}
                    >
                        <div
                            role="img"
                            aria-label={w.land.request.label}
                            className={PANEL}
                        >
                            <Crumb parts={w.land.request.crumb} />
                            <h4 className="m-0 px-4 pt-3 font-display text-[22px] font-bold">
                                {w.land.request.title}
                            </h4>
                            <dl className="m-0 grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 px-4 pt-3 text-[14px]">
                                {w.land.request.rows.map(([k, v, when]) => (
                                    <div key={k} className="contents">
                                        <dt className="text-muted-foreground">
                                            {k}
                                        </dt>
                                        <dd className="m-0">
                                            {v}{" "}
                                            {when ? (
                                                <span className="whitespace-nowrap text-muted-foreground">
                                                    {when}
                                                </span>
                                            ) : null}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                            <div className="mx-4 mt-3.5 rounded-xl border border-border bg-mk-noon px-3.5 py-2.5 text-[14px]">
                                <b className="block font-semibold">
                                    {w.land.request.live}
                                </b>
                                {w.land.request.liveWhat}
                            </div>
                            <span className="mx-4 mt-3 inline-flex h-10 items-center gap-2 rounded-[9px] border border-border-strong px-3.5 text-[14px] font-semibold">
                                <Eye aria-hidden className="size-4" />
                                {w.land.request.preview}
                            </span>
                            <p className="m-0 mx-4 mt-3 flex gap-2 rounded-xl bg-mk-tint px-3 py-2.5 text-[13.5px] text-foreground">
                                <Info
                                    aria-hidden
                                    className="mt-0.5 size-4 shrink-0"
                                />
                                {w.land.request.note}
                            </p>
                            <div className="flex justify-end gap-2 p-4">
                                <span className="inline-flex h-10 items-center rounded-[9px] border border-border-strong px-3.5 text-[14px] font-semibold">
                                    {w.land.request.buttons[0]}
                                </span>
                                <span className="inline-flex h-10 items-center rounded-[9px] bg-foreground px-3.5 text-[14px] font-semibold text-background">
                                    {w.land.request.buttons[1]}
                                </span>
                            </div>
                        </div>
                    </Landed>
                </SwipeRow>
                <PhoneFold
                    summary={w.land.arriveMore}
                    className="mt-6 min-[760px]:mt-10"
                >
                    <div className="grid gap-8 border-t border-border pt-7 min-[760px]:grid-cols-3">
                        {w.land.arrive.map((a) => (
                            <div key={a.title}>
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                    {a.title}
                                </h3>
                                <span className="mt-2 inline-block">
                                    {a.draft ? (
                                        <DraftPill>{a.how}</DraftPill>
                                    ) : (
                                        <LivePill>{a.how}</LivePill>
                                    )}
                                </span>
                                <p className="m-0 mt-2 text-[15.5px] leading-normal text-mk-copy">
                                    {a.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </PhoneFold>
            </Section>

            {/* Ask AI, or AI apps? */}
            <Section
                titleId="compare-title"
                title={w.compare.title}
                lead={w.compare.lead}
                size="kit-h2"
                className={SCENE}
            >
                <div className="mt-10 min-[760px]:mt-12">
                    <CropToggle label={w.compare.more} height={330}>
                        <div className="overflow-hidden rounded-mk-card border border-border bg-card">
                            <div className="hidden grid-cols-[180px_1fr_1fr] border-b border-border bg-mk-noon min-[760px]:grid">
                                <span />
                                {w.compare.cols.map((col) => (
                                    <span
                                        key={col.name}
                                        className="px-5 py-4 font-display text-mk-kit-h3 font-bold"
                                    >
                                        {col.name}
                                        <small className="block font-sans text-[13px] font-normal text-muted-foreground">
                                            {col.sub}
                                        </small>
                                    </span>
                                ))}
                            </div>
                            {w.compare.rows.map(([k, a, b]) => (
                                <div
                                    key={k}
                                    className="grid border-t border-mk-line-row text-[15px] first:border-t-0 min-[760px]:grid-cols-[180px_1fr_1fr]"
                                >
                                    <span className="px-5 pt-3.5 text-[13.5px] font-semibold text-muted-foreground min-[760px]:py-3.5">
                                        {k}
                                    </span>
                                    <span className="px-5 py-1.5 min-[760px]:py-3.5">
                                        <b className="mr-1.5 font-semibold min-[760px]:hidden">
                                            {w.compare.cols[0].name}:
                                        </b>
                                        {a}
                                    </span>
                                    <span className="px-5 pb-3.5 pt-1.5 leading-normal min-[760px]:py-3.5">
                                        <b className="mr-1.5 font-semibold min-[760px]:hidden">
                                            {w.compare.cols[1].name}:
                                        </b>
                                        {b}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CropToggle>
                </div>
            </Section>

            {/* Connected in three moves. */}
            <Section
                id={w.connect.id}
                titleId="connect-title"
                title={w.connect.title}
                lead={w.connect.lead}
                size="kit-h2"
                className={cn(SCENE, "scroll-mt-24")}
            >
                <SwipeRow
                    label={w.connect.title}
                    columns={3}
                    of={w.connect.of}
                    className="mt-10 min-[760px]:mt-12"
                >
                    {w.connect.moves.map((m, i) => (
                        <div
                            key={m.title}
                            className="grid h-full content-start gap-3"
                        >
                            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-mk-copy">
                                <i
                                    aria-hidden
                                    className={cn(
                                        "block size-2 rounded-full",
                                        m.claude
                                            ? "bg-brand-500"
                                            : "bg-foreground",
                                    )}
                                />
                                {m.where}
                            </div>
                            <div
                                role="img"
                                aria-label={m.label}
                                className={cn(PANEL, "min-h-[300px]")}
                            >
                                <div className="flex h-10 items-center gap-1.5 border-b border-mk-line-row bg-mk-noon px-3.5 text-[13px] text-mk-copy">
                                    {m.claude ? (
                                        <>
                                            {m.bar[0]}
                                            <ChevronRight
                                                aria-hidden
                                                className="size-3.5"
                                            />
                                            {m.bar[1]}
                                        </>
                                    ) : (
                                        <>
                                            <Lock
                                                aria-hidden
                                                className="size-3.5"
                                            />
                                            {w.connect.signIn.host}
                                        </>
                                    )}
                                </div>
                                <div className="grid gap-3 p-4">
                                    {i === 0 ? (
                                        <>
                                            <div className="text-[15px] font-semibold">
                                                {w.connect.form.title}
                                            </div>
                                            <Field
                                                label={w.connect.form.name[0]}
                                            >
                                                {w.connect.form.name[1]}
                                            </Field>
                                            <Field label={w.connect.form.addr}>
                                                <span className="truncate font-mono text-[13px]">
                                                    {w.connect.address}
                                                </span>
                                                <em className="ml-auto text-[12.5px] font-semibold not-italic">
                                                    {w.connect.form.copy}
                                                </em>
                                            </Field>
                                            <Block>{w.connect.form.add}</Block>
                                        </>
                                    ) : i === 1 ? (
                                        <>
                                            <span className="font-display text-[20px] font-bold tracking-[-0.04em]">
                                                Saroh
                                                <i className="ml-0.5 inline-block size-1.5 rounded-full bg-brand-500" />
                                            </span>
                                            <h5 className="m-0 text-[17px] font-semibold">
                                                {w.connect.signIn.title}
                                            </h5>
                                            <Field
                                                label={
                                                    w.connect.signIn.email[0]
                                                }
                                            >
                                                {w.connect.signIn.email[1]}
                                            </Field>
                                            <Block>{w.connect.signIn.go}</Block>
                                            <p className="m-0 text-[13px] text-muted-foreground">
                                                {w.connect.signIn.note}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <h5 className="m-0 text-[16px] font-semibold leading-snug">
                                                {w.connect.consent.title}
                                            </h5>
                                            <div className="grid gap-1.5 text-[14px]">
                                                <span className="flex items-center gap-2.5">
                                                    <span className="size-[18px] rounded border border-border-strong" />
                                                    {w.connect.consent.all}
                                                </span>
                                                <span className="flex items-center gap-2.5 font-semibold">
                                                    <span className="flex size-[18px] items-center justify-center rounded bg-foreground text-background">
                                                        <Check
                                                            aria-hidden
                                                            className="size-3"
                                                        />
                                                    </span>
                                                    {w.connect.consent.one}
                                                </span>
                                            </div>
                                            <div className="rounded-xl bg-mk-noon px-3 py-2.5 text-[13px]">
                                                <b className="font-semibold">
                                                    {w.connect.consent.able}
                                                </b>
                                                <ul className="m-0 mt-1 grid gap-1 pl-4">
                                                    {w.connect.consent.can.map(
                                                        (x) => (
                                                            <li key={x}>{x}</li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                            <Block>
                                                {w.connect.consent.allow}
                                            </Block>
                                        </>
                                    )}
                                </div>
                            </div>
                            <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {m.title}
                            </h3>
                            <p className="m-0 text-[15.5px] leading-normal text-mk-copy">
                                {m.body}
                            </p>
                            {m.link ? (
                                <TextLink
                                    href={m.link.href}
                                    tone="ink"
                                    className="text-[15px]"
                                >
                                    {m.link.label}
                                    <ExternalLink
                                        aria-hidden
                                        className="size-3.5"
                                    />
                                </TextLink>
                            ) : null}
                        </div>
                    ))}
                </SwipeRow>
                <p className="m-0 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-mk-card border border-border bg-card px-5 py-4 text-[15.5px] text-mk-copy">
                    <span>
                        <b className="text-foreground">
                            {w.connect.chatgpt.bold}
                        </b>{" "}
                        {w.connect.chatgpt.text}
                    </span>
                    {chatgptHelp ? (
                        <TextLink
                            href={chatgptHelp.href}
                            tone="ink"
                            arrow
                            className="text-[15px]"
                        >
                            {w.connect.chatgpt.link}
                        </TextLink>
                    ) : null}
                </p>
            </Section>

            {/* What your assistant can do. */}
            <Section
                titleId="can-title"
                title={w.can.title}
                lead={w.can.lead}
                size="kit-h2"
                className={SCENE}
            >
                <div className="mt-10 border-t border-border">
                    {w.can.groups.map((g, i) => {
                        const group = (
                            <div
                                key={g.title}
                                className="grid gap-3 border-b border-border py-6 min-[1080px]:grid-cols-[320px_1fr]"
                            >
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                    {g.title}
                                    <small className="mt-1 block font-sans text-[14px] font-normal text-muted-foreground">
                                        {g.sub}
                                    </small>
                                </h3>
                                <ul className="m-0 grid list-none gap-x-8 gap-y-2 p-0 text-[15.5px] min-[760px]:grid-cols-2">
                                    {g.items.map((x) => (
                                        <li key={x}>{x}</li>
                                    ))}
                                </ul>
                            </div>
                        );
                        return i === 0 ? group : null;
                    })}
                    {/* A phone: the first part shown, the others folded, all in the HTML. */}
                    <PhoneFold
                        summary={w.can.more}
                        className="max-[759px]:mt-2"
                    >
                        {w.can.groups.slice(1).map((g) => (
                            <div
                                key={g.title}
                                className="grid gap-3 border-b border-border py-6 min-[1080px]:grid-cols-[320px_1fr]"
                            >
                                <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                    {g.title}
                                    <small className="mt-1 block font-sans text-[14px] font-normal text-muted-foreground">
                                        {g.sub}
                                    </small>
                                </h3>
                                <ul className="m-0 grid list-none gap-x-8 gap-y-2 p-0 text-[15.5px] min-[760px]:grid-cols-2">
                                    {g.items.map((x) => (
                                        <li key={x}>{x}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </PhoneFold>
                </div>
                <p className="m-0 mt-6 max-w-[62ch] text-[15.5px] leading-normal text-mk-copy">
                    {w.can.honest}
                    {developersHref ? (
                        <>
                            {" "}
                            <TextLink
                                href={developersHref}
                                tone="ink"
                                arrow
                                className="min-h-0"
                            >
                                {w.can.all}
                            </TextLink>
                        </>
                    ) : null}
                </p>
            </Section>

            {/* What it can't do. */}
            <section
                aria-labelledby="cant-title"
                className="mt-12 bg-mk-hover min-[760px]:mt-[140px]"
            >
                <Container className="py-12 min-[760px]:pb-[110px] min-[760px]:pt-[120px]">
                    <h2
                        id="cant-title"
                        className="m-0 font-display text-mk-kit-h2 font-bold"
                    >
                        {w.cant.title}
                    </h2>
                    <p className="m-0 mt-4 max-w-[660px] text-mk-kit-lead text-mk-copy">
                        {w.cant.lead}
                    </p>
                    <div className="mt-10 grid gap-10 min-[1080px]:grid-cols-2 min-[1080px]:gap-16">
                        <div>
                            <b className="block text-[19px] font-semibold">
                                {w.cant.stays}
                            </b>
                            <ul className="m-0 mt-3 list-none p-0">
                                {w.cant.list.map((x) => (
                                    <li
                                        key={x}
                                        className="flex items-center gap-3 border-t border-border-strong/60 py-3 text-[16px]"
                                    >
                                        <X
                                            aria-hidden
                                            className="size-[18px] shrink-0 text-mk-warn"
                                        />
                                        {x}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <b className="block text-[19px] font-semibold">
                                {w.cant.record.title}
                            </b>
                            <p className="m-0 mt-2 text-[16px] leading-normal text-mk-copy">
                                {w.cant.record.body}
                            </p>
                            <PhoneClip height={150} label={w.cant.panel.more}>
                                <div
                                    role="img"
                                    aria-label={w.cant.panel.label}
                                    className={cn(PANEL, "mt-5 p-4")}
                                >
                                    <h5 className="m-0 text-[16px] font-semibold">
                                        {w.cant.panel.title}
                                    </h5>
                                    <div className="text-[13px] text-muted-foreground">
                                        {w.cant.panel.sub}
                                    </div>
                                    {w.cant.panel.rows.map(([x, t]) => (
                                        <div
                                            key={x}
                                            className="mt-2 flex justify-between gap-3 border-t border-mk-line-row pt-2 text-[14px]"
                                        >
                                            {x}
                                            <span className="shrink-0 font-mono text-[13px] text-muted-foreground">
                                                {t}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <span className="inline-flex h-10 items-center rounded-[9px] border border-border-strong px-3.5 text-[14px] font-semibold">
                                            {w.cant.panel.buttons[0]}
                                        </span>
                                        <span className="ml-auto inline-flex h-10 items-center rounded-[9px] border border-border-strong px-3.5 text-[14px] font-semibold text-mk-warn">
                                            {w.cant.panel.buttons[1]}
                                        </span>
                                    </div>
                                </div>
                            </PhoneClip>
                        </div>
                    </div>
                    <p className="m-0 mt-9 max-w-[62ch] text-[15.5px] leading-normal text-mk-copy">
                        {w.cant.foot}
                    </p>
                </Container>
            </section>

            {developersHref ? (
                <Container className="pt-14">
                    <p className="m-0 text-[17px] text-mk-copy">
                        {w.dev.lead}{" "}
                        <TextLink
                            href={developersHref}
                            tone="ink"
                            arrow
                            className="min-h-0"
                        >
                            {w.dev.link}
                        </TextLink>
                    </p>
                </Container>
            ) : null}

            <InTheApp {...inTheApp} site={site} words={w.inTheApp} />
            {apps ? <AppList words={apps.words} apps={apps.list} /> : null}

            <Tail
                line={w.plan.line}
                compare={{ label: w.plan.compare, href: "/pricing" }}
            />

            <Questions items={w.faq} ask={w.askUs} />

            <ClosingCTA
                title={w.close.title}
                primary={site.start(`feature-${slug}-close`)}
                secondary={
                    momentHref ? (
                        <ButtonLink
                            href={momentHref}
                            variant="secondary"
                            size="kit"
                        >
                            {c.momentLink}
                        </ButtonLink>
                    ) : null
                }
                className="pt-[96px] min-[760px]:pt-[150px]"
            />
            <StickyBar watch={HERO_CTA}>
                {site.start(`feature-${slug}-sticky`, "w-full")}
            </StickyBar>
        </div>
    );
}

/** The Claude chat (FM's hero): one ask, each step it took, small tool names, sized to the words beside it (#40). */
function Chat({ w }: { w: AiAppsWords }) {
    const c = w.chat;
    const step = (s: {
        did: string;
        what: string;
        tool: string;
        state: string;
    }) => (
        <div
            key={s.what}
            className="grid grid-cols-[18px_1fr_auto] items-start gap-2.5 border-t border-mk-line-row py-2 text-[13.5px] first:border-t-0"
        >
            <Check aria-hidden className="mt-0.5 size-4 text-mk-ok" />
            <span className="min-w-0">
                <b className="font-semibold">{s.did}</b>
                <span className="block text-mk-copy">
                    {s.what}{" "}
                    <code className="font-mono text-[12px] text-muted-foreground">
                        {s.tool}
                    </code>
                </span>
            </span>
            {s.state === "Draft" ? (
                <DraftPill>{s.state}</DraftPill>
            ) : (
                <span className="text-[12.5px] text-muted-foreground">
                    {s.state}
                </span>
            )}
        </div>
    );
    return (
        <div
            role="img"
            aria-label={c.label}
            className={cn(
                PANEL,
                "shadow-[0_24px_50px_-24px_rgba(40,30,15,0.3)]",
            )}
        >
            <div className="flex h-[52px] items-center gap-2.5 border-b border-mk-line-row px-4 text-[15px] font-semibold">
                <span className="inline-flex size-7 items-center justify-center rounded-lg bg-[#D97757] text-[13px] font-bold text-white">
                    C
                </span>
                {c.app}
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-mk-hover px-2.5 py-1 text-[12.5px] font-semibold">
                    <i
                        aria-hidden
                        className="block size-1.5 rounded-full bg-mk-ok"
                    />
                    {c.connected}
                </span>
            </div>
            <div className="grid gap-3 p-4 min-[760px]:p-5">
                <Time at={c.first.at} />
                <Bubble>{c.first.ask}</Bubble>
                <div className="rounded-xl border border-border px-3">
                    {c.first.steps.map(step)}
                </div>
                <p className="m-0 font-serif text-[15.5px] leading-normal">
                    {c.first.answer.map((part, i) =>
                        i % 2 === 1 ? (
                            <b key={i}>{part}</b>
                        ) : (
                            <span key={i}>{part}</span>
                        ),
                    )}
                </p>
                <span className="inline-flex w-fit items-center gap-2 rounded-[10px] border border-border-strong px-3 py-2 text-[14px] font-semibold">
                    <ExternalLink aria-hidden className="size-4" />
                    {c.first.link}
                </span>
            </div>
        </div>
    );
}

function Time({ at }: { at: string }) {
    return (
        <TimeStamp
            at={at}
            className="justify-self-end text-[12.5px] text-muted-foreground"
        />
    );
}

function Bubble({ children }: { children: ReactNode }) {
    return (
        <div className="max-w-[88%] justify-self-end rounded-xl bg-mk-hover px-3.5 py-2.5 text-[14.5px] leading-snug">
            {children}
        </div>
    );
}

function Crumb({ parts }: { parts: readonly string[] }) {
    return (
        <div className="flex h-10 items-center gap-1.5 border-b border-mk-line-row bg-mk-noon px-4 text-[13px] text-mk-copy">
            {parts[0]}
            <ChevronRight aria-hidden className="size-3.5" />
            <b className="font-semibold text-foreground">{parts[1]}</b>
        </div>
    );
}

function Landed({
    after,
    when,
    children,
}: {
    after: string;
    when: string;
    children: ReactNode;
}) {
    return (
        <div className="grid h-full content-start gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-mk-copy">
                <span className="rounded-md bg-mk-hover px-2 py-1 font-semibold text-foreground">
                    {after}
                </span>
                {when}
            </div>
            {children}
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <span className="block text-[12.5px] font-semibold text-mk-copy">
                {label}
            </span>
            <div className="mt-1 flex h-10 items-center gap-2 rounded-[9px] border border-border px-3 text-[14px]">
                {children}
            </div>
        </div>
    );
}

function Block({ children }: { children: ReactNode }) {
    return (
        <span className="flex h-10 items-center justify-center rounded-[9px] bg-foreground text-[14px] font-semibold text-background">
            {children}
        </span>
    );
}
