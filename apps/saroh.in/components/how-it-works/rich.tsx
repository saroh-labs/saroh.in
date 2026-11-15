import type { ReactNode } from "react";

import type { Gate, GatedText } from "@/content/how-it-works";

/** A gate's state, as the page works it out from its switches. */
export type IsOn = (gate: Gate) => boolean;

/** Words with the board's `**bold**` words drawn bold. */
export function Rich({ text }: { text: string }): ReactNode {
    const parts = text.split("**");
    return parts.map((p, i) =>
        i % 2 ? (
            <b key={i} className="font-semibold text-foreground">
                {p}
            </b>
        ) : (
            p
        ),
    );
}

/** A line with the gated sentences that are on added at its end. */
export function gated(t: GatedText, on: IsOn): string {
    return (
        t.text +
        (t.tails ?? [])
            .filter(on)
            .map((x) => x.text)
            .join("")
    );
}
