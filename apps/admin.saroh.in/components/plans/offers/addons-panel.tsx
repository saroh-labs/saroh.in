"use client";

import type { Addon, AddonMode } from "@saroh/pricing-catalog";
import { addonMaxQuantity, MAX_ADDON_QUANTITY } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import type { ReactNode } from "react";
import { useId } from "react";

import { AddButton } from "../add-button";
import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { fieldClass, RupeesField, WholeField } from "./number-field";
import {
    ADDON_KIND_ORDER,
    ADDON_KIND_WORDS,
    addonClash,
    addonProspects,
    addonReach,
    addonSummary,
    canAddKind,
    modulesSomePlanLacks,
    newAddon,
    newAddonId,
    toggleAddonPlan,
} from "./offers";
import { OfferCard, Segmented } from "./parts";

const MODES: { value: AddonMode; label: string }[] = [
    { value: "pack", label: "Pack" },
    { value: "unit", label: "Per unit" },
];

const SMALL = "text-[11.5px] text-muted-foreground";

/**
 * Add-ons a plan can buy, billed monthly with it (plans catalogue U9). Each
 * is offered on every plan or on the plans it names, with its own price
 * and the most a business can hold (DEC-157). They are part of the draft,
 * so each change here is a draft change.
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
                    Billed monthly with the plan. For a price or a maximum that
                    differs by plan, add one for each plan.
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
                    {ADDON_KIND_ORDER.filter((k) => canAddKind(catalog, k)).map(
                        (k) => (
                            <AddButton
                                key={k}
                                className="h-[30px] px-3 text-[12.5px]"
                                onClick={() => add(k)}
                            >
                                Add {ADDON_KIND_WORDS[k].label.toLowerCase()}
                            </AddButton>
                        ),
                    )}
                </div>
            )}
        </OfferCard>
    );
}

/** One plan an add-on is offered on, or "Every plan": pressed when it is. */
function PlanChip({
    on,
    disabled,
    onClick,
    children,
}: {
    on: boolean;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                "h-[26px] cursor-pointer rounded-[6px] border px-2.5 text-[12px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border-strong text-muted-foreground hover:text-foreground active:bg-secondary",
            )}
        >
            {children}
        </button>
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

    const clash = addonClash(addon, catalog);

    function set(patch: Partial<Addon>) {
        edit((c) => {
            c.addons = c.addons.map((x) => {
                if (x.id !== addon.id) return x;
                const next = { ...x, ...patch };
                // Every plan and the ceiling are said by leaving them out.
                if (!next.plans?.length) delete next.plans;
                if (next.max === undefined || next.max >= MAX_ADDON_QUANTITY) {
                    delete next.max;
                }
                return next;
            });
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
                {!isModule && (
                    <label className="grid w-[92px] gap-1">
                        <span className={SMALL}>At most</span>
                        <WholeField
                            value={addonMaxQuantity(addon)}
                            min={1}
                            max={MAX_ADDON_QUANTITY}
                            disabled={!canEdit}
                            aria-describedby={`${id}-reach`}
                            className="h-8 w-full min-w-0 px-[9px] text-[12.5px]"
                            onValue={(max) => set({ max })}
                        />
                    </label>
                )}
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
            <div
                role="group"
                aria-label={`Plans ${addon.name} is offered on`}
                className="flex flex-wrap items-center gap-1.5"
            >
                <span className={SMALL}>Offered on</span>
                <PlanChip
                    on={!addon.plans?.length}
                    disabled={!canEdit}
                    onClick={() => set({ plans: undefined })}
                >
                    Every plan
                </PlanChip>
                {catalog.plans.map((p) => (
                    <PlanChip
                        key={p.id}
                        on={addon.plans?.includes(p.id) ?? false}
                        disabled={!canEdit}
                        onClick={() =>
                            set({
                                plans: toggleAddonPlan(addon, catalog, p.id),
                            })
                        }
                    >
                        {p.name}
                    </PlanChip>
                ))}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px]">
                <span className="text-foreground/90">
                    {addonSummary(addon, catalog)}
                </span>
                <span id={`${id}-reach`} className="text-foreground/90">
                    {addonReach(addon, catalog)}
                </span>
                {clash && (
                    <span role="status" className="text-warning">
                        {clash}
                    </span>
                )}
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
