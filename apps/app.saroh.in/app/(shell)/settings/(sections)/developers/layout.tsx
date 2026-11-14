import { Button } from "@saroh/ui/button";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import { DevelopersNav } from "@/components/settings/developers/developers-nav";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { readApiUsage } from "@/lib/api-keys/service";
import { askAiOn } from "@/lib/ask-ai/ask-ai-switch";
import { DOCS_URL } from "@/lib/help/links";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { apiAreaOn } from "@/lib/settings/api-area-switch";
import { developersTabsFor } from "@/lib/settings/developers";

/**
 * Settings › API and AI apps (plan 2026-11-10-001, U14; "API and AI apps"
 * boards): the header, Developer docs, and the area's four tabs, each its
 * own page under it. Which tabs show is the person's permissions and,
 * once the API has said, the surfaces' switches; that read is best-effort
 * here (each tab reads it again, and fails in its own place).
 *
 * Open when either the API area's switch or Ask AI's is on (plan
 * 2026-11-13-001 U11); each tab's page keeps its own switch.
 */
export default async function DevelopersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const on = { apiArea: apiAreaOn(), askAi: askAiOn() };
    if (!on.apiArea && !on.askAi) notFound();
    const org = await resolveActiveOrganization();
    const usage = on.apiArea ? await readApiUsage().catch(() => null) : null;
    const tabs = developersTabsFor(org?.actions, usage, on);
    const business = org?.name ?? "your business";
    const askAi = tabs.some((t) => t.tab === "ask-ai");
    return (
        <SettingsPanel
            width="full"
            header={
                <SettingsPanelHeader
                    className="mb-5"
                    title="API and AI apps"
                    holdsData
                    description={
                        !askAi
                            ? `Let AI assistants, your own website and your own tools work with ${business}.`
                            : on.apiArea
                              ? `Ask AI inside Saroh, and AI apps and your own tools working with ${business}.`
                              : `Ask AI inside Saroh, for ${business}.`
                    }
                    actions={
                        on.apiArea ? (
                            <Button asChild variant="outline" size="sm">
                                <a
                                    href={`${DOCS_URL}/api`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Developer docs
                                    <ExternalLink
                                        aria-hidden
                                        className="size-3.5"
                                    />
                                </a>
                            </Button>
                        ) : undefined
                    }
                />
            }
        >
            <DevelopersNav tabs={tabs} />
            {children}
        </SettingsPanel>
    );
}
