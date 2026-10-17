"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Textarea } from "@saroh/ui/textarea";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ShopSwitch } from "@/components/commerce/product-sections/shop-switch";
import { patchProduct } from "@/lib/products/actions";
import { detailsCopy } from "@/lib/products/editor-labels";
import type { DetailsValues } from "@/lib/products/editor-sections";
import {
    detailsFrom,
    detailsPatch,
    detailsSchema,
    firstProblem,
    heldOverLimit,
    LIMITS,
} from "@/lib/products/editor-sections";
import {
    FULFILMENT_CHOICES,
    inTableOrder,
} from "@/lib/products/fulfilment-types";
import type {
    ProductDetail,
    ProductFulfilmentType,
} from "@/lib/products/service";
import type { EffectiveDefaults } from "@/lib/products/settings";

import { Chip } from "@/components/shared/chip";
import { useEditor, useSection } from "./editor-state";
import { Count, FieldHelp, FieldLabel } from "./fields";
import { SectionCard } from "./section-card";

const EMPTY: DetailsValues = {
    howToUse: "",
    materials: "",
    showHowToUse: true,
    showMaterials: true,
    fulfilmentTypes: [],
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
    const { canWrite, sayError } = useEditor();
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
    const copy = detailsCopy(allergens.length > 0);
    // Creating: the allergens go with the create call, like every other
    // field here (#525).
    const allergenPatch = () =>
        contains.length || may.length ? { contains, mayContain: may } : {};
    // Saved over the limit before it was one (How to use, 395 of 300): a
    // held note, and the rest of the section still saves around it.
    const held = heldOverLimit(v.howToUse, baseline.howToUse, LIMITS.howToUse);
    const howLong = !held && v.howToUse.length > LIMITS.howToUse;
    const howTooLong = `Keep it under ${LIMITS.howToUse} characters. It is ${v.howToUse.length} now.`;
    const patchOf = (values: DetailsValues) => {
        const patch = detailsPatch(values);
        // Unchanged and held: left as it is, so the API isn't asked to
        // judge a line nobody touched.
        if (held) delete patch.howToUse;
        return patch;
    };

    useSection(
        "details",
        {
            dirty: isDirty || allergensDirty,
            note: copy.saves,
            problem: howLong
                ? howTooLong
                : firstProblem(detailsSchema, {
                      ...v,
                      howToUse: held ? "" : v.howToUse,
                  }),
        },
        {
            save: async () => {
                if (!product) return false;
                const values = form.getValues();
                const res = await patchProduct(storeId, product.id, {
                    ...patchOf(values),
                    ...(allergensDirty ? { contains, mayContain: may } : {}),
                });
                if (!res.ok) {
                    if (res.field === "howToUse" || res.field === "materials")
                        form.setError(res.field, { message: res.error });
                    else sayError("details", res.error);
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
            collect: () => ({
                ...detailsPatch(form.getValues()),
                ...allergenPatch(),
            }),
        },
    );

    return (
        <SectionCard k="details" title={copy.title}>
            <FieldLabel
                htmlFor="pe-how"
                aside={
                    <ShopSwitch
                        field={copy.how.field}
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
                {copy.how.label}
            </FieldLabel>
            <Textarea
                id="pe-how"
                {...form.register("howToUse")}
                rows={3}
                disabled={ro}
                placeholder={copy.how.placeholder}
                aria-invalid={howLong || (!held && !!errors.howToUse)}
                aria-describedby="pe-how-note"
                className="resize-y"
            />
            <div className="mb-4 mt-1.5 flex items-baseline gap-2.5">
                <FieldHelp
                    id="pe-how-note"
                    className="min-w-0 flex-1"
                    tone={
                        howLong || (!held && errors.howToUse)
                            ? "bad"
                            : held
                              ? "warn"
                              : "quiet"
                    }
                >
                    {held ||
                        (howLong
                            ? howTooLong
                            : (errors.howToUse?.message ?? copy.how.help))}
                </FieldHelp>
                {/* Held, the note says the count: red only for a line
                    being typed past the limit. */}
                {held ? null : (
                    <Count value={v.howToUse.length} max={LIMITS.howToUse} />
                )}
            </div>

            <FieldLabel
                htmlFor="pe-materials"
                aside={
                    <ShopSwitch
                        field={copy.materials.field}
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
                {copy.materials.label}
            </FieldLabel>
            <Textarea
                id="pe-materials"
                {...form.register("materials")}
                rows={2}
                disabled={ro}
                placeholder={copy.materials.placeholder}
                aria-invalid={!!errors.materials}
                className="resize-y"
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
                    disabled={ro}
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
            <FulfilmentChips
                picked={v.fulfilmentTypes}
                disabled={ro}
                onChange={(types) =>
                    form.setValue("fulfilmentTypes", types, {
                        shouldDirty: true,
                    })
                }
            />
        </SectionCard>
    );
}

/**
 * How it's fulfilled (B12): the ways an order with it may leave. None
 * picked is every way its storefronts offer; the API refuses an order in a
 * way a picked list leaves out.
 */
function FulfilmentChips({
    picked,
    disabled,
    onChange,
}: {
    picked: ProductFulfilmentType[];
    disabled: boolean;
    onChange: (types: ProductFulfilmentType[]) => void;
}) {
    return (
        <>
            <p
                id="pe-fulfilment"
                className="mb-[7px] mt-3.5 text-[12.5px] font-medium"
            >
                How it&apos;s fulfilled
            </p>
            <div
                role="group"
                aria-labelledby="pe-fulfilment"
                className="flex flex-wrap gap-1.5"
            >
                {FULFILMENT_CHOICES.map((c) => {
                    const on = picked.includes(c.value);
                    return (
                        <Chip
                            key={c.value}
                            as="toggle"
                            on={on}
                            disabled={disabled}
                            onClick={() =>
                                onChange(
                                    on
                                        ? picked.filter((t) => t !== c.value)
                                        : inTableOrder([...picked, c.value]),
                                )
                            }
                        >
                            {c.label}
                        </Chip>
                    );
                })}
            </div>
            <FieldHelp className="mt-[9px]">
                {picked.length
                    ? "An order with it offers only these ways."
                    : "Pick none and it goes every way its locations offer."}
            </FieldHelp>
        </>
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
                    <Chip
                        key={a.id}
                        as="toggle"
                        on={on}
                        disabled={disabled}
                        onClick={() => onChange(toggle(ids, a.id))}
                    >
                        {a.name}
                    </Chip>
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
                May contain (same kitchen)
            </p>
            {group("May contain", may, onMay)}
            <FieldHelp className="mt-[9px]">
                {contains.length || may.length
                    ? `Customers see: ${contains.length ? `Contains ${names(contains)}.` : ""}${may.length ? ` May contain ${names(may)}.` : ""}`
                    : "Tick nothing and the shop says nothing. It will not claim a product is allergen-free."}
            </FieldHelp>
        </>
    );
}
