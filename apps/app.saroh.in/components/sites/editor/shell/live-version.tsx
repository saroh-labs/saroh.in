"use client";

import { FailedRead } from "@saroh/ui/failed-read";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useBusinessZone } from "@/components/shared/dates/business-zone";
import { formatDate } from "@/lib/format/datetime";
import { readVersion, readVersions } from "@/lib/sites/history-read";
import type { SitePublicationDetail } from "@/lib/sites/service";

import { COMPARE_WIDTH, VersionPage } from "../panels/history-compare";
import type { EditorModel } from "./editor-model";

type Read =
    | { state: "loading" }
    | { state: "failed" }
    | { state: "none" }
    | { state: "ready"; detail: SitePublicationDetail; at: string };

/** Where the canvas is, so the live page covers it and nothing else. */
function canvasRect(): DOMRect | null {
    return (
        document
            .querySelector('[aria-label="Page canvas"]')
            ?.getBoundingClientRect() ?? null
    );
}

/**
 * The Live version switch's page (R1, `fix/WXMReviewer`): what visitors
 * see now on this page, over the canvas, drawn from the live publication
 * as it was served (`VersionPage`, the same drawing History's Compare
 * uses). Switching it off shows the draft again; nothing here edits.
 */
export function LiveVersionPage({ model }: { model: EditorModel }) {
    const zone = useBusinessZone();
    const [read, setRead] = useState<Read>({ state: "loading" });
    const [attempt, setAttempt] = useState(0);
    const [rect, setRect] = useState<DOMRect | null>(null);
    const { siteId } = model;

    useEffect(() => {
        const run = { gone: false };
        const set = (next: Read) => {
            if (!run.gone) setRead(next);
        };
        void (async () => {
            const list = await readVersions(siteId);
            if (!list) return set({ state: "failed" });
            const current = list.find((v) => v.isCurrent);
            if (!current) return set({ state: "none" });
            const detail = await readVersion(siteId, current.id);
            set(
                detail
                    ? { state: "ready", detail, at: current.publishedAt }
                    : { state: "failed" },
            );
        })();
        return () => {
            run.gone = true;
        };
    }, [siteId, attempt]);

    useEffect(() => {
        const measure = () => setRect(canvasRect());
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, []);

    // VersionPage lays the page out at COMPARE_WIDTH: fill the canvas's width.
    const scale = liveScale(rect?.width ?? 0);
    const overlay = (
        <div
            role="region"
            aria-label="Live version"
            data-live-version=""
            className="fixed z-20 overflow-y-auto bg-muted p-6"
            style={
                rect
                    ? {
                          left: rect.left,
                          top: rect.top,
                          width: rect.width,
                          height: rect.height,
                      }
                    : { inset: 0 }
            }
        >
            {read.state === "loading" ? (
                <p className="text-sm text-muted-foreground">
                    Loading the live version…
                </p>
            ) : read.state === "failed" ? (
                <FailedRead
                    things="the live version"
                    onRetry={() => {
                        setRead({ state: "loading" });
                        setAttempt((n) => n + 1);
                    }}
                />
            ) : read.state === "none" ? (
                <p className="text-sm text-muted-foreground">
                    This site hasn&apos;t been published yet, so visitors see
                    nothing.
                </p>
            ) : (
                <>
                    <p className="mb-2 text-[0.8125rem] font-semibold text-muted-foreground">
                        {`Live since ${formatDate(read.at, zone)} · what visitors see now`}
                    </p>
                    <VersionPage
                        detail={read.detail}
                        siteId={siteId}
                        path={model.page?.path ?? "/"}
                        scale={scale}
                    />
                </>
            )}
        </div>
    );
    return createPortal(overlay, document.body);
}

/** The live page's scale: as wide as the canvas less its padding, never over 1. */
export function liveScale(canvasWidth: number): number {
    return Math.min(1, Math.max(160, canvasWidth - 48) / COMPARE_WIDTH);
}
