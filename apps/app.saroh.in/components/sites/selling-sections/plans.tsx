"use client";

import { useEffect, useState } from "react";

import { resolveVariant } from "@saroh/block-contract";
import { PLANS_BUTTON, PLANS_JOIN } from "@saroh/site-blocks";
import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { Textarea } from "@saroh/ui/textarea";

import { listPlansForCompare } from "@/lib/sites/actions";

import type { PlansContent } from "@/lib/sites/service";

import { ChoiceField } from "@/components/sites/section-fields/choice-field";
import {
    DisplayOptions,
    hiddenFlag,
    unlessDefault,
    wordsOrAbsent,
} from "@/components/sites/section-fields/display-options";
import { OptionSwitch } from "@/components/sites/section-fields/option-switch";
import type { SectionFieldsProps } from "@/components/sites/section-fields/props";
import { RepeatedItems } from "@/components/sites/section-fields/repeated-items";

/** The contract's caps on Compare's rows. */
const MAX_ROWS = 12;

type Includes = NonNullable<PlansContent["includes"]>;

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
            <Field optional label="A line under it">
                <Textarea
                    value={c.intro ?? ""}
                    onChange={(e) =>
                        patch({ intro: e.target.value || undefined })
                    }
                    rows={2}
                    placeholder="No joining fee, cancel any time."
                />
            </Field>

            <ChoiceField
                label="Show"
                options={[
                    ["plans", "Plans"],
                    ["packs", "Packs"],
                    ["both", "Both"],
                ]}
                value={c.show ?? "plans"}
                // Plans is how the block always drew, so it is absent.
                onChange={(v) => patch({ show: unlessDefault(v, "plans") })}
                note="Your plans, your class packs, or plans then packs. Both are read from Payments."
            />

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

            {resolveVariant("plans", c) === "compare" ? (
                <CompareRows
                    includes={c.includes ?? []}
                    onChange={(rows) =>
                        patch({ includes: rows.length > 0 ? rows : undefined })
                    }
                />
            ) : null}
        </div>
    );
}

/** The plans on sale, read once for the cells; null while read or failed. */
function usePlanNames(): { id: string; name: string }[] | null | "loading" {
    const [plans, setPlans] = useState<
        { id: string; name: string }[] | null | "loading"
    >("loading");
    useEffect(() => {
        let active = true;
        listPlansForCompare()
            .then((read) => {
                if (active) setPlans(read);
            })
            .catch(() => {
                if (active) setPlans(null);
            });
        return () => {
            active = false;
        };
    }, []);
    return plans;
}

/**
 * Compare's rows (DEC-228), typed until plans carry what they include: a
 * row's words, then per plan on sale whether it includes it and in what
 * words ("Every one"; empty says "Included").
 */
function CompareRows({
    includes,
    onChange,
}: {
    includes: Includes;
    onChange: (rows: Includes) => void;
}) {
    const plans = usePlanNames();
    return (
        <Field label="What each includes">
            <div className="grid gap-2">
                {plans === "loading" ? (
                    <p className="text-sm text-muted-foreground">
                        Reading your plans…
                    </p>
                ) : plans === null ? (
                    <p className="text-sm text-muted-foreground">
                        We couldn&apos;t read your plans, so each row&apos;s
                        plans can&apos;t be ticked just now. The rows you have
                        are kept.
                    </p>
                ) : null}
                {includes.length === 0 ? (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => onChange([{ label: "" }])}
                    >
                        Add a row
                    </Button>
                ) : (
                    <RepeatedItems
                        items={includes}
                        onChange={onChange}
                        max={MAX_ROWS}
                        min={0}
                        itemNoun="Row"
                        addLabel="Add a row"
                        fullMessage="That is the most rows a table carries."
                        newItem={() => ({ label: "" })}
                        reorderable
                    >
                        {(row, set) => (
                            <>
                                <Input
                                    value={row.label}
                                    aria-label="What the row is"
                                    maxLength={120}
                                    onChange={(e) =>
                                        set({ label: e.target.value })
                                    }
                                    placeholder="Evening classes"
                                />
                                {Array.isArray(plans)
                                    ? plans.map((plan) => {
                                          const cell = row.cells?.find(
                                              (x) => x.id === plan.id,
                                          );
                                          const others = (
                                              row.cells ?? []
                                          ).filter((x) => x.id !== plan.id);
                                          const setCell = (
                                              next: typeof cell | null,
                                          ) => {
                                              const cells = next
                                                  ? [...others, next]
                                                  : others;
                                              set({
                                                  cells:
                                                      cells.length > 0
                                                          ? cells
                                                          : undefined,
                                              });
                                          };
                                          return (
                                              <div
                                                  key={plan.id}
                                                  className="grid gap-1.5"
                                              >
                                                  <OptionSwitch
                                                      label={plan.name}
                                                      checked={Boolean(cell)}
                                                      onChange={(on) =>
                                                          setCell(
                                                              on
                                                                  ? {
                                                                        id: plan.id,
                                                                    }
                                                                  : null,
                                                          )
                                                      }
                                                  />
                                                  {cell ? (
                                                      <Input
                                                          value={
                                                              cell.words ?? ""
                                                          }
                                                          aria-label={`${plan.name}: in words`}
                                                          maxLength={60}
                                                          onChange={(e) =>
                                                              setCell({
                                                                  id: plan.id,
                                                                  words:
                                                                      e.target
                                                                          .value ||
                                                                      undefined,
                                                              })
                                                          }
                                                          placeholder="Included"
                                                      />
                                                  ) : null}
                                              </div>
                                          );
                                      })
                                    : null}
                            </>
                        )}
                    </RepeatedItems>
                )}
            </div>
        </Field>
    );
}
