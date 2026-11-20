"use client";

import { Button } from "@saroh/ui/button";
import { FormSheetBody } from "@saroh/ui/form-sheet";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useState } from "react";

import { count } from "@/lib/format/plural";
import { EditorSheet } from "../editor-sheet";

/** A field the text sheet is changing: the form's own textarea. */
export interface TextField {
    el: HTMLTextAreaElement;
    /** "Intro", from the field's label. */
    label: string;
    /** "Bridal packages", the section it is in. */
    section: string;
}

/** Words in a piece of text, for the count under it. */
export function wordCount(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Put text into a form's own field as if typed, so the form's change
 * handler (React's, which listens for `input`) sees it.
 */
export function typeInto(el: HTMLTextAreaElement, value: string) {
    // The prototype's setter: React tracks the element's own one.
    Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
    )?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * A section's longer text on a phone, full screen (U49, `fix/WXNText`):
 * Cancel · the field · Save over a big box with its word count. Save puts
 * the words into the section's own field, which saves as typing there
 * would; Cancel leaves the field as it was. The link picker on a
 * selection arrives with U47d.
 */
export function TextSheet({
    field,
    container,
    onClose,
}: {
    field: TextField | null;
    /** The whole phone editor, so the sheet covers both bars. */
    container: HTMLElement | null;
    onClose: () => void;
}) {
    return (
        <EditorSheet
            open={field !== null}
            onClose={onClose}
            container={container}
            side="bottom"
            title={field?.label ?? "Text"}
            closeLabel="Cancel"
            full
            head={null}
        >
            {field ? (
                // Keyed on the field: each opening starts from its words.
                <TextBody
                    key={field.el.id || field.label}
                    field={field}
                    onClose={onClose}
                />
            ) : null}
        </EditorSheet>
    );
}

function TextBody({
    field,
    onClose,
}: {
    field: TextField;
    onClose: () => void;
}) {
    const [value, setValue] = useState(field.el.value);
    const max = field.el.maxLength > 0 ? field.el.maxLength : undefined;
    const words = wordCount(value);
    return (
        <>
            <div className="flex min-h-14 shrink-0 items-center gap-2 border-b px-2">
                <Button
                    type="button"
                    variant="ghost"
                    className="h-11"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <h2 className="min-w-0 flex-1 truncate text-center text-base font-semibold">
                    {field.label}
                </h2>
                <Button
                    type="button"
                    className="h-11"
                    onClick={() => {
                        typeInto(field.el, value);
                        onClose();
                    }}
                >
                    Save
                </Button>
            </div>
            <FormSheetBody className="mx-0 block gap-0 px-4 pb-0 pt-4">
                <Label
                    htmlFor="phone-text-sheet"
                    className="mb-2 block text-[0.8125rem] font-medium text-muted-foreground"
                >
                    {`${field.section} · ${field.label}`}
                </Label>
                <Textarea
                    id="phone-text-sheet"
                    // The keyboard comes up on the words, not on Cancel.
                    autoFocus
                    value={value}
                    maxLength={max}
                    onChange={(e) => setValue(e.target.value)}
                    className="block min-h-44 w-full resize-none rounded-[10px] border border-foreground bg-card p-3.5 text-[1.0625rem] leading-relaxed text-foreground shadow-[0_0_0_3px_hsl(var(--info-subtle))] focus-visible:outline-none"
                    rows={7}
                />
                <p
                    aria-live="polite"
                    className="flex justify-end px-1 py-2 text-[0.8125rem] text-muted-foreground"
                >
                    {count(words, "word")}
                </p>
            </FormSheetBody>
        </>
    );
}
