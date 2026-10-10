"use client";

import { Button } from "@saroh/ui/button";
import { showError, showInfo, showSuccess } from "@saroh/ui/toast";
import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ViewerDate } from "@/components/shared/viewer-date";
import { getDataExportLink, startDataExport } from "@/lib/data-export/actions";
import type { DataExportLine } from "@/lib/data-export/words";
import {
    DATA_EXPORT_ALREADY,
    DATA_EXPORT_HOLDS,
    DATA_EXPORT_KEPT,
    DATA_EXPORT_STARTED,
} from "@/lib/data-export/words";

/**
 * Settings › Your data (DEC-120): what a download holds, the button that
 * asks for one, and the downloads so far — each said in words, with
 * Download on a ready one. One is made at a time: while one is being put
 * together the button is off and says why, and "Check again" re-reads it.
 * A link is made when Download is pressed and opened at once; it works for
 * a few minutes, so it is never kept on the page.
 */
export function DataExportPanel({
    lines,
    inProgress,
}: {
    lines: DataExportLine[];
    inProgress: boolean;
}) {
    const router = useRouter();
    const [starting, startStarting] = useTransition();
    const [checking, startChecking] = useTransition();
    const [opening, setOpening] = useState<string | null>(null);

    const start = () =>
        startStarting(async () => {
            const result = await startDataExport();
            if (!result.ok) {
                showError("Your data couldn't be prepared", result.error);
                return;
            }
            if (result.data.already) showInfo(DATA_EXPORT_ALREADY);
            else
                showSuccess("Your data is being prepared", DATA_EXPORT_STARTED);
            router.refresh();
        });

    const download = async (id: string) => {
        setOpening(id);
        try {
            const result = await getDataExportLink(id);
            if (!result.ok) {
                showError("The download couldn't start", result.error);
                router.refresh();
                return;
            }
            window.location.assign(result.data.url);
        } finally {
            setOpening(null);
        }
    };

    return (
        <div className="grid max-w-[760px] gap-5">
            <section
                aria-labelledby="data-export-what"
                className="grid gap-3 rounded-lg border border-border bg-card p-4"
            >
                <h3 id="data-export-what" className="text-[14px] font-semibold">
                    Download your data
                </h3>
                <p className="text-pretty text-[13px] leading-normal text-muted-foreground">
                    One zip file with everything this business keeps in Saroh.{" "}
                    {DATA_EXPORT_HOLDS}
                </p>
                <p className="text-pretty text-[13px] leading-normal text-muted-foreground">
                    We put it together in the background and email you a link
                    when it&apos;s ready. {DATA_EXPORT_KEPT}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        onClick={start}
                        disabled={inProgress || starting}
                    >
                        <Download aria-hidden className="size-4" />
                        {starting ? "Starting…" : "Prepare a download"}
                    </Button>
                    {inProgress ? (
                        <>
                            <p
                                role="status"
                                className="text-[13px] text-foreground/80"
                            >
                                One is being put together now. We&apos;ll email
                                you when it&apos;s ready.
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={checking}
                                onClick={() =>
                                    startChecking(() => router.refresh())
                                }
                            >
                                {checking ? "Checking…" : "Check again"}
                            </Button>
                        </>
                    ) : null}
                </div>
            </section>

            <section aria-labelledby="data-export-list" className="grid gap-2">
                <h3 id="data-export-list" className="text-[14px] font-semibold">
                    Your downloads
                </h3>
                {lines.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                        None yet. Prepare one whenever you like.
                    </p>
                ) : (
                    <ul className="grid divide-y divide-border rounded-lg border border-border bg-card">
                        {lines.map((line) => (
                            <li
                                key={line.id}
                                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-medium">
                                        {line.state}
                                        {line.when ? (
                                            <span className="font-normal text-muted-foreground">
                                                {" · "}
                                                {line.when.label}{" "}
                                                <ViewerDate
                                                    iso={line.when.iso}
                                                    variant="datetime"
                                                />
                                            </span>
                                        ) : null}
                                    </p>
                                    {line.detail ? (
                                        <p className="text-pretty text-[12.5px] leading-normal text-muted-foreground">
                                            {line.detail}
                                        </p>
                                    ) : null}
                                </div>
                                {line.downloadable ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={opening !== null}
                                        onClick={() => void download(line.id)}
                                    >
                                        {opening === line.id
                                            ? "Starting…"
                                            : "Download"}
                                    </Button>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
