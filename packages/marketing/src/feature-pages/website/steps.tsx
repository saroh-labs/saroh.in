import { Laptop, Smartphone, Tablet } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../cn";
import type { SiteLook } from "../../kit/site-drawing";
import { Section } from "../../sections/section";

import { LivePill } from "../reach/app-card";
import type { ShopSiteWords } from "./shop-site";
import { lookStyle, MiniSite } from "./shop-site";
import type { StepWords, WebsiteWords } from "./words";

const SCENE = "pt-12 min-[760px]:pt-[120px]";
const CARD = "overflow-hidden rounded-mk-card border border-border bg-card";
const ROW =
    "flex items-center justify-between gap-3 border-t border-mk-line-row px-[18px] py-3 text-[14.5px]";

/**
 * One step of the Website page (#33, #35, #36): the page's `Section` with a
 * drawing beside the step's points, as "Pages, built from sections" lays out.
 */
function Step({
    id,
    words,
    picture,
}: {
    id: string;
    words: StepWords;
    picture: ReactNode;
}) {
    return (
        <Section
            titleId={`${id}-title`}
            title={words.title}
            lead={words.lead}
            size="kit-h2"
            className={SCENE}
        >
            <div className="mt-10 grid items-start gap-8 min-[760px]:mt-[52px] min-[1080px]:grid-cols-[1fr_360px] min-[1080px]:gap-14">
                <div role="img" aria-label={words.label} className="min-w-0">
                    {picture}
                </div>
                <div className="grid gap-7">
                    {words.points.map((p) => (
                        <div key={p.title}>
                            <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                                {p.title}
                            </h3>
                            <p className="m-0 mt-2 text-[16px] leading-normal text-mk-copy min-[760px]:text-[17px]">
                                {p.body}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </Section>
    );
}

/** A drawn button: Ink when it's the one to press. */
function Press({
    ink = false,
    children,
}: {
    ink?: boolean;
    children: ReactNode;
}) {
    return (
        <span
            className={cn(
                "inline-flex h-10 items-center rounded-[9px] px-3.5 text-[14px] font-semibold",
                ink
                    ? "bg-foreground text-background"
                    : "border border-border-strong bg-card",
            )}
        >
            {children}
        </span>
    );
}

/** #33: a test release on its own address, approved, then put live. */
export function TestReleaseStep({
    words: w,
}: {
    words: WebsiteWords["testRelease"];
}) {
    return (
        <Step
            id="test-release"
            words={w}
            picture={
                <div className={CARD}>
                    <h3 className="m-0 px-[18px] py-4 text-[16px] font-semibold">
                        {w.panel}
                    </h3>
                    <div className="border-t border-mk-line-row px-[18px] py-3.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <b className="text-[15.5px] font-semibold">
                                {w.name}
                            </b>
                            <span className="text-[13.5px] text-muted-foreground">
                                {w.number}
                            </span>
                        </div>
                        <div className="mt-2.5 flex h-[46px] items-center gap-3 rounded-xl border border-border-strong px-3.5 font-mono text-[14px] min-[760px]:text-[15px]">
                            <span className="min-w-0 truncate">
                                {w.address}
                            </span>
                            <span className="ml-auto shrink-0 rounded-full bg-mk-tint px-2.5 py-1 font-sans text-[12.5px] font-semibold text-brand-700">
                                {w.only}
                            </span>
                        </div>
                    </div>
                    <div className={ROW}>
                        <span className="text-mk-copy">{w.reviewer}</span>
                        <LivePill dot>{w.approved}</LivePill>
                    </div>
                    <div className="flex flex-wrap gap-2.5 border-t border-mk-line-row bg-mk-noon px-[18px] py-3.5">
                        <Press ink>{w.now}</Press>
                        <Press>{w.later}</Press>
                    </div>
                </div>
            }
        />
    );
}

/** #35: the editor's device switch, set to Phone, over the site at phone width. */
export function PreviewStep({
    words: w,
    site,
    shop,
    look,
}: {
    words: WebsiteWords["preview"];
    site: ShopSiteWords;
    shop: boolean;
    look?: SiteLook;
}) {
    const icons = [Laptop, Tablet, Smartphone];
    const on = w.devices.length - 1;
    return (
        <Step
            id="preview"
            words={w}
            picture={
                <div className={cn(CARD, "bg-mk-hover")}>
                    <div className="flex items-center gap-3 border-b border-mk-line-row bg-card px-3.5 py-2.5">
                        <span className="flex gap-1 rounded-xl bg-mk-hover p-1">
                            {w.devices.map((d, i) => {
                                const Icon = icons[i] ?? Laptop;
                                return (
                                    <span
                                        key={d}
                                        className={cn(
                                            "inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[14px] font-medium text-mk-copy",
                                            i === on &&
                                                "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(28,28,26,0.14)]",
                                        )}
                                    >
                                        <Icon aria-hidden className="size-4" />
                                        <span className="max-[459px]:sr-only">
                                            {d}
                                        </span>
                                    </span>
                                );
                            })}
                        </span>
                        <span className="ml-auto inline-flex h-9 items-center rounded-[9px] border border-border-strong bg-card px-3 text-[14px] font-semibold">
                            {w.zoom}
                        </span>
                    </div>
                    <div className="flex justify-center px-4 py-6">
                        <div
                            style={look ? lookStyle(look) : undefined}
                            className="w-[240px] overflow-hidden rounded-[22px] border-[6px] border-foreground shadow-[0_18px_40px_-24px_rgba(40,30,15,0.4)]"
                        >
                            <MiniSite words={site} shop={shop} />
                        </div>
                    </div>
                </div>
            }
        />
    );
}

/** #36: the look panel (theme, colours, typefaces, logo) beside the site it styles. */
export function BrandStep({
    words: w,
    site,
    shop,
    look,
}: {
    words: WebsiteWords["brand"];
    site: ShopSiteWords;
    shop: boolean;
    look?: SiteLook;
}) {
    const swatches = look ? [look.bg, look.surface, look.accent, look.fg] : [];
    return (
        <Step
            id="brand"
            words={w}
            picture={
                <div
                    style={look ? lookStyle(look) : undefined}
                    className="grid items-start gap-5 min-[760px]:grid-cols-[1fr_240px]"
                >
                    <div className={CARD}>
                        <h3 className="m-0 px-[18px] py-4 text-[16px] font-semibold">
                            {w.panel}
                        </h3>
                        <div className={ROW}>
                            <span className="text-muted-foreground">
                                {w.theme}
                            </span>
                            <b className="font-semibold">{w.themeValue}</b>
                        </div>
                        <div className={ROW}>
                            <span className="text-muted-foreground">
                                {w.colours}
                            </span>
                            <span className="flex gap-1.5">
                                {swatches.map((c) => (
                                    <i
                                        key={c}
                                        className="block size-6 rounded-full border border-border"
                                        style={{ background: `hsl(${c})` }}
                                    />
                                ))}
                            </span>
                        </div>
                        <div className={ROW}>
                            <span className="text-muted-foreground">
                                {w.typefaces}
                            </span>
                            <b className="font-[family-name:var(--site-font-heading)] text-[16px] font-semibold">
                                {w.typefacesValue}
                            </b>
                        </div>
                        <div className={ROW}>
                            <span className="text-muted-foreground">
                                {w.logo}
                            </span>
                            <span className="flex items-center gap-2.5">
                                <i className="flex size-8 items-center justify-center rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] font-[family-name:var(--site-font-heading)] text-[15px] font-bold not-italic text-[hsl(var(--site-accent-fg))]">
                                    {site.name.charAt(0)}
                                </i>
                                <b className="font-semibold">{site.name}</b>
                            </span>
                        </div>
                    </div>
                    <div className="hidden overflow-hidden rounded-xl shadow-[0_14px_30px_-16px_rgba(40,30,15,0.3)] min-[760px]:block">
                        <MiniSite words={site} shop={shop} />
                    </div>
                </div>
            }
        />
    );
}
