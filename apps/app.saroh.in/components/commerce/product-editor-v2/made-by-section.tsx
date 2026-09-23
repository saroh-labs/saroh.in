"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { DatePicker } from "@saroh/ui/date-picker";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import {
    ChoicePills,
    ShopSwitch,
} from "@/components/commerce/product-sections/shop-switch";
import { patchProduct } from "@/lib/products/actions";
import type { MadeByValues } from "@/lib/products/editor-sections";
import {
    firstProblem,
    madeByFrom,
    madeByPatch,
    madeBySchema,
} from "@/lib/products/editor-sections";
import { productSettingsHref } from "@/lib/products/links";
import type { ProductCustomField, ProductDetail } from "@/lib/products/service";

import { useEditor, useSection } from "./editor-state";
import { boxClass, FieldHelp, FieldLabel } from "./fields";
import { SectionCard } from "./section-card";

const EMPTY: MadeByValues = {
    madeHere: true,
    maker: "",
    madeIn: "",
    supplierCode: "",
    warranty: "",
    returnsMode: "STOREFRONT",
    returnsText: "",
    showMaker: true,
    showMadeIn: true,
    showWarranty: true,
    showReturns: true,
};

type Switch = "showMaker" | "showMadeIn" | "showWarranty" | "showReturns";

/**
 * Who makes it, the warranty and the returns rule. Made here needs nothing
 * typed — the business is the maker. Made by someone else asks who, and
 * where; a supplier's code for reordering stays with the team.
 */
