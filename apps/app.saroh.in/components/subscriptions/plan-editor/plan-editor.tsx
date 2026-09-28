"use client";

import { useMemo, useState } from "react";

import { EditorShell } from "@/components/editor-shell/editor-shell";
import { PLANS_HREF } from "@/lib/subscriptions/plan-detail";
import type { PlanEditorRecord } from "@/lib/subscriptions/plan-drafts";
import type { NameClash, PlanFigures } from "@/lib/subscriptions/plan-editor";
import {
    changesNote,
    clashOf,
    CLASS_CHOICES,
    editHref,
    editorRecordOf,
    EMPTY_PLAN,
    glance,
    PLAN_COPY,
    PLAN_FIELD_LABELS,
    planBlocker,
    planChanges,
    planProblems,
    planTitle,
    publishedText,
    viewHref,
    whoPays,
} from "@/lib/subscriptions/plan-editor";
import { planEditorAdapter } from "@/lib/subscriptions/plan-editor-adapter";

import { PaymentsCrumbs } from "../payments-crumbs";
import { PlanAside } from "./at-a-glance";
import { ClassesSection } from "./classes-section";
import { DetailsSection } from "./details-section";
import { PriceSection } from "./price-section";

/**
 * The Plan Editor (plan 2026-09-26-004, D7), after "Saroh Plan Editor":
 * `/billing/plans/new` and `/billing/plans/[planId]/edit`. It replaced
 * `PlanDialog`, and every control that had a place here:
 *
 * - name, price, how often and what's included → Details and Price and billing;
 * - Save / Make the plan → autosave, then Publish (a new plan is a Draft
 *   nobody can buy until then, DEC-043);
 * - "changes reach new sign-ups only" → the publish banner's "When you
 *   publish: …" and the note after it;
 * - Archive and Put back on sale → the Plans tab and Plan Detail, which
 *   carry them with Undo (D3, D4);
 * - Cancel → leaving, which asks first when something isn't saved;
 * - the currency picker → gone: a plan is in the business's currency
 *   (DEC-030 amendment), and an older plan keeps its own.
 *
 * The shell (D6) owns autosave, the banner, Publish, Discard, Delete draft,
 * the failed and conflict states and leaving; this gives it D5's routes,
 * the plan's words and rules, and draws the sections.
 */
export function PlanEditor({
    initial,
    figures,
    takenNames,
    withClasses,
    currency,
    canEdit,
    readOnlyText,
}: {
    /** Null on `/billing/plans/new`. */
    initial: PlanEditorRecord | null;
    /** Who is on it and what it brings in; null for a plan not saved yet. */
    figures: PlanFigures | null;
    /** Every other plan's name that isn't archived. */
    takenNames: readonly string[];
    /** The business sells classes (Appointments on, default 31). */
    withClasses: boolean;
    /** The plan's currency, or the business's for a new plan. */
    currency: string;
    canEdit: boolean;
    readOnlyText?: string;
}) {
    const first = useMemo(
        () => (initial ? editorRecordOf(initial) : null),
        [initial],
    );
    const [clash, setClash] = useState<NameClash | null>(() =>
        initial ? clashOf(initial) : null,
    );
    const [other, setOther] = useState(
        () =>
            !!first &&
            !(CLASS_CHOICES as readonly string[]).includes(
                first.values.classes,
            ),
    );
    const adapter = useMemo(
        () => planEditorAdapter((r) => setClash(clashOf(r))),
        [],
    );
    const subscribers = figures?.subscriberCount ?? 0;
    const ctx = { withClasses, otherClasses: other, takenNames, clash };
    const pays = first?.status === "DRAFT" ? [] : whoPays(figures);

    return (
        <EditorShell
            adapter={adapter}
            copy={PLAN_COPY}
            initial={first}
            emptyValues={EMPTY_PLAN}
            canEdit={canEdit}
            readOnlyText={readOnlyText}
            crumbs={
                <PaymentsCrumbs
                    here={first ? planTitle(first.values, true) : "New plan"}
                    trail={[{ href: PLANS_HREF, label: "Plans" }]}
                />
            }
            titleOf={(v, r) => planTitle(v, r !== null)}
            problemsOf={(v) => planProblems(v, ctx)}
            blockerOf={(v) => planBlocker(v, ctx)}
            changesOf={(p, v) => planChanges(p, v, withClasses)}
            changesNote={(r) =>
                r.published
                    ? changesNote(r.published, r.values, subscribers)
                    : ""
            }
            fieldLabels={PLAN_FIELD_LABELS}
            hrefFor={editHref}
            viewHrefFor={viewHref}
            afterDeleteHref={PLANS_HREF}
            publishedMessage={(r, wasLive) =>
                publishedText(r.values.name.trim(), wasLive, subscribers)
            }
            aside={({ values }) => (
                <PlanAside
                    pays={pays}
                    glance={glance(
                        { ...values, currency: values.currency || currency },
                        figures,
                    )}
                />
            )}
        >
            {(fields) => (
                <>
                    <DetailsSection fields={fields} withClasses={withClasses} />
                    <PriceSection
                        fields={fields}
                        currency={fields.values.currency || currency}
                    />
                    {withClasses ? (
                        <ClassesSection
                            fields={fields}
                            other={other}
                            onOther={setOther}
                        />
                    ) : null}
                </>
            )}
        </EditorShell>
    );
}
