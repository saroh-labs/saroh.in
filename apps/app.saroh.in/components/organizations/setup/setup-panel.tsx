"use client";

import { SplitPanel } from "@saroh/ui/split-shell";

import { planFor } from "@/lib/organizations/setup-steps";
import { galleryPanelHeading } from "@/lib/organizations/trade";

import type { GalleryTemplate } from "./setup-gallery-note";

import { useSetupStep } from "./setup-step-context";

/**
 * The plan beside setup's form: the account, ticked, then setup's three
 * steps with the one on show marked. It reads the same step as the form
 * (`setup-step-context.tsx`) and the same list (`setup-steps.ts`), so the
 * two can't disagree about where the person is.
 *
 * The panel is gone on a phone, so nothing here is said only here: the
 * form's own line above its heading and its progress bar say the place.
 */
export function SetupPanel({
    gallery,
}: {
    /**
     * The template picked in the gallery (TPLD1): the panel says what the
     * business starts as and that its website starts from it.
     */
    gallery?: GalleryTemplate | null;
}) {
    const { step } = useSetupStep();
    const plan = planFor(step);
    if (gallery) {
        return (
            <SplitPanel
                eyebrow="Set up"
                heading={galleryPanelHeading(gallery.trade)}
                body="Say what it is, name it and pick what to do first. The last step opens that thing, ready to fill in."
                points={[
                    "You can change any of it later in Settings",
                    `Your website starts from ${gallery.name}`,
                ]}
            />
        );
    }
    return (
        <SplitPanel
            eyebrow="Set up"
            heading="Name it, pick a start, and you are in it."
            body="One question at a time. The last one opens what you picked, ready to fill in, and you can change any of this later in Settings."
            steps={plan.steps}
            currentStep={plan.current}
        />
    );
}
