import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { QrCode } from "lucide-react";
import Link from "next/link";

import { ModuleGate } from "@/components/modules/module-gate";
import { QrShare } from "@/components/qr/qr-share";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/settings-panel";
import { resolveActiveOrganization } from "@/lib/organizations/service";
import { readQrScreen } from "@/lib/qr/screen";
import { requireSession } from "@/lib/session";

/**
 * Settings › Share (plan U5, "Saroh QR Codes" design): what the business
 * hands customers to reach it. QR codes are its first section; another way
 * to share gets a section of its own under the same heading.
 *
 * The codes open pages of the website, so the tab sits behind Website's
 * gate: off, it says so and that nothing was deleted; out of a role's
 * reach, it says that. Anyone with `site:read` sees the codes; making and
 * changing one is `site:update`, which the API judges again on every save.
 */
export const metadata = { title: "Share" };

export default async function ShareSettingsPage() {
    await requireSession();
    return (
        <ModuleGate moduleKey="WEBSITE">
            <Share />
        </ModuleGate>
    );
}

async function Share() {
    const org = await resolveActiveOrganization();
    const screen = await readQrScreen(org);
    const readOnly = screen.state === "ready" && !screen.canChange;

    return (
        <SettingsPanel
            width="full"
            header={
                <SettingsPanelHeader
                    title="Share"
                    description="Ways to put your pages in front of customers, in your shop and on paper."
                    readOnlyNote={
                        readOnly
                            ? "You can see and download these codes. An owner or admin makes and changes them."
                            : undefined
                    }
                />
            }
        >
            {screen.state === "no-site" ? (
                <EmptyState
                    className="max-w-[760px]"
                    icon={<QrCode />}
                    title="No website yet"
                    description="A QR code opens a page on your website, so it needs one first. Once your site is there, its codes are made here."
                    action={
                        <Button asChild>
                            <Link href="/sites">Go to Website</Link>
                        </Button>
                    }
                />
            ) : (
                <div className="max-w-[1232px]">
                    <QrShare screen={screen} />
                </div>
            )}
        </SettingsPanel>
    );
}
