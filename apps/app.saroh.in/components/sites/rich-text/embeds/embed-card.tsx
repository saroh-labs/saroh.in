"use client";

import { formatDuration, POST_EMBED_CARD } from "@saroh/site-blocks";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import { Skeleton } from "@saroh/ui/skeleton";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { BadgePercent, ShoppingBag, Tag, X } from "lucide-react";

import { useServicesForPicker } from "@/components/sites/blocks/use-services-for-picker";
import { useGridCatalogue } from "@/components/sites/selling-sections/use-grid-catalogue";
import { formatMoney } from "@/lib/format/money";

import type { EmbedKind } from "./insert-embed";
import { useOffersForPicker } from "./use-offers";

/**
 * A card in the post as the writer sees it (`WXWInsert`'s preview): the
 * service's name over "time · price · Book now", read from Services now,
 * or the product's name. In the site's own look, as on the page. One
 * whose service or product is gone says it shows nothing on the site.
 */
export function EmbedCard({
    node,
    editor,
    selected,
    deleteNode,
}: NodeViewProps) {
    const kind = node.attrs.kind as EmbedKind;
    const id = node.attrs.id as string;
    if (kind === "book") {
        return (
            <NodeViewWrapper
                data-post-card="book"
                className={cn(
                    "not-prose my-6 flex items-center gap-3 font-site-body",
                    selected && "rounded-md ring-2 ring-ring ring-offset-2",
                )}
            >
                <span className={POST_EMBED_CARD.button}>Book now</span>
                <span className="min-w-0 flex-1 truncate font-sans text-sm text-site-muted">
                    <BookWords id={id} />
                </span>
                {editor.isEditable ? (
                    <IconButton
                        label="Take this button out"
                        icon={<X />}
                        onClick={deleteNode}
                        className="shrink-0 font-sans"
                    />
                ) : null}
            </NodeViewWrapper>
        );
    }
    return (
        <NodeViewWrapper
            data-post-card={kind}
            className={cn(
                POST_EMBED_CARD.card,
                "font-site-body",
                selected && "ring-2 ring-ring ring-offset-2",
            )}
        >
            <span aria-hidden className={POST_EMBED_CARD.tile}>
                {kind === "service" ? (
                    <Tag className="size-5" />
                ) : kind === "offer" ? (
                    <BadgePercent className="size-5" />
                ) : (
                    <ShoppingBag className="size-5" />
                )}
            </span>
            <span className="min-w-0 flex-1">
                {kind === "service" ? (
                    <ServiceWords id={id} />
                ) : kind === "offer" ? (
                    <OfferWords id={id} />
                ) : (
                    <ProductWords id={id} />
                )}
            </span>
            {editor.isEditable ? (
                <IconButton
                    label="Take this card out"
                    icon={<X />}
                    onClick={deleteNode}
                    className="shrink-0 font-sans"
                />
            ) : null}
        </NodeViewWrapper>
    );
}

function Words({ name, line }: { name: string; line: string }) {
    return (
        <>
            <b
                data-ph-mask=""
                className={cn(POST_EMBED_CARD.name, "block truncate")}
            >
                {name}
            </b>
            <span className={cn(POST_EMBED_CARD.line, "block")}>{line}</span>
        </>
    );
}

function Loading({ label }: { label: string }) {
    return (
        <span className="grid gap-1.5" aria-label={label}>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
        </span>
    );
}

// shortcut: each card reads its list on mount; a post holds a few cards. A
// shared cache is the upgrade if posts start carrying many.
function ServiceWords({ id }: { id: string }) {
    const load = useServicesForPicker();
    if (load.status === "loading")
        return <Loading label="Loading the service" />;
    if (load.status === "failed") {
        return (
            <Words
                name="Service card"
                line="Its name and price couldn't load here. The site still shows them."
            />
        );
    }
    const s = load.services.find((x) => x.id === id);
    if (s?.status !== "ACTIVE") {
        return (
            <Words
                name="Service card"
                line="This service is no longer offered, so the card shows nothing on the site."
            />
        );
    }
    const line = [
        s.durationMinutes ? formatDuration(s.durationMinutes) : null,
        s.priceCents == null
            ? null
            : formatMoney(s.priceCents, s.currency ?? null),
        "Book now",
    ]
        .filter(Boolean)
        .join(" · ");
    return <Words name={s.name} line={line} />;
}

function ProductWords({ id }: { id: string }) {
    const load = useGridCatalogue();
    if (load.status === "loading")
        return <Loading label="Loading the product" />;
    if (load.status === "failed") {
        return (
            <Words
                name="Product"
                line="Its name and price couldn't load here. The site still shows them."
            />
        );
    }
    const p = load.products.find((x) => x.id === id);
    if (p?.status !== "PUBLISHED") {
        return (
            <Words
                name="Product"
                line="This product isn't on sale, so the card shows nothing on the site."
            />
        );
    }
    return <Words name={p.name} line="Price and stock from Products" />;
}

/** "Opens booking for Trial session", or that it shows nothing. */
function BookWords({ id }: { id: string }) {
    const load = useServicesForPicker();
    if (load.status === "loading") return <>Loading the service…</>;
    if (load.status === "failed") return <>Opens booking for a service</>;
    const s = load.services.find((x) => x.id === id);
    return s?.status === "ACTIVE" ? (
        <span data-ph-mask="">Opens booking for {s.name}</span>
    ) : (
        <>This service is no longer offered, so the button shows nothing.</>
    );
}

function OfferWords({ id }: { id: string }) {
    const load = useOffersForPicker();
    if (load === "loading") return <Loading label="Loading the offer" />;
    if (load === null) {
        return (
            <Words
                name="Offer"
                line="Its words couldn't load here. The site still shows them."
            />
        );
    }
    const o = load.find((x) => x.id === id);
    if (!o) {
        return (
            <Words
                name="Offer"
                line="This offer has ended, so the card shows nothing on the site."
            />
        );
    }
    return <Words name={o.name} line={`${o.rule} · Shop now`} />;
}
