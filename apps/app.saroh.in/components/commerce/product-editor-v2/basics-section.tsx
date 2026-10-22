"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@saroh/ui/input";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import type { MrpPricing } from "@/lib/gst/mrp";
import { overMrpProblem, toPayLine } from "@/lib/gst/mrp";
import type { GstPriceMode, ItemModeValue } from "@/lib/gst/price-mode";
import {
    ITEM_MODE_LABEL,
    itemModeOptions,
    rateHint,
    SAME_AS_BUSINESS,
} from "@/lib/gst/price-mode";
import { GST_RATE_NEEDED, isHsnSac } from "@/lib/invoices/gst";
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
    needsGstRate,
    paise,
    slugify,
    suggestedPath,
} from "@/lib/products/editor-sections";
import type { ProductDetail } from "@/lib/products/service";
import { OptionSelect } from "@saroh/ui/option-select";

import {
    GstRatePicker,
    pickerWiring,
} from "@/components/shared/fields/gst-rate-picker";
import { Field } from "@saroh/ui/field";
import { MoneyInput } from "@saroh/ui/money-input";
import { TextLink } from "@saroh/ui/text-link";
import type { CategoryChoice } from "./category-picker";
import { CategoryPicker } from "./category-picker";
import { useEditor, useSection } from "./editor-state";
import { Count, FieldHelp, FieldLabel } from "./fields";
import { SectionCard } from "./section-card";
import { usePathPreview } from "./use-path-preview";

const EMPTY: BasicsValues = {
    name: "",
    slug: "",
    price: "",
    mrp: "",
    categoryId: "",
    gstRate: "",
    gstPriceMode: SAME_AS_BUSINESS,
    hsnCode: "",
};

const FIELDS = [
    "name",
    "slug",
    "price",
    "mrp",
    "categoryId",
    "gstRate",
    "gstPriceMode",
    "hsnCode",
] as const;

/**
 * Basics: what the product is called, where it lives on the shop, what it
 * sells for and what it is. Creating needs a name and a price and nothing
 * else; the path is made from the name and can be changed afterwards.
 * A GST-registered business's priced product also needs its GST rate,
 * asked under the price, and beside it "GST on this price" for the one
 * product priced differently from the business's own way (12 Oct 2026). A
 * business that isn't registered is never shown that.
 *
 * GST is part of MRP (12 Oct 2026): where GST is added to this price, the
 * MRP's own line says the amount to pay ("₹1,180 to pay with 18% GST"), and
 * an MRP under it is refused in place, before Save and by the API
 * (`lib/gst/mrp.ts`). Nothing changes while the price includes GST, or for
 * a business that isn't registered.
 */