export function MadeBySection({
    product,
    storeId,
    storeName,
}: {
    product: ProductDetail | null;
    storeId: string;
    storeName: string;
}) {
    const { canWrite } = useEditor();
    const baseline = product ? madeByFrom(product) : EMPTY;
    const fields = product?.customFields ?? [];
    const baseCustom = customFrom(fields);
    const customKey = JSON.stringify(baseCustom);
    const [custom, setCustom] = useState(baseCustom);
    const [seenCustom, setSeenCustom] = useState(customKey);
    if (seenCustom !== customKey) {
        setSeenCustom(customKey);
        setCustom(baseCustom);
    }
    const customDirty = JSON.stringify(custom) !== customKey;
    const customProblem =
        fields.map((f) => fieldProblem(f, custom[f.id] ?? "")).find(Boolean) ??
        "";
    const form = useForm<MadeByValues>({
        resolver: zodResolver(madeBySchema),
        values: baseline,
        mode: "onChange",
    });
    const { isDirty, errors } = form.formState;
    const v = form.watch();
    const ro = !canWrite;
    const makerMissing = !v.madeHere && !v.maker.trim();
    const ownMissing = v.returnsMode === "OWN" && !v.returnsText.trim();

    useSection(
        "madeby",
        {
            dirty: isDirty || customDirty,
            problem: firstProblem(madeBySchema, v) || customProblem,
        },
        {
            save: async () => {
                if (!product) return false;
                const values = form.getValues();
                const res = await patchProduct(storeId, product.id, {
                    ...madeByPatch(values),
                    ...(customDirty ? { customFields: custom } : {}),
                });
                if (!res.ok) {
                    if (res.field === "maker" || res.field === "returnsText")
                        form.setError(res.field, { message: res.error });
                    else showError(res.error);
                    return false;
                }
                form.reset(values);
                setCustom(custom);
                return true;
            },
            discard: () => {
                form.reset(baseline);
                setCustom(baseCustom);
            },
            collect: () => madeByPatch(form.getValues()),
        },
    );

    const toggle = (name: Switch, label: string) => (
        <ShopSwitch
            field={label}
            checked={v[name]}
            disabled={ro}
            onCheckedChange={(on) =>
                form.setValue(name, on, { shouldDirty: true })
            }
        />
    );

    return (
        <SectionCard k="madeby" title="Made by, warranty and returns">
            <div className="mb-3.5">
                <ChoicePills
                    label="Who makes it"
                    value={v.madeHere ? "here" : "else"}
                    disabled={ro}
                    onChange={(next) =>
                        form.setValue("madeHere", next === "here", {
                            shouldDirty: true,
                            shouldValidate: true,
                        })
                    }
                    options={[
                        { value: "here", label: "Made here" },
                        { value: "else", label: "Made by someone else" },
                    ]}
                />
            </div>

            {v.madeHere ? (
                <>
                    <FieldLabel aside={toggle("showMaker", "Made by")}>
                        Made by
                    </FieldLabel>
                    <div className="flex h-9 items-center rounded-[8px] bg-muted/50 px-[11px] text-[13px] text-foreground/75">
                        {storeName}
                    </div>
                    <FieldHelp className="mb-4 mt-1.5">
                        From your business details — nothing to type.
                    </FieldHelp>
                </>
            ) : (
                <>
                    <div className="flex flex-wrap gap-3">
                        <div className="min-w-0 flex-[1_1_180px]">
                            <FieldLabel
                                htmlFor="pe-maker"
                                aside={toggle("showMaker", "Maker or supplier")}
                            >
                                Maker or supplier
                            </FieldLabel>
                            <input
                                id="pe-maker"
                                {...form.register("maker")}
                                disabled={ro}
                                placeholder="Vetiver Labs"
                                aria-invalid={makerMissing || !!errors.maker}
                                className={boxClass({
                                    bad: makerMissing || !!errors.maker,
                                })}
                            />
                        </div>
                        <div className="min-w-0 flex-[1_1_150px]">
                            <FieldLabel
                                htmlFor="pe-made-in"
                                aside={toggle("showMadeIn", "Made in")}
                            >
                                Made in
                            </FieldLabel>
                            <input
                                id="pe-made-in"
                                {...form.register("madeIn")}
                                disabled={ro}
                                placeholder="Pune, India"
                                className={boxClass()}
                            />
                        </div>
                    </div>
                    {makerMissing || errors.maker ? (
                        <FieldHelp className="mt-1.5" tone="bad">
                            {errors.maker?.message ??
                                "Add who makes it, or switch back to Made here."}
                        </FieldHelp>
                    ) : null}
                    <div className="mt-3">
                        <FieldLabel
                            htmlFor="pe-supplier-code"
                            aside={
                                <span className="shrink-0 rounded-full bg-muted px-[7px] py-px text-[11px] font-semibold text-muted-foreground">
                                    Team only
                                </span>
                            }
                        >
                            Supplier&apos;s product code
                        </FieldLabel>
                        <input
                            id="pe-supplier-code"
                            {...form.register("supplierCode")}
                            disabled={ro}
                            placeholder="For reordering"
                            className={boxClass({ mono: true })}
                        />
                    </div>
                    <div className="h-4" />
                </>
            )}

            <FieldLabel
                htmlFor="pe-warranty"
                aside={toggle("showWarranty", "Warranty")}
            >
                Warranty
            </FieldLabel>
            <input
                id="pe-warranty"
                {...form.register("warranty")}
                disabled={ro}
                placeholder="None"
                className={boxClass()}
            />
            <FieldHelp className="mb-4 mt-1.5">
                How long, and what it covers — one line. Leave it empty if there
                is none; the shop shows nothing.
            </FieldHelp>

            <FieldLabel aside={toggle("showReturns", "Returns")}>
                Returns
            </FieldLabel>
            <div
                role="radiogroup"
                aria-label="Returns rule"
                className="flex flex-col gap-1.5"
            >
                {(
                    [
                        ["STOREFRONT", "Use the storefront's rule"],
                        ["OWN", "Its own rule"],
                    ] as const
                ).map(([mode, label]) => {
                    const on = v.returnsMode === mode;
                    return (
                        <button
                            key={mode}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={ro}
                            onClick={() =>
                                form.setValue("returnsMode", mode, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            className={cn(
                                "flex w-full items-center gap-[9px] rounded-[8px] border bg-card px-[11px] py-2 text-left text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed coarse:min-h-11",
                                on ? "border-foreground" : "border-border",
                            )}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "size-3.5 shrink-0 rounded-full bg-card",
                                    on
                                        ? "border-4 border-foreground"
                                        : "border-[1.5px] border-border-strong",
                                )}
                            />
                            <span className="flex-1">{label}</span>
                        </button>
                    );
                })}
            </div>
            {v.returnsMode === "OWN" ? (
                <>
                    <input
                        {...form.register("returnsText")}
                        disabled={ro}
                        aria-label="This product's returns rule"
                        placeholder="Exchange within 7 days, tags on"
                        aria-invalid={ownMissing || !!errors.returnsText}
                        className={cn(
                            boxClass({
                                bad: ownMissing || !!errors.returnsText,
                            }),
                            "mt-2",
                        )}
                    />
                    {ownMissing || errors.returnsText ? (
                        <FieldHelp className="mt-1.5" tone="bad">
                            {errors.returnsText?.message ??
                                "Write this product's returns rule, or use the storefront's."}
                        </FieldHelp>
                    ) : null}
                </>
            ) : null}

            {fields.length > 0 && product ? (
                <MoreAboutIt
                    fields={fields}
                    values={custom}
                    onChange={(id, value) =>
                        setCustom((c) => ({ ...c, [id]: value }))
                    }
                    categoryName={product.category?.name ?? ""}
                    manageHref={productSettingsHref(storeId, "fields")}
                    disabled={ro}
                />
            ) : null}
        </SectionCard>
    );
}

