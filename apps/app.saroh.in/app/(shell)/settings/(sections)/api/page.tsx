import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { notFound } from "next/navigation";

import { requireSession } from "@/lib/session";
import { apiAreaOn } from "@/lib/settings/api-area-switch";

/**
 * Settings › API and AI apps (plan 2026-11-10-001). A placeholder until
 * U14 builds the page: the tab exists so the nav and search can point here.
 */
export const metadata = { title: "API and AI apps · Settings" };

export default async function ApiSettingsPage() {
    if (!apiAreaOn()) notFound();
    await requireSession();
    return (
        <SettingsPanel
            header={
                <SettingsPanelHeader
                    title="API and AI apps"
                    description="AI assistants, keys and webhooks"
                />
            }
        >
            <h2 data-ph-unmask="" className="text-base font-medium">
                Coming soon
            </h2>
        </SettingsPanel>
    );
}
