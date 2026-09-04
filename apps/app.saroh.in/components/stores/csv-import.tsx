"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { Card, CardContent } from "@saroh/ui/card";
import { Label } from "@saroh/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { applyImport, previewImport } from "@/lib/imports/actions";
import type {
    ApplyResult,
    DuplicatePolicy,
    ImportEntity,
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
 */

/** Matches the api's own cap; refused here too so the file is never uploaded. */
const MAX_BYTES = 5 * 1024 * 1024;
const IGNORE = "__ignore__";
/** Errors are listed up to this many; the rest are counted, never hidden silently. */
const MAX_LISTED_ISSUES = 50;

type Phase = "choose" | "review" | "done";

export interface Descriptor {
    entity: ImportEntity;
    requiredFields: string[];
    mappableFields: string[];
    keyLabel: string;
}

function IssueList({ issues, total }: { issues: RowIssue[]; total: number }) {
    return (
        <div className="space-y-2">
            <ul className="space-y-1.5">
                {issues.map((issue, i) => (
                    <li
                        key={`${issue.row}-${issue.field ?? ""}-${i}`}
                        className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                    >
                        <span className="tabular-nums text-muted-foreground">
                            Row {issue.row}
                        </span>
                        {issue.field ? (
                            <code className="rounded bg-muted px-1 py-0.5 text-xs">
                                {issue.field}
                            </code>
                        ) : null}
                        <span>{issue.message}</span>
                    </li>
                ))}
            </ul>
            {total > issues.length ? (
                <p className="text-sm text-muted-foreground">
                    …and {total - issues.length} more.
                </p>
            ) : null}
        </div>
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

export function CsvImport({
    storeId,
    descriptor,
    backHref,
}: {
    storeId: string;
    descriptor: Descriptor;
    backHref: string;
}) {
    const router = useRouter();
    const fileInput = useRef<HTMLInputElement>(null);

    const [phase, setPhase] = useState<Phase>("choose");
    const [fileName, setFileName] = useState("");
    const [csv, setCsv] = useState("");
    const [policy, setPolicy] = useState<DuplicatePolicy>("SKIP");
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [preview, setPreview] = useState<PreviewResult | null>(null);
    const [result, setResult] = useState<ApplyResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [fileIssues, setFileIssues] = useState<RowIssue[]>([]);
    const [pending, startTransition] = useTransition();

    const runPreview = useCallback(
        (
            text: string,
            nextMapping: Record<string, string>,
            next: DuplicatePolicy,
        ) => {
            startTransition(async () => {
                const res = await previewImport(storeId, descriptor.entity, {
                    csv: text,
                    mapping: nextMapping,
                    policy: next,
                });
                if (!res.ok) {
                    setError(res.error);
                    setPreview(null);
                    return;
                }
                setError(null);
                setPreview(res.data);
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
        if (file.size > MAX_BYTES) {
            setError(
                "This file is larger than 5 MB. Split it and import in parts.",
            );
            setPreview(null);
            return;
        }
        const text = await file.text();
        setFileName(file.name);
        setCsv(text);
        setMapping({});
        runPreview(text, {}, policy);
    }

    function changeMapping(header: string, field: string) {
        const next = { ...mapping };
        if (field === IGNORE) delete next[header];
        else next[header] = field;
        setMapping(next);
        runPreview(csv, next, policy);
    }

    function changePolicy(next: DuplicatePolicy) {
        setPolicy(next);
        runPreview(csv, mapping, next);
    }

    function onImport() {
        startTransition(async () => {
            const res = await applyImport(storeId, descriptor.entity, {
                csv,
                mapping,
                policy,
            });
            if (!res.ok) {
                setError(res.error);
                if (res.fileIssues) setFileIssues(res.fileIssues);
                return;
            }
            setError(null);
            setResult(res.data);
            setPhase("done");
            toast.success(
                `Imported ${res.data.created + res.data.updated} ${descriptor.entity}`,
            );
            router.refresh();
        });
    }

    function reset() {
        setPhase("choose");
        setPreview(null);
        setResult(null);
        setError(null);
        setFileIssues([]);
        setCsv("");
        setFileName("");
        setMapping({});
        if (fileInput.current) fileInput.current.value = "";
    }

    // A field already fed by another column cannot be chosen twice.
    const claimed = new Set(Object.values(mapping));
    const plan = preview?.plan;
    const willWrite = plan ? plan.counts.CREATE + plan.counts.UPDATE : 0;
    const rowIssues = plan
        ? plan.rows.flatMap((r) => r.issues).slice(0, MAX_LISTED_ISSUES)
        : [];
    const totalRowIssues = plan
        ? plan.rows.reduce((n, r) => n + r.issues.length, 0)
        : 0;

    if (phase === "done" && result) {
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
                    <div className="flex flex-wrap gap-x-10 gap-y-4">
                        <Count label="Created" value={result.created} />
                        <Count label="Updated" value={result.updated} />
                        <Count label="Skipped" value={result.skipped} />
                        <Count label="Not imported" value={result.failed} />
                    </div>
                    {result.failed > 0 ? (
                        <div className="space-y-2">
                            <p className="text-sm font-medium">
                                {result.failed} row
                                {result.failed === 1 ? "" : "s"} could not be
                                imported. Fix these in your file and import it
                                again — rows that already succeeded will be
                                skipped or updated, not duplicated.
                            </p>
                            <IssueList
                                issues={rowIssues}
                                total={totalRowIssues}
                            />
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
            <Card className="wk-surface">
                <CardContent className="space-y-4 p-6">
                    <div className="space-y-1">
                        <Label htmlFor="csv-file">CSV file</Label>
                        <p className="text-sm text-muted-foreground">
                            The first row must be column headings. Required:{" "}
                            {descriptor.requiredFields.join(", ")}.
                        </p>
                    </div>
                    <input
                        ref={fileInput}
                        id="csv-file"
                        type="file"
                        accept=".csv,text/csv"
                        disabled={pending}
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void onFile(file);
                        }}
                        className="block w-full cursor-pointer text-sm file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-muted file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/80"
                    />
                    {fileName ? (
                        <p className="text-sm text-muted-foreground">
                            {fileName}
                            {plan ? ` — ${plan.totalRows} rows` : ""}
                        </p>
                    ) : null}
                </CardContent>
            </Card>

            {error ? (
                <Card className="border-destructive/40">
                    <CardContent className="space-y-2 p-6">
                        <p className="text-sm font-medium text-destructive">
                            {error}
                        </p>
                        {fileIssues.length > 0 ? (
                            <IssueList
                                issues={fileIssues}
                                total={fileIssues.length}
                            />
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
                                    We matched what we recognised. Anything set
                                    to “Don’t import” is ignored.
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
                                                <SelectTrigger className="w-full">
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
                                                                {field}
                                                                {descriptor.requiredFields.includes(
                                                                    field,
                                                                )
                                                                    ? " (required)"
                                                                    : ""}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="grid items-center gap-2 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium">
                                        Rows that already exist
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Matched on {descriptor.keyLabel}.
                                    </p>
                                </div>
                                <Select
                                    value={policy}
                                    disabled={pending}
                                    onValueChange={(v) =>
                                        changePolicy(v as DuplicatePolicy)
                                    }
                                >
                                    <SelectTrigger className="w-full">
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

                            <div
                                aria-live="polite"
                                className="flex flex-wrap gap-x-10 gap-y-4"
                            >
                                <Count
                                    label="Will be created"
                                    value={plan?.counts.CREATE ?? 0}
                                />
                                <Count
                                    label={
                                        policy === "UPDATE"
                                            ? "Will be updated"
                                            : "Already exist"
                                    }
                                    value={
                                        policy === "UPDATE"
                                            ? (plan?.counts.UPDATE ?? 0)
                                            : (plan?.counts.SKIP ?? 0)
                                    }
                                />
                                <Count
                                    label="Have errors"
                                    value={plan?.counts.ERROR ?? 0}
                                />
                            </div>

                            {plan?.totalRows === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    This file has headings but no rows.
                                </p>
                            ) : null}

                            {totalRowIssues > 0 ? (
                                <div className="space-y-2 border-t pt-5">
                                    <p className="text-sm font-medium">
                                        Rows that will not be imported
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        The rest can still be imported — fix
                                        these and run the file again.
                                    </p>
                                    <IssueList
                                        issues={rowIssues}
                                        total={totalRowIssues}
                                    />
                                </div>
                            ) : null}

                            <div className="flex flex-wrap items-center gap-3 border-t pt-5">
                                <Button
                                    variant="brand"
                                    onClick={onImport}
                                    disabled={pending || willWrite === 0}
                                >
                                    {pending
                                        ? "Working…"
                                        : `Import ${willWrite} row${willWrite === 1 ? "" : "s"}`}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={reset}
                                    disabled={pending}
                                >
                                    Choose a different file
                                </Button>
                                {willWrite === 0 && !pending ? (
                                    <p className="text-sm text-muted-foreground">
                                        Nothing to import yet.
                                    </p>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                </>
            ) : null}
        </div>
    );
}
