import { PackEditorState } from "@/components/class-packs/pack-editor/editor-states";
import { PackEditor } from "@/components/class-packs/pack-editor/pack-editor";
import {
    kindFromQuery,
    loadPackEditorContext,
} from "@/lib/class-packs/editor-data";
import { newPackValues } from "@/lib/class-packs/pack-editor";
import { requireSession } from "@/lib/session";

export const metadata = { title: "New pack" };

/**
 * Bookings › Packs › New pack (E18): the Pack Editor for a pack not saved
 * yet. It saves itself as a Draft once it has a name, and the address
 * becomes the pack's own edit page. `?kind=one-to-one` starts a one-to-one
 * pack.
 */
export default async function NewClassPackPage({
    searchParams,
}: {
    searchParams: Promise<{ kind?: string }>;
}) {
    await requireSession();
    const [context, params] = await Promise.all([
        loadPackEditorContext(),
        searchParams,
    ]);
    if (!context.canRead || !context.canWrite) {
        return (
            <PackEditorState
                state={context.canRead ? "readOnly" : "forbidden"}
                retryHref="/class-packs/new"
                here="New pack"
            />
        );
    }
    const kind = kindFromQuery(params.kind);
    return (
        <PackEditor
            initial={null}
            emptyValues={newPackValues(
                kind,
                context.services ?? [],
                context.currency,
            )}
            services={context.services}
            sold={0}
            canEdit
        />
    );
}
