"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@saroh/ui/input";
import { showError } from "@saroh/ui/toast";
import { useState } from "react";
import { useForm } from "react-hook-form";

import type { GstRateValue } from "@/lib/invoices/gst";
import { GST_RATE_OPTIONS, isHsnSac } from "@/lib/invoices/gst";
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
import { OptionSelect } from "@saroh/ui/option-select";

import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import type { CategoryChoice } from "./category-picker";
import { CategoryPicker } from "./category-picker";
import { useEditor, useSection } from "./editor-state";
import { Count, FieldHelp, FieldLabel } from "./fields";
import { SectionCard } from "./section-card";

const EMPTY: BasicsValues = {
    name: "",
    slug: "",
    price: "",
    mrp: "",
    categoryId: "",
    gstRate: "",
    hsnCode: "",
};

const FIELDS = [
    "name",
    "slug",
    "price",
    "mrp",
    "categoryId",
    "gstRate",
    "hsnCode",
] as const;

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
    gstRegistered,
    categories: initialCategories,
    manageCategoriesHref,
    onCategoryChange,
}: {
    product: ProductDetail | null;
    storeId: string;
    currency: string;
    /** Only a GST-registered business sets a rate and an HSN code. */
    gstRegistered: boolean;
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
    const { errors, isDirty, touchedFields, dirtyFields } = form.formState;
    // A field says what is wrong once it has been left, not while its
    // first characters are typed. What was loaded wrong says so at once,
    // and after that first leave it clears as it is fixed.
    const seen = (name: (typeof FIELDS)[number]) =>
        touchedFields[name] === true || dirtyFields[name] !== true;
    const priceBox = form.register("price");
    const mrpBox = form.register("mrp");
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
    const hsnBad = v.hsnCode.trim() !== "" && !isHsnSac(v.hsnCode);

    return (
        <SectionCard k="basics" title="Basics">
            <FieldLabel htmlFor="pe-name">Name</FieldLabel>
            <Input
                id="pe-name"
                {...form.register("name")}
                disabled={ro}
                placeholder="Vitamin C brightening serum"
                aria-invalid={nameEmpty || nameLong || !!errors.name}
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
                        <Input
                            dense
                            id="pe-slug"
                            {...form.register("slug")}
                            disabled={ro}
                            aria-invalid={!slugOk || !!errors.slug}
                            className="min-w-0 flex-[1_1_150px] font-mono"
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
                            ? "A product needs an address. It is what the link is made of."
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
                <Field
                    label="Price"
                    className="flex-[1_1_150px]"
                    error={
                        seen("price")
                            ? errors.price?.message && !priceBad
                                ? errors.price.message
                                : priceBad
                                  ? "A number with at most two decimal places."
                                  : null
                            : null
                    }
                    hint={
                        creating && !v.price
                            ? "What it sells for. Variants can set their own."
                            : `In ${CURRENCY_WORD[currency] ?? currency}, the business's currency.`
                    }
                >
                    <MoneyInput
                        id="pe-price"
                        ref={priceBox.ref}
                        name={priceBox.name}
                        onBlur={priceBox.onBlur}
                        currency={currency}
                        value={v.price}
                        onValueChange={(price) =>
                            form.setValue("price", price, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        disabled={ro}
                        placeholder="549"
                    />
                </Field>
                <Field
                    label="MRP"
                    className="flex-[1_1_150px]"
                    error={
                        seen("mrp")
                            ? mrpBad
                                ? isMoney(v.mrp)
                                    ? "MRP can't be lower than the price it sells for."
                                    : "A number with at most two decimal places."
                                : errors.mrp?.message
                            : null
                    }
                    hint="The printed price, shown struck through. Leave it empty if it sells at MRP."
                >
                    <MoneyInput
                        id="pe-mrp"
                        ref={mrpBox.ref}
                        name={mrpBox.name}
                        onBlur={mrpBox.onBlur}
                        currency={currency}
                        value={v.mrp}
                        onValueChange={(mrp) =>
                            form.setValue("mrp", mrp, {
                                shouldDirty: true,
                                shouldValidate: true,
                            })
                        }
                        disabled={ro}
                        placeholder={v.price || "699"}
                    />
                </Field>
            </div>

            <Field
                label="Category"
                className="mt-4"
                hint={
                    v.categoryId === ""
                        ? "Uncategorized is a real choice. It clears the category rather than leaving it alone."
                        : "A product sits in one category. Choosing Uncategorized clears it."
                }
            >
                <CategoryPicker
                    id="pe-category"
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
            </Field>

            {/* GST (ADR-008): printed on a registered business's tax invoice,
                so only a registered business is asked. A rate or a code
                already saved stays in view either way. */}
            {gstRegistered || v.gstRate !== "" || v.hsnCode.trim() !== "" ? (
                <div className="mt-4 flex flex-wrap gap-3.5">
                    <Field
                        label="GST rate"
                        className="flex-[1_1_150px]"
                        error={errors.gstRate?.message}
                        hint="Included in the price. Bread and other nil-rated goods are 0%."
                    >
                        <OptionSelect
                            id="pe-gst"
                            value={v.gstRate as GstRateValue}
                            onValueChange={(rate) =>
                                form.setValue("gstRate", rate, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            options={GST_RATE_OPTIONS}
                            disabled={ro}
                        />
                    </Field>
                    <Field
                        label="HSN code"
                        className="flex-[1_1_150px]"
                        error={
                            seen("hsnCode")
                                ? hsnBad
                                    ? "An HSN code is 4 to 8 digits."
                                    : errors.hsnCode?.message
                                : null
                        }
                        hint="Team only. Printed on tax invoices."
                    >
                        <Input
                            id="pe-hsn"
                            {...form.register("hsnCode")}
                            inputMode="numeric"
                            disabled={ro}
                            placeholder="1905 90 10"
                            className="font-mono"
                        />
                    </Field>
                </div>
            ) : null}
        </SectionCard>
    );
}
