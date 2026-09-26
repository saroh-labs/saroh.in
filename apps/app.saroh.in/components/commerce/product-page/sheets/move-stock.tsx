"use client";

import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import type { ProductDetail } from "@/lib/products/service";
import { moveProductStock } from "@/lib/products/stock-actions";
import { movable } from "@/lib/products/stock-sheet";
import { movedWords } from "@/lib/stock/levels";
import type { ProductStock, SizeStock } from "@/lib/stock/product-stock";

/**
 * Move stock between storefronts, from the stock sheet (#523): only what
 * isn't promised can go, and it goes as a pair of Moved entries in the
 * log. Its own write, made when Move is pressed — so it waits while the
 * sheet has unsaved counts, rather than mixing the two.
 */
export function MoveStock({
    product,
    stock,
    blocked,
}: {
    product: ProductDetail;
    stock: ProductStock;
    /** Why Move is off, when it is. */
    blocked: string | null;
}) {
    const router = useRouter();
    const sizes = stock.sizes;
    const [sizeKey, setSizeKey] = useState(sizes.at(0)?.variantId ?? "");
    const size: SizeStock | undefined =
        sizes.find((s) => (s.variantId ?? "") === sizeKey) ?? sizes.at(0);
    const shelves = size?.shelves ?? [];
    const [from, setFrom] = useState(
        shelves.find((s) => movable(s) > 0)?.storeId ??
            shelves.at(0)?.storeId ??
            "",
    );
    const [to, setTo] = useState(
        stock.byStore.find((s) => s.storeId !== from)?.storeId ?? "",
    );
    const [units, setUnits] = useState("");
    const [pending, setPending] = useState(false);

    const fromShelf = shelves.find((s) => s.storeId === from);
    const can = fromShelf ? movable(fromShelf) : 0;
    const n = /^\d+$/.test(units.trim()) ? Number(units) : NaN;
    const stores = Array.from(
        new Map([
            ...stock.byStore.map((s) => [s.storeId, s.name] as const),
            ...shelves.map((s) => [s.storeId, s.name] as const),
        ]),
    );
    const problem =
        blocked ??
        (!from || !to
            ? "Choose where from and where to."
            : from === to
              ? "Choose two different storefronts."
              : units.trim() === ""
                ? null
                : !Number.isInteger(n) || n < 1
                  ? "Whole numbers, 1 or more."
                  : n > can
                    ? `Only ${can} can move — the rest is promised to open orders.`
                    : null);
    const nameOf = (id: string) =>
        stores.find(([sid]) => sid === id)?.[1] ?? "the storefront";

    async function move() {
        if (problem || !size || Number.isNaN(n)) return;
        setPending(true);
        try {
            const res = await moveProductStock({
                fromStoreId: from,
                toStoreId: to,
                productId: product.id,
                variantId: size.variantId,
                units: n,
                idempotencyKey: crypto.randomUUID(),
            });
            if (!res.ok) {
                showError("Nothing moved", res.error);
                return;
            }
            showSuccess(movedWords(n, nameOf(to)));
            setUnits("");
            router.refresh();
        } finally {
            setPending(false);
        }
    }

    return (
        <section
            aria-labelledby="move-stock-title"
            className="mt-5 border-t border-border pt-4"
        >
            <h3 id="move-stock-title" className="text-[12.5px] font-semibold">
                Move stock between storefronts
            </h3>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
                Only what isn&apos;t promised can move. It shows in the log as
                Moved, at both.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
                {sizes.length > 1 ? (
                    <div className="col-span-2">
                        <OptionSelect
                            value={sizeKey}
                            onValueChange={setSizeKey}
                            aria-label="Which size"
                            options={sizes.map((s) => ({
                                value: s.variantId ?? "",
                                label:
                                    product.variants.find(
                                        (v) => v.id === s.variantId,
                                    )?.title ?? product.name,
                            }))}
                        />
                    </div>
                ) : null}
                <OptionSelect
                    value={from}
                    onValueChange={setFrom}
                    aria-label="Move from"
                    placeholder="From"
                    options={stores.map(([id, name]) => ({
                        value: id,
                        label: `From ${name}`,
                    }))}
                />
                <OptionSelect
                    value={to}
                    onValueChange={setTo}
                    aria-label="Move to"
                    placeholder="To"
                    options={stores.map(([id, name]) => ({
                        value: id,
                        label: `To ${name}`,
                    }))}
                />
                <Input
                    value={units}
                    onChange={(e) => setUnits(e.target.value)}
                    inputMode="numeric"
                    placeholder="How many"
                    aria-label="How many to move"
                    aria-invalid={Boolean(problem) && units.trim() !== ""}
                />
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => void move()}
                    disabled={
                        pending || Boolean(problem) || units.trim() === ""
                    }
                    className="h-9 rounded-lg text-[12.5px]"
                >
                    {pending ? "Moving…" : "Move"}
                </Button>
            </div>
            <p
                role="status"
                className="mt-1.5 text-[11.5px] text-muted-foreground"
            >
                {problem ??
                    (fromShelf
                        ? `${can} can move from ${fromShelf.name}.`
                        : "")}
            </p>
        </section>
    );
}
