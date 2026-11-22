"use client";

import { RadioCards } from "@saroh/ui/choice-group";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";

import type { Section } from "@/lib/sites/service";

import { useEditorReadOnly } from "../read-only";
import { frameOf } from "./section-frame";

export interface VisibilityTabProps {
    section: Section;
    /** Shown ↔ Hidden when published (today's toggle, with Undo). */
    onToggleHidden: () => void;
    /** Hide on phone on or off (the frame, with Undo). */
    onHideOnPhone: (hide: boolean) => void;
}

/**
 * Inspector › Visibility (U47): on the site or left out when published, as
 * the old Visible/Hidden toggle did, and Hide on phone (the frame's
 * `hideOn`, CSS only). The phone's section sheet (U49) reuses it.
 */
export function VisibilityTab({
    section,
    onToggleHidden,
    onHideOnPhone,
}: VisibilityTabProps) {
    const readOnly = useEditorReadOnly();
    const hidden = section.hidden === true;
    return (
        <fieldset disabled={readOnly} className="grid gap-5">
            <div className="grid gap-2">
                <p id="section-shown" className="text-sm font-semibold">
                    On the site
                </p>
                <RadioCards
                    labelledBy="section-shown"
                    value={hidden ? "hidden" : "shown"}
                    disabled={readOnly}
                    onChange={(v) => {
                        if ((v === "hidden") !== hidden) onToggleHidden();
                    }}
                    options={[
                        {
                            value: "shown",
                            label: "Shown on the site",
                            note: "Publishes with the page.",
                        },
                        {
                            value: "hidden",
                            label: "Hidden when published",
                            note: "Stays here to change, and is left out when you publish.",
                        },
                    ]}
                />
            </div>
            <div className="flex items-start justify-between gap-3 border-t pt-4">
                <div className="grid gap-0.5">
                    <Label htmlFor="section-hide-phone" className="text-sm">
                        Hide on phone
                    </Label>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Shown on a computer or tablet, left out on a phone.
                    </p>
                </div>
                <Switch
                    id="section-hide-phone"
                    checked={frameOf(section).hideOn === "phone"}
                    onCheckedChange={onHideOnPhone}
                    disabled={readOnly}
                />
            </div>
        </fieldset>
    );
}
