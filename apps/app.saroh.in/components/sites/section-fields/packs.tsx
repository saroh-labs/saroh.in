"use client";

import { PACKS_BUY } from "@saroh/site-blocks";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";

import type { PacksContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `packs` section's editor fields (G20).
 *
 * Only how the packs show is chosen here: the title, the button's words and
 * whether descriptions show. Which packs, and their prices, are not a
 * choice — the class packs on sale, read live — and the inspector's note
 * above says where they live (Class packs). With none on sale, the canvas
 * says why.
 */
export function PacksFields({
    section,
    onChange,
}: SectionFieldsProps<"packs">) {
    const c = section.content;
    const patch = (next: Partial<PacksContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const id = section.key ?? "packs";

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="Class packs"
                />
            </Field>

            <Field label="Button">
                <Input
                    value={c.buttonLabel ?? ""}
                    maxLength={40}
                    onChange={(e) =>
                        patch({ buttonLabel: e.target.value || undefined })
                    }
                    placeholder={PACKS_BUY}
                />
            </Field>
            <p className="-mt-1.5 text-xs text-muted-foreground">
                Customers sign in and pay you online. Where you can&apos;t take
                the payment online, it says &ldquo;Ask about this pack&rdquo;
                and opens your site&apos;s enquiry form with the pack named.
            </p>

            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-descriptions`}>Descriptions</Label>
                <Switch
                    id={`${id}-descriptions`}
                    checked={c.showDescriptions !== false}
                    onCheckedChange={(on) =>
                        patch({ showDescriptions: on ? undefined : false })
                    }
                />
            </div>
        </div>
    );
}
