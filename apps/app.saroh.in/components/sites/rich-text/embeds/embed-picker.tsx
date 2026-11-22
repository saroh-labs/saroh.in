"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import {
    ArrowLeft,
    BadgePercent,
    CalendarCheck,
    ShoppingBag,
    Tag,
} from "lucide-react";
import { useState } from "react";

import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { ServicesLoadNotice } from "@/components/sites/selling-sections/services-load-notice";
import { useGridCatalogue } from "@/components/sites/selling-sections/use-grid-catalogue";
import { formatDuration, POST_EMBED_CARD } from "@saroh/site-blocks";

import { servicePriceWords } from "@/lib/services/price-words";

import type { EmbedKind } from "./insert-embed";
import { useOffersForPicker } from "./use-offers";

/** The picker's words, by kind (`WXWInsert`'s preview pane). */
export const EMBED_WORDS: Record<
    EmbedKind,
    { title: string; about: string; choose: string }
> = {
    service: {
        title: "Service card",
        about: "Shows a service from your business with its live price and a Book now button. Change the price in Services and the post follows.",
        choose: "Choose a service",
    },
    product: {
        title: "Product",
        about: "Shows a product from your shop with its live price. Change it in Products and the post follows.",
        choose: "Choose a product",
    },
    book: {
        title: "Book now button",
        about: "A button that opens booking for one service. If the service stops being offered, the button goes too.",
        choose: "Choose a service",
    },
    offer: {
        title: "Offer",
        about: "Shows one of your discount codes while it runs: how much off, until when, and the code. Once it ends, the card goes.",
        choose: "Choose an offer",
    },
};

interface Option {
    id: string;
    name: string;
    price?: string;
    /** The preview card's second line ("3 hours · ₹18,000 · Book now"). */
    line?: string;
}

/**
 * Add › Service card or Product: which one. It adds the card where the
 * cursor was; the card stores only which one (`business-embed.ts`).
 */
export function EmbedPicker({
    kind,
    onPick,
    onBack,
}: {
    kind: EmbedKind;
    onPick: (id: string) => void;
    onBack?: () => void;
}) {
    const words = EMBED_WORDS[kind];
    const Icon =
        kind === "offer"
            ? BadgePercent
            : kind === "product"
              ? ShoppingBag
              : kind === "book"
                ? CalendarCheck
                : Tag;
    return (
        <section
            aria-label={words.title}
            className="grid min-w-0 gap-2.5 p-3 [&>*]:min-w-0"
        >
            <h3 className="flex items-center gap-2 text-sm font-semibold">
                {onBack ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="-ml-1 px-1"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={onBack}
                        aria-label="Back to everything you can add"
                    >
                        <ArrowLeft aria-hidden className="size-4" />
                    </Button>
                ) : null}
                <Icon aria-hidden className="size-4" />
                {words.title}
                <Badge variant="info" size="sm">
                    New
                </Badge>
            </h3>
            <p className="text-[0.8125rem] text-muted-foreground">
                {words.about}
            </p>
            {kind === "service" || kind === "book" ? (
                <ServiceOptions
                    choose={words.choose}
                    onPick={onPick}
                    book={kind === "book"}
                />
            ) : kind === "offer" ? (
                <OfferOptions choose={words.choose} onPick={onPick} />
            ) : (
                <ProductOptions choose={words.choose} onPick={onPick} />
            )}
        </section>
    );
}

function ServiceOptions({
    choose,
    onPick,
    book = false,
}: {
    choose: string;
    onPick: (id: string) => void;
    /** A Book now button: the preview is the button, not the card. */
    book?: boolean;
}) {
    const load = useServicesForPicker();
    if (load.status !== "ready") return <ServicesLoadNotice load={load} />;
    const options = load.services
        .filter((s) => s.status === "ACTIVE")
        .map((s) => ({
            id: s.id,
            name: s.name,
            // Every row says its price (W3.3), as Add a service does.
            price: servicePriceWords(s.priceCents, s.currency),
            line: book
                ? "Book now"
                : [
                      s.durationMinutes
                          ? formatDuration(s.durationMinutes)
                          : null,
                      s.priceCents == null
                          ? null
                          : servicePriceWords(s.priceCents, s.currency),
                      "Book now",
                  ]
                      .filter(Boolean)
                      .join(" · "),
        }));
    if (options.length === 0) {
        return (
            <EmptyState
                size="inline"
                title="No services yet"
                description="Add one in Services, then add its card here."
                action={<TextLink href="/services/new">New service</TextLink>}
            />
        );
    }
    return <Options label={choose} options={options} onPick={onPick} />;
}

function ProductOptions({
    choose,
    onPick,
}: {
    choose: string;
    onPick: (id: string) => void;
}) {
    const load = useGridCatalogue();
    if (load.status === "loading") {
        return (
            <p className="text-sm text-muted-foreground">
                Loading your products…
            </p>
        );
    }
    if (load.status === "failed") {
        return load.forbidden ? (
            <p className="text-sm text-muted-foreground">
                Your role can&apos;t see this business&apos;s products, so they
                can&apos;t be chosen here.
            </p>
        ) : (
            <div className="grid gap-2">
                <p className="text-sm text-muted-foreground">
                    We couldn&apos;t load your products.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={load.retry}
                >
                    Try again
                </Button>
            </div>
        );
    }
    const options = load.products
        .filter((p) => p.status === "PUBLISHED")
        .map((p) => ({ ...p, line: "Price and stock from Products" }));
    if (options.length === 0) {
        return (
            <EmptyState
                size="inline"
                title="No products yet"
                description="Publish one in Products, then add its card here."
                action={
                    <TextLink href="/commerce/products/new">
                        New product
                    </TextLink>
                }
            />
        );
    }
    return <Options label={choose} options={options} onPick={onPick} />;
}

