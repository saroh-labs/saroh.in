"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { patchProduct } from "@/lib/products/actions";
import type { BasicsValues } from "@/lib/products/editor-sections";
import {
    basicsFrom,
    basicsPatch,
    basicsProblem,
    basicsSchema,
    isMoney,
    joinAnd,
    LIMITS,
    paise,
    slugify,
} from "@/lib/products/editor-sections";
import type { ProductDetail } from "@/lib/products/service";

import type { CategoryChoice } from "./category-picker";
import { CategoryPicker } from "./category-picker";
import { useEditor, useSection } from "./editor-state";
import { boxClass, Count, FieldHelp, FieldLabel, MoneyBox } from "./fields";
import { SectionCard } from "./section-card";

const EMPTY: BasicsValues = {
    name: "",
    slug: "",
    price: "",
    mrp: "",
    categoryId: "",
};

const FIELDS = ["name", "slug", "price", "mrp", "categoryId"] as const;

const CURRENCY_WORD: Record<string, string> = {
    INR: "rupees",
    USD: "US dollars",
    EUR: "euros",
    GBP: "pounds",
};

/**
 * Basics: what the product is called, where it lives on the shop, what it
 * sells for and what it is. Creating needs a name and a price and nothing
 * else; the address is made from the name and can be changed afterwards.
 */
