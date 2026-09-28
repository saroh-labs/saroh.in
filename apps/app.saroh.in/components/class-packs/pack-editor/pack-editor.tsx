"use client";

import { EditorShell } from "@/components/editor-shell/editor-shell";
import {
    createPackDraft,
    deletePackDraft,
    discardPackChanges,
    loadPackDraft,
    publishPack,
    savePackDraft,
} from "@/lib/class-packs/draft-actions";
import type { PackEditorRecord } from "@/lib/class-packs/pack-drafts";
import type {
    PackServiceOption,
    PackValues,
} from "@/lib/class-packs/pack-editor";
import {
    kindLocked,
    PACK_COPY,
    PACK_DETAIL_PAGE,
    PACK_FIELD_LABELS,
    packBlocker,
    packPayload,
    packProblems,
} from "@/lib/class-packs/pack-editor";
import {
    packChanges,
    publishedToast,
    soldKeepNote,
} from "@/lib/class-packs/pack-editor-words";
import type { EditorAdapter } from "@/lib/editor-shell/types";

import { PackCrumbs } from "./pack-crumbs";
import {
    CreditsAndPrice,
    Details,
    PackGlance,
    WhoCanBuy,
} from "./pack-sections";
import { ServicesPicker } from "./services-picker";

/**
 * E14's draft routes, through the Server Actions. What an autosave sends is
 * `packPayload`: a field the API would refuse ("4500.", 5 days) is left out
 * so the rest still saves, and its problem keeps Publish off.
 */
const ADAPTER: EditorAdapter<PackValues> = {
    create: (values) => createPackDraft(packPayload(values)),
    saveDraft: (id, values, revision) =>
        savePackDraft(id, packPayload(values), revision),
    publish: (id, revision) => publishPack(id, revision),
    discard: (id, revision) => discardPackChanges(id, revision),
    remove: (id, revision) => deletePackDraft(id, revision),
    load: (id) => loadPackDraft(id),
};

/**
 * The Pack Editor (round-2 E18, Saroh Pack Editor.dc.html) on the shared
 * editor shell (D6): it autosaves as a draft; a new pack is a Draft nobody
 * can buy until Publish; a pack on sale keeps its edits as unpublished
 * changes until Publish changes, and everyone who bought one keeps what
 * they bought. A sold pack's kind is locked (E13), said beside the choice,
 * and a refusal from Publish lands on its field in the merchant's words.
 */
export function PackEditor({
    initial,
    emptyValues,
    services,
    sold,
    canEdit,
}: {
    /** Null while creating. */
    initial: PackEditorRecord | null;
    /** A new pack's starting values. */
    emptyValues: PackValues;
    /** The business's services; null when they couldn't be read. */
    services: PackServiceOption[] | null;
    /** Times sold; 0 for a draft, null when it couldn't be counted. */
    sold: number | null;
    canEdit: boolean;
}) {
    const keepNote = soldKeepNote(
        initial?.published?.kind ?? emptyValues.kind,
        sold,
    );
    return (
        <EditorShell<PackValues>
            adapter={ADAPTER}
            copy={PACK_COPY}
            initial={initial}
            emptyValues={emptyValues}
            canEdit={canEdit}
            crumbs={
                <PackCrumbs
                    here={
                        initial
                            ? (initial.published?.name ??
                                  initial.values.name) ||
                              "Untitled pack"
                            : "New pack"
                    }
                />
            }
            titleOf={(values, record) =>
                values.name.trim() || (record ? "Untitled pack" : "New pack")
            }
            problemsOf={(values, record) =>
                packProblems(values, {
                    services,
                    sold,
                    published: record?.published ?? null,
                })
            }
            blockerOf={packBlocker}
            changesOf={packChanges}
            changesNote={keepNote ? () => keepNote : undefined}
            fieldLabels={PACK_FIELD_LABELS}
            hrefFor={(id) => `/class-packs/${id}/edit`}
            viewHrefFor={(id) => `/class-packs/${id}`}
            viewable={(record) => PACK_DETAIL_PAGE && record.status !== "DRAFT"}
            afterDeleteHref="/class-packs"
            publishedMessage={(record, wasLive) =>
                publishedToast(record.values, wasLive, sold)
            }
            aside={({ values, set, errors }) => (
                <>
                    <WhoCanBuy values={values} set={set} errors={errors} />
                    <PackGlance
                        values={values}
                        services={services}
                        sold={sold}
                    />
                </>
            )}
        >
            {({ values, set, errors, record, disabled }) => {
                const live = record !== null && record.status !== "DRAFT";
                return (
                    <>
                        <Details
                            values={values}
                            set={set}
                            errors={errors}
                            services={services}
                            locked={kindLocked(live, sold)}
                            live={live}
                            sold={sold}
                        />
                        <CreditsAndPrice
                            values={values}
                            set={set}
                            errors={errors}
                            services={services}
                        />
                        <ServicesPicker
                            kind={values.kind}
                            value={values.serviceIds}
                            onChange={(serviceIds) => set({ serviceIds })}
                            services={services}
                            error={errors.serviceIds}
                            disabled={disabled || services === null}
                        />
                    </>
                );
            }}
        </EditorShell>
    );
}