function OfferOptions({
    choose,
    onPick,
}: {
    choose: string;
    onPick: (id: string) => void;
}) {
    const load = useOffersForPicker();
    if (load === "loading") {
        return (
            <p className="text-sm text-muted-foreground">
                Loading your offers…
            </p>
        );
    }
    if (load === null) {
        return (
            <p className="text-sm text-muted-foreground">
                We couldn&apos;t load your offers. Close this and try again.
            </p>
        );
    }
    if (load.length === 0) {
        return (
            <EmptyState
                size="inline"
                title="No offers running"
                description="Start a discount code, then add its card here."
                action={
                    <TextLink href="/commerce/discounts/new">
                        New discount code
                    </TextLink>
                }
            />
        );
    }
    return (
        <Options
            label={choose}
            options={load.map((o) => ({
                id: o.id,
                name: o.name,
                line: `${o.rule} · Shop now`,
            }))}
            onPick={onPick}
        />
    );
}

/**
 * The options, and the card the one under the pointer or the keyboard
 * adds (W3, `WXWInsert`): ↑ ↓ choose, Enter adds; Esc closes the menu.
 */
export function Options({
    label,
    options,
    onPick,
}: {
    label: string;
    options: Option[];
    onPick: (id: string) => void;
}) {
    const [at, setAt] = useState(0);
    const shown = options.at(Math.min(at, options.length - 1));
    const siteScope = useWritingScope();
    return (
        <div className="grid min-w-0 gap-2 [&>*]:min-w-0">
            <ul
                aria-label={label}
                // A bordered list with dividers (W3.2).
                className="grid max-h-64 divide-y overflow-y-auto rounded-lg border bg-card"
                onKeyDown={(e) => {
                    const move =
                        e.key === "ArrowDown"
                            ? 1
                            : e.key === "ArrowUp"
                              ? -1
                              : 0;
                    if (!move) return;
                    e.preventDefault();
                    const next = Math.max(
                        0,
                        Math.min(options.length - 1, at + move),
                    );
                    setAt(next);
                    const rows =
                        e.currentTarget.querySelectorAll<HTMLButtonElement>(
                            "button",
                        );
                    rows.item(next).focus();
                }}
            >
                {options.map((o, i) => (
                    <li key={o.id}>
                        <Button
                            data-ph-mask=""
                            type="button"
                            variant="ghost"
                            aria-current={i === at ? "true" : undefined}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setAt(i)}
                            onFocus={() => setAt(i)}
                            onClick={() => onPick(o.id)}
                            className={cn(
                                "h-auto min-h-10 w-full justify-start gap-2 rounded-none px-3 text-left text-[0.8125rem] font-normal coarse:min-h-11",
                                i === at && "bg-secondary font-semibold",
                            )}
                        >
                            <span
                                data-ph-mask=""
                                className="min-w-0 flex-1 truncate"
                            >
                                {o.name}
                            </span>
                            {o.price ? (
                                <em className="shrink-0 not-italic tabular-nums text-muted-foreground">
                                    {o.price}
                                </em>
                            ) : null}
                        </Button>
                    </li>
                ))}
            </ul>
            {shown?.line ? (
                // The card as the post will show it: the site's own type
                // and colours (W3.1), the live card's classes.
                <div
                    data-embed-preview=""
                    aria-hidden
                    className={siteScope?.className}
                    data-site-look={siteScope?.look}
                >
                    <div
                        className={cn(
                            POST_EMBED_CARD.card,
                            "my-0 font-site-body",
                        )}
                    >
                        <span className={POST_EMBED_CARD.tile} />
                        <span className="min-w-0 flex-1">
                            <b
                                data-ph-mask=""
                                className={cn(
                                    POST_EMBED_CARD.name,
                                    "block truncate",
                                )}
                            >
                                {shown.name}
                            </b>
                            <span className={cn(POST_EMBED_CARD.line, "block")}>
                                {shown.line}
                            </span>
                        </span>
                    </div>
                </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
                Enter to add · Esc to close
            </p>
        </div>
    );
}

/**
 * The post's site-look scope (`SiteThemeScope`'s class and look), read off
 * the writing surface: the menu is drawn outside it, in a popover.
 */
function useWritingScope(): { className: string; look?: string } | null {
    // Read once as it opens: the picker only ever opens in the browser.
    const [scope] = useState(() => {
        if (typeof document === "undefined") return null;
        const el = document
            .querySelector("[data-writing-surface]")
            ?.closest<HTMLElement>("[class^='site-theme-']");
        return el
            ? { className: el.className, look: el.dataset.siteLook }
            : null;
    });
    return scope;
}
