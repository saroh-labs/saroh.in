"use client";

import { PLANS_BUTTON, PLANS_JOIN } from "@saroh/site-blocks";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import type { PlansContent } from "@/lib/sites/service";

import {
    DisplayOptions,
    hiddenFlag,
    unlessDefault,
    wordsOrAbsent,
} from "./display-options";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `plans` section's editor fields (G9; display options G16).
 *
 * Only how the plans show is chosen here: the title, then Show as, whether
 * descriptions and prices show, whether the first plan is highlighted and
 * the button's words. Which plans, and their prices, are not a choice — the
 * plans on sale, read live — and the inspector's note above says where they
 * live (Payments › Subscriptions › Plans). With none on sale, or Payments
 * off, the canvas says why.
 */
export function PlansFields({
    section,
    onChange,
}: SectionFieldsProps<"plans">) {
    const c = section.content;
    const patch = (next: Partial<PlansContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

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
            <Field label="A line under it">
                <Textarea
                    value={c.intro ?? ""}
                    onChange={(e) =>
                        patch({ intro: e.target.value || undefined })
                    }
                    rows={2}
                    placeholder="Optional. No joining fee, cancel any time."
                />
            </Field>

            <DisplayOptions
                // Cards is how plans have always shown, so it is absent.
                layout={c.layout ?? "cards"}
                onLayout={(v) => patch({ layout: unlessDefault(v, "cards") })}
                descriptions={{
                    value: c.showDescriptions !== false,
                    onChange: (on) =>
                        patch({ showDescriptions: hiddenFlag(on) }),
                }}
                prices={{
                    value: c.showPrices !== false,
                    onChange: (on) => patch({ showPrices: hiddenFlag(on) }),
                }}
                highlight={{
                    value: c.highlight ?? "first",
                    // The first is the default, so it is stored as absent.
                    onChange: (v) =>
                        patch({ highlight: unlessDefault(v, "first") }),
                }}
                button={{
                    value: c.buttonLabel ?? "",
                    onChange: (v) => patch({ buttonLabel: wordsOrAbsent(v) }),
                    placeholder: PLANS_JOIN,
                    // G20 (DEC-062): the button joins and pays online; the
                    // enquiry form is the fallback where it can't.
                    note: `Customers sign in and join, paying you online. Where you can't take the payment online, it says “${PLANS_BUTTON}” and opens your site's enquiry form with the plan named.`,
                }}
            />
        </div>
    );
}
