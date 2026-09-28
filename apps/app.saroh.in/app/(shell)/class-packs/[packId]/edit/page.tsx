import { PackEditorState } from "@/components/class-packs/pack-editor/editor-states";
import { PackEditor } from "@/components/class-packs/pack-editor/pack-editor";
import { loadPackEditorContext } from "@/lib/class-packs/editor-data";
import { readPackEditor, readPackSold } from "@/lib/class-packs/pack-drafts";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Edit pack" };

/**
 * Bookings › Packs › a pack (E18): the Pack Editor. A draft autosaves and
 * goes on sale at Publish; a pack on sale keeps its edits as unpublished
 * changes until Publish changes, and what was sold keeps its terms. A pack
 * that can't be read says so rather than "isn't here".
 */
export default async function EditClassPackPage({
    params,
}: {
    params: Promise<{ packId: string }>;
}) {
    await requireSession();
    const { packId } = await params;
    const retryHref = `/class-packs/${packId}/edit`;
    const [read, context] = await Promise.all([
        readPackEditor(packId),
        loadPackEditorContext(),
    ]);
    if (!read.ok) {
        return <PackEditorState state={read.reason} retryHref={retryHref} />;
    }
    const record = read.record;
    const here = record.published?.name ?? record.values.name;
    if (!context.canWrite) {
        return (
            <PackEditorState
                state="readOnly"
                retryHref={retryHref}
                here={here}
            />
        );
    }
    if (record.status === "ARCHIVED") {
        return (
            <PackEditorState
                state="archived"
                retryHref={retryHref}
                here={here}
            />
        );
    }
    // A draft has never been sold; a live pack's sales lock its kind (E13).
    const sold = record.status === "DRAFT" ? 0 : await readPackSold(packId);

    return (
        <PackEditor
            // A different pack starts from its own saved values.
            key={record.id}
            initial={record}
            emptyValues={record.values}
            services={context.services}
            sold={sold}
            canEdit
        />
    );
}
