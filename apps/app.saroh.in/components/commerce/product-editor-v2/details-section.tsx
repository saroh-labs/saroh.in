"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ShopSwitch } from "@/components/commerce/product-sections/shop-switch";
import { patchProduct } from "@/lib/products/actions";
import type { DetailsValues } from "@/lib/products/editor-sections";
import {
    detailsFrom,
    detailsPatch,
    detailsSchema,
    firstProblem,
    LIMITS,
} from "@/lib/products/editor-sections";
import type { ProductDetail } from "@/lib/products/service";
import type { EffectiveDefaults } from "@/lib/products/settings";

import { useEditor, useSection } from "./editor-state";
import { boxClass, FieldHelp, FieldLabel } from "./fields";
import { SectionCard } from "./section-card";

const EMPTY: DetailsValues = {
    howToUse: "",
    materials: "",
    showHowToUse: true,
    showMaterials: true,
};

/**
 * How to use or care for it, and what it is made of — a line under the
 * price, and the ingredients or fabric. Each with its own switch: the team
 * always sees both; this decides what the shop shows.
 */
export function DetailsSection({
    product,
    storeId,
    allergens,
    defaults,
}: {
    product: ProductDetail | null;
    storeId: string;
    /** The storefront's list (#483); empty hides "Contains". */
    allergens: { id: string; name: string }[];
    /** Creating: Settings → Defaults for the chosen category. */
    defaults: EffectiveDefaults | null;
}) {
    const { canWrite } = useEditor();
    // A new product starts with its category's line; picking another
    // category changes it only while the merchant hasn't typed their own.
    const baseline = product
        ? detailsFrom(product)
        : { ...EMPTY, howToUse: defaults?.howToUse ?? "" };
    const baseContains = (product?.allergens.contains ?? []).map((a) => a.id);
    const baseMay = (product?.allergens.mayContain ?? []).map((a) => a.id);
    const allergenKey = JSON.stringify([baseContains, baseMay]);
    const [contains, setContains] = useState(baseContains);
    const [may, setMay] = useState(baseMay);
    const [seenAllergens, setSeenAllergens] = useState(allergenKey);
    if (seenAllergens !== allergenKey) {
        setSeenAllergens(allergenKey);
        setContains(baseContains);
        setMay(baseMay);
    }
    const sameSet = (a: string[], b: string[]) =>
        a.length === b.length && a.every((x) => b.includes(x));
    const allergensDirty =
        !sameSet(contains, baseContains) || !sameSet(may, baseMay);
    const form = useForm<DetailsValues>({
        resolver: zodResolver(detailsSchema),
        values: baseline,
        resetOptions: product ? undefined : { keepDirtyValues: true },
        mode: "onChange",
    });
    const { isDirty, errors } = form.formState;
    const v = form.watch();
    const ro = !canWrite;
    const howLong = v.howToUse.length > LIMITS.howToUse;

    useSection(
        "details",
        {
            dirty: isDirty || allergensDirty,
            problem: howLong
                ? `Keep the line under ${LIMITS.howToUse} characters.`
                : firstProblem(detailsSchema, v),
        },
        {
            save: async () => {
                if (!product) return false;
                const values = form.getValues();
                const res = await patchProduct(storeId, product.id, {
                    ...detailsPatch(values),
                    ...(allergensDirty ? { contains, mayContain: may } : {}),
                });
                if (!res.ok) {
                    if (res.field === "howToUse" || res.field === "materials")
                        form.setError(res.field, { message: res.error });
                    else showError(res.error);
                    return false;
                }
                form.reset(values);
                return true;
            },
            discard: () => {
                form.reset(baseline);
                setContains(baseContains);
                setMay(baseMay);
            },
            collect: () => detailsPatch(form.getValues()),
        },
    );

    return (
        <SectionCard k="details" title="How to use and ingredients">
            <FieldLabel
                htmlFor="pe-how"
                aside={
                    <ShopSwitch
                        field="How to use"
                        checked={v.showHowToUse}
                        disabled={ro}
                        onCheckedChange={(on) =>
                            form.setValue("showHowToUse", on, {
                                shouldDirty: true,
                            })
                        }
                    />
                }
            >
                How to use or care for it
            </FieldLabel>
            <input
                id="pe-how"
                {...form.register("howToUse")}
                disabled={ro}
                placeholder="Two drops, morning and night, on clean skin."
                aria-invalid={howLong || !!errors.howToUse}
                className={boxClass({ bad: howLong || !!errors.howToUse })}
            />
            <FieldHelp
                className="mb-4 mt-1.5"
                tone={howLong || errors.howToUse ? "bad" : "quiet"}
            >
                {howLong
                    ? `Keep the line under ${LIMITS.howToUse} characters.`
                    : (errors.howToUse?.message ??
                      "One line under the price. Every variant shares it.")}
            </FieldHelp>

            <FieldLabel
                htmlFor="pe-materials"
                aside={
                    <ShopSwitch
                        field="Ingredients or material"
                        checked={v.showMaterials}
                        disabled={ro}
                        onCheckedChange={(on) =>
                            form.setValue("showMaterials", on, {
                                shouldDirty: true,
                            })
                        }
                    />
                }
            >
                Ingredients or material
            </FieldLabel>
            <textarea
                id="pe-materials"
                {...form.register("materials")}
                rows={2}
                disabled={ro}
                placeholder="Aqua, Ethyl ascorbic acid, Glycerin… — or 100% linen"
                aria-invalid={!!errors.materials}
                className={cn(
                    boxClass({ bad: !!errors.materials }),
                    "h-auto resize-y py-2 leading-[1.5]",
                )}
            />
            {errors.materials ? (
                <FieldHelp className="mt-1.5" tone="bad">
                    {errors.materials.message}
                </FieldHelp>
            ) : null}
            {allergens.length > 0 ? (
                <Allergens
                    list={allergens}
                    contains={contains}
                    may={may}
                    disabled={ro || !product}
                    onContains={(ids) => {
                        setContains(ids);
                        // One allergen is either in it or may be: not both.
                        setMay(may.filter((id) => !ids.includes(id)));
                    }}
                    onMay={(ids) => {
                        setMay(ids);
                        setContains(contains.filter((id) => !ids.includes(id)));
                    }}
                />
            ) : null}
        </SectionCard>
    );
}

