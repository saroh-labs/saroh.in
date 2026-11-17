import { AskAiView } from "@saroh/marketing/feature-pages/ask-ai-page";

import { askAiWords } from "@/content/reach-ask-ai";
import { WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";

import { inTheAppData, REACH_CRUMB } from "./reach/data";

/** /features/ask-ai (FADesk, FAPhone2): the shared page with saroh.in's words and world. */
export function AskAiPage() {
    const languages = claimOn("ask-ai-languages");
    return Promise.resolve(
        <AskAiView
            site={pageSite()}
            words={askAiWords({
                languages,
                stockOn: claimOn("ask-ai-stock"),
                plans: claimOn("ask-ai-plans"),
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            // Hinglish and Hindi wait for their claim.
            inTheApp={inTheAppData(
                "ask-ai",
                languages ? undefined : /Hinglish|Hindi/,
            )}
        />,
    );
}
