"use client";

import { paperColourOf, paperStyleOf } from "@saroh/block-contract";
import { useState } from "react";

import { PaperLookFields } from "@/components/invoices/paper-editor/paper-look-fields";
import { FormSheet } from "@/components/shared/form-sheet";
import { Refusal } from "@/components/shared/refusal";
import { runAction } from "@/lib/api/run-action";
import type { PaperDefault } from "@/lib/invoices/paper-look";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sheetWords } from "@/lib/organizations/business-sheet-words";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

/** The business's default look as saved: Classic in ink until chosen. */
export function savedPaper(settings: OrganizationSettings): PaperDefault {
    return {
        style: paperStyleOf(settings.invoicePaper?.style),
        colour: paperColourOf(settings.invoicePaper?.colour),
    };
}

/**
 * Settings › Business › Tax and invoices › Invoice style (DEC-173, U15
 * #1127): the look every new invoice starts in, Classic, Band or Compact,
 * and its colour. Owner and Admin only (`org:update`, as the row's Edit
 * is). Saved through the settings PATCH as `invoicePaper`; issued paper
 * keeps the look it was issued in, and a draft that chose its own keeps
 * that.
 */
export function InvoicePaperSheet({
    settings,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    settings: OrganizationSettings;
    open: boolean;
    returnTo: string;
    onClose: () => void;
    /** Saved: the settings now, and what to say. */
    onSaved: (next: OrganizationSettings, said: string) => void;
}) {
    const saved = savedPaper(settings);
    const [look, setLook] = useState<PaperDefault>(saved);
    const [saving, setSaving] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const words = sheetWords("paper", { kind: undefined, registered: false });
    const changed =
        look.style !== saved.style ||
        (look.colour ?? null) !== (saved.colour ?? null);

    async function save() {
        if (!changed) {
            onClose();
            return;
        }
        setRefusal(null);
        const res = await runAction(
            () =>
                saveOrganizationSettings({
                    invoicePaper: {
                        style: look.style,
                        colour: look.colour ?? "",
                    },
                }),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            setRefusal(res.error);
            return;
        }
        onSaved(
            res.data,
            "Invoice style saved. New invoices start in it, and issued ones keep theirs.",
        );
        onClose();
    }

    return (
        <FormSheet
            id={`${BUSINESS_ROW_ID.paper}-panel`}
            returnFocusTo={returnTo}
            title={words.title}
            description={words.description}
            open={open}
            pending={saving}
            dirty={changed}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <PaperLookFields
                look={look}
                onStyle={(style) => setLook((l) => ({ ...l, style }))}
                onColour={(colour) => setLook((l) => ({ ...l, colour }))}
            />
            <p className="text-[12px] leading-[1.5] text-muted-foreground">
                A tax invoice always keeps the fields GST requires (Rule 46),
                whatever its style.
            </p>
            <Refusal>{refusal}</Refusal>
        </FormSheet>
    );
}
