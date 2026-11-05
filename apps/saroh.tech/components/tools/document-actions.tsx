"use client";

import { useState } from "react";

import { Button } from "@/components/shared/button";
import { track } from "@/lib/analytics";
import type { DocumentView } from "@/lib/tools/document";
import { canDrawPdf, downloadPdf } from "@/lib/tools/pdf";

/** Download and Print, with the reason when the PDF can't be made. */
export function useDownload(
    view: DocumentView,
    tool: string,
    onDone: (what: string) => void,
) {
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const download = () => {
        setProblem(null);
        if (!canDrawPdf(view)) {
            setProblem(
                "The PDF font can't draw some of these characters. Use Print, then Save as PDF: that keeps them.",
            );
            return;
        }
        setBusy(true);
        downloadPdf(view)
            .then(() => {
                track("tool_downloaded", { tool });
                onDone(`${view.fileName} downloaded`);
            })
            .catch(() =>
                setProblem(
                    "Couldn't make the PDF. Use Print, then Save as PDF. Your draft is safe.",
                ),
            )
            .finally(() => setBusy(false));
    };
    return { busy, problem, download };
}

export function DownloadProblem({ problem }: { problem: string | null }) {
    return problem ? (
        <p role="alert" className="m-0 text-sm text-mk-copy">
            {problem}
        </p>
    ) : null;
}

/** The desk's row under the document. */
export function DeskActions({
    busy,
    onDownload,
}: {
    busy: boolean;
    onDownload: () => void;
}) {
    return (
        <div className="flex gap-2.5">
            <Button className="flex-1" disabled={busy} onClick={onDownload}>
                {busy ? "Making your PDF…" : "Download PDF"}
            </Button>
            <Button
                look="secondary"
                className="!h-[52px]"
                onClick={() => window.print()}
            >
                Print
            </Button>
        </div>
    );
}

/** Where a draft is, and how to clear it. */
export function SavedNote({
    savedAt,
    onClear,
}: {
    savedAt?: string | null;
    onClear: () => void;
}) {
    return (
        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {savedAt
                ? `Saved in this browser · ${savedAt}`
                : "Stays in this browser"}
            <button
                type="button"
                onClick={onClear}
                className="min-h-11 cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] text-foreground underline md:min-h-0"
            >
                Clear
            </button>
        </span>
    );
}
