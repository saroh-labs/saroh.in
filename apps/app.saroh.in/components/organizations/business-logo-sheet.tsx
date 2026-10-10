"use client";

import { useState } from "react";

import type { LogoValue } from "@/components/shared/logo-upload";
import { LogoUpload } from "@/components/shared/logo-upload";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sheetWords } from "@/lib/organizations/business-sheet-words";
import { saveBusinessLogo } from "@/lib/organizations/settings-actions";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";

/**
 * The business's logo, edited in its row's sheet: upload or replace it, or
 * take it off, all here (`LogoUpload`), and Save sets it. Until Save the
 * invoices keep the logo they had; a picture uploaded and then cancelled
 * stays in the library, unused.
 *
 * A refusal keeps the sheet open and is said under the field.
 */
export function BusinessLogoSheet({
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
    /** Saved: the settings now, and what to say (the page offers Undo). */
    onSaved: (next: OrganizationSettings, said: string) => void;
}) {
    const saved: LogoValue | null = settings.logo ?? null;
    const [logo, setLogo] = useState(saved);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [refusal, setRefusal] = useState<string | null>(null);
    const words = sheetWords("logo", {
        kind: settings.kind,
        registered: false,
    });

    async function save() {
        if (logo?.url === saved?.url) {
            onClose();
            return;
        }
        setRefusal(null);
        setSaving(true);
        const result = await saveBusinessLogo(logo?.mediaId ?? null);
        setSaving(false);
        if (!result.ok) {
            setRefusal(result.error);
            return;
        }
        onSaved(
            result.data,
            logo
                ? "Logo saved. It prints on your invoices and receipts."
                : "Logo removed",
        );
        onClose();
    }

    return (
        <SettingsSheetFrame
            id={`${BUSINESS_ROW_ID.logo}-panel`}
            returnFocusTo={returnTo}
            title={words.title}
            description={words.description}
            open={open}
            pending={saving}
            saveOff={uploading}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                void save();
            }}
        >
            <LogoUpload
                value={logo}
                onChange={(next) => {
                    setRefusal(null);
                    setLogo(next);
                }}
                name={settings.name}
                disabled={saving}
                onBusy={setUploading}
            />
            {refusal ? (
                <p
                    role="alert"
                    className="text-pretty text-[12.5px] font-medium leading-[1.5] text-destructive-subtle-foreground"
                >
                    {refusal}
                </p>
            ) : null}
        </SettingsSheetFrame>
    );
}
