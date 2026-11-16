import type { CSSProperties } from "react";

import { cn } from "../cn";
import type { DrawnPhotoKind } from "./drawn-photo";
import { DrawnPhoto } from "./drawn-photo";
import { BrowserFrame } from "./frames";

/**
 * A merchant site's look, in the site renderer's own terms: each colour an
 * HSL channel triple as `--site-*` carries it ("33 50% 91%",
 * `@saroh/site-blocks`' site theme), and its own fonts. Never Saroh's brand:
 * a drawing of Rye & Co.'s site wears Rye & Co.'s look.
 */
export interface SiteLook {
    bg: string;
    surface: string;
    fg: string;
    muted: string;
    accent: string;
    accentFg: string;
    /** A CSS font-family the page has loaded (`var(--font-site-serif), serif`). */
    fontHeading: string;
    fontBody: string;
    headingWeight?: number;
    /** Corners, in px. */
    radius: number;
}

/** The look as `--site-*` custom properties, for a drawing's root. */
export function siteVars(look: SiteLook): CSSProperties {
    return {
        "--site-bg": look.bg,
        "--site-surface": look.surface,
        "--site-fg": look.fg,
        "--site-muted": look.muted,
        "--site-accent": look.accent,
        "--site-accent-fg": look.accentFg,
        "--site-font-heading": look.fontHeading,
        "--site-font-body": look.fontBody,
        "--site-heading-weight": String(look.headingWeight ?? 600),
        "--site-radius": `${look.radius}px`,
    } as CSSProperties;
}

export interface SiteItem {
    name: string;
    /** As the site shows it, currency and all: "₹360 · box of 6". */
    price: string;
    /** A real photo; without one, a block of the site's surface. */
    image?: { src: string; alt: string };
    /** Without a real photo: a drawn one (`kit/drawn-photo`), the world's. */
    drawn?: DrawnPhotoKind;
}

const HEAD =
    "font-[family-name:var(--site-font-heading)] [font-weight:var(--site-heading-weight)]";

/** A merchant's site as a drawing shows it: its look, address, name, menu and hero. */
export interface SiteFace {
    look: SiteLook;
    address: string;
    name: string;
    nav: readonly string[];
    cta: string;
    hero: { title: string; line: string };
}

/**
 * A merchant's site, drawn from its look (the landing's site section, the
 * 10 am scene, Website's signature): its address bar, name and menu, its
 * hero line and button, and a few things it sells. `phone` draws the
 * single column a phone shows. Every word and price is the world's.
 */
export function SiteDrawing({
    look,
    address,
    name,
    nav,
    cta,
    hero,
    items,
    phone = false,
    label,
    className,
}: SiteFace & {
    items: readonly SiteItem[];
    phone?: boolean;
    label: string;
    className?: string;
}) {
    return (
        <div style={siteVars(look)} className={className}>
            <BrowserFrame label={label} address={address} look="site">
                <div className="bg-[hsl(var(--site-bg))] font-[family-name:var(--site-font-body)] text-[hsl(var(--site-fg))]">
                    <div className="flex items-center gap-3 border-b border-[hsl(var(--site-fg)/0.12)] px-5 py-4 min-[760px]:px-7">
                        <span
                            className={cn(
                                HEAD,
                                "text-[20px] tracking-[-0.01em] min-[760px]:text-[22px]",
                            )}
                        >
                            {name}
                        </span>
                        {phone ? null : (
                            <span className="ml-auto hidden gap-5 text-[14px] text-[hsl(var(--site-muted))] min-[560px]:flex">
                                {nav.map((n) => (
                                    <span key={n}>{n}</span>
                                ))}
                            </span>
                        )}
                        <span
                            className={cn(
                                "inline-flex h-9 items-center rounded-[var(--site-radius)] bg-[hsl(var(--site-accent))] px-4 text-[14px] font-medium text-[hsl(var(--site-accent-fg))]",
                                phone ? "ml-auto" : "max-[559px]:ml-auto",
                            )}
                        >
                            {cta}
                        </span>
                    </div>
                    <div className="grid gap-2 px-5 pb-5 pt-6 min-[760px]:px-7">
                        <p
                            className={cn(
                                HEAD,
                                "m-0 text-[28px] leading-[1.05] tracking-[-0.02em]",
                                !phone && "min-[760px]:text-[40px]",
                            )}
                        >
                            {hero.title}
                        </p>
                        <p className="m-0 max-w-[48ch] text-[15px] leading-normal text-[hsl(var(--site-muted))]">
                            {hero.line}
                        </p>
                    </div>
                    <ul
                        className={cn(
                            "m-0 grid list-none gap-4 px-5 pb-6 pt-1 min-[760px]:px-7",
                            phone
                                ? "grid-cols-1"
                                : "grid-cols-2 min-[760px]:grid-cols-3",
                        )}
                    >
                        {items.map((item) => (
                            <li
                                key={item.name}
                                className={cn(
                                    "grid content-start gap-2",
                                    phone &&
                                        "grid-cols-[64px_1fr] items-center gap-3",
                                )}
                            >
                                {item.image ? (
                                    <img
                                        src={item.image.src}
                                        alt={item.image.alt}
                                        loading="lazy"
                                        className={cn(
                                            "w-full rounded-[var(--site-radius)] object-cover",
                                            phone
                                                ? "aspect-square"
                                                : "aspect-[4/3]",
                                        )}
                                    />
                                ) : item.drawn ? (
                                    <DrawnPhoto
                                        kind={item.drawn}
                                        className={cn(
                                            "w-full rounded-[var(--site-radius)]",
                                            phone
                                                ? "aspect-square"
                                                : "aspect-[4/3]",
                                        )}
                                    />
                                ) : (
                                    <span
                                        aria-hidden
                                        className={cn(
                                            "block rounded-[var(--site-radius)] bg-[hsl(var(--site-surface))]",
                                            phone
                                                ? "aspect-square"
                                                : "aspect-[4/3]",
                                        )}
                                    />
                                )}
                                <span className="grid gap-0.5">
                                    <span className={cn(HEAD, "text-[16px]")}>
                                        {item.name}
                                    </span>
                                    <span className="text-[13px] text-[hsl(var(--site-muted))]">
                                        {item.price}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </BrowserFrame>
        </div>
    );
}
