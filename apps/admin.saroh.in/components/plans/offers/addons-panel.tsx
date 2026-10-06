"use client";

import type { Addon, AddonMode } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { useId } from "react";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { fieldClass, RupeesField, WholeField } from "./number-field";
import {
    ADDON_KIND_ORDER,
    ADDON_KIND_WORDS,
    addonProspects,
    addonSummary,
    canAddKind,
    modulesSomePlanLacks,
    newAddon,
    newAddonId,
} from "./offers";
import { OfferCard, Segmented } from "./parts";

const MODES: { value: AddonMode; label: string }[] = [
    { value: "pack", label: "Pack" },
    { value: "unit", label: "Per unit" },
];

const SMALL = "text-[11.5px] text-muted-foreground";

/**
 * Add-ons any plan can buy, billed monthly with it (plans catalogue U9).
 * They are part of the draft, so each change here is a draft change.
 */
export function AddonsPanel() {
    const { catalog, edit, canEdit } = useDraft();
    if (!catalog) return null;

    function add(kind: (typeof ADDON_KIND_ORDER)[number]) {
        edit((c) => {
            const a = newAddon(c, kind, newAddonId(c));
            if (a) c.addons = [...c.addons, a];
        });
    }

    return (
        <OfferCard label="Add-ons">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
                <span className="font-semibold">Add-ons</span>
                <span className="text-[12.5px] text-muted-foreground">
                    Any plan can buy them, billed monthly with the plan.
                </span>
            </div>
            {catalog.addons.length === 0 && (
                <span className="text-[12.5px] text-muted-foreground">
                    No add-ons yet.
                </span>
            )}
            {catalog.addons.map((a) => (
                <AddonRow key={a.id} addon={a} />
            ))}
            {canEdit && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12px] text-muted-foreground">
                        Add:
                    </span>
                    {ADDON_KIND_ORDER.filter((k) => canAddKind(catalog, k)).map(
                        (k) => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => add(k)}
                                className="h-[30px] cursor-pointer rounded-full border border-dashed border-border-strong px-[11px] text-[12.5px] font-semibold text-foreground/80 transition-colors duration-fast hover:border-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-secondary"
                            >
                                + {ADDON_KIND_WORDS[k].label}
                            </button>
                        ),
                    )}
                </div>
            )}
        </OfferCard>
    );
}

function AddonRow({ addon }: { addon: Addon }) {
    const { catalog, edit, canEdit } = useDraft();
    const { pricing } = usePlans();
    const id = useId();
    if (!catalog) return null;
    const isModule = addon.kind === "module";
    const prospects = addonProspects(addon, catalog, pricing);
    const options = modulesSomePlanLacks(catalog);

    function set(patch: Partial<Addon>) {
        edit((c) => {
            c.addons = c.addons.map((x) =>
                x.id === addon.id ? { ...x, ...patch } : x,
            );
        });
    }

    return (
        <div className="grid gap-2.5 rounded-[10px] border border-border-strong bg-secondary p-3">
            <div className="flex flex-wrap items-end gap-2.5">
                <label className="grid min-w-0 flex-[1_1_180px] gap-1">
                    <span className={SMALL}>Name on the pricing page</span>
                    <input
                        value={addon.name}
                        disabled={!canEdit}
                        onChange={(e) => set({ name: e.target.value })}
                        aria-invalid={addon.name.trim() === ""}
                        className={cn(
                            fieldClass,
                            "h-8 w-full min-w-0 px-[9px] text-[12.5px]",
                        )}
                    />
                </label>
                {isModule && (
                    <div className="grid flex-[0_1_190px] gap-1">
                        <span id={`${id}-module`} className={SMALL}>
                            Module
                        </span>
                        <Select
                            value={addon.module ?? ""}
                            disabled={!canEdit}
                            onValueChange={(module) =>
                                set({
                                    module,
                                    name:
                                        catalog.modules.find(
                                            (m) => m.id === module,
                                        )?.name ?? addon.name,
                                })
                            }
                        >
                            <SelectTrigger
                                aria-labelledby={`${id}-module`}
                                className="h-8 rounded-[8px] border-border-strong bg-card px-2 text-[12.5px]"
                            >
                                <SelectValue placeholder="Pick a module" />
                            </SelectTrigger>
                            <SelectContent>
                                {options.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
                {!isModule && (
                    <>
                        <Segmented
                            label="Priced"
                            size="sm"
                            value={addon.mode}
                            options={MODES}
                            disabled={!canEdit}
                            onValue={(mode) => set({ mode })}
                        />
                        {addon.mode === "pack" && (
                            <label className="grid w-20 gap-1">
                                <span className={SMALL}>Pack of</span>
                                <WholeField
                                    value={addon.qty}
                                    min={1}
                                    disabled={!canEdit}
                                    className="h-8 w-full min-w-0 px-[9px] text-[12.5px]"
                                    onValue={(qty) => set({ qty })}
                                />
                            </label>
                        )}
                    </>
                )}
                <label className="grid w-[110px] gap-1">
                    <span className={SMALL}>₹ a month</span>
                    <RupeesField
                        paise={addon.pricePaise}
                        disabled={!canEdit}
                        className="h-8 w-full min-w-0 px-[9px] text-[12.5px]"
                        onPaise={(pricePaise) => set({ pricePaise })}
                    />
                </label>
                {canEdit && (
                    <button
                        type="button"
                        onClick={() =>
                            edit((c) => {
                                c.addons = c.addons.filter(
                                    (x) => x.id !== addon.id,
                                );
                            })
                        }
                        className="h-8 cursor-pointer rounded-[8px] border border-border-strong px-2.5 text-[12.5px] font-semibold text-destructive transition-colors duration-fast hover:bg-destructive-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-destructive-subtle"
                    >
                        Remove
                        <span className="sr-only"> {addon.name}</span>
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px]">
                <span className="text-foreground/90">
                    {addonSummary(addon, catalog)}
                </span>
                {prospects && (
                    <span className="text-muted-foreground">{prospects}</span>
                )}
                {addon.pricePaise === 0 && (
                    <span className="text-warning">
                        Set a price before you publish.
                    </span>
                )}
            </div>
        </div>
    );
}
