"use client";

import { showError, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PhotosField } from "@/components/commerce/product-sections/photos-field";
import { replaceProductImages } from "@/lib/products/actions";
import type { PhotoDraft } from "@/lib/products/editor-sections";
import {
    photosFrom,
    photosInput,
    samePhotos,
} from "@/lib/products/editor-sections";
import { productEditHref } from "@/lib/products/links";
import type { ProductDetail } from "@/lib/products/service";

import { QuickSheet } from "../quick-sheet";

/**
 * The product page's "Edit photos": the same photo set as the editor's
 * section, saved as one ordered list. Undo puts the previous set back.
 */
export function PhotosSheet({
    open,
    onOpenChange,
    product,
    storeId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    product: ProductDetail;
    storeId: string;
}) {
    const router = useRouter();
    const baseline = photosFrom(product.images);
    const [draft, setDraft] = useState<PhotoDraft[]>(baseline);
    const [saving, setSaving] = useState(false);
    // A fresh baseline when the photos themselves change — a save here or
    // elsewhere — not on every save of the product, which would drop a
    // draft in progress.
    const loadedKey = JSON.stringify(baseline.map((p) => [p.id, p.url, p.alt]));
    const [loadedFor, setLoadedFor] = useState(loadedKey);
    if (loadedFor !== loadedKey) {
        setLoadedFor(loadedKey);
        setDraft(baseline);
    }
    const dirty = !samePhotos(draft, baseline);

    async function save() {
        setSaving(true);
        const res = await replaceProductImages(
            storeId,
            product.id,
            photosInput(draft),
        );
        setSaving(false);
        if (!res.ok) {
            showError(res.error);
            return;
        }
        onOpenChange(false);
        router.refresh();
        // Undo re-adds what was there: kept photos by id where they survive,
        // the rest by the address or library object they came from.
        const survivors = new Set(res.data.map((i) => i.id));
        const previous = baseline.map((p) =>
            p.id && survivors.has(p.id) ? p : { ...p, id: undefined },
        );
        showUndo("Photos and videos saved.", () => {
            void replaceProductImages(
                storeId,
                product.id,
                photosInput(previous),
            ).then((undo) => {
                if (!undo.ok)
                    showError("Couldn't undo. The saved photos stay.");
                router.refresh();
            });
        });
    }

    return (
        <QuickSheet
            open={open}
            onOpenChange={(o) => {
                if (!o) setDraft(baseline);
                onOpenChange(o);
            }}
            productName={product.name}
            title="Edit photos and videos"
            fullEditorHref={productEditHref(storeId, product.id, "photos")}
            dirty={dirty}
            saving={saving}
            note={dirty ? undefined : "No changes yet"}
            onSave={() => void save()}
        >
            <PhotosField value={draft} onChange={setDraft} disabled={saving} />
        </QuickSheet>
    );
}
