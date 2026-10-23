"use client";

import { FormSheet } from "@/components/shared/forms/form-sheet";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Textarea } from "@saroh/ui/textarea";
import { dismissToasts, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import type { EntryKind } from "@/lib/stock/screen";
import {
    ENTRY_KINDS,
    entryProblem,
    entrySaved,
    STOCK_UNREACHABLE,
} from "@/lib/stock/screen";
import { recordStockEntry, undoStock } from "@/lib/stock/screen-actions";
import { OptionSelect } from "@saroh/ui/option-select";

import { ChipGroup } from "@/components/shared/fields/choice-group";
import { targetKey, targetOptions, useStockTargets } from "./use-stock-targets";

/**
 * Record stock (#521): units received from a supplier, baked, or wasted, at
 * one storefront — one entry in the log, undone from the toast. Returns come
 * back through their order's refund, not here.
 */
export function EntrySheet({
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
    const [kind, setKind] = useState<EntryKind>("RECEIVED");
    const [what, setWhat] = useState("");
    const [store, setStore] = useState(storefronts[0]?.id ?? "");
    const [units, setUnits] = useState("");
    const [note, setNote] = useState("");
    const [refusal, setRefusal] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    // What is wrong is said once the button is pressed.
    const [tried, setTried] = useState(false);
    const attempt = useRef<string | null>(null);

    const rows = targets.state === "ready" ? targets.levels.rows : [];
    const options = targetOptions(rows);
    const chosen = what || options[0]?.value || "";
    const row = rows.find((r) => targetKey(r) === chosen);
    const cell = row?.cells.find((c) => c.storeId === store);
    const storeName = storefronts.find((s) => s.id === store)?.name ?? "";
    const problem = row
        ? entryProblem({ kind, units, onHand: cell?.onHand ?? 0 })
        : "Pick a product.";
    const shown = refusal ?? (units !== "" || tried ? problem : null);

    const reset = () => {
        setWhat("");
        setUnits("");
        setNote("");
        setRefusal(null);
        setTried(false);
        attempt.current = null;
    };
    const change =
        <T,>(set: (v: T) => void) =>
        (v: T) => {
            set(v);
            setRefusal(null);
            attempt.current = null;
        };

    const save = async () => {
        setTried(true);
        if (problem || !row) return;
        const n = Number(units);
        attempt.current ??= crypto.randomUUID();
        setSaving(true);
        let res: Awaited<ReturnType<typeof recordStockEntry>>;
        try {
            res = await recordStockEntry({
                kind,
                storeId: store,
                productId: row.productId,
                variantId: row.variantId,
                units: n,
                note: note.trim() || undefined,
                idempotencyKey: attempt.current,
            });
        } catch {
            // Keep the key: a retry of one that landed isn't made twice.
            setRefusal(STOCK_UNREACHABLE);
            return;
        } finally {
            setSaving(false);
        }
        if (!res.ok) {
            setRefusal(res.error);
            attempt.current = null;
            return;
        }
        reset();
        onOpenChange(false);
        dismissToasts();
        showUndo(entrySaved(kind, n, res.data.shelf.onHand), async () => {
            const u = await undoStock({
                entryIds: [res.data.entry.id],
                idempotencyKey: crypto.randomUUID(),
            });
            router.refresh();
            return u;
        });
        router.refresh();
    };

    const field = "h-9 rounded-[8px] text-[13px] coarse:h-11";

    return (
        <FormSheet
            open={open}
            title="Record stock"
            description="What came in, came out of the oven, or went in the bin. Each one is a line in the log."
            pending={saving}
            dirty={what !== "" || units !== "" || note !== ""}
            saveLabel="Record stock"
            savingLabel="Recording…"
            fieldsClassName="gap-4"
            onClose={() => {
                reset();
                onOpenChange(false);
            }}
            onSubmit={save}
        >
            <ChipGroup
                label="What happened"
                className="gap-2"
                value={kind}
                onChange={change(setKind)}
                choices={ENTRY_KINDS.map((k) => ({
                    value: k.kind,
                    label: k.label,
                }))}
            />
            <div className="grid gap-[5px]">
                <Label htmlFor="en-what" className="text-[12.5px] font-medium">
                    What
                </Label>
                <OptionSelect
                    id="en-what"
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
                    onValueChange={change(setWhat)}
                />
            </div>
            {storefronts.length > 1 ? (
                <div className="grid gap-[5px]">
                    <Label
                        htmlFor="en-where"
                        className="text-[12.5px] font-medium"
                    >
                        Where
                    </Label>
                    <OptionSelect
                        id="en-where"
                        className={field}
                        value={store}
                        options={storefronts.map((s) => ({
                            value: s.id,
                            label: s.name,
                        }))}
                        onValueChange={change(setStore)}
                    />
                </div>
            ) : null}
            <div className="grid gap-[5px]">
                <Label htmlFor="en-units" className="text-[12.5px] font-medium">
                    How many
                </Label>
                <Input
                    id="en-units"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={units}
                    aria-invalid={!!shown || undefined}
                    aria-describedby="en-note-line"
                    onChange={(e) => change(setUnits)(e.target.value)}
                    className={cn(field, "w-[120px] px-[9px]")}
                />
                <p
                    id="en-note-line"
                    role="status"
                    className={cn(
                        "text-pretty text-[12.5px] leading-normal",
                        shown ? "text-destructive" : "text-muted-foreground",
                    )}
                >
                    {targets.state === "failed"
                        ? targets.error
                        : (shown ??
                          (row
                              ? `${cell?.onHand ?? 0} on hand${storefronts.length > 1 ? ` at ${storeName}` : ""} now.`
                              : ""))}
                </p>
            </div>
            <div className="grid gap-[5px]">
                <Label htmlFor="en-note" className="text-[12.5px] font-medium">
                    Note{" "}
                    <span className="font-normal text-muted-foreground">
                        (optional)
                    </span>
                </Label>
                <Textarea
                    id="en-note"
                    value={note}
                    maxLength={500}
                    rows={2}
                    placeholder={
                        kind === "WASTED" ? "e.g. Day-old" : "e.g. Half a tray"
                    }
                    onChange={(e) => setNote(e.target.value)}
                />
            </div>
        </FormSheet>
    );
}
