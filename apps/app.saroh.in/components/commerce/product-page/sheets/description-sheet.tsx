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
import { Textarea } from "@saroh/ui/textarea";
import { showError, showUndo } from "@saroh/ui/toast";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { ShopSwitch } from "@/components/commerce/product-sections/shop-switch";
import { patchProduct } from "@/lib/products/actions";
import {
    descriptionFrom,
    descriptionPatch,
    descriptionSchema,
    LIMITS,
} from "@/lib/products/editor-sections";
import { productEditHref } from "@/lib/products/links";
import type { ProductDetail, ProductPatch } from "@/lib/products/service";

import { QuickSheet } from "../quick-sheet";

// Tiptap has no server pass; the editor loads in the browser only.
const DescriptionEditor = dynamic(
    () =>
        import("@/components/commerce/product-sections/description-editor").then(
            (m) => m.DescriptionEditor,
        ),
    { ssr: false },
);

const schema = z.intersection(
    descriptionSchema,
    z.object({
        materials: z.string().max(LIMITS.materials),
        showMaterials: z.boolean(),
        showKeyPoints: z.boolean(),
    }),
);
type Values = z.infer<typeof schema>;

function valuesOf(p: ProductDetail): Values {
    return {
        ...descriptionFrom(p),
        materials: p.materials ?? "",
        showMaterials: p.shopFields.materials !== false,
        showKeyPoints: p.shopFields.keyPoints !== false,
    };
}

function patchOf(v: Values, p: ProductDetail): ProductPatch {
    return {
        ...descriptionPatch(v),
        materials: v.materials.trim() || null,
        shopFields: {
            ...p.shopFields,
            materials: v.showMaterials,
            keyPoints: v.showKeyPoints,
        },
    };
}

/**
 * The product page's "Edit description": the words customers read, the key
 * points listed under them, and what it is made of — ingredients for a
 * serum, fabric for a dress.
 */
export function DescriptionSheet({
    open,
    onOpenChange,
    product,
    storeId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: ProductDetail;
    storeId: string;
}) {
    const router = useRouter();
    const form = useForm<Values>({
        resolver: zodResolver(schema),
        values: valuesOf(product),
    });
    const { isSubmitting, isDirty, errors } = form.formState;
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
                res.field === "description" ||
                res.field === "materials" ||
                res.field === "keyPoints"
            ) {
                form.setError(res.field, { message: res.error });
            } else {
                showError(res.error);
            }
            return;
        }
        onOpenChange(false);
        router.refresh();
        showUndo("Description saved.", () => {
            void patchProduct(storeId, product.id, before).then((undo) => {
                if (!undo.ok)
                    showError("Couldn't undo. The saved description stays.");
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
            title="Edit description"
            fullEditorHref={productEditHref(storeId, product.id, "description")}
            dirty={isDirty}
            saving={isSubmitting}
            note={firstError ?? (isDirty ? undefined : "No changes yet")}
            onSave={() => void form.handleSubmit(save)()}
        >
            <Form {...form}>
                <div className="flex flex-col gap-4">
                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field, fieldState }) => (
                            <FormItem>
                                <FormLabel>Description</FormLabel>
                                <DescriptionEditor
                                    value={field.value}
                                    onChange={field.onChange}
                                    invalid={Boolean(fieldState.error)}
                                />
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="keyPoints"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center justify-between gap-2">
                                    <FormLabel>
                                        Key points — one per line
                                    </FormLabel>
                                    <ShopSwitch
                                        field="Key points"
                                        checked={form.watch("showKeyPoints")}
                                        onCheckedChange={(v) =>
                                            form.setValue("showKeyPoints", v, {
                                                shouldDirty: true,
                                            })
                                        }
                                    />
                                </div>
                                <FormControl>
                                    <Textarea
                                        {...field}
                                        rows={4}
                                        placeholder={
                                            "Lightweight, absorbs in a minute\nWith niacinamide and rose water"
                                        }
                                    />
                                </FormControl>
                                <FormDescription>
                                    Shown as a list under the description. Up to{" "}
                                    {LIMITS.keyPoints}.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="materials"
                        render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center justify-between gap-2">
                                    <FormLabel>
                                        Ingredients or material
                                    </FormLabel>
                                    <ShopSwitch
                                        field="Ingredients or material"
                                        checked={form.watch("showMaterials")}
                                        onCheckedChange={(v) =>
                                            form.setValue("showMaterials", v, {
                                                shouldDirty: true,
                                            })
                                        }
                                    />
                                </div>
                                <FormControl>
                                    <Textarea
                                        {...field}
                                        rows={3}
                                        placeholder="Aqua, Niacinamide, Glycerin… — or 100% linen"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </Form>
        </QuickSheet>
    );
}
