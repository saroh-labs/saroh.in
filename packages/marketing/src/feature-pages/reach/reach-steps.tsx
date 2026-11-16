import type { ReactNode } from "react";

import type { FeatureStep } from "../../content/types";
import { ScreenshotFrame } from "../../media/screenshot-frame";
import type { ShotView } from "../../media/shot";
import { StepsShowcase } from "../../sections/steps-showcase";
import type { InTheAppData } from "./in-the-app";
import { claimed } from "./in-the-app";

/** The desk panel's 640px less its padding and note line: no shot is drawn taller. */
const ROOM = 560;

/** A captured screen in the steps' panel, as wide as fits its height. */
export function PanelShot({ shot }: { shot: ShotView }) {
    const { width, height } = shot.image;
    return (
        <div
            className="mx-auto"
            style={{
                width: `min(100%, ${Math.round((ROOM * width) / height)}px)`,
            }}
        >
            <ScreenshotFrame
                shot={shot}
                zoomable
                sizes="(min-width: 1080px) 680px, 100vw"
            />
        </div>
    );
}

/**
 * A Reach page's "How it works" (board "Steps A"): the feature's own steps
 * and lead from `content/features.ts`, less any sentence whose claim is off,
 * each with the picture the page draws for it, and its Help links.
 */
export function ReachSteps({
    data,
    foot,
    picture,
}: {
    data: InTheAppData;
    /** The line under the list (Ask AI: how long history is kept). */
    foot?: string;
    picture: (step: FeatureStep, i: number) => ReactNode;
}) {
    const feature = claimed(data.feature, data.hide);
    const under = [data.feature.worksToday, foot].filter(Boolean).join(" ");
    return (
        <StepsShowcase
            id="in-the-app"
            title={feature.howTitle}
            lede={feature.sub}
            steps={feature.steps.map((step, i) => ({
                title: step.title,
                body: step.body,
                note: step.who,
                picture: picture(step, i),
            }))}
            foot={under || undefined}
            links={data.help}
        />
    );
}
