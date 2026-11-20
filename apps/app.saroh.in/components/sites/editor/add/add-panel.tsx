"use client";

import { AddBlockPanel } from "@/components/sites/blocks/add-block-panel";
import type { EditorModel } from "../shell/editor-model";

export interface AddPanelProps {
    model: EditorModel;
    /** In a phone's bottom sheet (U49) rather than the desk's left panel. */
    phone?: boolean;
}

/**
 * Rail › Add (U46 stub; U46e fills it as `fix/WXBAdd`, `fix/WXKLibrary`
 * and `fix/WXBAddPage` draw it). Stub body: today's Add tab, the section
 * list with Browse all, adding below the selected section.
 */
export function AddPanel({ model, phone = false }: AddPanelProps) {
    const { add } = model;
    return (
        <section aria-label="Add" className="flex min-h-0 flex-1 flex-col">
            <AddBlockPanel
                search={phone}
                shopOpen={model.shopOpen}
                packsOpen={model.packsOpen}
                onBrowse={() => add.setBrowsing(true)}
                onPick={(type, looks) => {
                    if (looks > 1) add.setLookFor(type);
                    else add.addSection(type);
                }}
            />
        </section>
    );
}
