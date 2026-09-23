"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
    ChoicePills,
    ShopSwitch,
} from "@/components/commerce/product-sections/shop-switch";
import { OptionSelect } from "@/components/shared/option-select";
import { patchProduct } from "@/lib/products/actions";
import {
    LIMITS,
    madeByFrom,
    madeByPatch,
    madeBySchema,
} from "@/lib/products/editor-sections";
import { productEditHref } from "@/lib/products/links";
import type { ProductDetail, ProductPatch } from "@/lib/products/service";

import { QuickSheet } from "../quick-sheet";

const schema = z.intersection(
    z.object({
        status: z.enum(["PUBLISHED", "DRAFT", "ARCHIVED"]),
        categoryId: z.string(),
        howToUse: z
            .string()
            .max(
                LIMITS.howToUse,
                `Keep the line under ${LIMITS.howToUse} characters.`,
            ),
        showHowToUse: z.boolean(),
    }),
    madeBySchema,
);
type Values = z.infer<typeof schema>;

const STATUS_NOTE: Record<Values["status"], string> = {
    PUBLISHED: "Customers can see and buy it.",
    DRAFT: "Only the team can see it. Its page stops opening for customers.",
    ARCHIVED: "Not sold, and its page does not open. Past orders keep it.",
};

function valuesOf(p: ProductDetail): Values {
    return {
        status: p.status,
        categoryId: p.categoryId ?? "",
        howToUse: p.howToUse ?? "",
        showHowToUse: p.shopFields.howToUse !== false,
        ...madeByFrom(p),
    };
}

function patchOf(v: Values, p: ProductDetail): ProductPatch {
    const made = madeByPatch(v, p.shopFields);
    return {
        status: v.status,
        categoryId: v.categoryId || null,
        howToUse: v.howToUse.trim() || null,
        ...made,
        shopFields: { ...made.shopFields, howToUse: v.showHowToUse },
    };
}

/**
 * The product page's "Edit details": whether it is on the shop, what it is
 * (its category), its how-to-use or care line, who makes it, a warranty and
 * its returns rule — each customer-facing one with its own switch. Saves on
 * its own, with Undo.
 */
