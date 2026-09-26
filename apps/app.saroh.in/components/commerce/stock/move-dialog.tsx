"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import {
    dismissToasts,
    showError,
    showSuccess,
    showUndo,
} from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { OptionSelect } from "@/components/shared/option-select";
import { movedWords } from "@/lib/stock/levels";
import type { MoveShelf } from "@/lib/stock/screen";
import { moveNote, moveProblem } from "@/lib/stock/screen";
import { moveStock, undoStock } from "@/lib/stock/screen-actions";

import { targetKey, targetOptions, useStockTargets } from "./use-stock-targets";

/**
 * Move stock (#521): units not promised, from one storefront to another,
 * written as a pair of entries. Offered only with more than one storefront.
 * The API has the last word; its refusal ("Only 4 can be moved from Hill
 * Road…") shows where the design's note is.
 */
export function MoveDialog({
    open,
    onOpenChange,
    storefronts,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    storefronts: { id: string; name: string }[];
}) {
    const router = useRouter();
    const targets = useStockTargets();
    const [what, setWhat] = useState("");
    const [from, setFrom] = useState(storefronts[0]?.id ?? "");
    const [to, setTo] = useState(storefronts[1]?.id ?? "");
    const [units, setUnits] = useState("");
    const [refusal, setRefusal] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // One key per attempt: a retried tap applies once.
    const attempt = useRef<string | null>(null);

    const rows = targets.state === "ready" ? targets.levels.rows : [];
    const options = targetOptions(rows);
    const chosen = what || options[0]?.value || "";
    const row = rows.find((r) => targetKey(r) === chosen);
    const shelf = (storeId: string): MoveShelf | undefined => {
        const store = storefronts.find((s) => s.id === storeId);
        if (!store) return undefined;
        const cell = row?.cells.find((c) => c.storeId === storeId);
        return {
            storeId,
            name: store.name,
            soldHere: cell?.soldHere ?? false,
            onHand: cell?.onHand ?? 0,
            promised: cell?.promised ?? 0,
            canSell: cell?.canSell ?? 0,
            has: !!cell?.stockLevelId,
        };
    };
    const fromShelf = shelf(from);
    const toShelf = shelf(to);
    const problem = row
        ? moveProblem({ from: fromShelf, to: toShelf, units })
        : "Pick what to move.";
    const showProblem =
        refusal ?? (units !== "" || from === to ? problem : null);

    const reset = () => {
        setWhat("");
        setUnits("");
        setRefusal(null);
        attempt.current = null;
    };

    const save = async () => {
        if (problem || !row || !toShelf) return;
        const n = Number(units);
        attempt.current ??= crypto.randomUUID();
        setSaving(true);
        const res = await moveStock({
            fromStoreId: from,
            toStoreId: to,
            productId: row.productId,
            variantId: row.variantId,
            units: n,
            idempotencyKey: attempt.current,
        });
        setSaving(false);
        if (!res.ok) {
            setRefusal(res.error);
            attempt.current = null;
            return;
        }
        const toName = toShelf.name;
        reset();
        onOpenChange(false);
        dismissToasts();
        showUndo(movedWords(n, toName), () => {
            void undoStock({
                entryIds: res.data.entryIds,
                idempotencyKey: crypto.randomUUID(),
            }).then((u) => {
                if (!u.ok) {
                    showError(u.error);
                    return;
                }
                showSuccess("Move undone.");
                router.refresh();
            });
        });
        router.refresh();
    };

    const storeOptions = storefronts.map((s) => ({
        value: s.id,
        label: s.name,
    }));
    const field = "h-9 rounded-[8px] text-[13px] coarse:h-11";

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (!o) reset();
                onOpenChange(o);
            }}
        >
            <DialogContent className="grid w-[420px] max-w-[calc(100vw-32px)] gap-3.5 rounded-[14px] px-[22px] py-5">
                <DialogTitle className="font-display text-[18px] font-semibold tracking-[-0.02em]">
                    Move stock
                </DialogTitle>
                <DialogDescription className="sr-only">
                    Move units that aren&apos;t promised from one storefront to
                    another.
                </DialogDescription>
                <div className="grid gap-[5px]">
                    <Label
                        htmlFor="mv-what"
                        className="text-[12.5px] font-medium"
                    >
                        What
                    </Label>
                    <OptionSelect
                        id="mv-what"
                        className={field}
                        value={chosen}
                        options={options}
                        disabled={targets.state !== "ready"}
                        placeholder={
                            targets.state === "loading"
                                ? "Loading products…"
                                : targets.state === "failed"
                                  ? "Products couldn't be loaded"
                                  : "Pick a product"
                        }
                        onValueChange={(v) => {
                            setWhat(v);
                            setRefusal(null);
                        }}
                    />
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[1fr_1fr_90px]">
                    <div className="grid min-w-0 gap-[5px]">
                        <Label
                            htmlFor="mv-from"
                            className="text-[12.5px] font-medium"
                        >
                            From
                        </Label>
                        <OptionSelect
                            id="mv-from"
                            className={field}
                            value={from}
                            options={storeOptions}
                            onValueChange={(v) => {
                                setFrom(v);
                                setRefusal(null);
                            }}
                        />
                    </div>
                    <div className="grid min-w-0 gap-[5px]">
                        <Label
                            htmlFor="mv-to"
                            className="text-[12.5px] font-medium"
                        >
                            To
                        </Label>
                        <OptionSelect
                            id="mv-to"
                            className={field}
                            value={to}
                            options={storeOptions}
                            onValueChange={(v) => {
                                setTo(v);
                                setRefusal(null);
                            }}
                        />
                    </div>
                    <div className="col-span-2 grid gap-[5px] sm:col-span-1">
                        <Label
                            htmlFor="mv-units"
                            className="text-[12.5px] font-medium"
                        >
                            How many
                        </Label>
                        <Input
                            id="mv-units"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={units}
                            aria-invalid={!!showProblem || undefined}
                            aria-describedby="mv-note"
                            onChange={(e) => {
                                setUnits(e.target.value);
                                setRefusal(null);
                            }}
                            className={cn(field, "px-[9px]")}
                        />
                    </div>
                </div>
                <p
                    id="mv-note"
                    role="status"
                    className={cn(
                        "min-h-[19px] text-pretty text-[12.5px] leading-normal",
                        showProblem
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}
                >
                    {targets.state === "failed"
                        ? targets.error
                        : (showProblem ?? moveNote(fromShelf, toShelf))}
                </p>
                <div className="flex justify-end gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        className="h-9 rounded-[9px] px-3.5 text-[12.5px] coarse:h-11"
                        onClick={() => {
                            reset();
                            onOpenChange(false);
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        className="h-9 rounded-[9px] px-3.5 text-[12.5px] coarse:h-11"
                        disabled={!!problem || saving}
                        onClick={() => void save()}
                    >
                        {saving ? "Moving…" : "Move"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