export function BasicsSection({
    product,
    storeId,
    currency,
    symbol,
    categories: initialCategories,
    manageCategoriesHref,
    onCategoryChange,
}: {
    product: ProductDetail | null;
    storeId: string;
    currency: string;
    symbol: string;
    categories: CategoryChoice[];
    manageCategoriesHref: string;
    /** Creating: the category picked, so its defaults can apply. */
    onCategoryChange?: (categoryId: string) => void;
}) {
    const { mode, canWrite } = useEditor();
    const creating = mode === "create";
    const [categories, setCategories] = useState(initialCategories);
    const baseline = product ? basicsFrom(product) : EMPTY;
    const form = useForm<BasicsValues>({
        resolver: zodResolver(basicsSchema),
        values: baseline,
        mode: "onChange",
    });
    const { errors, isDirty } = form.formState;
    const v = form.watch();
    const problem = basicsProblem(v, creating);
    const ro = !canWrite;

    // Once customers could reach it, a new address breaks the old links.
    const everLive = product !== null && product.status !== "DRAFT";
    const slugOk = /^[a-z0-9-]+$/.test(v.slug) && v.slug.length <= LIMITS.slug;
    const slugMoved =
        !creating && everLive && slugOk && v.slug !== baseline.slug;

    useSection(
        "basics",
        {
            dirty: isDirty,
            problem,
            // The problem names only the first; creating says them all.
            missing: creating
                ? joinAnd(
                      [
                          v.name.trim() ? null : "a name",
                          v.price.trim() ? null : "a price",
                      ].filter((x): x is string => x !== null),
                  )
                : undefined,
            note: slugMoved
                ? `Saving moves the address. Links people saved to /products/${baseline.slug} will stop working.`
                : undefined,
        },
        {
            save: async () => {
                if (!product) return false;
                const values = form.getValues();
                const res = await patchProduct(
                    storeId,
                    product.id,
                    basicsPatch(values),
                );
                if (!res.ok) {
                    const field = res.field;
                    if (field && (FIELDS as readonly string[]).includes(field))
                        form.setError(field as (typeof FIELDS)[number], {
                            message: res.error,
                        });
                    else showError(res.error);
                    return false;
                }
                form.reset(values);
                return true;
            },
            discard: () => form.reset(baseline),
            collect: () => {
                const values = form.getValues();
                const { slug: _slug, ...rest } = basicsPatch(values);
                return rest;
            },
        },
    );

    const nameLong = v.name.length > LIMITS.name;
    const nameEmpty = !creating && !v.name.trim();
    const priceBad =
        v.price.trim() !== "" ? !isMoney(v.price) : !creating && isDirty;
    const mrpBad =
        v.mrp.trim() !== "" &&
        (!isMoney(v.mrp) ||
            (isMoney(v.price) && paise(v.mrp) < paise(v.price)));
    const derived = slugify(v.name);

    return (
        <SectionCard k="basics" title="Basics">
            <FieldLabel htmlFor="pe-name" required={creating}>
                Name
            </FieldLabel>
            <input
                id="pe-name"
                {...form.register("name")}
                disabled={ro}
                placeholder="Vitamin C brightening serum"
                aria-invalid={nameEmpty || nameLong || !!errors.name}
                className={boxClass({
                    bad: nameEmpty || nameLong || !!errors.name,
                })}
            />
            <div className="mb-4 mt-1.5 flex items-baseline gap-2.5">
                <FieldHelp
                    tone={nameEmpty || !!errors.name ? "bad" : "quiet"}
                    className="min-w-0 flex-1"
                >
                    {errors.name?.message && !nameEmpty
                        ? errors.name.message
                        : nameEmpty
                          ? "A product needs a name before it can be saved."
                          : "What customers see on the shop and on the receipt."}
                </FieldHelp>
                <Count value={v.name.length} max={LIMITS.name} />
            </div>

            <FieldLabel htmlFor={creating ? undefined : "pe-slug"}>
                Address on the shop
            </FieldLabel>
            {creating ? (
                <>
                    <div className="flex flex-wrap items-center gap-2 rounded-[9px] bg-muted/50 px-[13px] py-[11px]">
                        <span className="font-mono text-[12px] text-muted-foreground">
                            /products/
                        </span>
                        <span
                            className={
                                derived
                                    ? "min-w-0 break-all font-mono text-[12.5px]"
                                    : "min-w-0 font-mono text-[12.5px] text-muted-foreground/70"
                            }
                        >
                            {derived || "made-from-the-name"}
                        </span>
                    </div>
                    <FieldHelp className="mb-4 mt-1.5">
                        Made from the name. You can change it after it is
                        created.
                    </FieldHelp>
                </>
            ) : (
                <>
                    <div className="flex flex-wrap items-center gap-2 rounded-[9px] bg-muted/50 px-[11px] py-[9px]">
                        <span className="font-mono text-[12px] text-muted-foreground">
                            /products/
                        </span>
                        <input
                            id="pe-slug"
                            {...form.register("slug")}
                            disabled={ro}
                            aria-invalid={!slugOk || !!errors.slug}
                            className={`${boxClass({
                                bad: !slugOk || !v.slug || !!errors.slug,
                                mono: true,
                                small: true,
                            })} min-w-0 flex-[1_1_150px] rounded-[7px] px-[9px]`}
                        />
                        <Count value={v.slug.length} max={LIMITS.slug} />
                    </div>
                    <FieldHelp
                        className="mb-4 mt-1.5"
                        tone={
                            !v.slug.trim() || !slugOk || errors.slug
                                ? "bad"
                                : slugMoved
                                  ? "warn"
                                  : "quiet"
                        }
                    >
                        {!v.slug.trim()
                            ? "A product needs an address — it is what the link is made of."
                            : v.slug.length > LIMITS.slug
                              ? "Longer than the 150 characters an address can be."
                              : !slugOk
                                ? "Only lowercase letters, numbers and hyphens."
                                : (errors.slug?.message ??
                                  (slugMoved
                                      ? `Old links to /products/${baseline.slug} stop working once you save.`
                                      : "Changing it later breaks links people have saved."))}
                    </FieldHelp>
                </>
            )}

            <div className="flex flex-wrap gap-3.5">
                <div className="min-w-0 flex-[1_1_150px]">
                    <FieldLabel htmlFor="pe-price" required={creating}>
                        Price
                    </FieldLabel>
                    <MoneyBox symbol={symbol}>
                        <input
                            id="pe-price"
                            {...form.register("price")}
                            inputMode="decimal"
                            disabled={ro}
                            placeholder="549"
                            aria-invalid={priceBad || !!errors.price}
                            className={`${boxClass({ bad: priceBad || !!errors.price })} pl-6`}
                        />
                    </MoneyBox>
                    <FieldHelp
                        className="mt-1.5"
                        tone={priceBad || errors.price ? "bad" : "quiet"}
                    >
                        {errors.price?.message && !priceBad
                            ? errors.price.message
                            : priceBad
                              ? "A number with at most two decimal places."
                              : creating && !v.price
                                ? "What it sells for. Variants can set their own."
                                : `In ${CURRENCY_WORD[currency] ?? currency}, the business's currency.`}
                    </FieldHelp>
                </div>
                <div className="min-w-0 flex-[1_1_150px]">
                    <FieldLabel htmlFor="pe-mrp">MRP</FieldLabel>
                    <MoneyBox symbol={symbol}>
                        <input
                            id="pe-mrp"
                            {...form.register("mrp")}
                            inputMode="decimal"
                            disabled={ro}
                            placeholder={v.price || "699"}
                            aria-invalid={mrpBad || !!errors.mrp}
                            className={`${boxClass({ bad: mrpBad || !!errors.mrp })} pl-6`}
                        />
                    </MoneyBox>
                    <FieldHelp
                        className="mt-1.5"
                        tone={mrpBad || errors.mrp ? "bad" : "quiet"}
                    >
                        {mrpBad
                            ? isMoney(v.mrp)
                                ? "MRP can't be lower than the price it sells for."
                                : "A number with at most two decimal places."
                            : (errors.mrp?.message ??
                              "The printed price, shown struck through. Leave it empty if it sells at MRP.")}
                    </FieldHelp>
                </div>
            </div>

            <div className="mt-4">
                <FieldLabel htmlFor="pe-category">Category</FieldLabel>
                <CategoryPicker
                    id="pe-category"
                    storeId={storeId}
                    value={v.categoryId}
                    onChange={(id) => {
                        form.setValue("categoryId", id, {
                            shouldDirty: true,
                            shouldValidate: true,
                        });
                        onCategoryChange?.(id);
                    }}
                    categories={categories}
                    onCreated={(c) => setCategories((list) => [...list, c])}
                    manageHref={manageCategoriesHref}
                    disabled={ro}
                />
                <FieldHelp className="mt-1.5">
                    {v.categoryId === ""
                        ? "Uncategorized is a real choice — it clears the category rather than leaving it alone."
                        : "A product sits in one category. Choosing Uncategorized clears it."}
                </FieldHelp>
            </div>
        </SectionCard>
    );
}