export function DetailsSheet({
    open,
    onOpenChange,
    product,
    storeId,
    categories,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: ProductDetail;
    storeId: string;
    categories: { id: string; name: string }[];
}) {
    const router = useRouter();
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        values: valuesOf(product),
        resetOptions: { keepDirtyValues: false },
    });
    const { isSubmitting, isDirty, errors } = form.formState;
    const madeHere = form.watch("madeHere");
    const returnsMode = form.watch("returnsMode");
    const status = form.watch("status");
    const firstError = Object.values(errors)[0]?.message;

    async function save(v: Values) {
        const before = patchOf(valuesOf(product), product);
        const res = await patchProduct(
            storeId,
            product.id,
            patchOf(v, product),
        );
        if (!res.ok) {
            if (
                res.field === "maker" ||
                res.field === "returnsText" ||
                res.field === "howToUse"
            ) {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        onOpenChange(false);
        router.refresh();
        showUndo("Details saved.", () => {
            void patchProduct(storeId, product.id, before).then((undo) => {
                if (!undo.ok)
                    showError("Couldn't undo. The saved details stay.");
                router.refresh();
            });
        });
    }

    return (
        <QuickSheet
            open={open}
            onOpenChange={(o) => {
                if (!o) form.reset(valuesOf(product));
                onOpenChange(o);
            }}
            productName={product.name}
            title="Edit details"
            fullEditorHref={productEditHref(storeId, product.id, "details")}
            dirty={isDirty}
            saving={isSubmitting}
            note={firstError ?? (isDirty ? undefined : "No changes yet")}
            onSave={() => void form.handleSubmit(save)()}
        >
            <Form {...form}>
                <div className="flex flex-col gap-4">
                    <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Visibility</FormLabel>
                                <FormControl>
                                    <ChoicePills
                                        label="Visibility"
                                        value={field.value}
                                        onChange={field.onChange}
                                        options={[
                                            {
                                                value: "PUBLISHED",
                                                label: "On the shop",
                                            },
                                            { value: "DRAFT", label: "Draft" },
                                            {
                                                value: "ARCHIVED",
                                                label: "Archived",
                                            },
                                        ]}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {STATUS_NOTE[status]}
                                </FormDescription>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="categoryId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Category</FormLabel>
                                <FormControl>
                                    <OptionSelect
                                        aria-label="Category"
                                        value={field.value}
                                        onValueChange={field.onChange}
                                        options={[
                                            {
                                                value: "",
                                                label: "Uncategorized",
                                            },
                                            ...categories.map((c) => ({
                                                value: c.id,
                                                label: c.name,
                                            })),
                                        ]}
                                    />
                                </FormControl>
                                <FormDescription>
                                    One per product — what it is. It drives the
                                    shop&apos;s filters and your reports.
                                </FormDescription>
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="howToUse"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center justify-between gap-2">
                                    <FormLabel>
                                        How to use or care for it
                                    </FormLabel>
                                    <ShopSwitch
                                        field="How to use"
                                        checked={form.watch("showHowToUse")}
                                        onCheckedChange={(v) =>
                                            form.setValue("showHowToUse", v, {
                                                shouldDirty: true,
                                            })
                                        }
                                    />
                                </div>
                                <FormControl>
                                    <Input
                                        {...field}
                                        placeholder="Two drops, morning and night, on clean skin."
                                    />
                                </FormControl>
                                <FormDescription>
                                    One line under the price. Every variant
                                    shares it.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <fieldset className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                            <legend className="text-sm font-medium">
                                Who makes it
                            </legend>
                            <ShopSwitch
                                field="Made by"
                                checked={form.watch("showMaker")}
                                onCheckedChange={(v) =>
                                    form.setValue("showMaker", v, {
                                        shouldDirty: true,
                                    })
                                }
                            />
                        </div>
                        <ChoicePills
                            label="Who makes it"
                            value={madeHere ? "here" : "else"}
                            onChange={(v) =>
                                form.setValue("madeHere", v === "here", {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            options={[
                                { value: "here", label: "Made here" },
                                {
                                    value: "else",
                                    label: "Made by someone else",
                                },
                            ]}
                        />
                        {madeHere ? null : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormField
                                    control={form.control}
                                    name="maker"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                Maker or supplier
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder="Kama Labs"
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="madeIn"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Made in</FormLabel>
                                            <FormControl>
                                                <Input
                                                    {...field}
                                                    placeholder="Pune, India"
                                                />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            </div>
                        )}
                    </fieldset>

                    <FormField
                        control={form.control}
                        name="warranty"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center justify-between gap-2">
                                    <FormLabel>Warranty</FormLabel>
                                    <ShopSwitch
                                        field="Warranty"
                                        checked={form.watch("showWarranty")}
                                        onCheckedChange={(v) =>
                                            form.setValue("showWarranty", v, {
                                                shouldDirty: true,
                                            })
                                        }
                                    />
                                </div>
                                <FormControl>
                                    <Input {...field} placeholder="None" />
                                </FormControl>
                                <FormDescription>
                                    Leave it empty if there is none; the shop
                                    shows nothing.
                                </FormDescription>
                            </FormItem>
                        )}
                    />

                    <fieldset className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                            <legend className="text-sm font-medium">
                                Returns
                            </legend>
                            <ShopSwitch
                                field="Returns"
                                checked={form.watch("showReturns")}
                                onCheckedChange={(v) =>
                                    form.setValue("showReturns", v, {
                                        shouldDirty: true,
                                    })
                                }
                            />
                        </div>
                        <ChoicePills
                            label="Returns"
                            value={returnsMode}
                            onChange={(v) =>
                                form.setValue("returnsMode", v, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                })
                            }
                            options={[
                                {
                                    value: "STOREFRONT",
                                    label: "The storefront's rule",
                                },
                                { value: "OWN", label: "Its own rule" },
                            ]}
                        />
                        {returnsMode === "OWN" ? (
                            <FormField
                                control={form.control}
                                name="returnsText"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Its returns rule</FormLabel>
                                        <FormControl>
                                            <Input
                                                {...field}
                                                placeholder="Exchange within 7 days, tags on"
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        ) : null}
                    </fieldset>
                </div>
            </Form>
        </QuickSheet>
    );
}
