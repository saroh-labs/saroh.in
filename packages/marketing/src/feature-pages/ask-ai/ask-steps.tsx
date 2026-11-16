"use client";

import type { FeatureStep } from "../../content/types";
import { StepsPlayer } from "../../sections/steps-player";
import type { reachSteps } from "../reach/reach-steps";
import type { AskPlayWords } from "./answer";
import { AskPlay } from "./answer";

/**
 * Ask AI's "How it works" (board "overdrive", #49): its four steps play the
 * hero's one question through one panel, moved on by the visitor. A client piece, so the panel's
 * story is drawn here from plain words the server page hands in.
 */
export function AskSteps({
    how,
    words,
    stockOn,
}: {
    how: ReturnType<typeof reachSteps>;
    words: AskPlayWords;
    stockOn: boolean;
}) {
    return (
        <StepsPlayer
            {...how}
            steps={how.steps.map((step: FeatureStep) => ({
                title: step.title,
                body: step.body,
            }))}
            note={how.steps.find((st) => st.who)?.who}
            panel={(view) => (
                <AskPlay words={words} view={view} stockOn={stockOn} />
            )}
            panelLabel={words.panel.label}
            labels={words.play}
        />
    );
}
