"use client";

import { plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";

import { SoldOutActions } from "@/components/commerce/product-stock/sold-out-actions";
import { setInventory, setVariantStock } from "@/lib/products/actions";
import type { StockDraft, StockLine } from "@/lib/products/editor-sections";
import { isCount, mergeDraft } from "@/lib/products/editor-sections";
import type { PlaceShelf } from "@/lib/products/editor-stock";
import {
    allLocations,
    SPLIT_NEEDS_WRITE,
    stockCounting,
    stockDraftFrom,
    stockLayout,
    switchesToVariants,
} from "@/lib/products/editor-stock";
import type { ProductDetail } from "@/lib/products/service";
import type { TrackingControl } from "@/lib/products/tracking";
import {
    TRACKING_LOCKED,
    UNTRACKED_NOTE,
    untrackedLine,
} from "@/lib/products/tracking";

import { TextLink } from "@saroh/ui/text-link";
import { useEditor, useSection } from "./editor-state";
import { FieldHelp } from "./fields";
import { SectionCard } from "./section-card";
import {
    lowLines,
    LowNote,
    PlacesStock,
    VariantStockTable,
    WholeStock,
} from "./stock-fields";
import { TrackStockSwitch } from "./track-stock-switch";

const DEFAULT_WARN = "10";

const same = (a: StockDraft, b: StockDraft) =>
    JSON.stringify(a) === JSON.stringify(b);

/**
 * Stock: how many there are and when to warn. Once a product counts per
 * variant, each keeps its own count — a small bottle runs out before a large
 * one — and the product's total is the sum. An older product with variants
 * may still count as a whole; it is shown and counted that way until an
 * owner or admin splits it (#525). Promised stock is what open orders hold;
 * Orders sets it, so it is shown and never typed.
 *
 * A stock-only role (`inventory:write`) changes this section and nothing
 * else; the Track stock switch stays locked for them, and the save sends
 * counts only — the API refuses tracking and listing changes from them.
 */
export function StockSection({
    product,
    storeId,
    countedAt,
    defaultWarn,
    control,
    opt = "variant",
    elsewhere = [],
}: {
    product: ProductDetail;
    storeId: string;
    /** The storefront whose shelf this counts, named when there are several. */
    countedAt: string | null;
    /** Settings → Defaults: where a first count starts warning. */
    defaultWarn: number | null;
    /** Who may flip Track stock (#515): Owner/Admin, locked, or no switch. */
    control: TrackingControl;
    /** The product's option, lower case ("shade"); "variant" with none. */
    opt?: string;
    /**
     * Its shelves at the business's other locations, while it counts as a
     * whole (HPEditDesk): counted here too, with All locations under them.
     */
    elsewhere?: readonly PlaceShelf[];
}) {
    const { canWrite, mayEdit, states, sayError } = useEditor();
    const ro = !mayEdit("stock");
    const fromProduct = stockDraftFrom(
        product,
        defaultWarn === null ? DEFAULT_WARN : String(defaultWarn),
    );
    const counting = stockCounting(product);
    // Track stock (#515): the business tracks stock, or this section isn't
    // drawn, so the product's own switch decides.
    const tracked = product.stockTracked;
    const loadedKey = JSON.stringify([fromProduct, counting, tracked]);
    const [base, setBase] = useState(fromProduct);
    const [draft, setDraft] = useState(fromProduct);
    const [seen, setSeen] = useState(loadedKey);
    const [seenTracked, setSeenTracked] = useState(tracked);
    // Add stock, or Count each variant; kept through its save until the
    // product comes back counted the new way, so the layout doesn't flicker.
    const [opened, setOpened] = useState(false);
    const [openedSaved, setOpenedSaved] = useState(false);
    if (seen !== loadedKey) {
        setSeen(loadedKey);
        setSeenTracked(tracked);
        setBase(fromProduct);
        // Track stock flipped: every shelf is at 0 now, off or on, so
        // nothing in the draft carries over — merged, a count left in it
        // reads as typed and comes back Unsaved.
        setDraft(
            seenTracked !== tracked || same(draft, base)
                ? fromProduct
                : mergeDraft(fromProduct, base, draft),
        );
        setOpened(false);
        setOpenedSaved(false);
    }

    // The other locations' counts, kept like the draft: reset when the
    // product comes back, kept while typed.
    const elsewhereKey = JSON.stringify(elsewhere);
    const [othersBase, setOthersBase] = useState(elsewhere);
    const [others, setOthers] = useState(elsewhere);
    const [seenElsewhere, setSeenElsewhere] = useState(elsewhereKey);
    if (seenElsewhere !== elsewhereKey) {
        setSeenElsewhere(elsewhereKey);
        setOthersBase(elsewhere);
        setOthers(elsewhere);
    }
    const changedOthers = others.filter((o) => {
        const was = othersBase.find((b) => b.storeId === o.storeId);
        return (
            was?.quantity !== o.quantity ||
            was.lowStockAlert !== o.lowStockAlert
        );
    });

    const hasVariants = product.variants.length > 0;
    const layout = stockLayout(counting, hasVariants, opened);
    const places = layout === "whole" && others.length > 0;
    const dirty =
        tracked &&
        (!same(draft, base) ||
            (opened && !openedSaved) ||
            (places && changedOthers.length > 0));
    const splitting = switchesToVariants(counting, layout);

    const qtyBad =
        !isCount(draft.quantity) ||
        !isCount(draft.lowStockAlert) ||
        (places &&
            others.some(
                (o) => !isCount(o.quantity) || !isCount(o.lowStockAlert),
            ));
    const otherBelow = places
        ? others.find(
              (o) => isCount(o.quantity) && Number(o.quantity) < o.promised,
          )
        : undefined;
    const reserved = product.inventory?.reserved ?? 0;
    const lines = layout === "lines";
    const belowPromised = lines
        ? draft.lines.find(
              (l) => isCount(l.quantity) && Number(l.quantity) < l.promised,
          )
        : isCount(draft.quantity) && Number(draft.quantity) < reserved
          ? { title: "", promised: reserved }
          : otherBelow
            ? { title: "", promised: otherBelow.promised }
            : undefined;
    const lineBad = draft.lines.some(
        (l) => !isCount(l.quantity) || !isCount(l.lowStockAlert),
    );
    // Variants added or removed and not saved: the counts would be for a
    // list that isn't there yet.
    const variantsPending =
        !!states.variants?.dirty && !!states.variants.changesList;
    const problem = !tracked
        ? ""
        : variantsPending
          ? "Save variants first."
          : splitting && !canWrite
            ? SPLIT_NEEDS_WRITE
            : (lines ? lineBad : qtyBad)
              ? "Whole numbers, zero or more."
              : belowPromised
                ? `${belowPromised.promised} promised to open orders${
                      belowPromised.title ? ` for ${belowPromised.title}` : ""
                  }. On hand can't go below that.`
                : "";

    useSection(
        "stock",
        { dirty, problem },
        {
            save: async () => {
                const res = lines
                    ? await setVariantStock(
                          storeId,
                          product.id,
                          draft.lines.map((l) => ({
                              variantId: l.variantId,
                              quantity: Number(l.quantity),
                              lowStockAlert: Number(l.lowStockAlert),
                          })),
                      )
                    : await setInventory(storeId, product.id, {
                          quantity: Number(draft.quantity),
                          lowStockAlert: Number(draft.lowStockAlert),
                      });
                if (!res.ok) {
                    sayError("stock", res.error);
                    return false;
                }
                setBase(draft);
                // Each other location's count it was given, one call each.
                if (!lines && places) {
                    for (const o of changedOthers) {
                        const at = await setInventory(o.storeId, product.id, {
                            quantity: Number(o.quantity),
                            lowStockAlert: Number(o.lowStockAlert),
                        });
                        if (!at.ok) {
                            sayError("stock", at.error);
                            return false;
                        }
                    }
                    setOthersBase(others);
                }
                if (opened) setOpenedSaved(true);
                return true;
            },
            discard: () => {
                setDraft(base);
                setOthers(othersBase);
                setOpened(false);
                setOpenedSaved(false);
            },
        },
    );

    const setLine = (id: string, patch: Partial<StockLine>) =>
        setDraft({
            ...draft,
            lines: draft.lines.map((l) =>
                l.variantId === id ? { ...l, ...patch } : l,
            ),
        });

    const aside =
        control === "hidden" ? undefined : (
            <TrackStockSwitch
                productId={product.id}
                productName={product.name}
                tracked={tracked}
                control={control}
                // Not `setDraft(base)`: the `base` it closed over is the
                // count from before the switch, and React applied it after
                // the refreshed product had reset the section to 0 — a
                // stale 3 in the draft, hidden while untracked, came back
                // Unsaved when Track stock went on again.
                onTurnedOff={() => setOpened(false)}
            />
        );
    const head = (
        <>
            {control === "locked" ? (
                <p className="mb-2.5 text-[12px] text-muted-foreground">
                    {TRACKING_LOCKED}
                </p>
            ) : null}
            {countedAt && tracked && !places ? (
                <p className="mb-2.5 text-[12px] text-muted-foreground">
                    Counted at {countedAt}.
                </p>
            ) : null}
        </>
    );

    if (!tracked) {
        // Sold out by hand (#515): anyone who may count stock marks it, per
        // storefront; everyone else reads where it is sold out.
        const places = product.storefronts ?? [];
        const line = untrackedLine(places);
        return (
            <SectionCard
                k="stock"
                title="Stock"
                aside={aside}
                bodyClassName="pb-4 pt-2.5"
            >
                {head}
                <p className="text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                    {UNTRACKED_NOTE}
                </p>
                {line !== "Available on the shop." ? (
                    <p className="mt-2 text-pretty text-[12.5px] font-medium text-destructive-subtle-foreground">
                        {line}
                    </p>
                ) : null}
                {control !== "hidden" ? (
                    <SoldOutActions
                        productId={product.id}
                        places={places}
                        className="mt-2.5"
                    />
                ) : null}
            </SectionCard>
        );
    }

    if (layout === "collapsed") {
        // A first count per variant changes how the product counts: an
        // owner or admin's to start (#515).
        const blocked = ro || (hasVariants && !canWrite);
        return (
            <SectionCard k="stock" title="Stock" aside={aside}>
                {head}
                <p className="mb-3 text-pretty text-[12.5px] leading-[1.55] text-foreground/75">
                    {hasVariants
                        ? `No stock count yet. Each of the ${product.variants.length} variants gets its own, so a small one can run out before a large one.`
                        : "No stock count yet. Add one to see how many you have and get a warning when it runs low."}
                </p>
                <Button
                    variant="outline"
                    type="button"
                    disabled={blocked}
                    onClick={() => setOpened(true)}
                    className="gap-[7px]"
                >
                    <Plus aria-hidden className="size-3.5" />
                    Add stock
                </Button>
                {hasVariants && !canWrite && !ro ? (
                    <FieldHelp className="mt-2">{SPLIT_NEEDS_WRITE}</FieldHelp>
                ) : null}
            </SectionCard>
        );
    }

    if (layout === "whole") {
        const qty = Number(draft.quantity);
        const low = Number(draft.lowStockAlert);
        const lowNow = !qtyBad && qty <= low;
        return (
            <SectionCard k="stock" title="Stock" aside={aside}>
                {head}
                {places ? (
                    <>
                        <PlacesStock
                            shelves={[
                                {
                                    storeId,
                                    name: countedAt ?? "Here",
                                    quantity: draft.quantity,
                                    lowStockAlert: draft.lowStockAlert,
                                    promised: reserved,
                                },
                                ...others,
                            ]}
                            ro={ro}
                            badStoreId={
                                isCount(draft.quantity) &&
                                Number(draft.quantity) < reserved
                                    ? storeId
                                    : (otherBelow?.storeId ?? null)
                            }
                            onShelf={(id, patch) =>
                                id === storeId
                                    ? setDraft({
                                          ...draft,
                                          ...(patch.quantity !== undefined
                                              ? { quantity: patch.quantity }
                                              : {}),
                                          ...(patch.lowStockAlert !== undefined
                                              ? {
                                                    lowStockAlert:
                                                        patch.lowStockAlert,
                                                }
                                              : {}),
                                      })
                                    : setOthers(
                                          others.map((o) =>
                                              o.storeId === id
                                                  ? { ...o, ...patch }
                                                  : o,
                                          ),
                                      )
                            }
                        />
                        <PlacesNote
                            problem={problem}
                            shelves={[
                                {
                                    quantity: draft.quantity,
                                    promised: reserved,
                                },
                                ...others,
                            ]}
                            hasVariants={hasVariants}
                            opt={opt}
                        />
                    </>
                ) : (
                    <WholeStock
                        draft={draft}
                        promised={reserved}
                        ro={ro}
                        qtyBad={!!belowPromised}
                        noteBad={!!problem}
                        note={
                            problem ||
                            (hasVariants
                                ? "Counted for the whole product, not per variant: an order for any variant takes from this count. Promised updates itself as orders come in and are collected."
                                : "Promised updates itself as orders come in and are collected.")
                        }
                        onChange={(patch) => setDraft({ ...draft, ...patch })}
                    />
                )}
                {hasVariants && canWrite ? (
                    <TextLink
                        data-ph-unmask=""
                        onClick={() => setOpened(true)}
                        className="mt-2 text-[12px] coarse:min-h-11"
                    >
                        Count each {opt} instead
                    </TextLink>
                ) : null}
                {lowNow ? (
                    <LowNote>
                        {qty === 0
                            ? product.status === "PUBLISHED"
                                ? "Nothing on hand. The product stays published and cannot be bought."
                                : "Nothing on hand yet. Set a quantity before you publish it."
                            : `On hand has reached the alert level: ${qty} left, alerting at ${low}.`}
                    </LowNote>
                ) : null}
            </SectionCard>
        );
    }

    const low = lowLines(draft.lines);
    return (
        <SectionCard k="stock" title="Stock" aside={aside}>
            {head}
            <VariantStockTable
                lines={draft.lines}
                ro={ro}
                onLine={setLine}
                opt={opt}
            />
            <FieldHelp className="mt-[9px]" tone={problem ? "bad" : "quiet"}>
                {problem ||
                    (splitting && counting === "whole"
                        ? "Saving counts each variant on its own. Each starts at what its open orders hold, and the first also at what was free to sell. Nothing on the shelf is lost or counted twice."
                        : "Each variant has its own count, and the product's total is the sum. Promised updates itself as orders come in and are collected.")}
            </FieldHelp>
            {low.length > 0 && !problem ? (
                <LowNote>
                    {low
                        .map((l) => `${l.title} has ${l.quantity} left`)
                        .join(", ")}
                    , at or under {plural(low.length, "its", "their")} warning
                    level.
                </LowNote>
            ) : null}
        </SectionCard>
    );
}

/**
 * Under every location's count (HPEditDesk): "290 to sell (440 on hand,
 * 150 promised)", and how it counts; or what is wrong.
 */
function PlacesNote({
    problem,
    shelves,
    hasVariants,
    opt,
}: {
    problem: string;
    shelves: readonly { quantity: string; promised: number }[];
    hasVariants: boolean;
    opt: string;
}) {
    if (problem) {
        return (
            <FieldHelp className="mt-[9px]" tone="bad">
                {problem}
            </FieldHelp>
        );
    }
    const all = allLocations(shelves);
    return (
        <p className="mt-3 text-pretty rounded-lg border border-border bg-muted/50 px-3 py-2 text-[12.5px] leading-[1.5] text-muted-foreground">
            <b className="font-semibold text-foreground">
                {all.toSell} to sell
            </b>{" "}
            ({all.onHand} on hand, {all.promised} promised).{" "}
            {hasVariants
                ? `Counted for the whole product: an order for any ${opt} takes from this count.`
                : "Promised updates itself as orders come in and are collected."}
        </p>
    );
}
