"use client";

import { Button } from "@saroh/ui/button";
import { History } from "lucide-react";
import Link from "next/link";

import type { EditorModel } from "../shell/editor-model";

export interface HistoryPanelProps {
    model: EditorModel;
}

/**
 * Rail › History (U46 stub; U46b fills it as `fix/WXEHistory` draws it:
 * waiting changes with Undo per change, versions, compare, restore). Until
 * then it is today's way in: the Versions page, where a version is
 * previewed and restored.
 */
export function HistoryPanel({ model }: HistoryPanelProps) {
    return (
        <section aria-label="History" className="flex min-h-0 flex-1 flex-col">
            <h2 className="flex h-12 shrink-0 items-center px-4 text-[0.9375rem] font-semibold">
                History
            </h2>
            <div className="grid gap-3 px-4 text-sm text-muted-foreground">
                <p>
                    Every version that went live, kept so you can look back or
                    restore one as the draft.
                </p>
                <Button asChild variant="outline" className="w-full">
                    <Link href={`/sites/${model.siteId}/versions`}>
                        <History aria-hidden className="size-4" />
                        See versions
                    </Link>
                </Button>
            </div>
        </section>
    );
}
