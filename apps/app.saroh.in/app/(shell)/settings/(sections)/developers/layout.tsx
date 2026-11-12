import { Button } from "@saroh/ui/button";
import { ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";

import { DevelopersNav } from "@/components/settings/developers/developers-nav";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { readApiUsage } from "@/lib/api-keys/service";
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
 */
export default async function DevelopersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    if (!apiAreaOn()) notFound();
    const org = await resolveActiveOrganization();
    const usage = await readApiUsage().catch(() => null);
    const tabs = developersTabsFor(org?.actions, usage);
    return (
        <SettingsPanel
            width="full"
            header={
                <SettingsPanelHeader
                    className="mb-5"
                    title="API and AI apps"
                    holdsData
                    description={`Let AI assistants, your own website and your own tools work with ${org?.name ?? "your business"}.`}
                    actions={
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
                    }
                />
            }
        >
            <DevelopersNav tabs={tabs} />
            {children}
        </SettingsPanel>
    );
}
