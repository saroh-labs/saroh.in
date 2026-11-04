import { SolutionChanges as Changes } from "@saroh/marketing/solution-changes";

import { featureHref, features } from "@/content/features";
import { segmentViews } from "@/content/solutions";
import type { Solution } from "@/content/types";

import { shotView } from "../shared/media/shot-view";

/** A solution page's "What changes", from its content. */
export function SolutionChanges({ solution }: { solution: Solution }) {
    return (
        <Changes
            title={solution.changeTitle}
            segments={segmentViews(
                solution.segments,
                (f) => features[f].name,
            ).map((seg) => ({
                label: seg.label,
                pain: seg.pain,
                title: seg.title,
                body: seg.body,
                see: seg.seeLink
                    ? {
                          href: featureHref(seg.feature),
                          label: <>See {seg.featureName}</>,
                      }
                    : undefined,
                shot: seg.shot ? shotView(seg.shot, seg.alt) : undefined,
            }))}
        />
    );
}
