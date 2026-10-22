"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { EmptyState } from "@saroh/ui/data-state";
import { planLabel } from "@saroh/ui/lib/state-copy";
import { cn } from "@saroh/ui/lib/utils";
import { Notice } from "@saroh/ui/notice";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { Download, FileUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import { showPlanRefusal } from "@/components/billing/plan-refusal";
import { PlanWay } from "@/components/billing/plan-way";
import { useLeaveGuard } from "@/components/shared/forms/use-leave-guard";
import { runAction } from "@/lib/api/run-action";
import type { PlanMeter } from "@/lib/billing/meter";
import { importRoom } from "@/lib/billing/meter";
import { joinFacts } from "@/lib/format/join";
import { count } from "@/lib/format/plural";
import { applyImport, previewImport } from "@/lib/imports/actions";
import {
    columnWords,
    entityNoun,
    fieldOption,
    issueGroups,
    matchNote,
    neededSentence,
    problemsLead,
    rowLine,
    rowsInFile,
    toCsv,
} from "@/lib/imports/review";
import type {
    ApplyResult,
    DuplicatePolicy,
    ImportEntity,
    IssueGroup,
    PreviewResult,
    RowIssue,
} from "@/lib/imports/service";

/**
 * CSV import (#175) — pick a file, check the mapping, see what will happen,
 * then commit.
 *
 * `PRODUCT_STRATEGY.md` §15 requires preview, validation, useful error
 * messages, duplicate handling and a correction path. Nothing is written until
 * the merchant presses Import, and the summary they approve is computed by the
 * api from the same file it will later write.
 *
 * Deliberately not a table (§17): mapping is a stack of labelled rows that
 * reflows to one column, so it is usable one-handed rather than being a desktop
 * grid squeezed onto a phone. No affordance depends on hover.
 *
 * Fields read in words (UX-065), and on a plan with a product limit the
 * preview says how many of the new rows fit and offers to bring in those
 * (UX-036) — never "7 will be created", then the whole file refused.
 *
 * Products audit (16 Oct): the columns and a sample file come before the
 * file; problems are grouped and numbered as the spreadsheet numbers rows;
 * the first rows read as the products they'll become; a failed re-check
 * keeps the last good preview; the done card is the only feedback.
 */

/** Matches the api's own cap; refused here too so the file is never uploaded. */
const MAX_BYTES = 5 * 1024 * 1024;
const IGNORE = "__ignore__";
/** Problems are listed up to this many kinds; the rest are counted. */
const MAX_LISTED_GROUPS = 20;
/** How many rows the preview reads out as they'll come in. */
const PREVIEW_ROWS = 5;

type Phase = "choose" | "review" | "done";

/** A preview that came back, with the duplicate rule it was checked under. */
type Checked = PreviewResult & { policy: DuplicatePolicy };

export interface Descriptor {
    entity: ImportEntity;
    requiredFields: string[];
    mappableFields: string[];
    fieldLabels?: Record<string, string>;
    keyLabel: string;
    /** Headings, then example rows; absent from an older API. */
    sample?: string[][];
    currency?: string | null;
}

/** What the product import can't bring in yet, said where the columns are matched. */
const NOT_YET: Partial<Record<ImportEntity, string>> = {
    products:
        "Category, SKU and stock can't be imported yet. Set them on each product after.",
};

function IssueGroups({
    groups,
    limit = MAX_LISTED_GROUPS,
}: {
    groups: IssueGroup[];
    limit?: number;
}) {
    const shown = groups.slice(0, limit);
    return (
        <div className="space-y-2">
            <ul className="space-y-2">
                {shown.map((group, i) => (
                    <li key={`${group.field ?? ""}-${i}`} className="text-sm">
                        <span>{group.message}</span>{" "}
                        <span className="text-muted-foreground">
                            {rowsInFile(group.rows)}
                        </span>
                    </li>
                ))}
            </ul>
            {groups.length > shown.length ? (
                <p className="text-sm text-muted-foreground">
                    …and {count(groups.length - shown.length, "more problem")}.
                </p>
            ) : null}
        </div>
    );
}

function FileIssues({ issues }: { issues: RowIssue[] }) {
    return (
        <ul className="space-y-1">
            {issues.map((issue, i) => (
                <li
                    key={`${issue.field ?? ""}-${i}`}
                    className="text-sm font-medium text-destructive"
                >
                    {issue.message}
                </li>
            ))}
        </ul>
    );
}

function Count({ label, value }: { label: string; value: number }) {
    return (
        <div className="min-w-0">
            <div className="text-2xl font-semibold tabular-nums">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
        </div>
    );
}

/** Hand the merchant the sample file to fill in. */
function downloadSample(entity: ImportEntity, sample: string[][]) {
    const blob = new Blob([toCsv(sample)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saroh-${entity}-sample.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function CsvImport({
    storeId,
    descriptor,
    backHref,
    meter = null,
}: {
    storeId: string;
    descriptor: Descriptor;
    backHref: string;
    /** The plan's product limit, for a products import (UX-036). */
    meter?: PlanMeter | null;
}) {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);
    const noun = entityNoun(descriptor.entity);

    const [phase, setPhase] = useState<Phase>("choose");
    const [fileName, setFileName] = useState("");
    const [csv, setCsv] = useState("");
    const [policy, setPolicy] = useState<DuplicatePolicy>("SKIP");
    const [mapping, setMapping] = useState<Record<string, string>>({});
    // The last preview that came back: kept on screen when a re-check fails.
    const [preview, setPreview] = useState<Checked | null>(null);
    const [result, setResult] = useState<ApplyResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fileIssues, setFileIssues] = useState<RowIssue[]>([]);
    // A re-check that didn't come back, and what it asked, for Try again.
    const [recheck, setRecheck] = useState<{
        error: string;
        mapping: Record<string, string>;
        policy: DuplicatePolicy;
    } | null>(null);
    const [dragging, setDragging] = useState(false);
    const [pending, startTransition] = useTransition();
    // A file checked and its columns matched, and nothing written yet.
    const guard = useLeaveGuard({
        dirty: phase === "review",
        lost: `Nothing from ${fileName || "the file"} is imported yet, and the columns you matched will be lost.`,
    });

    const runPreview = useCallback(
        (
            text: string,
            nextMapping: Record<string, string>,
            next: DuplicatePolicy,
            /** The preview on screen, kept if this one fails. */
            kept: Checked | null,
        ) => {
            startTransition(async () => {
                let unreached: string | null = null;
                const res = await runAction(
                    () =>
                        previewImport(storeId, descriptor.entity, {
                            csv: text,
                            mapping: nextMapping,
                            policy: next,
                        }),
                    // A re-check says it failed where the preview is.
                    kept
                        ? {
                              quiet: true,
                              onUnreached: (s) => {
                                  unreached = s;
                              },
                          }
                        : {},
                );
                const failed = !res ? unreached : res.ok ? null : res.error;
                if (!res?.ok) {
                    if (failed === null) return;
                    if (kept) {
                        // Keep the last good preview and what it matched.
                        setMapping(kept.mapping);
                        setPolicy(kept.policy);
                        setRecheck({
                            error: failed,
                            mapping: nextMapping,
                            policy: next,
                        });
                    } else {
                        setError(failed);
                    }
                    return;
                }
                setError(null);
                setRecheck(null);
                setPreview({ ...res.data, policy: next });
                // The api suggests a mapping when none was sent; adopt it so the
                // controls show what the preview was actually computed from.
                setMapping(res.data.mapping);
                setFileIssues(res.data.plan.fileIssues);
                setPhase("review");
            });
        },
        [storeId, descriptor.entity],
    );

    async function onFile(file: File) {
        setResult(null);
        setRecheck(null);
        if (file.size > MAX_BYTES) {
            setError(
                "This file is larger than 5 MB. Split it and import in parts.",
            );
            return;
        }
        const text = await file.text();
        setFileName(file.name);
        setCsv(text);
        setMapping({});
        setPreview(null);
        setPhase("choose");
        runPreview(text, {}, policy, null);
    }

    function chooseFile() {
        if (fileInput.current) {
            // The same file chosen again still counts as a choice.
            fileInput.current.value = "";
            fileInput.current.click();
        }
    }

    function changeMapping(header: string, field: string) {
        const next = { ...mapping };
        if (field === IGNORE) delete next[header];
        else next[header] = field;
        setMapping(next);
        runPreview(csv, next, policy, preview);
    }

    function changePolicy(next: DuplicatePolicy) {
        setPolicy(next);
        runPreview(csv, mapping, next, preview);
    }

    function onImport(createAtMost?: number) {
        startTransition(async () => {
            const res = await runAction(() =>
                applyImport(storeId, descriptor.entity, {
                    csv,
                    mapping,
                    policy,
                    ...(createAtMost === undefined ? {} : { createAtMost }),
                }),
            );
            if (!res) return;
            if (!res.ok) {
                // More rows than the plan's products limit (U13): its notice.
                if (res.plan) showPlanRefusal(res.plan);
                setError(res.error);
                if (res.fileIssues) setFileIssues(res.fileIssues);
                return;
            }
            // The done card is the feedback: no toast to say it twice.
            setError(null);
            setResult(res.data);
            setPhase("done");
            router.refresh();
        });
    }

    function reset() {
        setPhase("choose");
        setPreview(null);
        setResult(null);
        setError(null);
        setRecheck(null);
        setFileIssues([]);
        setCsv("");
        setFileName("");
        setMapping({});
        if (fileInput.current) fileInput.current.value = "";
    }

    // A field already fed by another column cannot be chosen twice.
    const claimed = new Set(Object.values(mapping));
    const plan = preview?.plan;
    // New products the cap counts (archived rows add none, as the API counts).
    const adding = plan
        ? plan.rows.filter(
              (r) =>
                  r.outcome === "CREATE" &&
                  (r.values.status ?? "DRAFT").toUpperCase() !== "ARCHIVED",
          ).length
        : 0;
    const room =
        descriptor.entity === "products" ? importRoom(meter, adding) : null;
    // Only the first `fits` new rows come in when the file is over (UX-036).
    const fits = room?.over ? room.fits : null;
    const willWrite = plan
        ? plan.counts.CREATE +
          plan.counts.UPDATE -
          (fits === null ? 0 : adding - fits)
        : 0;
    const groups = issueGroups(plan);
    const firstRows = plan
        ? plan.rows
              .filter((r) => r.outcome === "CREATE" || r.outcome === "UPDATE")
              .slice(0, PREVIEW_ROWS)
        : [];
    const statusUnmatched =
        descriptor.entity === "products" &&
        descriptor.mappableFields.includes("status") &&
        !Object.values(preview?.mapping ?? {}).includes("status");
    const columns = columnWords(
        descriptor.requiredFields,
        descriptor.mappableFields,
        descriptor.fieldLabels,
    );

    if (phase === "done" && result) {
        const resultGroups = issueGroups(result.plan);
        return (
            <Card className="wk-surface">
                <CardContent className="space-y-6 p-6">
                    <div>
                        <h2 className="text-lg font-semibold">
                            Import finished
                        </h2>
                        <p className="text-sm text-muted-foreground">
                            {fileName}
                        </p>
                    </div>
                    <p className="text-base font-medium">
                        {joinFacts(
                            `${count(result.created, noun)} added`,
                            result.updated > 0 &&
                                `${count(result.updated, noun)} updated`,
                            result.skipped > 0 &&
                                `${count(result.skipped, "row")} already there, left as they were`,
                            result.overLimit
                                ? `${count(result.overLimit, noun)} left out to fit your plan`
                                : null,
                        )}
                    </p>
                    {result.failed > 0 ? (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                {count(result.failed, "row")} couldn’t be
                                imported. Fix these in your file and import it
                                again. Rows already in will be left as they are
                                or updated, not added twice.
                            </p>
                            <IssueGroups groups={resultGroups} />
                        </div>
                    ) : null}
                    <div className="flex flex-wrap gap-3">
                        <Button variant="brand" asChild>
                            <Link href={backHref}>Done</Link>
                        </Button>
                        <Button variant="outline" onClick={reset}>
                            Import another file
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <input
                ref={fileInput}
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose a CSV file"
                disabled={pending}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                }}
            />
            <Card className="wk-surface">
                <CardContent
                    className="space-y-4 p-6"
                    onDragOver={(e) => {
                        if (pending) return;
                        e.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        if (pending) return;
                        const file = e.dataTransfer.files.item(0);
                        if (file) void onFile(file);
                    }}
                >
                    {fileName ? (
                        <div
                            className={cn(
                                "flex flex-wrap items-center justify-between gap-3 rounded-[10px]",
                                dragging &&
                                    "outline-dashed outline-2 outline-offset-4 outline-foreground",
                            )}
                        >
                            <p className="min-w-0 text-sm">
                                <span className="font-medium">{fileName}</span>
                                {plan ? (
                                    <span className="text-muted-foreground">
                                        {` · ${count(plan.totalRows, "row")}`}
                                    </span>
                                ) : null}
                            </p>
                            <Button
                                variant="outline"
                                onClick={chooseFile}
                                disabled={pending}
                            >
                                Choose a different file
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Button
                                variant="outline"
                                onClick={chooseFile}
                                disabled={pending}
                                className={cn(
                                    "h-auto min-h-[132px] w-full flex-col gap-2 whitespace-normal rounded-[10px] border-dashed border-border-strong p-4",
                                    dragging && "border-foreground bg-muted/50",
                                )}
                            >
                                <FileUp
                                    className="size-5 text-muted-foreground"
                                    aria-hidden
                                />
                                Drop a CSV here or choose one
                            </Button>
                            <div className="space-y-2 text-sm">
                                <p>
                                    Your first row is the headings.{" "}
                                    {neededSentence(
                                        descriptor.requiredFields,
                                        descriptor.fieldLabels,
                                    )}
                                </p>
                                <p className="text-muted-foreground">
                                    {joinFacts(
                                        `Needed: ${columns.required.join(", ")}`,
                                        columns.optional.length > 0 &&
                                            `Optional: ${columns.optional.join(", ")}`,
                                    )}
                                </p>
                                {descriptor.sample?.length ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() =>
                                            downloadSample(
                                                descriptor.entity,
                                                descriptor.sample ?? [],
                                            )
                                        }
                                    >
                                        <Download aria-hidden />
                                        Download a sample file
                                    </Button>
                                ) : null}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            {error ? (
                <Card className="border-destructive/40">
                    <CardContent className="space-y-2 p-6">
                        <p className="text-sm font-medium text-destructive">
                            {error}
                        </p>
                        {fileIssues.length > 0 ? (
                            <FileIssues issues={fileIssues} />
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            {phase === "review" && preview ? (
                <>
                    <Card className="wk-surface">
                        <CardContent className="space-y-5 p-6">
                            <div>
                                <h2 className="font-semibold">
                                    Match your columns
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Matched from your headings. Columns set to
                                    “Don’t import” are left out.
                                </p>
                            </div>
                            <div className="space-y-3">
                                {preview.headers.map((header) => {
                                    const value = mapping[header] ?? IGNORE;
                                    return (
                                        <div
                                            key={header}
                                            className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4"
                                        >
                                            <div className="min-w-0 truncate text-sm font-medium">
                                                {header}
                                            </div>
                                            <Select
                                                value={value}
                                                disabled={pending}
                                                onValueChange={(v) =>
                                                    changeMapping(header, v)
                                                }
                                            >
                                                <SelectTrigger
                                                    className="w-full"
                                                    aria-label={`What the “${header}” column fills`}
                                                >
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={IGNORE}>
                                                        Don’t import
                                                    </SelectItem>
                                                    {descriptor.mappableFields.map(
                                                        (field) => (
                                                            <SelectItem
                                                                key={field}
                                                                value={field}
                                                                disabled={
                                                                    field !==
                                                                        value &&
                                                                    claimed.has(
                                                                        field,
                                                                    )
                                                                }
                                                            >
                                                                {fieldOption(
                                                                    field,
                                                                    descriptor.requiredFields,
                                                                    descriptor.fieldLabels,
                                                                )}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    );
                                })}
                            </div>

                            {fileIssues.length > 0 ? (
                                <FileIssues issues={fileIssues} />
                            ) : null}

                            {NOT_YET[descriptor.entity] ? (
                                <p className="text-sm text-muted-foreground">
                                    {NOT_YET[descriptor.entity]}
                                </p>
                            ) : null}

                            <div className="grid items-center gap-2 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium">
                                        {`${noun.charAt(0).toUpperCase()}${noun.slice(1)}s you already have`}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {matchNote(descriptor.entity, mapping)}
                                    </p>
                                </div>
                                <Select
                                    value={policy}
                                    disabled={pending}
                                    onValueChange={(v) =>
                                        changePolicy(v as DuplicatePolicy)
                                    }
                                >
                                    <SelectTrigger
                                        className="w-full"
                                        aria-label={`${noun.charAt(0).toUpperCase()}${noun.slice(1)}s you already have`}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="SKIP">
                                            Leave them unchanged
                                        </SelectItem>
                                        <SelectItem value="UPDATE">
                                            Update them from the file
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="wk-surface">
                        <CardContent className="space-y-5 p-6">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 className="font-semibold">
                                    What will happen
                                </h2>
                                {pending ? (
                                    <Badge variant="secondary">Checking…</Badge>
                                ) : null}
                            </div>

                            {recheck ? (
                                <Notice tone="error" align="center">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <p className="min-w-0 flex-[1_1_240px] text-sm">
                                            {recheck.error} Below is the last
                                            check that came back.
                                        </p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={pending}
                                            onClick={() => {
                                                setMapping(recheck.mapping);
                                                setPolicy(recheck.policy);
                                                runPreview(
                                                    csv,
                                                    recheck.mapping,
                                                    recheck.policy,
                                                    preview,
                                                );
                                            }}
                                        >
                                            Try again
                                        </Button>
                                    </div>
                                </Notice>
                            ) : null}

                            <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-10">
                                <div
                                    aria-live="polite"
                                    className="flex flex-wrap content-start gap-x-10 gap-y-4"
                                >
                                    <Count
                                        label="Will be added"
                                        value={plan?.counts.CREATE ?? 0}
                                    />
                                    {policy === "UPDATE" ? (
                                        <Count
                                            label="Will be updated"
                                            value={plan?.counts.UPDATE ?? 0}
                                        />
                                    ) : (plan?.counts.SKIP ?? 0) > 0 ? (
                                        <Count
                                            label="Already there"
                                            value={plan?.counts.SKIP ?? 0}
                                        />
                                    ) : null}
                                    <Count
                                        label="Can’t import"
                                        value={plan?.counts.ERROR ?? 0}
                                    />
                                </div>
                                {firstRows.length > 0 ? (
                                    <div className="min-w-0 space-y-1.5">
                                        <p className="text-sm font-medium">
                                            {firstRows.length < willWrite
                                                ? `The first ${firstRows.length}, as they’ll read`
                                                : "As they’ll read"}
                                        </p>
                                        <ul
                                            className="space-y-1"
                                            aria-label={`The first ${count(firstRows.length, noun)} as they’ll read`}
                                        >
                                            {firstRows.map((r) => (
                                                <li
                                                    key={r.row}
                                                    className="truncate text-sm text-muted-foreground"
                                                >
                                                    {rowLine(
                                                        descriptor.entity,
                                                        r.values,
                                                        descriptor.currency,
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}
                            </div>

                            {statusUnmatched ? (
                                <p className="text-sm text-muted-foreground">
                                    New products start as Draft.
                                </p>
                            ) : null}

                            {plan?.totalRows === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    This file has headings but no rows.
                                </p>
                            ) : null}

                            {groups.length > 0 ? (
                                <div className="space-y-2 border-t pt-5">
                                    <p className="text-sm font-medium">
                                        Rows that can’t be imported
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {problemsLead(willWrite)}
                                    </p>
                                    <IssueGroups groups={groups} />
                                </div>
                            ) : null}

                            {room?.over && meter ? (
                                <Notice tone="info" align="center">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <p className="min-w-0 flex-[1_1_260px] text-pretty text-sm">
                                            {room.words}{" "}
                                            {room.fits > 0
                                                ? `Import the first ${room.fits}, or upgrade for more.`
                                                : "Upgrade to bring them in."}
                                        </p>
                                        <PlanWay className="text-foreground/80">
                                            <Button
                                                asChild
                                                variant="outline"
                                                size="sm"
                                            >
                                                <Link href={meter.href}>
                                                    {planLabel(meter.upgradeTo)}
                                                </Link>
                                            </Button>
                                        </PlanWay>
                                    </div>
                                </Notice>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-3 border-t pt-5">
                                <Button
                                    variant="brand"
                                    onClick={() => onImport(fits ?? undefined)}
                                    disabled={willWrite === 0}
                                    busy={pending}
                                    busyLabel="Importing…"
                                >
                                    {`Import ${count(willWrite, "row")}`}
                                </Button>
                                {willWrite === 0 && !pending ? (
                                    <EmptyState
                                        size="inline"
                                        title="Nothing to import yet"
                                    />
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                </>
            ) : null}
            {guard.dialog}
        </div>
    );
}