export function BasicsSection({
    product,
    storeId,
    currency,
    gstRegistered,
    gstRateNeeded = false,
    businessPriceMode = null,
    categories: initialCategories,
    manageCategoriesHref,
    onCategoryChange,
}: {
    product: ProductDetail | null;
    storeId: string;
    currency: string;
    /** Only a GST-registered business sets a rate and an HSN code. */
    gstRegistered: boolean;
    /** Known to be registered: a priced product needs its GST rate. */
    gstRateNeeded?: boolean;
    /**
     * How the business's prices carry GST, for "Same as the business (…)";
     * null when it couldn't be told.
     */
    businessPriceMode?: GstPriceMode | null;
    categories: CategoryChoice[];
    manageCategoriesHref: string;
    /** Creating: the category picked, so its defaults can apply. */
    onCategoryChange?: (categoryId: string) => void;
}) {
    const { mode, canWrite, sayError, createTries } = useEditor();
    const creating = mode === "create";
    // Create was pressed with something missing: mark it, as a save would.
    const tried = creating && createTries > 0;
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
    const problem = basicsProblem(v, creating, gstRateNeeded, {
        businessMode: businessPriceMode,
        currency,
    });
    // What one of it costs to pay, where GST is added to the price: the
    // MRP is compared with that, never with the price before GST.
    const pricing: MrpPricing = {
        registered: gstRateNeeded,
        businessMode: businessPriceMode,
        itemMode: v.gstPriceMode,
        rate: v.gstRate,
    };
    const payLine = isMoney(v.price)
        ? toPayLine(v.price, pricing, currency)
        : null;
    // A new product says its rate is missing once the price is in and the
    // box has been opened or left; a saved one says so at once.
    const rateMissing = needsGstRate(v, gstRateNeeded);
    const [rateAsked, setRateAsked] = useState(false);
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
                          rateMissing ? "a GST rate" : null,
                      ].filter((x): x is string => x !== null),
                  )
                : undefined,
            note: slugMoved
                ? `Saving changes the path. Links people saved to /products/${baseline.slug} will stop working.`
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
                    else sayError("basics", res.error);
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
    const nameEmpty = (!creating || tried) && !v.name.trim();
    const priceEmpty = tried && !v.price.trim();
    const priceBad =
        v.price.trim() !== "" ? !isMoney(v.price) : !creating && isDirty;

    // Each press of Create with something missing takes the keyboard to
    // the first thing to fix (frontend-forms: never off, said on press).
    useEffect(() => {
        if (!creating || createTries === 0) return;
        const values = form.getValues();
        const first = !values.name.trim()
            ? "pe-name"
            : !isMoney(values.price)
              ? "pe-price"
              : needsGstRate(values, gstRateNeeded)
                ? "pe-gst"
                : null;
        if (first === "pe-gst") setRateAsked(true);
        if (first) document.getElementById(first)?.focus();
        // Only a new press moves the keyboard, never a keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createTries]);
    const overMrp =
        isMoney(v.mrp) && isMoney(v.price)
            ? overMrpProblem(v.price, v.mrp, pricing, currency)
            : null;
    const mrpBad = v.mrp.trim() !== "" && (!isMoney(v.mrp) || overMrp !== null);
    // Creating: the path it will really get, a number on the end when
    // another product has the name's own (16 Oct 2026).
    const preview = usePathPreview(v.name, creating);
    const derived = preview.path || slugify(v.name);
    // A path another product has: the refusal's free one, one press away.
    const freeSlug = suggestedPath(errors.slug?.message);
    const hsnBad = v.hsnCode.trim() !== "" && !isHsnSac(v.hsnCode);
    const sameAsPrice =
        isMoney(v.mrp) && isMoney(v.price) && paise(v.mrp) === paise(v.price);

    return (
        <SectionCard k="basics" title="Basics">
            <FieldLabel htmlFor="pe-name">Name</FieldLabel>
            <Input
                id="pe-name"
                {...form.register("name")}
                disabled={ro}
                placeholder="The name on the label"
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
                          ? creating
                              ? "Add a name."
                              : "A product needs a name before it can be saved."
                          : "What customers see on the shop and on the receipt."}
                </FieldHelp>
                <Count value={v.name.length} max={LIMITS.name} />
            </div>

            <FieldLabel htmlFor={creating ? undefined : "pe-slug"}>
                Path
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
                        {preview.holder
                            ? `${preview.holder} already uses ${slugify(v.name)}, so this one gets ${derived}. You can change it after it is created.`
                            : "Made from the name. You can change it after it is created."}
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
                    </div>
                    <div className="mb-4 mt-1.5 flex items-baseline gap-2.5">
                        <FieldHelp
                            className="min-w-0 flex-1"
                            tone={
                                !v.slug.trim() || !slugOk || errors.slug
                                    ? "bad"
                                    : slugMoved
                                      ? "warn"
                                      : "quiet"
                            }
                        >
                            {!v.slug.trim()
                                ? "A product needs a path. It is what the link is made of."
                                : v.slug.length > LIMITS.slug
                                  ? "Longer than the 150 characters a path can be."
                                  : !slugOk
                                    ? "Only lowercase letters, numbers and hyphens."
                                    : (errors.slug?.message ??
                                      (slugMoved
                                          ? `Old links to /products/${baseline.slug} stop working once you save.`
                                          : "Changing it later breaks links people have saved."))}
                        </FieldHelp>
                        {/* Under the box, so on a phone the path keeps the row. */}
                        <Count value={v.slug.length} max={LIMITS.slug} />
                    </div>
                    {freeSlug && !ro ? (
                        <TextLink
                            onClick={() =>
                                form.setValue("slug", freeSlug, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            className="-mt-3 mb-4 text-[12px] coarse:min-h-11"
                        >
                            Use {freeSlug}
                        </TextLink>
                    ) : null}
                </>
            )}

            <div className="flex flex-wrap gap-3.5">
                <Field
                    holdsData={false}
                    label="Price"
                    className="flex-[1_1_150px]"
                    error={
                        priceEmpty
                            ? "Add a price."
                            : seen("price")
                              ? errors.price?.message && !priceBad
                                  ? errors.price.message
                                  : priceBad
                                    ? "A number with at most two decimal places."
                                    : null
                              : null
                    }
                    hint="What it sells for. Variants can set their own."
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
                    />
                </Field>
                <Field
                    // Its line names what this product costs to pay.
                    holdsData={payLine !== null}
                    label="MRP"
                    className="flex-[1_1_150px]"
                    error={
                        seen("mrp")
                            ? mrpBad
                                ? (overMrp ??
                                  "A number with at most two decimal places.")
                                : errors.mrp?.message
                            : null
                    }
                    hint={
                        payLine
                            ? `The printed price, which includes GST. ${payLine}, so the MRP can't be lower.`
                            : sameAsPrice
                              ? "Same as the price, so nothing is struck through."
                              : "The printed price, shown struck through. Leave it empty if it sells at MRP."
                    }
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
                    />
                </Field>
            </div>

            {/* GST (ADR-008): printed on a registered business's tax invoice,
                so only a registered business is asked. A rate or a code
                already saved stays in view either way. It sits with the
                price it is part of, and a registered business's priced
                product can't be saved without one (12 Oct 2026): 0% is a
                choice, and no chip pressed is the only "not set". */}
            {gstRegistered || v.gstRate !== "" || v.hsnCode.trim() !== "" ? (
                <div className="mt-4 flex flex-wrap gap-3.5">
                    <Field
                        // Saroh's own words, whichever way the price
                        // carries GST.
                        holdsData={false}
                        label="GST rate"
                        className="flex-[1_1_100%]"
                        error={
                            errors.gstRate?.message ??
                            (rateMissing && (rateAsked || !creating || tried)
                                ? GST_RATE_NEEDED
                                : null)
                        }
                        hint={rateHint(
                            businessPriceMode,
                            gstRateNeeded ? v.gstPriceMode : "INCLUDED",
                            "Included in the price.",
                        )}
                    >
                        {(control) => (
                            <GstRatePicker
                                {...pickerWiring(control)}
                                value={v.gstRate}
                                optional={!gstRateNeeded}
                                onChange={(rate) => {
                                    setRateAsked(true);
                                    form.setValue("gstRate", rate, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    });
                                }}
                                disabled={ro}
                            />
                        )}
                    </Field>
                    {/* Only a business known to be registered chooses how
                        a price carries GST (12 Oct 2026); most leave it as
                        the business's own way. */}
                    {gstRateNeeded ? (
                        <Field
                            label={ITEM_MODE_LABEL}
                            className="flex-[1_1_220px]"
                            hint="Only if this one is priced differently from the rest."
                        >
                            <OptionSelect<ItemModeValue>
                                id="pe-gst-mode"
                                value={v.gstPriceMode}
                                onValueChange={(mode) =>
                                    form.setValue("gstPriceMode", mode, {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                    })
                                }
                                options={itemModeOptions(businessPriceMode)}
                                disabled={ro}
                            />
                        </Field>
                    ) : null}
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
                            className="font-mono"
                        />
                    </Field>
                </div>
            ) : null}

            <Field label="Category" className="mt-4">
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
        </SectionCard>
    );
}
