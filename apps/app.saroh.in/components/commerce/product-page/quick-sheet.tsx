"use client";

import { TextLink } from "@saroh/ui/text-link";
import type { ReactNode } from "react";

import { FormSheet } from "@/components/shared/form-sheet";

/**
 * A quick edit over the product page: one section's fields, saved on their
 * own. The app's one `FormSheet`, named by the product it belongs to: it
 * closes, saves and hands the keyboard back by that frame's rules, so a
 * stray press outside never drops what was typed and Cancel, Escape and
 * the close button do, unasked.
 *
 * "More in the full editor" is the one link out. It stays because the
 * rest of a product is a page of its own, not something a sheet can hold,
 * and it is drawn as the quiet action at the far side of the foot.
 */
export function QuickSheet({
    open,
    onOpenChange,
    productName,
    title,
    description = "One part of this product. Nothing changes until you save.",
    fullEditorHref,
    moreLink,
    dirty,
    saving,
    note,
    onSave,
    saveDisabled,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productName: string;
    title: string;
    /** One sentence: what saving changes. */
    description?: string;
    /** "More in the full editor"; left out where the editor has no more. */
    fullEditorHref?: string;
    /** In its place, a link on to where the rest is managed. */
    moreLink?: { href: string; label: string };
    dirty: boolean;
    saving: boolean;
    /** Why Save is off, or what saving will do — written, never a tooltip. */
    note?: ReactNode;
    onSave: () => void | Promise<void>;
    /** Save waits on something in the sheet, such as an upload. */
    saveDisabled?: boolean;
    children: ReactNode;
}) {
    return (
        <FormSheet
            open={open}
            eyebrow={productName}
            title={title}
            description={description}
            pending={saving}
            dirty={dirty}
            saveOff={saveDisabled ?? false}
            fieldsClassName="block"
            footNote={
                note ? (
                    <p
                        role="status"
                        className="text-[12.5px] text-muted-foreground"
                    >
                        {note}
                    </p>
                ) : null
            }
            extra={
                fullEditorHref || moreLink ? (
                    <TextLink
                        href={fullEditorHref ?? moreLink?.href ?? ""}
                        className="text-[12.5px] coarse:flex coarse:min-h-11 coarse:items-center"
                    >
                        {fullEditorHref
                            ? "More in the full editor"
                            : moreLink?.label}
                    </TextLink>
                ) : null
            }
            onClose={() => onOpenChange(false)}
            onSubmit={() => onSave()}
        >
            {children}
        </FormSheet>
    );
}