function customFrom(fields: ProductCustomField[]): Record<string, string> {
    return Object.fromEntries(fields.map((f) => [f.id, f.value ?? ""]));
}

/** What a value must fix, in the API's words; "" when it is fine. */
function fieldProblem(f: ProductCustomField, value: string): string {
    const v = value.trim();
    if (!v) return "";
    if (f.type === "NUMBER" && !/^-?\d+(\.\d+)?$/.test(v))
        return `${f.name} is a number.`;
    if (f.type === "TEXT" && v.length > 200)
        return `Keep ${f.name} under 200 characters.`;
    return "";
}

const toDate = (v: string): Date | undefined => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    return m
        ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        : undefined;
};
const fromDate = (d: Date | undefined): string =>
    d
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
        : "";

/**
 * "More about it": the custom fields the product's category asks for (#482),
 * each saying who sees it. Saved with this section.
 */
function MoreAboutIt({
    fields,
    values,
    onChange,
    categoryName,
    manageHref,
    disabled,
}: {
    fields: ProductCustomField[];
    values: Record<string, string>;
    onChange: (fieldId: string, value: string) => void;
    categoryName: string;
    manageHref: string;
    disabled: boolean;
}) {
    return (
        <div className="mt-[18px] border-t border-border/70 pt-3.5">
            <div className="mb-2.5 flex flex-wrap items-baseline gap-2">
                <span className="text-[12.5px] font-semibold">
                    More about it
                </span>
                <span className="text-[11.5px] text-muted-foreground">
                    Asked of everything in {categoryName}.
                </span>
                <Link
                    href={manageHref}
                    className="ml-auto text-[12px] text-brand hover:text-foreground"
                >
                    Manage fields
                </Link>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                {fields.map((f) => {
                    const value = values[f.id] ?? "";
                    const problem = fieldProblem(f, value);
                    const id = `pe-field-${f.id}`;
                    return (
                        <div key={f.id} className="min-w-0">
                            <FieldLabel
                                htmlFor={f.type === "YES_NO" ? undefined : id}
                                aside={
                                    <span
                                        className={cn(
                                            "shrink-0 rounded-full px-[7px] py-px text-[11px] font-semibold",
                                            f.onShop
                                                ? "bg-success-subtle text-success-subtle-foreground"
                                                : "bg-muted text-muted-foreground",
                                        )}
                                    >
                                        {f.onShop ? "On the shop" : "Team only"}
                                    </span>
                                }
                            >
                                {f.name}
                            </FieldLabel>
                            {f.type === "DATE" ? (
                                <DatePicker
                                    id={id}
                                    value={toDate(value)}
                                    onValueChange={(d) =>
                                        onChange(f.id, fromDate(d))
                                    }
                                    disabled={disabled}
                                    aria-label={f.name}
                                    className="h-9 w-full rounded-[8px] text-[13px]"
                                />
                            ) : f.type === "YES_NO" ? (
                                <ChoicePills
                                    label={f.name}
                                    value={
                                        value === "true"
                                            ? "true"
                                            : value === "false"
                                              ? "false"
                                              : ""
                                    }
                                    disabled={disabled}
                                    onChange={(next) => onChange(f.id, next)}
                                    options={[
                                        { value: "true", label: "Yes" },
                                        { value: "false", label: "No" },
                                        { value: "", label: "Not said" },
                                    ]}
                                />
                            ) : (
                                <input
                                    id={id}
                                    value={value}
                                    disabled={disabled}
                                    inputMode={
                                        f.type === "NUMBER"
                                            ? "decimal"
                                            : undefined
                                    }
                                    onChange={(e) =>
                                        onChange(f.id, e.target.value)
                                    }
                                    aria-invalid={!!problem}
                                    className={boxClass({ bad: !!problem })}
                                />
                            )}
                            {problem ? (
                                <FieldHelp className="mt-1.5" tone="bad">
                                    {problem}
                                </FieldHelp>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
