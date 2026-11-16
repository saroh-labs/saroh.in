import { Breadcrumbs } from "@saroh/marketing/breadcrumbs";
import { ButtonLink } from "@saroh/marketing/button";
import { Container } from "@saroh/marketing/container";
import { Chip, SourceChips } from "@saroh/marketing/kit/chip";
import { Claim } from "@saroh/marketing/kit/claim";
import { ClosingCTA } from "@saroh/marketing/kit/closing-cta";
import { CroppedCard } from "@saroh/marketing/kit/cropped-card";
import { DayScene } from "@saroh/marketing/kit/day-scene";
import { BrowserFrame, PhoneFrame } from "@saroh/marketing/kit/frames";
import { HourStrip } from "@saroh/marketing/kit/hour-strip";
import { MomentCard } from "@saroh/marketing/kit/moment-card";
import { MoneyPath } from "@saroh/marketing/kit/money-path";
import { PlanLine } from "@saroh/marketing/kit/plan-line";
import { SiteDrawing } from "@saroh/marketing/kit/site-drawing";
import { StickyBar } from "@saroh/marketing/kit/sticky-bar";
import { SunArc } from "@saroh/marketing/kit/sun-arc";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { hourAnchor } from "@saroh/marketing/kit/time";
import { TimeStamp } from "@saroh/marketing/kit/time-stamp";
import { TradeSwitcher } from "@saroh/marketing/kit/trade-switcher";
import { Mark } from "@saroh/marketing/mark";
import type { SectionTone } from "@saroh/marketing/section";
import { Section, TONE_BAND } from "@saroh/marketing/section";
import { SectionHeading } from "@saroh/marketing/section-heading";
import { TextLink } from "@saroh/marketing/text-link";
import {
    dayLink,
    exampleFor,
    tradeParam,
    WORLD_TRADES,
} from "@saroh/marketing/world";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SITE_FONTS } from "@/components/feature-pages/reach/site-fonts";
import { CtaLink } from "@/components/shared/buttons/cta-link";
import { RYE_MONDAY, WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";

/*
 * The kit sheet (DEC-221): every piece of the redesign's kit once, on the
 * India world, for the page agents and the owner. Only under `next dev`
 * (`page.dev.tsx`, next.config.js). Its sample words are the sheet's own,
 * never a page's.
 */
export const metadata: Metadata = {
    title: "Kit · Saroh",
    robots: { index: false, follow: false },
};

const rye = WORLD.lead;
const order = (id: string) => rye.orders?.find((o) => o.id === id);
const ryeLook = rye.look ?? WORLD.others[0].look ?? ({} as never);
const item = (key: string) => rye.items.find((i) => i.key === key);

function Piece({ name, children }: { name: string; children: ReactNode }) {
    return (
        <div className="grid gap-4 border-t border-border pt-6">
            <p className="m-0 font-mono text-[13px] text-muted-foreground">
                {name}
            </p>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

function OrderRows({ ids }: { ids: string[] }) {
    return (
        <ul className="m-0 list-none p-0">
            {ids.map((id) => {
                const o = order(id);
                if (!o) return null;
                return (
                    <li
                        key={id}
                        className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t border-border px-5 py-3 first:border-t-0"
                    >
                        <b className="text-[15px] font-semibold">
                            {o.customer}
                        </b>
                        <span className="text-right font-mono text-[14px]">
                            {o.total}
                        </span>
                        <span className="text-[13.5px] text-mk-copy">
                            {o.id} · {o.items}
                        </span>
                        <span className="text-right text-[13px] text-muted-foreground">
                            {o.pickup}
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}

export default async function KitSheet({
    searchParams,
}: {
    searchParams: Promise<{ trade?: string | string[]; frame?: string }>;
}) {
    const params = await searchParams;
    const trade = tradeParam(params.trade);
    const example = exampleFor(WORLD, trade);
    const framed = params.frame === "phone";
    const tones: SectionTone[] = [
        "paper",
        "white",
        "dawn",
        "noon",
        "afternoon",
        "dusk",
        "lamp",
    ];

    return (
        <div className={SITE_FONTS}>
            <Container className="grid gap-10 py-[72px]">
                <Breadcrumbs
                    crumbs={[
                        { name: "Dev", href: "/dev/kit" },
                        { name: "Kit" },
                    ]}
                />
                <SectionHeading
                    as="h1"
                    size="kit-h1"
                    title={
                        <>
                            Every <Mark>piece</Mark> of the kit, once.
                        </>
                    }
                    lead={`The redesign's components on the India world: ${rye.name}, ${WORLD.today}. Resize to 390 to see the phone, or open ?frame=phone.`}
                />
                <div className="flex flex-wrap items-center gap-4">
                    <span id="kit-hero-cta">
                        <CtaLink src="kit" size="kit" />
                    </span>
                    <ButtonLink href="/features" variant="secondary" size="kit">
                        See how it works
                    </ButtonLink>
                </div>
                <p className="m-0 -mt-6 text-[15px] text-muted-foreground">
                    Free to start. No card needed.
                </p>

                {framed ? null : (
                    <Piece name="The same sheet at 390px (iframe)">
                        <iframe
                            title="The kit at phone width"
                            src="/dev/kit?frame=phone"
                            className="h-[760px] w-[390px] max-w-full rounded-mk-card border border-border bg-background"
                        />
                    </Piece>
                )}

                <Piece name="SectionHeading kit-h2 · TextLink ink · Button kit">
                    <div className="grid gap-6">
                        <SectionHeading
                            size="kit-h2"
                            title="A website that looks like your shop, not like a template."
                            lead="Pick a template, add your menu or services, and go live at yourname.saroh.app."
                        />
                        <div className="flex flex-wrap gap-6">
                            <TextLink href="/features/website" tone="ink" arrow>
                                How the website builder works
                            </TextLink>
                            <TextLink href="#9am" tone="ink">
                                Follow Asha&apos;s day
                            </TextLink>
                        </div>
                        <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                            An h3, 20px on desk and phone
                        </h3>
                    </div>
                </Piece>

                <Piece name="Chip: filter · chapter · source (SourceChips) · plan · TimeStamp">
                    <div className="grid gap-4">
                        <div className="flex flex-wrap gap-2">
                            <Chip on count={34}>
                                All
                            </Chip>
                            <Chip count={7}>Food and shops</Chip>
                            <Chip count={7}>Beauty and wellness</Chip>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Chip variant="chapter" on href="#records">
                                Your records
                            </Chip>
                            <Chip variant="chapter" href="#reach">
                                Reaching customers
                            </Chip>
                            <Chip variant="chapter" href="#ask">
                                Asking and connecting
                            </Chip>
                        </div>
                        <SourceChips
                            sources={[
                                { name: "Orders", href: "/features/orders" },
                                {
                                    name: "Products",
                                    href: "/features/products",
                                    dot: "hsl(var(--mk-ok))",
                                },
                            ]}
                        />
                        <div className="flex flex-wrap gap-4">
                            <Chip variant="plan">Free</Chip>
                            <Chip variant="plan" on>
                                Grow
                            </Chip>
                            <Chip variant="plan">Pro</Chip>
                        </div>
                        <p className="m-0 flex gap-4 text-[15px]">
                            <TimeStamp at="09:14" />{" "}
                            <TimeStamp at="21:00" hour />{" "}
                            <TimeStamp at="16:06" />
                        </p>
                    </div>
                </Piece>

                <Piece name="TradeSwitcher (?trade=) · exampleFor">
                    <div className="grid gap-3">
                        <TradeSwitcher
                            legend="Show it for a"
                            value={example.trade}
                            options={WORLD_TRADES.map((t) => ({
                                id: t,
                                label: t[0].toUpperCase() + t.slice(1),
                                href: `/dev/kit?trade=${t}`,
                            }))}
                        />
                        <p className="m-0 text-[15px] text-mk-copy">
                            Example for this trade: {example.name},{" "}
                            {example.place}.
                        </p>
                    </div>
                </Piece>

                <Piece name="CroppedCard (folded content in a closed details)">
                    <CroppedCard
                        height={220}
                        more={{
                            label: "See the whole list",
                            content: (
                                <OrderRows
                                    ids={[
                                        "ORD-1041",
                                        "ORD-1043",
                                        "ORD-1046",
                                        "ORD-1047",
                                    ]}
                                />
                            ),
                        }}
                    >
                        <div className="flex items-center justify-between px-5 pb-2 pt-4">
                            <b className="font-display text-[22px]">Orders</b>
                            <span className="text-[14px] text-mk-copy">
                                5 open
                            </span>
                        </div>
                        <OrderRows
                            ids={[
                                "ORD-1045",
                                "ORD-1041",
                                "ORD-1047",
                                "ORD-1044",
                            ]}
                        />
                    </CroppedCard>
                </Piece>

                <Piece name="SwipeRow (1 of N on a phone, 3 columns on desk)">
                    <SwipeRow label="Example businesses" columns={4}>
                        {[WORLD.lead, ...WORLD.others].map((b) => (
                            <div
                                key={b.key}
                                className="grid h-full gap-2 rounded-mk-card border border-border bg-card p-5"
                            >
                                <b className="font-display text-mk-kit-h3">
                                    {b.name}
                                </b>
                                <span className="text-[15px] text-mk-copy">
                                    A {b.kind}, {b.place}
                                </span>
                                <span className="font-mono text-[13px] text-muted-foreground">
                                    {b.site}
                                </span>
                            </div>
                        ))}
                    </SwipeRow>
                </Piece>

                <Piece name="MomentCard · PlanLine · Claim">
                    <div className="grid gap-6">
                        <MomentCard
                            at="09:14"
                            line={`Phone on the flour bin, ${order("ORD-1045")?.customer} orders a black forest on WhatsApp.`}
                            link={{
                                label: "See 9 am at Rye & Co.",
                                href: dayLink(rye, { at: "09:00", line: "" }),
                            }}
                        />
                        <PlanLine
                            compare={{
                                label: "Compare plans",
                                href: "/pricing",
                            }}
                        >
                            Free to start.{" "}
                            <Claim on={claimOn("ask-ai-plans")}>
                                Ask AI on Grow and Pro.
                            </Claim>
                        </PlanLine>
                        <p className="m-0 flex flex-wrap items-center gap-3 text-[15px]">
                            Saroh Social posts for you:{" "}
                            <Claim on={false} notYet="Not available yet">
                                Posts and schedules for you
                            </Claim>
                        </p>
                    </div>
                </Piece>

                <Piece name="HourStrip">
                    <HourStrip
                        title="Her day, hour by hour"
                        current="#7am"
                        stops={(rye.day ?? []).map((h) => ({
                            at: h.at,
                            label: h.label,
                            line: h.line,
                            href: `#${h.anchor ?? hourAnchor(h.at)}`,
                            feature: h.feature
                                ? {
                                      label: h.feature,
                                      href: `/features/${h.feature}`,
                                  }
                                : undefined,
                        }))}
                    />
                </Piece>

                <Piece name="SunArc">
                    <div className="flex flex-wrap items-end gap-6">
                        {["07:00", "10:00", "13:00", "16:00", "18:00"].map(
                            (at) => (
                                <SunArc key={at} at={at} />
                            ),
                        )}
                        <span className="rounded-mk-crop bg-mk-lamp p-3">
                            <SunArc at="21:00" />
                        </span>
                    </div>
                </Piece>

                <Piece name="PhoneFrame · BrowserFrame (app)">
                    <div className="grid items-start gap-8 min-[1000px]:grid-cols-[400px_1fr]">
                        <PhoneFrame
                            label={`${rye.owner}'s Home at 7:02 am, an example`}
                            time="7:02"
                            width={360}
                        >
                            <div className="grid gap-1 px-6 pt-6">
                                <p className="m-0 font-display text-[24px] font-bold tracking-[-0.03em]">
                                    Good morning, {rye.owner}
                                </p>
                                <p className="m-0 text-[14px] text-muted-foreground">
                                    {rye.name} · Hill Road
                                </p>
                                <p className="m-0 mt-6 text-[14px] font-semibold">
                                    Needs you
                                </p>
                                <p className="m-0 rounded-mk-card bg-card p-4 text-[15px] font-semibold">
                                    3 cake orders to bake today
                                </p>
                            </div>
                        </PhoneFrame>
                        <BrowserFrame
                            label="The Orders list, an example"
                            address="app.saroh.in · Orders"
                        >
                            <OrderRows
                                ids={[
                                    "ORD-1045",
                                    "ORD-1041",
                                    "ORD-1047",
                                    "ORD-1044",
                                    "ORD-1046",
                                ]}
                            />
                        </BrowserFrame>
                    </div>
                </Piece>

                <Piece name="SiteDrawing (the merchant's own look) · desk and phone">
                    <div className="grid items-start gap-8 min-[1000px]:grid-cols-[1fr_320px]">
                        <SiteDrawing
                            label={`${rye.name}'s website, an example`}
                            look={ryeLook}
                            address={rye.site}
                            name={rye.name}
                            nav={["Shop", "Cakes", "Visit us"]}
                            cta="Order a cake"
                            hero={{
                                title: "Baked this morning on Hill Road",
                                line: "Cakes to order, breads and bun boxes for pick-up.",
                            }}
                            items={[
                                "bun-box",
                                "sourdough",
                                "rose-pistachio",
                            ].map((k) => ({
                                name: item(k)?.name ?? k,
                                price: `${item(k)?.price}${item(k)?.unit ? ` · ${item(k)?.unit}` : ""}`,
                            }))}
                        />
                        <SiteDrawing
                            phone
                            label={`${rye.name}'s website on a phone, an example`}
                            look={ryeLook}
                            address={rye.site}
                            name={rye.name}
                            nav={[]}
                            cta="Order"
                            hero={{
                                title: "Baked this morning",
                                line: "Pick up tomorrow, 8 am.",
                            }}
                            items={["bun-box", "sourdough"].map((k) => ({
                                name: item(k)?.name ?? k,
                                price: item(k)?.price ?? "",
                            }))}
                        />
                    </div>
                </Piece>

                <Piece name="MoneyPath">
                    <MoneyPath
                        label="How Anjali's ₹1,450 reaches Asha's bank, an example"
                        from={{
                            label: "Anjali's phone",
                            title: "₹1,450",
                            line: `Pays ${rye.name} by ${WORLD.money.method} from the pay link`,
                        }}
                        via={{
                            label: `Her own ${WORLD.money.provider} account`,
                            title: rye.name,
                            line: `Her merchant account. Or ${WORLD.money.otherProviders}.`,
                        }}
                        to={{
                            label: "Asha's bank",
                            title: "Current a/c",
                            line: `On ${WORLD.money.provider}'s usual settlement schedule`,
                        }}
                        wires={[WORLD.money.method, "Settled"]}
                        saroh={{
                            title: "Saroh",
                            line: "Sees the payment, marks ORD-1044 paid and writes its bill. It never holds the money.",
                        }}
                        status={
                            <span>
                                Paid · <TimeStamp at="16:06" />
                            </span>
                        }
                    />
                </Piece>
            </Container>

            <Section
                tone="white"
                titleId="kit-bands"
                title="Section bands"
                size="kit-h2"
                space="kit"
            >
                <div className="mt-8 grid grid-cols-2 gap-3 min-[760px]:grid-cols-7">
                    {tones.map((t) => (
                        <div
                            key={t}
                            className={`rounded-mk-crop border border-border p-4 text-[15px] font-semibold ${TONE_BAND[t]}`}
                        >
                            {t}
                        </div>
                    ))}
                </div>
            </Section>

            <DayScene
                at="09:00"
                title="A WhatsApp order, written in once."
                mood="The buns are proving. Her phone buzzes on the flour bin."
                lead={`${order("ORD-1045")?.customer} messages for a black forest cake for 4 pm. Asha writes it into Orders at 9:14 am.`}
                used={
                    <>
                        <Chip variant="chapter" href="/features/orders">
                            Orders · how it works
                        </Chip>
                    </>
                }
            >
                <BrowserFrame
                    label="The Orders list at 9:14 am, an example"
                    address="app.saroh.in · Orders"
                >
                    <OrderRows ids={["ORD-1045", "ORD-1041"]} />
                </BrowserFrame>
            </DayScene>
            <DayScene
                at="21:00"
                title="She asks what sold most this week."
                mood="Home, feet up, chai going cold."
                lead={`The ${item(RYE_MONDAY.topSeller.item)?.name.toLowerCase()}: ${RYE_MONDAY.topSeller.sold} sold, from Orders and Products.`}
            />

            <ClosingCTA
                title="Open tomorrow knowing what needs you."
                primary={<CtaLink src="kit-closing" size="kit" />}
                secondary={
                    <ButtonLink
                        href="/templates"
                        variant="secondary"
                        size="kit"
                    >
                        Browse templates
                    </ButtonLink>
                }
            />
            <StickyBar watch="kit-hero-cta">
                <CtaLink src="kit-sticky" size="kit" className="w-full" />
            </StickyBar>
        </div>
    );
}
