"use client";

import { canShare, copyFailedMessage, copyText } from "@saroh/ui/copy-button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import { readyRows } from "@/components/settings/ready/ready-rows";
import { SetupChecklist } from "@/components/shared/setup-checklist/setup-checklist";
import { noteShared } from "@/components/shared/share-link/note-shared";
import type { FirstSteps } from "@/lib/settings/ready";
import { FIRST_STEPS_WORDS, firstStepsLead } from "@/lib/settings/ready";
import type { ShareLink } from "@/lib/sites/share-links";

import { setSetupHidden, useSetupHidden } from "./use-setup-hidden";

/**
 * Home's 4 first steps (#1194, R12), drawn by the one checklist above both
 * layouts while any is left: publish the site, add services or products,
 * share the booking link, take the first booking or order. Once all are
 * done this draws nothing and Home's money card (`TakeMoneyChecklist`)
 * takes its place; until then the money steps are on Settings › Business.
 *
 * "Share your booking link" opens the phone's share sheet, or copies the
 * link at a desk, when the link is live; either ticks the step. Not live
 * yet, it goes to Bookings › Services, where the booking page is published.
 *
 * Hide is the same per-browser store as the money card's
 * (`use-setup-hidden.ts`), so Settings › Business's "Show setup on Home"
 * brings either back.
 */
export function FirstStepsChecklist({
    first,
    share,
    businessId,
}: {
    first: FirstSteps;
    share?: ShareLink | null;
    businessId: string;
}) {
    const hidden = useSetupHidden(businessId);
    const router = useRouter();
    if (!firstStepsLead(first)) return null;

    const press = async (link: ShareLink) => {
        if (canShare()) {
            try {
                await navigator.share({ url: link.url, title: link.label });
            } catch {
                // Closed, or refused: nothing was shared.
                return;
            }
        } else if (await copyText(link.url)) {
            showSuccess(link.copied);
        } else {
            showError(copyFailedMessage());
            return;
        }
        await noteShared();
        router.refresh();
    };

    const rows = readyRows(first.steps).map((row) =>
        row.key === "share" && share && !row.done
            ? {
                  ...row,
                  action: {
                      label: row.action?.label ?? "Share link",
                      onPress: () => void press(share),
                  },
              }
            : row,
    );

    return (
        <SetupChecklist
            name="home-first"
            {...FIRST_STEPS_WORDS}
            rows={rows}
            hide={{
                hidden,
                onHide: () => setSetupHidden(businessId, true),
                onShow: () => setSetupHidden(businessId, false),
                said: "Setup hidden. Show it again from the top of Home or Settings › Business.",
            }}
        />
    );
}
