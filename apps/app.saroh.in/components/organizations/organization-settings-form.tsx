"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { DetailTab } from "@/components/organizations/business-detail-rows";
import {
    BusinessDetailRows,
    DETAIL_TABS,
} from "@/components/organizations/business-detail-rows";
import { BusinessFieldSheet } from "@/components/organizations/business-field-sheet";
import { printOf, valuesOf } from "@/components/organizations/business-form";
import {
    BusinessHoursSection,
    hasHoursToEdit,
    HOURS_SECTION,
} from "@/components/organizations/business-hours-section";
import { BusinessLogoSheet } from "@/components/organizations/business-logo-sheet";
import { BusinessPrintPreview } from "@/components/organizations/business-print-preview";
import {
    PAY_SECTION,
    PayInstructionsSection,
} from "@/components/organizations/pay-instructions-section";
import { useBusinessSheets } from "@/components/organizations/use-business-sheets";
import {
    cardUndo,
    logoCardUndo,
    useSettingsUndo,
} from "@/components/organizations/use-settings-undo";
import { SettingsTabStrip } from "@/components/shared/settings-tab-strip";
import { useTabParam } from "@/lib/hooks/use-tab-param";
import type { BusinessTab } from "@/lib/organizations/business-rows";
import {
    BUSINESS_TAB_PARAM,
    BUSINESS_TABS,
    businessSheetToOpen,
} from "@/lib/organizations/business-rows";
import { savedWords } from "@/lib/organizations/business-sheet-words";
import type { OrganizationSettings } from "@/lib/organizations/settings-service";
import type { StorefrontHoursRead } from "@/lib/stores/storefronts";

/** Hours and How to pay us keep their own panels, rows and sheets. */
type OwnPanelKey = "hours" | "pay";
const OWN_PANEL: Record<OwnPanelKey, { title: string; panel: string }> = {
    hours: { title: HOURS_SECTION.title, panel: "business-hours-panel" },
    pay: { title: PAY_SECTION.title, panel: "business-pay-panel" },
};
const isDetailTab = (key: BusinessTab): key is DetailTab =>
    key !== "hours" && key !== "pay";
const titleOf = (key: BusinessTab) =>
    isDetailTab(key) ? DETAIL_TABS[key].title : OWN_PANEL[key].title;

/**
 * Workspace → Business, read first (owner, 10 Oct): six tabs, in the order
 * a customer's invoice reads (who the business is, how to reach it, how it
 * is taxed and numbered, how to pay it, when it is open, where it is
 * registered), each a card of rows saying what is saved, beside a preview
 * of how an invoice prints.
 *
 * Nothing is edited on the page. A row's Edit opens that row's side sheet
 * with one Save (`business-field-sheet.tsx`, and the logo's, the hours' and
 * How to pay us's own); Cancel, Escape and a press outside drop the draft,
 * so there is no unsaved edit for the page to guard on the way out. A save
 * offers Undo (F12), and the rows and the preview read what it answered at
 * once. A link elsewhere opens a sheet with `?edit=` on its tab
 * (`lib/organizations/business-rows.ts`).
 */
export function OrganizationSettingsForm({
    settings: initial,
    canEdit,
    hours,
    canEditHours,
    webAddress,
}: {
    settings: OrganizationSettings;
    canEdit: boolean;
    /** The locations' opening hours, for the Hours tab. */
    hours: StorefrontHoursRead;
    /** May change the locations, which is where hours are kept. */
    canEditHours: boolean;
    /**
     * The web address card (DEC-069, L4), drawn under Identity. It saves on
     * its own, in its own dialog.
     */
    webAddress?: React.ReactNode;
}) {
    const router = useRouter();
    // What the API last said, so the rows read a save at once rather than
    // waiting for the page to be fetched again.
    const [settings, setSettings] = useState(initial);
    // In the address, so Search settings can open the tab a setting is on.
    const [tab, setTab] = useTabParam(
        BUSINESS_TAB_PARAM,
        BUSINESS_TABS,
        "identity",
    );
    // Undo on a save (F12); what it saved back shows at once.
    const undo = useSettingsUndo();
    const applySaved = (next: OrganizationSettings) => {
        setSettings(next);
        // The header switcher renders the name: refresh so a rename shows.
        router.refresh();
    };
    const saved = valuesOf(settings);
    const mayEditHours = canEdit && canEditHours && hasHoursToEdit(hours);
    // A new edit closes the last save's Undo, which would write under it.
    const sheets = useBusinessSheets(
        (which) =>
            businessSheetToOpen(which, {
                canEdit,
                canEditHours: mayEditHours,
                registered: saved.gstRegistered,
            }),
        undo.settle,
    );
    const editing = canEdit ? sheets.editing : null;
    const words = { kind: settings.kind, registered: saved.gstRegistered };

    return (
        <>
            <SettingsTabStrip
                label="Business details"
                idPrefix="business-tab"
                current={tab}
                onChange={setTab}
                className="-mt-1.5 mb-[18px]"
                tabs={BUSINESS_TABS.map((key) => ({
                    key,
                    label: titleOf(key),
                    controls: isDetailTab(key)
                        ? "business-panel"
                        : OWN_PANEL[key].panel,
                }))}
            />

            <div className="flex flex-wrap items-start gap-5">
                {isDetailTab(tab) ? (
                    <div
                        id="business-panel"
                        role="tabpanel"
                        aria-labelledby={`business-tab-${tab}`}
                        className="grid min-w-0 flex-[1_1_460px] gap-4"
                    >
                        <BusinessDetailRows
                            tab={tab}
                            settings={settings}
                            canEdit={canEdit}
                            sheets={sheets}
                        />
                        {tab === "identity" ? webAddress : null}
                    </div>
                ) : null}
                {/* Mounted on every tab, so the weeks a save answered are
                    still what the tab reads when it is looked at again. */}
                <BusinessHoursSection
                    hours={hours}
                    hidden={tab !== "hours"}
                    canEdit={mayEditHours}
                    sheets={sheets}
                    offerUndo={undo.offer}
                />
                {/* Its own preview: what customers see. */}
                <PayInstructionsSection
                    saved={settings.payInstructions}
                    businessName={settings.name}
                    hidden={tab !== "pay"}
                    canEdit={canEdit}
                    sheets={sheets}
                    onSaved={setSettings}
                    offerUndo={undo.offer}
                />

                {/* What is saved, as an invoice prints it. A sheet shows
                    its own draft the same way, under its fields. */}
                <BusinessPrintPreview
                    hidden={tab === "pay"}
                    live={false}
                    {...printOf(saved, settings)}
                />
            </div>

            {/* The open sheet, a fresh draft each time it opens. */}
            {editing?.which === "logo" ? (
                <BusinessLogoSheet
                    key={editing.opened}
                    settings={settings}
                    open={editing.open}
                    returnTo={editing.returnTo}
                    onClose={sheets.close}
                    onSaved={(next, said) => {
                        undo.offer(
                            said,
                            logoCardUndo(settings, next, setSettings),
                        );
                        setSettings(next);
                    }}
                />
            ) : editing &&
              editing.which !== "hours" &&
              editing.which !== "pay" ? (
                <BusinessFieldSheet
                    key={editing.opened}
                    sheet={editing.which}
                    settings={settings}
                    open={editing.open}
                    returnTo={editing.returnTo}
                    onClose={sheets.close}
                    onSaved={(next, sent) => {
                        undo.offer(
                            savedWords(editing.which, words),
                            cardUndo(settings, next, sent, applySaved),
                        );
                        applySaved(next);
                    }}
                />
            ) : null}
        </>
    );
}
