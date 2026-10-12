"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EditorShell } from "@/components/editor-shell/editor-shell";
import type { GstAsk } from "@/lib/gst/item-words";
import { NOT_ASKED } from "@/lib/gst/item-words";
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
import type { RenewalChange } from "@/lib/subscriptions/renewal-change";

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
 * A GST-registered business answers the plan's GST beside its price (12 Oct
 * 2026): draft fields, autosaved and published like the price. Whether it
 * is asked comes with every answer of the server's (`gst`), and from the
 * page for a plan not saved yet. What publishing the GST does to the
 * members already on the plan (`renewalChange`) is said under the fields,
 * as of the last save.
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
    autopayOffered = false,
    gst: gstOfPage = NOT_ASKED,
}: {
    /**
     * Whether a new plan asks for GST, as the page read it: a saved plan's
     * own read says so itself, and wins. Unknown asks for nothing.
     */
    gst?: GstAsk;
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
    /**
     * The business offers autopay (D14's honest copy): only then does
     * "how it's paid" mention it. Unknown reads as not.
     */
    autopayOffered?: boolean;
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
    // What the server last said beside the values: whether GST is asked,
    // and what publishing it does to the members on the plan.
    const [gstOfRead, setGstOfRead] = useState<GstAsk | null>(
        () => initial?.gst ?? null,
    );
    const [renewal, setRenewal] = useState<RenewalChange | null>(
        () => initial?.renewalChange ?? null,
    );
    // Made once: it follows `renewalChange` through every answer, so the
    // publish toast says what the publish did to the members on the plan.
    const [adapter] = useState(() =>
        planEditorAdapter((r) => {
            setClash(clashOf(r));
            if (r.gst) setGstOfRead(r.gst);
            setRenewal(r.renewalChange ?? null);
        }, initial?.renewalChange ?? null),
    );
    const gst = gstOfRead ?? gstOfPage;
    const subscribers = figures?.subscriberCount ?? 0;
    const ctx = {
        withClasses,
        otherClasses: other,
        takenNames,
        clash,
        gstAsked: gst.asked,
    };
    const pays = first?.status === "DRAFT" ? [] : whoPays(figures);

    return (
        <EditorShell
            adapter={adapter}
            copy={PLAN_COPY}
            initial={first}
            emptyValues={EMPTY_PLAN}
            canEdit={canEdit}
            readOnlyText={readOnlyText}
            breadcrumb={[
                "Payments",
                <Link key="plans" href={PLANS_HREF}>
                    Plans
                </Link>,
                first ? planTitle(first.values, true) : "New plan",
            ]}
            titleOf={(v, r) => planTitle(v, r !== null)}
            problemsOf={(v) => planProblems(v, ctx)}
            blockerOf={(v) => planBlocker(v, ctx)}
            changesOf={(p, v) => planChanges(p, v, withClasses)}
            changesNote={(r) =>
                r.published
                    ? changesNote(r.published, r.values, subscribers, renewal)
                    : ""
            }
            fieldLabels={PLAN_FIELD_LABELS}
            hrefFor={editHref}
            viewHrefFor={viewHref}
            afterDeleteHref={PLANS_HREF}
            publishedMessage={(r, wasLive) =>
                publishedText(
                    r.values.name.trim(),
                    wasLive,
                    subscribers,
                    adapter.publishedRenewal(),
                )
            }
            aside={({ values }) => (
                <PlanAside
                    pays={pays}
                    glance={glance(
                        { ...values, currency: values.currency || currency },
                        figures,
                        gst,
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
                        autopayOffered={autopayOffered}
                        autopayLimits={initial?.autopayLimits}
                        gst={gst}
                        renewal={renewal}
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
