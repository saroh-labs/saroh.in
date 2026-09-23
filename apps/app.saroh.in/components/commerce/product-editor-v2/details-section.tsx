"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
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
}: {
    product: ProductDetail | null;
    storeId: string;
}) {
    const { canWrite } = useEditor();
    const baseline = product ? detailsFrom(product) : EMPTY;
    const form = useForm<DetailsValues>({
        resolver: zodResolver(detailsSchema),
        values: baseline,
        mode: "onChange",
    });
    const { isDirty, errors } = form.formState;
    const v = form.watch();
    const ro = !canWrite;
    const howLong = v.howToUse.length > LIMITS.howToUse;

    useSection(
        "details",
        {
            dirty: isDirty,
            problem: howLong
                ? `Keep the line under ${LIMITS.howToUse} characters.`
                : firstProblem(detailsSchema, v),
        },
        {
            save: async () => {
                if (!product) return false;
                const values = form.getValues();
                const res = await patchProduct(
                    storeId,
                    product.id,
                    detailsPatch(values),
                );
                if (!res.ok) {
                    if (res.field === "howToUse" || res.field === "materials")
                        form.setError(res.field, { message: res.error });
                    else showError(res.error);
                    return false;
                }
                form.reset(values);
                return true;
            },
            discard: () => form.reset(baseline),
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
        </SectionCard>
    );
}
