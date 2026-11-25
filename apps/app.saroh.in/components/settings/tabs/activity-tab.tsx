"use client";

import { EmptyState } from "@saroh/ui/data-state";
import { History } from "lucide-react";

import { ActivityList } from "@/components/settings/activity/activity-list";
import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { ACTIVITY_SAYS } from "@/lib/settings/queries";
import { useActivityScreen } from "@/lib/settings/use-activity";

import { Drawn } from "./drawn";

const TITLE = "Activity";

/**
 * Settings › Activity on React Query (DEC-259): the last 50 changes, each
 * worded on the server in the business's zone (`records` tier).
 */
export function ActivityContainer() {
    return (
        <Drawn
            query={useActivityScreen()}
            section="activity"
            loading={
                <SettingsLoading
                    title={TITLE}
                    description={ACTIVITY_SAYS}
                    rows={6}
                />
            }
        >
            {({ entries }) => (
                <SettingsPanel
                    header={
                        <SettingsPanelHeader
                            holdsData={false}
                            title={TITLE}
                            description={ACTIVITY_SAYS}
                        />
                    }
                >
                    {entries.length === 0 ? (
                        <div className="max-w-[760px]">
                            <EmptyState
                                icon={<History />}
                                title="No changes yet"
                                description="When someone changes a setting, it shows here."
                            />
                        </div>
                    ) : (
                        <ActivityList entries={entries} />
                    )}
                </SettingsPanel>
            )}
        </Drawn>
    );
}
