"use client";

import { showSuccess } from "@saroh/ui/toast";
import { useState } from "react";

import { BusinessLogoSheet } from "@/components/organizations/logo/business-logo-sheet";
import { useSettingsSave } from "@/lib/settings/use-settings";

const ADD_LOGO_ID = "qr-add-logo";

/**
 * "Add your logo", from the maker's line under Style: the business logo's
 * own sheet (Settings › Business › Logo) opened right here, so the logo
 * is uploaded and saved without leaving the code being made. Saved, Settings
 * is read again and the code draws the logo in place of the initials.
 */
export function QrAddLogo({
    businessName,
    className,
}: {
    /** For the initial in the sheet's empty tile. */
    businessName: string;
    className?: string;
}) {
    const save = useSettingsSave();
    // Counts openings, so each is a fresh draft; 0 is closed.
    const [opened, setOpened] = useState(0);
    const [open, setOpen] = useState(false);

    return (
        <>
            <button
                data-ph-unmask=""
                id={ADD_LOGO_ID}
                type="button"
                aria-haspopup="dialog"
                className={className}
                onClick={() => {
                    setOpened((n) => n + 1);
                    setOpen(true);
                }}
            >
                Add your logo
            </button>
            {opened > 0 ? (
                <BusinessLogoSheet
                    key={opened}
                    settings={{ name: businessName, logo: null }}
                    open={open}
                    returnTo={ADD_LOGO_ID}
                    onClose={() => setOpen(false)}
                    onSaved={(_next, said) => {
                        showSuccess(said);
                        save.saved();
                    }}
                />
            ) : null}
        </>
    );
}
