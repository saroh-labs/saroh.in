"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { IntentLink } from "@saroh/ui/intent-link";
import { QrCode } from "lucide-react";

import { QrShare } from "@/components/qr/share/qr-share";
import { SettingsLoading } from "@/components/settings/page/settings-loading";
import {
    SettingsPanel,
    SettingsPanelHeader,
} from "@/components/settings/page/settings-panel";
import { useShareScreen } from "@/lib/qr/use-share";

import { Drawn } from "./drawn";

const TITLE = "Share";
const SAYS =
    "Ways to put your pages in front of customers, in your shop and on paper.";

/**
 * Settings › Share on React Query (DEC-259): the page keeps Website's
 * module gate; the codes and the maker's choices load here (`settings`
 * tier), and a code made, changed or retired reads them again.
 */
export function ShareContainer() {
    return (
        <Drawn
            query={useShareScreen()}
            section="share"
            loading={
                <SettingsLoading
                    title={TITLE}
                    description={SAYS}
                    width="full"
                    rows={4}
                />
            }
        >
            {(screen) => (
                <SettingsPanel
                    width="full"
                    header={
                        <SettingsPanelHeader
                            holdsData={false}
                            title={TITLE}
                            description={SAYS}
                            readOnlyNote={
                                screen.state === "ready" && !screen.canChange
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
                                    <IntentLink href="/sites">
                                        Go to Website
                                    </IntentLink>
                                </Button>
                            }
                        />
                    ) : (
                        <div className="max-w-[1232px]">
                            <QrShare screen={screen} />
                        </div>
                    )}
                </SettingsPanel>
            )}
        </Drawn>
    );
}
