"use client";

import { createContext, useContext } from "react";

/**
 * What a site setting does once its save landed (DEC-259): on the Settings
 * tab, the site's reads again (`useSiteSave`); in the editor's Find
 * settings sheet, the editor's page drawn again. `orgId` is the tab's
 * business, sent last to each write on a React Query screen. `saved` never
 * throws: a read that fails is the screen's failed state.
 */
export interface SettingsSaved {
    orgId?: string;
    saved: () => Promise<void>;
}

const SettingsSavedContext = createContext<SettingsSaved>({
    saved: () => Promise.resolve(),
});

export const SettingsSavedProvider = SettingsSavedContext.Provider;

export function useSettingsSaved(): SettingsSaved {
    return useContext(SettingsSavedContext);
}
