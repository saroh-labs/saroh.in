"use client";

import { ModuleCatalog } from "@/components/modules/catalog/module-catalog";
import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { useModulesScreen } from "@/lib/modules/use-modules";

import { Drawn } from "./drawn";

export const MODULES_SAYS =
    "Turn on what you use. Turning one off hides it. Nothing is deleted.";

/** Modules' loader: `loading.tsx` draws the same pieces. */
function ModulesLoading() {
    return (
        <SettingsLoading title="Modules" description={MODULES_SAYS} rows={6} />
    );
}

/**
 * Settings › Modules on React Query (DEC-259): a switch turned here calls
 * `afterSettingsSave()`, which reads this tab and the shell (the rail) again.
 */
export function ModulesContainer() {
    return (
        <Drawn
            query={useModulesScreen()}
            section="modules"
            loading={<ModulesLoading />}
        >
            {({ modules, locks }) => (
                <SettingsPanel
                    header={
                        <SettingsPanelHeader
                            title="Modules"
                            description={MODULES_SAYS}
                            readOnlyNote={
                                // `canManage` is the API's answer for this person, the same on every row.
                                modules.length === 0 ||
                                modules.some((m) => m.canManage)
                                    ? undefined
                                    : "Only owners and admins can change this."
                            }
                        />
                    }
                >
                    <ModuleCatalog modules={modules} locks={locks} />
                </SettingsPanel>
            )}
        </Drawn>
    );
}
