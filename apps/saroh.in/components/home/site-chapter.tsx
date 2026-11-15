import Link from "next/link";

import { home } from "@/content/home";
import { HOME_SITE_SHOWCASE } from "@/content/world";

import { Container } from "@saroh/marketing/container";
import { SiteDrawing } from "@saroh/marketing/kit/site-drawing";
import { SwipeRow } from "@saroh/marketing/kit/swipe-row";
import { ring } from "@saroh/marketing/ring";
import { TextLink } from "@saroh/marketing/text-link";
import { Tag } from "./tag";

/**
 * Chapter 1, "Your website" (`#online`): the website builder in a line and
 * the example sites, each in its own look (the old template gallery merged
 * in). On a phone the sites are a swipe row, the last card the templates
 * link while the gallery is published.
 */
export function SiteChapter({ templates }: { templates: boolean }) {
    const s = home.site;
    return (
        <Container
            as="section"
            id="online"
            aria-labelledby="online-title"
            className="scroll-mt-24 pt-12 min-[760px]:pt-20"
        >
            <div className="grid gap-4 min-[960px]:grid-cols-[minmax(0,1fr)_470px] min-[960px]:items-end min-[960px]:gap-12">
                <h2
                    id="online-title"
                    className="m-0 max-w-[700px] font-display text-mk-kit-h2 font-bold [text-wrap:balance]"
                >
                    {s.title}
                </h2>
                <div>
                    <p className="m-0 text-[16px] leading-normal text-mk-copy min-[760px]:text-mk-kit-lead">
                        <span className="max-[759px]:hidden">{s.lede}</span>
                        <span className="min-[760px]:hidden">{s.short}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-6 max-[759px]:hidden">
                        <TextLink href="/features/website" tone="ink" arrow>
                            {s.builder}
                        </TextLink>
                        {templates ? (
                            <TextLink href="/templates" tone="ink" arrow>
                                {s.templates}
                            </TextLink>
                        ) : null}
                    </div>
                </div>
            </div>
            <SwipeRow
                label={s.sites}
                columns={3}
                className="mt-6 min-[760px]:mt-10 min-[760px]:[&>ul>li:nth-child(4)]:hidden"
            >
                {HOME_SITE_SHOWCASE.map((x) => {
                    const b = x.business;
                    const caption = s.captions[b.key];
                    return (
                        <div key={b.key} className="grid gap-3">
                            {b.look ? (
                                <SiteDrawing
                                    phone
                                    look={b.look}
                                    address={x.address}
                                    name={b.name}
                                    nav={x.nav}
                                    cta={x.cta}
                                    hero={x.hero}
                                    items={x.items}
                                    label={`${b.name}'s website, an example`}
                                />
                            ) : null}
                            <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                <b className="text-[17px] font-semibold">
                                    {b.name}
                                </b>
                                <span className="flex items-center gap-2 text-[14px] text-muted-foreground">
                                    {b.domain ? (
                                        <Tag tone="ok">{s.live}</Tag>
                                    ) : null}
                                    {caption} · {s.example}
                                </span>
                            </p>
                        </div>
                    );
                })}
                {templates ? (
                    <Link
                        href="/templates"
                        className={`${ring()} flex h-full min-h-[200px] items-center justify-center rounded-mk-card border border-border bg-card text-[16px] font-semibold text-foreground underline decoration-border-strong underline-offset-[3px]`}
                    >
                        {s.templates} →
                    </Link>
                ) : null}
            </SwipeRow>
            <TextLink
                href="/features/website"
                tone="ink"
                arrow
                className="mt-1 min-[760px]:hidden"
            >
                {s.builder}
            </TextLink>
        </Container>
    );
}
