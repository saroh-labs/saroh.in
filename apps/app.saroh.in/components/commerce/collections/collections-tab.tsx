"use client";

import { Button } from "@saroh/ui/button";
import { Card } from "@saroh/ui/card";
import { Layers, Pencil } from "lucide-react";
import { useState } from "react";

import {
    PanelFailed,
    PanelForbidden,
    StateLink,
    TabState,
} from "@/components/commerce/product-page/panel-state";
import type { CategoryNode } from "@/lib/collections/rules";
import { collectionNote, whyIn } from "@/lib/collections/rules";
import type { CollectionSummary } from "@/lib/collections/service";
import type { ProductOverview } from "@/lib/products/overview";
import { websiteSummary } from "@/lib/products/overview-words";

import { CollectionSheet } from "./collection-sheet";
import { ProductCollectionsSheet } from "./product-collections-sheet";

const EDIT_BUTTON =
    "h-[26px] gap-[5px] rounded-[7px] px-[9px] text-[12px] coarse:h-11";

/**
 * The product's Collections tab (#524), after "Saroh Product Detail": the
 * collections it is in, each saying how many products it shows and why this
 * one is there — picked by hand, or "fills itself: everything in Breads"
 * with the product's own category when it sits inside — and the website
 * pages that show it. Edit ticks it into or out of hand-picked collections;
 * Open opens a collection's sheet. Without `store:write` it reads the same,
 * with no Edit and the sheets read-only.
 *
 * Its data is the overview's placement — the same one the Overview's
 * "Linked to this product" card and the tab's count read — plus the
 * business's collections for their counts (optional: without them, the
 * cards leave the count out).
 */
export function ProductCollectionsTab({
    overview,
    collections,
    categories,
    retryHref,
}: {
    overview: ProductOverview;
    /** Every collection; null when that read failed. */
    collections: CollectionSummary[] | null;
    categories: CategoryNode[];
    retryHref: string;
}) {
    const [editing, setEditing] = useState(false);
    const [opened, setOpened] = useState<string | null>(null);
    const placement = overview.placement;
    const product = overview.product;
    const canWrite = overview.canWrite;

    if (!placement || placement.status === "failed") {
        return <PanelFailed what="collections" retryHref={retryHref} />;
    }
    if (placement.status === "forbidden") {
        return <PanelForbidden what="collections" />;
    }
    const inIt = placement.data.collections;
    const web = websiteSummary(placement.data);
    const byId = new Map((collections ?? []).map((c) => [c.id, c]));
    const handPicked = (collections ?? []).some(
        (c) => c.kind === "HAND_PICKED",
    );
    const canEdit = canWrite && collections !== null;

    const sheets = (
        <>
            {canEdit ? (
                <ProductCollectionsSheet
                    open={editing}
                    onOpenChange={setEditing}
                    productId={product.id}
                    productName={product.name}
                    all={collections}
                    placement={placement.data}
                />
            ) : null}
            <CollectionSheet
                open={opened !== null}
                onOpenChange={(o) => {
                    if (!o) setOpened(null);
                }}
                collectionId={opened}
                categories={categories}
                canWrite={canWrite}
            />
        </>
    );

    if (inIt.length === 0 && !placement.data.website.showsProducts) {
        return (
            <>
                <TabState
                    icon={Layers}
                    title="Not in a collection, not on the website"
                    description={
                        canEdit && handPicked
                            ? "Collections are how it shows up on the site — a Breads section, a Weekend list. Add it to one here, or make one from Products."
                            : "Collections are how it shows up on the site — a Breads section, a Weekend list. Add it to one from Products."
                    }
                >
                    {canEdit && handPicked ? (
                        <Button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="h-[34px] rounded-[9px] px-3.5 text-[12.5px] coarse:min-h-11"
                        >
                            Add to a collection
                        </Button>
                    ) : null}
                    <StateLink href="/commerce/products?view=collections">
                        Open Products
                    </StateLink>
                </TabState>
                {sheets}
            </>
        );
    }

    return (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] items-start gap-4">
            <section aria-labelledby="in-collections">
                <div className="mb-2 flex items-center gap-2.5">
                    <h2
                        id="in-collections"
                        className="flex-1 text-[12.5px] font-semibold"
                    >
                        In these collections
                    </h2>
                    {canEdit ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditing(true)}
                            aria-label="Edit collections"
                            className={EDIT_BUTTON}
                        >
                            <Pencil
                                className="size-3"
                                strokeWidth={2}
                                aria-hidden
                            />
                            Edit
                        </Button>
                    ) : null}
                </div>
                <div className="flex flex-col gap-2.5">
                    {inIt.length === 0 ? (
                        <p className="rounded-[12px] border border-dashed border-border-strong px-4 py-3.5 text-[12.5px] text-muted-foreground">
                            Not in any collection.
                        </p>
                    ) : (
                        inIt.map((c) => {
                            const full = byId.get(c.id);
                            const note = full
                                ? collectionNote(full)
                                : c.kind === "AUTOMATIC"
                                  ? `Fills itself: everything in ${c.category?.name ?? "its category"}`
                                  : "Picked by hand";
                            const why = whyIn(
                                c,
                                product.categoryId,
                                categories,
                            );
                            return (
                                <Card
                                    key={c.id}
                                    className="rounded-[12px] px-4 py-[13px]"
                                >
                                    <div className="flex items-baseline gap-2">
                                        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                                            {c.name}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setOpened(c.id)}
                                            aria-label={`Open ${c.name}`}
                                            className="shrink-0 text-[12px] text-brand hover:text-foreground coarse:min-h-11"
                                        >
                                            Open
                                        </button>
                                    </div>
                                    <p className="mt-1 text-[12px] text-muted-foreground">
                                        {note}
                                    </p>
                                    {why ? (
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            {why}
                                        </p>
                                    ) : null}
                                    {!c.showing ? (
                                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                                            Hidden while it is archived; selling
                                            it again brings it back.
                                        </p>
                                    ) : null}
                                </Card>
                            );
                        })
                    )}
                </div>
                {collections === null ? (
                    <p className="mt-2 text-[11.5px] leading-[1.5] text-muted-foreground">
                        The business&apos;s collections couldn&apos;t be read
                        just now, so their sizes aren&apos;t shown and they
                        can&apos;t be changed here. Try again in a moment.
                    </p>
                ) : null}
            </section>
            <section aria-labelledby="on-website">
                <h2
                    id="on-website"
                    className="mb-2 text-[12.5px] font-semibold"
                >
                    Shown on the website
                </h2>
                <div className="flex flex-col gap-2.5">
                    {placement.data.website.pages.length > 0 ? (
                        placement.data.website.pages.map((p) => (
                            <Card
                                key={`${p.siteId}${p.path}`}
                                className="rounded-[12px] px-4 py-[13px]"
                            >
                                <p className="text-[14px] font-semibold">
                                    {p.title || p.path}
                                </p>
                                <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                                    {p.path}
                                </p>
                            </Card>
                        ))
                    ) : (
                        <p className="rounded-[12px] border border-dashed border-border-strong px-4 py-3.5 text-[12.5px] text-muted-foreground">
                            {web.lines[0]}
                        </p>
                    )}
                </div>
                {placement.data.website.pages.length > 0 ? (
                    <p className="mt-2.5 text-[11.5px] leading-[1.5] text-muted-foreground">
                        Archive it and it leaves{" "}
                        {placement.data.website.pages.length === 1
                            ? "that page"
                            : "these pages"}
                        . You&apos;ll be asked first.
                    </p>
                ) : null}
            </section>
            {sheets}
        </div>
    );
}
