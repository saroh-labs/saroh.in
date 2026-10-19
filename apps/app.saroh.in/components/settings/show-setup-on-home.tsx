"use client";

import { TextLink } from "@saroh/ui/text-link";

import {
    setSetupHidden,
    useSetupHidden,
} from "@/components/home/use-setup-hidden";

/**
 * "Show setup on Home" (Home plan A4, U6): Hide for now on Home's "Finish
 * setup" is kept per person, in this browser, and this is the way back
 * from Settings › Business. Drawn only while it is hidden here; it shows
 * the checklist again and opens Home.
 */
export function ShowSetupOnHome({ businessId }: { businessId: string }) {
    const hidden = useSetupHidden(businessId);
    if (!hidden) return null;
    return (
        <p
            data-ph-unmask=""
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px] text-muted-foreground"
        >
            Finish setup is hidden on Home in this browser.
            <TextLink
                href="/"
                onClick={() => setSetupHidden(businessId, false)}
                className="text-[13px] coarse:min-h-11"
            >
                Show setup on Home
            </TextLink>
        </p>
    );
}
