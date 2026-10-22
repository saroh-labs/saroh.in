"use client";

import { useState } from "react";

import { FormSheet } from "@/components/shared/forms/form-sheet";
import type {
    ServiceDraft,
    ServiceField,
    ServiceProblem,
} from "@/lib/services/service-editor";
import { problemFor } from "@/lib/services/service-editor";
import { sameHours } from "@/lib/services/service-hours-draft";
import type { PanelKey } from "@/lib/services/service-panels";
import {
    PANEL_FIELDS,
    PANEL_SAYS,
    PANEL_TITLE,
} from "@/lib/services/service-panels";

import type { PanelSetup } from "./panel-fields";
import { PanelFields } from "./panel-fields";

/**
 * One panel of the Service Editor (U16): a bottom sheet on a phone and a
 * right-hand side panel at a desk (`FormSheet bottomOnPhone`). It edits a
 * draft of its own, opened from what the page holds, and its button hands
 * that draft back: on a new service it goes into the page's draft ("Use
 * this"), on a saved one it is saved ("Save"). What is wrong with its own
 * fields is said when the button is pressed, at each field, and the
 * keyboard goes to the first. Each opening is a fresh draft (the caller
 * gives it a `key`).
 */
export function DetailPanel({
    which,
    open,
    source,
    setup,
    problemsOf,
    eyebrow,
    saveLabel,
    pending = false,
    onApply,
    onClose,
}: {
    which: PanelKey;
    open: boolean;
    /** What the panel opens with. */
    source: ServiceDraft;
    setup: Omit<PanelSetup, "hoursProblem">;
    /** Everything wrong with a draft; the panel says its own fields'. */
    problemsOf: (draft: ServiceDraft) => ServiceProblem[];
    /** Whose panel: the service's name, over the title. */
    eyebrow?: string;
    saveLabel: string;
    pending?: boolean;
    /** The panel's draft, its fields fine. True closes the panel. */
    onApply: (draft: ServiceDraft) => Promise<boolean> | boolean;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState(source);
    const [tried, setTried] = useState(false);
    const [left, setLeft] = useState<ReadonlySet<ServiceField>>(new Set());
    const fields = PANEL_FIELDS[which];
    const problems = problemsOf(draft).filter((p) => fields.includes(p.field));
    const set = (patch: Partial<ServiceDraft>) =>
        setDraft((d) => ({ ...d, ...patch }));
    const problem = (field: ServiceField) =>
        tried || left.has(field) ? problemFor(problems, field) : null;
    const leave = (field: ServiceField) =>
        setLeft((had) => (had.has(field) ? had : new Set(had).add(field)));
    const changed =
        JSON.stringify({ ...draft, hours: [] }) !==
            JSON.stringify({ ...source, hours: [] }) ||
        !sameHours(draft.hours, source.hours);

    return (
        <FormSheet
            open={open}
            bottomOnPhone
            eyebrow={eyebrow}
            title={PANEL_TITLE[which]}
            description={PANEL_SAYS[which]}
            saveLabel={saveLabel}
            pending={pending}
            dirty={changed}
            onClose={onClose}
            onSubmit={async () => {
                if (problems.length > 0) {
                    setTried(true);
                    return;
                }
                if (await onApply(draft)) onClose();
            }}
        >
            <PanelFields
                which={which}
                edit={{ draft, set, problem, leave }}
                setup={{
                    ...setup,
                    hoursProblem: (row) =>
                        tried ? problemFor(problems, "hours", row) : null,
                }}
            />
        </FormSheet>
    );
}
