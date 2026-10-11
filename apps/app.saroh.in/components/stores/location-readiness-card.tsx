"use client";

import { useCanChangePlan } from "@/components/billing/plan-way";
import { planRow } from "@/components/settings/ready-rows";
import { SetupChecklist } from "@/components/shared/setup-checklist";
import type { ChecklistRow } from "@/lib/setup-checklist";
import type {
    LocationReadiness,
    LocationTab,
    ReadyItem,
} from "@/lib/stores/location-readiness";

/** Opens a tab of the page and puts the keyboard on a field there. */
type Jump = (tab: LocationTab, focus?: string) => void;

/**
 * "Get ready for online orders · 2 of 4 done" at the top of a location (the
 * 9 Oct audit), drawn by the one checklist
 * (`components/shared/setup-checklist.tsx`): what's already done first,
 * then each step left with the one thing that does it. The items are
 * `locationReadiness`'s, read from what the page holds. Once everything is
 * done it says "Ready for online orders." and folds to one quiet line.
 *
 * A step done on this page (the address, delivery) is offered only to
 * someone who can change it; one done elsewhere (a provider, the website)
 * keeps its link, and that page says who can.
 */
export function LocationReadinessCard({
    readiness,
    canEdit,
    onJump,
    storeId,
}: {
    readiness: LocationReadiness;
    canEdit: boolean;
    onJump: Jump;
    /** What the finished state is remembered by, in this browser. */
    storeId?: string;
}) {
    const { heading, note, items, total } = readiness;
    // Its plan row is a plan prompt: the link for someone who may change
    // the plan, who can for anyone else.
    const canChangePlan = useCanChangePlan();
    if (total === 0) return null;
    return (
        <SetupChecklist
            name="location"
            // "Ready for online orders" is the goal until it is true.
            title={`Get ${heading.charAt(0).toLowerCase()}${heading.slice(1)}`}
            doneTitle={`${heading}.`}
            note={note}
            rows={items.map((item) =>
                rowOf(item, canEdit, onJump, canChangePlan),
            )}
            // The one link a done step carries (the live shop) stays
            // reachable from the quiet line.
            doneView={items.find((i) => i.view)?.view}
            foldKey={storeId ? `location:${storeId}` : undefined}
        />
    );
}

export function rowOf(
    item: ReadyItem,
    canEdit: boolean,
    onJump: Jump,
    canChangePlan = true,
): ChecklistRow {
    const action =
        item.action && (canEdit || !item.action.inPage) ? item.action : null;
    return {
        key: item.key,
        label: item.label,
        done: item.done,
        view: item.view,
        ...(action
            ? action.inPage
                ? {
                      action: {
                          label: action.label,
                          onPress: () => {
                              if (action.tab) {
                                  onJump(action.tab, action.focus);
                              }
                          },
                      },
                  }
                : planRow(
                      { label: action.label, href: action.href },
                      canChangePlan,
                  )
            : {}),
    };
}
