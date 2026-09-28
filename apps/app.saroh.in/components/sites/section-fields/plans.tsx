"use client";

import { PLANS_BUTTON, PLANS_JOIN } from "@saroh/site-blocks";
import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import type { PlansContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `plans` section's editor fields (G9).
 *
 * Only how the plans show is chosen here: the title, whether the first plan
 * is highlighted, the button's words and whether descriptions show. Which
 * plans, and their prices, are not a choice — the plans on sale, read live —
 * and the inspector's note above says where they live (Payments ›
 * Subscriptions › Plans). With none on sale, or Payments off, the canvas
 * says why.
 */
export function PlansFields({
    section,
    onChange,
}: SectionFieldsProps<"plans">) {
    const c = section.content;
    const patch = (next: Partial<PlansContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const id = section.key ?? "plans";

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="Plans"
                />
            </Field>

            <Field label="Highlight">
                <ToggleGroup
                    type="single"
                    value={c.highlight ?? "first"}
                    onValueChange={(v) => {
                        // The first is the default, so it is stored as absent.
                        if (v === "first") patch({ highlight: undefined });
                        if (v === "none") patch({ highlight: "none" });
                    }}
                    aria-label="Highlight"
                    className={SEGMENTED}
                >
                    <ToggleGroupItem value="first" className={SEGMENT}>
                        First plan
                    </ToggleGroupItem>
                    <ToggleGroupItem value="none" className={SEGMENT}>
                        None
                    </ToggleGroupItem>
                </ToggleGroup>
            </Field>

            <Field label="Button">
                <Input
                    value={c.buttonLabel ?? ""}
                    maxLength={40}
                    onChange={(e) =>
                        patch({ buttonLabel: e.target.value || undefined })
                    }
                    placeholder={PLANS_JOIN}
                />
            </Field>
            <p className="-mt-1.5 text-xs text-muted-foreground">
                Customers sign in and join, paying you online. Where you
                can&apos;t take the payment online, it says &ldquo;
                {PLANS_BUTTON}&rdquo; and opens your site&apos;s enquiry form
                with the plan named.
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
