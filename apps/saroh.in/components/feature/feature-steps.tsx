import { ChatExchange } from "@saroh/marketing/chat-exchange";
import { FeatureSteps as Steps } from "@saroh/marketing/feature-steps";

import type { FeatureHelpLink } from "@/content/feature-help";
import type { Feature } from "@/content/types";

import { shotView } from "../shared/media/shot-view";

/** A feature page's "How it works", with its links to Help (plan U7). */
export function FeatureSteps({
    feature,
    help = [],
}: {
    feature: Feature;
    help?: readonly FeatureHelpLink[];
}) {
    return (
        <Steps
            title={feature.howTitle}
            steps={feature.steps.map((step) => ({
                title: step.title,
                body: step.body,
                who: step.who,
                // A step in another company's app is drawn, not captured.
                ...(step.chat
                    ? { drawn: <ChatExchange words={step.chat} /> }
                    : { shot: shotView(step.shot, step.alt) }),
            }))}
            help={help}
        />
    );
}
