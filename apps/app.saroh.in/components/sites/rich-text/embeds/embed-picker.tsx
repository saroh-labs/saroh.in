"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { TextLink } from "@saroh/ui/text-link";
import { ArrowLeft, ShoppingBag, Tag } from "lucide-react";

import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { ServicesLoadNotice } from "@/components/sites/selling-sections/services-load-notice";
import { useGridCatalogue } from "@/components/sites/selling-sections/use-grid-catalogue";
import { formatMoney } from "@/lib/format/money";

import type { EmbedKind } from "./insert-embed";

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
};

interface Option {
    id: string;
    name: string;
    price?: string;
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
    const Icon = kind === "service" ? Tag : ShoppingBag;
    return (
        <section aria-label={words.title} className="grid gap-2.5 p-3">
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
            {kind === "service" ? (
                <ServiceOptions choose={words.choose} onPick={onPick} />
            ) : (
                <ProductOptions choose={words.choose} onPick={onPick} />
            )}
        </section>
    );
}

function ServiceOptions({
    choose,
    onPick,
}: {
    choose: string;
    onPick: (id: string) => void;
}) {
    const load = useServicesForPicker();
    if (load.status !== "ready") return <ServicesLoadNotice load={load} />;
    const options = load.services
        .filter((s) => s.status === "ACTIVE")
        .map((s) => ({
            id: s.id,
            name: s.name,
            price:
                s.priceCents == null
                    ? undefined
                    : formatMoney(s.priceCents, s.currency ?? null),
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
    const options = load.products.filter((p) => p.status === "PUBLISHED");
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

function Options({
    label,
    options,
    onPick,
}: {
    label: string;
    options: Option[];
    onPick: (id: string) => void;
}) {
    return (
        <ul
            aria-label={label}
            className="grid max-h-64 gap-0.5 overflow-y-auto"
        >
            {options.map((o) => (
                <li key={o.id}>
                    <Button
                        type="button"
                        variant="ghost"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPick(o.id)}
                        className="h-auto min-h-9 w-full justify-start gap-2 rounded-[7px] px-2.5 text-left text-[0.8125rem] font-normal coarse:min-h-11"
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
    );
}
