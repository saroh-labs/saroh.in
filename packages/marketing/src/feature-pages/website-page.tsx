import { AlertTriangle, FileText, Plus, Wallet } from "lucide-react";
import { cn } from "../cn";
import { Claim } from "../kit/claim";
import { ClosingCTA } from "../kit/closing-cta";
import { PhoneClip, PhoneFold } from "../kit/phone-fold";
import { StickyBar } from "../kit/sticky-bar";
import { TimeStamp } from "../kit/time-stamp";
import { Container } from "../layout/container";
import { TextLink } from "../links/text-link";
import { Section } from "../sections/section";

import type { FeatureTemplates } from "../content/types";
import type { World } from "../content/world";
import {
    AppCard,
    AppRow,
    FlowArrow,
    LivePill,
    TimeChip,
} from "./reach/app-card";
import { Fold } from "./reach/fold";
import type { InTheAppData } from "./reach/in-the-app";
import { InTheApp } from "./reach/in-the-app";
import { HERO_CTA, PageTop } from "./reach/page-top";
import { Photo, photoFor } from "./reach/photo";
import { Questions } from "./reach/questions";
import { pricingCompare, Tail } from "./reach/tail";
import type { PageSite } from "./site";
import { BrandStudio } from "./website/brand-studio";
import { Journey } from "./website/journey";
import { Looks } from "./website/looks";
import { lookStyle } from "./website/shop-site";
import type { WebsiteWords } from "./website/words";

const H3 = "m-0 font-display text-mk-kit-h3 font-bold";
const SCENE = "pt-12 min-[760px]:pt-[120px]";

/** What the site resolves for this page (its `content/` and `lib/`). */
export interface WebsitePageProps {
    site: PageSite;
    words: WebsiteWords;
    world: World;
    /** The level above: "Features", at /features. */
    crumb: { name: string; href: string };
    inTheApp: InTheAppData;
    /** The merchant fonts' class (`--font-site-*`), for the site drawings. */
    fonts: string;
    /** The templates section, only while the templates switch is on. */
    templates?: FeatureTemplates | null;
    /** The website template gallery, where the site has one; null links none. */
    templatesHref?: string | null;
}

/**
 * /features/website (boards FWDesk, FWPhone2): one responsive page. The
 * hero leads with one change (a price in Products, already on the site),
 * then the colourways over Rye & Co.'s own site, then what the site
 * reads, the address, then two Ink sections (board R2WebsiteOverdrive):
 * draft to live, with a test release and approval under their claim, and
 * the brand on every screen; then sections, sharing and asking for a change.
 * Products and the shop wait for the `site-shop` claim.
 */
