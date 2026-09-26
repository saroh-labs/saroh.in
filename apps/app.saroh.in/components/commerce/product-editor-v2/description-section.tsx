"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";

import { ShopSwitch } from "@/components/commerce/product-sections/shop-switch";
import { patchProduct } from "@/lib/products/actions";
import { descriptionNote } from "@/lib/products/editor-labels";
import type { DescriptionValues } from "@/lib/products/editor-sections";
import {
    descriptionFrom,
    descriptionPatch,
    descriptionSchema,
    firstProblem,
    isEmptyHtml,
    LIMITS,
} from "@/lib/products/editor-sections";
import type { ProductDetail } from "@/lib/products/service";

import { useEditor, useSection } from "./editor-state";
import { boxClass, FieldHelp, FieldLabel } from "./fields";
import { SectionCard } from "./section-card";

// Tiptap has no server pass; the editor loads in the browser only.
const DescriptionEditor = dynamic(
    () =>
        import("@/components/commerce/product-sections/description-editor").then(
            (m) => m.DescriptionEditor,
        ),
    {
        ssr: false,
        loading: () => (
            <div className="min-h-[220px] rounded-[10px] border border-border bg-card" />
        ),
    },
);

const EMPTY: DescriptionValues = {
    description: "",
    keyPoints: "",
    showKeyPoints: true,
};

/** Description: the words customers read, and the points listed under them. */
export function DescriptionSection({
    product,
    storeId,
}: {
    product: ProductDetail | null;
    storeId: string;
}) {
    const { canWrite } = useEditor();
    const baseline = product ? descriptionFrom(product) : EMPTY;
    const form = useForm<DescriptionValues>({
        resolver: zodResolver(descriptionSchema),
        values: baseline,
        mode: "onChange",
    });
    const { isDirty, errors } = form.formState;
    const v = form.watch();
    const problem = firstProblem(descriptionSchema, v);
    const ro = !canWrite;

    useSection(
        "description",
        { dirty: isDirty, problem },
        {
            save: async () => {
                if (!product) return false;
                const values = form.getValues();
                const res = await patchProduct(
                    storeId,
                    product.id,
                    descriptionPatch(values),
                );
                if (!res.ok) {
                    if (
                        res.field === "description" ||
                        res.field === "keyPoints"
                    )
                        form.setError(res.field, { message: res.error });
                    else showError(res.error);
                    return false;
                }
                form.reset(values);
                return true;
            },
            discard: () => form.reset(baseline),
            collect: () => descriptionPatch(form.getValues()),
        },
    );

    return (
        <SectionCard k="description" title="Description">
            <DescriptionEditor
                value={v.description}
                onChange={(html) => {
                    const now = form.getValues("description");
                    // An empty editor is "<p></p>"; that is not a change
                    // from no description.
                    if (html === now || (isEmptyHtml(html) && isEmptyHtml(now)))
                        return;
                    form.setValue("description", html, {
                        shouldDirty: true,
                        shouldValidate: true,
                    });
                }}
                disabled={ro}
                invalid={!!errors.description}
            />
            <FieldHelp
                className="mt-1.5"
                tone={errors.description ? "bad" : "quiet"}
            >
                {v.description.length > LIMITS.description
                    ? descriptionNote(true)
                    : (errors.description?.message ?? descriptionNote(false))}
            </FieldHelp>

            <div className="mt-4">
                <FieldLabel
                    htmlFor="pe-points"
                    aside={
                        <ShopSwitch
                            field="Key points"
                            checked={v.showKeyPoints}
                            disabled={ro}
                            onCheckedChange={(on) =>
                                form.setValue("showKeyPoints", on, {
                                    shouldDirty: true,
                                })
                            }
                        />
                    }
                >
                    Key points — one per line
                </FieldLabel>
                <textarea
                    id="pe-points"
                    {...form.register("keyPoints")}
                    rows={4}
                    disabled={ro}
                    placeholder={
                        "10% vitamin C, stable in the bottle\nFades dark spots in 6–8 weeks"
                    }
                    className={cn(
                        boxClass({ bad: !!errors.keyPoints }),
                        "h-auto resize-y py-2 leading-[1.5]",
                    )}
                />
                <FieldHelp
                    className="mt-1.5"
                    tone={errors.keyPoints ? "bad" : "quiet"}
                >
                    {errors.keyPoints?.message ??
                        `Shown as a list under the description. Up to ${LIMITS.keyPoints}.`}
                </FieldHelp>
            </div>
        </SectionCard>
    );
}