function Allergens({
    list,
    contains,
    may,
    disabled,
    onContains,
    onMay,
}: {
    list: { id: string; name: string }[];
    contains: string[];
    may: string[];
    disabled: boolean;
    onContains: (ids: string[]) => void;
    onMay: (ids: string[]) => void;
}) {
    const names = (ids: string[]) =>
        list
            .filter((a) => ids.includes(a.id))
            .map((a) => a.name.toLowerCase())
            .join(", ");
    const toggle = (ids: string[], id: string) =>
        ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    const group = (
        label: string,
        ids: string[],
        onChange: (ids: string[]) => void,
    ) => (
        <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
            {list.map((a) => {
                const on = ids.includes(a.id);
                return (
                    <button
                        key={a.id}
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        onClick={() => onChange(toggle(ids, a.id))}
                        className={cn(
                            "inline-flex h-8 items-center rounded-full border px-[13px] text-[12.5px] disabled:cursor-not-allowed coarse:h-11",
                            on
                                ? "border-foreground bg-foreground font-semibold text-background"
                                : "border-border bg-card font-medium text-foreground/75 hover:bg-muted/50",
                        )}
                    >
                        {a.name}
                    </button>
                );
            })}
        </div>
    );
    return (
        <>
            <div className="mb-[7px] mt-3.5 flex items-center gap-2.5">
                <span className="flex-1 text-[12.5px] font-medium">
                    Contains
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                    Always on the shop
                </span>
            </div>
            {group("Contains", contains, onContains)}
            <p className="mb-[7px] mt-3.5 text-[12.5px] font-medium">
                May contain — same kitchen
            </p>
            {group("May contain", may, onMay)}
            <FieldHelp className="mt-[9px]">
                {contains.length || may.length
                    ? `Customers see: ${contains.length ? `Contains ${names(contains)}.` : ""}${may.length ? ` May contain ${names(may)}.` : ""}`
                    : "Tick nothing and the shop says nothing — it will not claim a product is allergen-free."}
            </FieldHelp>
        </>
    );
}