export function WebsiteView({
    site,
    words,
    world,
    crumb,
    inTheApp,
    fonts,
    templates,
    templatesHref = "/templates",
}: WebsitePageProps) {
    const slug = "website";
    const shop = site.claimOn("site-shop");
    const testReleases = site.claimOn("site-test-releases");
    const w = words;
    const lead = world.lead;
    const look = lead.look;
    const tpl = templates;
    const aiApps = site.featureHref("ai-apps");
    const s = w.signature;
    const lookOptions = w.looks.options.flatMap((o) =>
        o.business.look
            ? [
                  {
                      label: o.label,
                      line: o.line,
                      look: o.business.look,
                      band: o.band,
                      caps: o.business.trade === "gym",
                  },
              ]
            : [],
    );

    return (
        <div className={fonts}>
            <PageTop
                crumb={crumb}
                words={w}
                start={site.start(`feature-${slug}`)}
                secondaryHref={`#${w.looks.id}`}
            >
                {/* The signature: one price, changed once, already on the site. */}
                <Claim on={shop}>
                    <div className="rounded-mk-card border border-border bg-card px-4 pb-5 pt-5 min-[760px]:px-8 min-[760px]:pb-[34px] min-[760px]:pt-[30px]">
                        <p className="m-0 mb-6 flex flex-wrap items-center gap-3.5 text-[16px] text-foreground min-[760px]:text-[18px]">
                            <TimeChip>{s.at}</TimeChip>
                            {s.line}
                        </p>
                        <div
                            role="img"
                            aria-label={s.label}
                            className="grid items-center min-[1080px]:grid-cols-[minmax(0,520px)_1fr_minmax(0,480px)]"
                        >
                            <AppCard
                                business={lead.name}
                                place={s.place}
                                page={s.page}
                            >
                                {s.rows.map((r, i) => (
                                    <AppRow
                                        key={r.key}
                                        highlight={i === 0}
                                        className={cn(
                                            "text-[16px] min-[760px]:px-[18px] min-[760px]:py-3.5",
                                            i > 0 && "max-[759px]:hidden",
                                        )}
                                        thumb={
                                            <Photo
                                                kind={photoFor(r.key)}
                                                className="size-11 shrink-0 rounded-[7px] max-[399px]:hidden"
                                            />
                                        }
                                        name={r.name}
                                        note={r.note}
                                        end={
                                            "to" in r ? (
                                                <span className="flex items-center gap-1.5 font-mono text-[14px] min-[400px]:gap-2.5 min-[400px]:text-[16px]">
                                                    <s className="text-muted-foreground">
                                                        {r.from}
                                                    </s>
                                                    <b className="rounded-md bg-mk-tint px-2 py-0.5 font-bold">
                                                        {r.to}
                                                    </b>
                                                </span>
                                            ) : (
                                                <span className="font-mono text-[14px]">
                                                    {r.price}
                                                </span>
                                            )
                                        }
                                    />
                                ))}
                            </AppCard>
                            <FlowArrow label={s.arrow} on="white" />
                            <div
                                style={look ? lookStyle(look) : undefined}
                                className="overflow-hidden rounded-xl shadow-[0_1px_2px_rgba(40,30,15,0.06),0_14px_30px_-16px_rgba(40,30,15,0.3)]"
                            >
                                <div className="grid grid-cols-[72px_1fr] items-center gap-3 bg-[hsl(var(--site-bg))] p-3.5 font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))] min-[400px]:grid-cols-[110px_1fr] min-[400px]:gap-[18px] min-[400px]:p-[18px] min-[760px]:grid-cols-[150px_1fr]">
                                    <Photo
                                        kind="buns"
                                        className="h-[72px] rounded-[var(--site-radius)] min-[400px]:h-[110px] min-[760px]:h-[150px]"
                                    />
                                    <div className="min-w-0">
                                        <span className="mb-2.5 block truncate font-mono text-[12px] text-[hsl(var(--site-muted))]">
                                            {s.shopUrl}
                                        </span>
                                        <b className="block font-[family-name:var(--site-font-heading)] text-[20px] font-semibold leading-[1.1] min-[760px]:text-[24px]">
                                            {s.shopItem.name}
                                        </b>
                                        <span className="text-[14px] text-[hsl(var(--site-muted))]">
                                            {s.shopItem.unit}
                                        </span>
                                        <em className="mt-3 flex flex-wrap items-center gap-2.5 text-[22px] font-bold not-italic">
                                            {s.shopItem.price}
                                            <i className="rounded-[3px] bg-[hsl(var(--site-accent))] px-2 py-[3px] text-[12px] font-bold not-italic text-[hsl(var(--site-accent-fg))]">
                                                {s.shopItem.badge}
                                            </i>
                                        </em>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <Fold
                        phone
                        label={s.phoneMore}
                        meta={s.phoneMoreMeta}
                        className="mt-4"
                    >
                        <ul>
                            {s.phoneList.map((li) => (
                                <li key={li}>{li}</li>
                            ))}
                        </ul>
                    </Fold>
                </Claim>
            </PageTop>

            {/* The colourways, over Rye & Co.'s own site (#31). */}
            <Container
                as="section"
                aria-labelledby="looks-title"
                className="pt-12 min-[760px]:pt-14"
            >
                <h2
                    id="looks-title"
                    className="m-0 mb-5 font-display text-mk-kit-h2 font-bold min-[760px]:sr-only"
                >
                    {w.looks.title}
                </h2>
                <Looks
                    id={w.looks.id}
                    label={w.looks.label}
                    group={w.looks.group}
                    note={w.looks.note}
                    frameLabel={w.looks.frame}
                    example={w.looks.example}
                    words={w.looks.site}
                    shop={shop}
                    options={lookOptions}
                />
                {tpl ? (
                    <>
                        <p className="m-0 mt-[22px] hidden flex-wrap items-center gap-x-5 text-[16px] text-mk-copy min-[760px]:flex">
                            {w.looks.templates}
                            {templatesHref ? (
                                <TextLink href={templatesHref} tone="ink" arrow>
                                    {tpl.linkLabel}
                                </TextLink>
                            ) : null}
                        </p>
                        {/* The templates section's words (rule 15), folded under the looks. */}
                        <Fold
                            label={tpl.title}
                            meta={w.looks.templatesMeta}
                            className="mt-4 max-w-[62ch]"
                        >
                            <p className="m-0 min-[760px]:hidden">
                                {w.looks.templates}
                            </p>
                            <p className="m-0 mt-2 min-[760px]:mt-0">
                                {tpl.lead}
                            </p>
                            <ul className="mt-3">
                                {tpl.points.map((pt) => (
                                    <li key={pt.title}>
                                        <b className="font-semibold text-foreground">
                                            {pt.title}.
                                        </b>{" "}
                                        {pt.body}
                                    </li>
                                ))}
                            </ul>
                            {templatesHref ? (
                                <TextLink
                                    href={templatesHref}
                                    tone="ink"
                                    arrow
                                    className="mt-2"
                                >
                                    {tpl.linkLabel}
                                </TextLink>
                            ) : null}
                        </Fold>
                    </>
                ) : null}
                <Claim on={shop}>
                    <p className="m-0 mt-6 text-[16px] leading-normal text-mk-copy min-[760px]:hidden">
                        {w.records.pay.before}
                        {w.records.pay.bold}
                        {w.records.pay.after}{" "}
                        <TextLink href="/features#money" tone="ink" arrow>
                            {w.records.pay.link}
                        </TextLink>
                    </p>
                </Claim>
            </Container>

            {/* What it reads from Saroh: desk draws the flows; the phone has them in the hero's fold. */}
            <Section
                titleId="records-title"
                title={w.records.title}
                lead={w.records.lead}
                size="kit-h2"
                className={cn(SCENE, "max-[759px]:hidden")}
            >
                <div className="mt-14 grid gap-7">
                    <Claim on={shop}>
                        <div className="grid items-center min-[1080px]:grid-cols-[470px_1fr_470px]">
                            <AppCard
                                business={lead.name}
                                place="Sell"
                                page="Products"
                            >
                                {w.records.products.map((p) => (
                                    <AppRow
                                        key={p.key}
                                        thumb={
                                            <Photo
                                                kind={photoFor(p.key)}
                                                className="size-9 shrink-0 rounded-[7px]"
                                            />
                                        }
                                        name={p.name}
                                        note={p.note}
                                        end={
                                            <>
                                                <LivePill>
                                                    {w.records.live}
                                                </LivePill>
                                                <span className="font-mono text-[14px]">
                                                    {p.price}
                                                </span>
                                            </>
                                        }
                                    />
                                ))}
                            </AppCard>
                            <FlowArrow label={w.records.arrows.shop} />
                            <div
                                style={look ? lookStyle(look) : undefined}
                                className="overflow-hidden rounded-xl bg-[hsl(var(--site-bg))] px-[18px] py-4 font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))] shadow-[0_14px_30px_-16px_rgba(40,30,15,0.3)]"
                            >
                                <div className="font-[family-name:var(--site-font-heading)] text-[20px] font-semibold">
                                    {w.looks.site.shopTitle}
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2.5">
                                    {w.records.products.map((p) => (
                                        <div
                                            key={p.key}
                                            className="overflow-hidden rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))]"
                                        >
                                            <Photo
                                                kind={photoFor(p.key)}
                                                className="h-[62px]"
                                            />
                                            <div className="px-2.5 py-2">
                                                <b className="block font-[family-name:var(--site-font-heading)] text-[14px] font-semibold leading-tight">
                                                    {p.name}
                                                </b>
                                                <em className="mt-1 block text-[13.5px] font-bold not-italic">
                                                    {p.price}
                                                </em>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </Claim>
                    <div className="grid items-center min-[1080px]:grid-cols-[470px_1fr_470px]">
                        <AppCard
                            business={lead.name}
                            place={w.records.classPlace}
                            page={w.looks.site.classTitle.split(" · ")[0]}
                        >
                            <AppRow
                                thumb={
                                    <Photo
                                        kind="class"
                                        className="size-9 shrink-0 rounded-[7px]"
                                    />
                                }
                                name={w.records.classRow.name}
                                note={w.records.classRow.note}
                                end={
                                    <span className="font-mono text-[14px]">
                                        {w.records.classRow.count}
                                    </span>
                                }
                            />
                        </AppCard>
                        <FlowArrow label={w.records.arrows.booking} />
                        <div
                            style={
                                look
                                    ? lookStyle(look, w.looks.options[0].band)
                                    : undefined
                            }
                            className="overflow-hidden rounded-xl bg-[hsl(var(--site-band))] px-[18px] py-4 font-[family-name:var(--site-font-body)] text-[hsl(var(--site-band-fg))] shadow-[0_14px_30px_-16px_rgba(40,30,15,0.3)]"
                        >
                            <div className="font-[family-name:var(--site-font-heading)] text-[20px] font-semibold">
                                {w.looks.site.classTitle}
                            </div>
                            <span className="mt-3 inline-flex h-[38px] items-center rounded-[var(--site-radius)] bg-[hsl(var(--site-band-fg))] px-3 text-[14px] font-bold text-[hsl(var(--site-band))]">
                                {w.looks.site.slot}
                            </span>
                            <p className="m-0 mt-2.5 text-[13.5px] opacity-90">
                                {w.records.classTail}
                            </p>
                        </div>
                    </div>
                    <div className="grid items-center min-[1080px]:grid-cols-[470px_1fr_470px]">
                        <AppCard
                            business={lead.name}
                            place={w.records.hoursPlace}
                            page={w.records.hoursPage}
                        >
                            {w.records.hours.map(([d, h]) => (
                                <AppRow
                                    key={d}
                                    name={d}
                                    end={
                                        <span className="font-mono text-[14px]">
                                            {h}
                                        </span>
                                    }
                                />
                            ))}
                        </AppCard>
                        <FlowArrow label={w.records.arrows.hours} />
                        <div
                            style={
                                look
                                    ? lookStyle(look, w.looks.options[0].band)
                                    : undefined
                            }
                            className="flex items-center justify-between gap-4 overflow-hidden rounded-xl bg-[hsl(var(--site-bg))] px-[18px] py-4 font-[family-name:var(--site-font-body)] text-[14.5px] text-[hsl(var(--site-fg))] shadow-[0_14px_30px_-16px_rgba(40,30,15,0.3)]"
                        >
                            <span>
                                <b className="block font-[family-name:var(--site-font-heading)] text-[18px] font-semibold">
                                    {w.records.visit}
                                </b>
                                {lead.place}
                            </span>
                            <span className="flex items-center gap-2">
                                <i
                                    aria-hidden
                                    className="block size-2 rounded-full bg-[hsl(var(--site-band))]"
                                />
                                {w.looks.site.open}
                            </span>
                        </div>
                    </div>
                </div>
                <Claim on={shop}>
                    <p className="m-0 mt-10 flex flex-wrap items-center gap-4 rounded-mk-card bg-mk-ledger px-[22px] py-[18px] text-[17px] text-mk-ledger-fg">
                        <span
                            aria-hidden
                            className="inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-white/10"
                        >
                            <Wallet className="size-5" />
                        </span>
                        <span>
                            {w.records.pay.before}
                            <b className="font-semibold">
                                {w.records.pay.bold}
                            </b>
                            {w.records.pay.after}
                        </span>
                        <TextLink
                            href="/features#money"
                            tone="on-ink"
                            arrow
                            className="ml-auto"
                        >
                            {w.records.pay.link}
                        </TextLink>
                    </p>
                </Claim>
            </Section>

            {/* Your address. */}
            <section
                aria-labelledby="address-title"
                className="mt-12 bg-mk-hover min-[760px]:mt-[120px]"
            >
                <Container className="py-[72px] min-[760px]:pb-[110px] min-[760px]:pt-[120px]">
                    <h2
                        id="address-title"
                        className="m-0 max-w-[22ch] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                    >
                        {w.address.title}
                    </h2>
                    <p className="m-0 mt-5 max-w-[660px] text-mk-kit-lead text-mk-copy">
                        {w.address.lead}
                    </p>
                    <div className="mt-10 grid items-start gap-7 min-[760px]:mt-[52px] min-[1080px]:grid-cols-2">
                        {[
                            {
                                ...w.address.web,
                                field: (
                                    <>
                                        {w.address.web.slug}
                                        <span className="text-muted-foreground">
                                            {w.address.web.host}
                                        </span>
                                    </>
                                ),
                                records: false,
                            },
                            {
                                ...w.address.own,
                                field: <>{w.address.own.domain}</>,
                                records: true,
                            },
                        ].map((card) => (
                            <div
                                key={card.title}
                                className="overflow-hidden rounded-mk-card border border-border bg-card"
                            >
                                <h3 className="m-0 px-5 pt-[18px] text-[17px] font-semibold">
                                    {card.title}
                                </h3>
                                <p className="m-0 px-5 pt-1 text-[14.5px] text-muted-foreground">
                                    {card.sub}
                                </p>
                                <div className="mx-5 mt-4 flex h-[54px] items-center gap-3 rounded-xl border border-border-strong px-3.5 font-mono text-[15px] font-medium min-[760px]:text-[17px]">
                                    <span className="min-w-0 truncate">
                                        {card.field}
                                    </span>
                                    <LivePill dot className="ml-auto font-sans">
                                        {w.address.live}
                                    </LivePill>
                                </div>
                                {card.records ? (
                                    <Fold
                                        label={w.address.records}
                                        meta={w.address.recordsMeta}
                                        className="mx-5 mt-3"
                                    >
                                        <div className="overflow-x-auto rounded-[10px] border border-border">
                                            <table className="w-full border-collapse text-left text-[14px]">
                                                <thead className="bg-mk-noon text-[12.5px] font-semibold text-muted-foreground">
                                                    <tr>
                                                        {w.address.head.map(
                                                            (h) => (
                                                                <th
                                                                    key={h}
                                                                    className={cn(
                                                                        "px-2 py-2.5 font-semibold min-[400px]:px-3",
                                                                        // Under 400px Status rides in the Value cell.
                                                                        h ===
                                                                            w
                                                                                .address
                                                                                .head[3] &&
                                                                            "max-[399px]:hidden",
                                                                    )}
                                                                >
                                                                    {h}
                                                                </th>
                                                            ),
                                                        )}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {w.address.rows.map(
                                                        ([
                                                            type,
                                                            name,
                                                            value,
                                                        ]) => (
                                                            <tr
                                                                key={type}
                                                                className="border-t border-mk-line-row"
                                                            >
                                                                <td className="px-2 py-2.5 font-mono text-[13.5px] min-[400px]:px-3">
                                                                    {type}
                                                                </td>
                                                                <td className="px-2 py-2.5 font-mono text-[13.5px] min-[400px]:px-3">
                                                                    {name}
                                                                </td>
                                                                <td className="px-2 py-2.5 text-muted-foreground [overflow-wrap:anywhere] min-[400px]:px-3">
                                                                    {value}
                                                                    {/* Status, here under 400px: four columns don't fit a 320 phone. */}
                                                                    <LivePill
                                                                        dot
                                                                        className="mt-1.5 flex w-fit min-[400px]:hidden"
                                                                    >
                                                                        {
                                                                            w
                                                                                .address
                                                                                .found
                                                                        }
                                                                    </LivePill>
                                                                </td>
                                                                <td className="px-2 py-2.5 max-[399px]:hidden min-[400px]:px-3">
                                                                    <LivePill
                                                                        dot
                                                                    >
                                                                        {
                                                                            w
                                                                                .address
                                                                                .found
                                                                        }
                                                                    </LivePill>
                                                                </td>
                                                            </tr>
                                                        ),
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </Fold>
                                ) : null}
                                <p className="m-0 mt-4 border-t border-mk-line-row bg-mk-noon px-5 py-3.5 text-[14px] leading-snug text-mk-copy">
                                    {card.foot}
                                </p>
                            </div>
                        ))}
                    </div>
                </Container>
            </section>

            {/* Nothing goes live until it's right (#33): draft, test address, approved, live. */}
            <Journey
                words={w.journey}
                stages={
                    testReleases
                        ? [
                              w.journey.draft,
                              ...w.journey.release,
                              w.journey.live,
                          ]
                        : [
                              {
                                  ...w.journey.draft,
                                  actions: [w.journey.publish.action],
                              },
                              w.journey.publish.live,
                          ]
                }
                site={w.looks.site}
                shop={shop}
                look={look}
            />

            {/* Your brand, every screen (#35, #36). */}
            <BrandStudio
                words={w.studio}
                options={lookOptions}
                site={w.looks.site}
                shop={shop}
            />

            {/* Pages, built from sections. */}
            <Section
                titleId="sections-title"
                title={w.sections.title}
                lead={w.sections.lead}
                size="kit-h2"
                className={SCENE}
            >
                <div className="mt-10 grid items-start gap-8 min-[760px]:mt-[52px] min-[1080px]:grid-cols-[360px_1fr] min-[1080px]:gap-14">
                    <div className="overflow-hidden rounded-mk-card border border-border bg-card">
                        {w.sections.pages.map(([n, path]) => (
                            <div
                                key={n}
                                className="flex h-[52px] items-center gap-3 border-t border-mk-line-row px-[18px] text-[15px] first:border-t-0"
                            >
                                <FileText
                                    aria-hidden
                                    className="size-[18px] text-muted-foreground"
                                />
                                {n}
                                <span className="ml-auto font-mono text-[13px] text-muted-foreground">
                                    {path}
                                </span>
                            </div>
                        ))}
                        <div className="flex h-[52px] items-center gap-2 border-t border-mk-line-row bg-mk-noon px-[18px] text-[14.5px] font-semibold">
                            <Plus aria-hidden className="size-4" />
                            {w.sections.addPage}
                        </div>
                    </div>
                    <PhoneFold summary={w.sections.more}>
                        <div className="grid gap-7 pt-1.5">
                            {[w.sections.read, w.sections.fill].map((b) => (
                                <div key={b.title}>
                                    <h3 className={H3}>{b.title}</h3>
                                    <p className="m-0 mt-2 text-[16px] leading-normal text-mk-copy min-[760px]:text-[17px]">
                                        {b.body}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </PhoneFold>
                </div>
            </Section>

            {/* Looks right when it's shared. */}
            <Section
                titleId="shared-title"
                title={w.shared.title}
                lead={w.shared.lead}
                size="kit-h2"
                className={SCENE}
            >
                <div className="mt-10 grid items-start gap-10 min-[760px]:mt-[52px] min-[1080px]:grid-cols-[420px_1fr] min-[1080px]:gap-16">
                    <PhoneClip height={260} label={w.shared.more}>
                        <div
                            role="img"
                            aria-label={w.shared.chatLabel}
                            className="rounded-[18px] bg-mk-afternoon p-[22px]"
                        >
                            <div className="mb-2.5 text-[13px] font-semibold text-mk-copy">
                                {w.shared.who}
                            </div>
                            <div className="max-w-[330px] rounded-[12px_12px_12px_4px] bg-card p-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.08)]">
                                <div className="overflow-hidden rounded-lg bg-mk-noon">
                                    <Photo kind="buns" className="h-[150px]" />
                                    <div className="px-[11px] py-[9px]">
                                        <b className="block text-[14.5px]">
                                            {w.shared.card.title}
                                        </b>
                                        <span className="mt-0.5 block text-[13px] leading-snug text-mk-copy">
                                            {w.shared.card.line}
                                        </span>
                                        <em className="mt-1 block text-[12.5px] not-italic text-muted-foreground">
                                            {w.shared.card.url}
                                        </em>
                                    </div>
                                </div>
                                <div className="px-1.5 pb-0.5 pt-2 text-[14.5px]">
                                    {w.shared.message}
                                </div>
                                <div className="px-1.5 pb-0.5 text-right font-mono text-[12px] text-muted-foreground">
                                    {w.shared.time}
                                </div>
                            </div>
                        </div>
                    </PhoneClip>
                    <div className="hidden overflow-hidden rounded-mk-card border border-border bg-card pb-2 min-[760px]:block">
                        <h3 className="m-0 flex justify-between border-b border-mk-line-row px-5 py-4 text-[16px] font-semibold">
                            {w.shared.panel}
                            <span className="text-[14px] font-normal text-muted-foreground">
                                {w.shared.panelPage}
                            </span>
                        </h3>
                        {w.shared.fields.map(([label, value]) => (
                            <div key={label} className="px-5 pt-3">
                                <span className="block text-[13px] font-semibold text-mk-copy">
                                    {label}
                                </span>
                                <div className="mt-1.5 flex min-h-[42px] items-center rounded-[9px] border border-border px-3 py-2 text-[15px] leading-snug">
                                    {value}
                                </div>
                            </div>
                        ))}
                        <div className="flex items-center gap-3.5 px-5 pt-3.5">
                            <Photo
                                kind="buns"
                                className="h-[63px] w-[120px] shrink-0 rounded-[7px]"
                            />
                            <div>
                                <b className="text-[14.5px]">
                                    {w.shared.picture}
                                </b>
                                <p className="m-0 mt-1 flex items-start gap-2 text-[14px] leading-snug text-mk-warn">
                                    <AlertTriangle
                                        aria-hidden
                                        className="mt-px size-[17px] shrink-0"
                                    />
                                    {w.shared.warn}
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2.5 border-t border-mk-line-row px-5 py-3 text-[14px]">
                            <span className="text-muted-foreground">
                                {w.shared.sitemap[0]}
                            </span>
                            <b className="truncate font-mono text-[13.5px] font-semibold">
                                {w.shared.sitemap[1]}
                            </b>
                        </div>
                        <div className="flex items-center justify-between gap-2.5 border-t border-mk-line-row px-5 py-3 text-[14px]">
                            <span className="text-muted-foreground">
                                {w.shared.google[0]}
                            </span>
                            <LivePill dot>{w.shared.google[1]}</LivePill>
                        </div>
                        <div className="flex items-center justify-between gap-2.5 border-t border-mk-line-row px-5 py-3 text-[14px]">
                            <span className="text-muted-foreground">
                                {w.shared.bing[0]}
                            </span>
                            <b className="font-medium text-muted-foreground">
                                {w.shared.bing[1]}
                            </b>
                        </div>
                    </div>
                </div>
                <Fold
                    phone
                    label={w.shared.phoneMore}
                    meta={w.shared.phoneMoreMeta}
                    className="mt-4"
                >
                    <ul>
                        {w.shared.fields.map(([label, value]) => (
                            <li key={label}>
                                {label}: {value}
                            </li>
                        ))}
                        <li>
                            {w.shared.picture}: {w.shared.warn}
                        </li>
                        <li>
                            {w.shared.sitemap[0]}: {w.shared.sitemap[1]}
                        </li>
                        <li>
                            {w.shared.google[0]}: {w.shared.google[1]}.{" "}
                            {w.shared.bing[0]}: {w.shared.bing[1]}.
                        </li>
                    </ul>
                </Fold>
            </Section>

            {/* Or ask for the change (AI apps). */}
            <Container
                as="section"
                aria-labelledby="ask-title"
                className={SCENE}
            >
                <div className="grid items-center gap-8 rounded-[20px] border border-border bg-card px-5 py-7 min-[760px]:px-10 min-[760px]:py-9 min-[1080px]:grid-cols-[360px_1fr] min-[1080px]:gap-14">
                    <div className="min-w-0">
                        <h2
                            id="ask-title"
                            className="m-0 font-display text-mk-kit-h2 font-bold"
                        >
                            {w.ask.title}
                        </h2>
                        <p className="m-0 mt-3.5 text-[16px] leading-normal text-mk-copy">
                            <TimeStamp at={w.ask.at} className="text-[15px]" />
                            {w.ask.body}
                        </p>
                        {aiApps ? (
                            <TextLink
                                href={aiApps}
                                tone="ink"
                                arrow
                                className="mt-2 text-[16px]"
                            >
                                {w.ask.link}
                            </TextLink>
                        ) : null}
                    </div>
                    <PhoneClip height={220} label={w.ask.more}>
                        <div
                            role="img"
                            aria-label={w.ask.label}
                            className="flex min-w-0 flex-col gap-3 rounded-mk-card border border-border bg-mk-noon p-[18px]"
                        >
                            <div className="flex items-center gap-2.5 text-[13.5px] text-muted-foreground">
                                <b className="font-semibold text-foreground">
                                    {w.ask.app}
                                </b>
                                {w.ask.connected}
                            </div>
                            <div className="max-w-[88%] self-end rounded-xl bg-mk-hover px-3 py-[9px] text-[14px] leading-snug">
                                {w.ask.ask}
                            </div>
                            <p className="m-0 font-serif text-[15px] leading-normal text-foreground">
                                {w.ask.answer}
                            </p>
                            <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-3.5 py-3">
                                <Photo
                                    kind="festive"
                                    className="h-11 w-16 shrink-0 rounded-md"
                                />
                                <span className="min-w-0 flex-1 text-[14.5px] leading-snug">
                                    {w.ask.draft}
                                    <small className="block truncate font-mono text-[12.5px] text-muted-foreground">
                                        {w.ask.draftUrl}
                                    </small>
                                </span>
                            </div>
                        </div>
                    </PhoneClip>
                </div>
            </Container>

            <InTheApp {...inTheApp} site={site} words={w.inTheApp} />

            <Tail
                line={w.tail.plan}
                compare={pricingCompare(site.open, w.tail.compare)}
            />

            <Questions items={w.faq} ask={w.ask_us} />

            <ClosingCTA
                title={w.close.title}
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
