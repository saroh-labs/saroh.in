"use client";

import { useEffect, useState } from "react";

import { readTemplatePreview } from "@/lib/sites/actions";
import type { TemplatePreviewDetails } from "@/lib/sites/template-preview";

/** The business's own details for a preview, as they load. */
export type DetailsRead =
    | { status: "loading" }
    | { status: "ready"; details: TemplatePreviewDetails }
    | { status: "failed"; retry: () => void };

/**
 * The business's own details a template's preview is drawn with (DEC-216),
 * read once when the choice is shown (the chosen line names them too), and
 * again on Try again. A failed read draws the sample, said once.
 */
export function usePreviewDetails(enabled = true): DetailsRead {
    const [read, setRead] = useState<"loading" | TemplatePreviewDetails | null>(
        "loading",
    );
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        let live = true;
        readTemplatePreview().then(
            (details) => {
                if (live) setRead(details);
            },
            () => {
                if (live) setRead(null);
            },
        );
        return () => {
            live = false;
        };
    }, [enabled, attempt]);

    if (read === "loading") return { status: "loading" };
    if (read) return { status: "ready", details: read };
    return {
        status: "failed",
        retry: () => {
            setRead("loading");
            setAttempt((n) => n + 1);
        },
    };
}
