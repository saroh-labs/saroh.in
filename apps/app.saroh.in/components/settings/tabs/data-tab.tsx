"use client";

import { DataExportPanel } from "@/components/settings/data/data-export-panel";
import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { useDataExports } from "@/lib/data-export/use-data-export";
import { dataExportLine } from "@/lib/data-export/words";

import { Drawn } from "./drawn";

const TITLE = "Your data";
const SAYS =
    "Everything this business keeps in Saroh is yours to take away, whenever you like.";

/**
 * Settings › Your data on React Query (DEC-259): the owner's downloads,
 * worded against the viewer's clock. A download's link is made when
 * Download is pressed and opened at once; it never enters the cache.
 */
export function DataContainer() {
    const query = useDataExports();
    return (
        <Drawn
            query={query}
            section="data"
            loading={
                <SettingsLoading title={TITLE} description={SAYS} rows={3} />
            }
        >
            {(read) => (
                <SettingsPanel
                    header={
                        <SettingsPanelHeader
                            holdsData={false}
                            title={TITLE}
                            description={SAYS}
                        />
                    }
                >
                    <DataExportPanel
                        lines={read.exports.map((view) =>
                            dataExportLine(view, new Date()),
                        )}
                        inProgress={read.inProgress}
                        check={() => query.refetch()}
                    />
                </SettingsPanel>
            )}
        </Drawn>
    );
}
