"use client";

import { Badge } from "@saroh/ui/badge";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";

import { OperatorDialog } from "@/components/operator-dialog";
import { Panel } from "@/components/panel";
import { deploySearchPages } from "@/lib/search-page-actions";
import type { PageRow } from "@/lib/search-page-words";
import { deployedWords, deployWords } from "@/lib/search-page-words";

/**
 * "N changes waiting to deploy" (R13, owner 31 Oct): every page published
 * or taken off since the last deploy, and Deploy changes, which rebuilds
 * the site once with all of them. While a rebuild waits or runs, it says
 * so and the button waits. Staff without `search-pages:publish` see the
 * list, never the button; with nothing waiting they see no bar.
 */
export function DeployBar({
    rows,
    site,
    rebuilding,
    canPublish,
}: {
    /** Pages whose staged status the site doesn't have yet. */
    rows: PageRow[];
    site: string;
    rebuilding: boolean;
    canPublish: boolean;
}) {
    const router = useRouter();
    if (rows.length === 0 && !canPublish) return null;
    const words = deployWords(rows, site);
    const list = (
        <ul aria-label="Changes waiting" className="grid">
            {rows.map((row) => (
                <li
                    key={row.path}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 text-sm first:border-t-0"
                >
                    <span className="min-w-0 flex-1 font-medium">
                        {row.name}
                    </span>
                    <code className="font-mono text-xs text-muted-foreground">
                        {row.path}
                    </code>
                    <Badge
                        variant={row.pending === "on" ? "success" : "outline"}
                    >
                        {row.pending === "on" ? "Published" : "Taken off"}
                    </Badge>
                </li>
            ))}
        </ul>
    );

    return (
        <Panel
            title={words.title}
            description={
                rebuilding
                    ? `${site} is rebuilding. You can deploy again once it's done.`
                    : rows.length > 0
                      ? `Published and taken-off pages reach ${site} only when you deploy. One rebuild carries them all.`
                      : `Publish or unpublish pages, then deploy them to ${site} together.`
            }
            actions={
                canPublish ? (
                    <OperatorDialog
                        trigger="Deploy changes"
                        triggerVariant="default"
                        disabled={rows.length === 0 || rebuilding}
                        disabledReason={
                            rebuilding
                                ? `${site} is rebuilding`
                                : "Nothing is waiting to deploy"
                        }
                        title={words.dialogTitle}
                        reasonRequired={false}
                        submitLabel="Deploy changes"
                        effect={
                            <div className="grid gap-1.5">
                                <p className="font-medium text-foreground">
                                    What happens
                                </p>
                                <ul className="grid list-disc gap-1 pl-5">
                                    {words.points.map((point) => (
                                        <li key={point}>{point}</li>
                                    ))}
                                </ul>
                            </div>
                        }
                        fields={
                            <div className="max-h-56 overflow-y-auto rounded-md border px-3">
                                {list}
                            </div>
                        }
                        onSubmit={async () => {
                            const result = await deploySearchPages();
                            if (!result.ok) {
                                return { ok: false, error: result.error };
                            }
                            const said = deployedWords(
                                result.data.paths.length,
                                result.data.rebuildQueued,
                                site,
                            );
                            showSuccess(said.title, said.description);
                            router.refresh();
                            return { ok: true };
                        }}
                    />
                ) : undefined
            }
        >
            {() => (rows.length > 0 ? list : null)}
        </Panel>
    );
}
