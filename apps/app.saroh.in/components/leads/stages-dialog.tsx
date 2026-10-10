"use client";

import { FormDialog } from "@/components/shared/form-dialog";
import { count, plural } from "@/lib/format/plural";
import { Button } from "@saroh/ui/button";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ArrowDown, ArrowUp, Plus, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { runAction } from "@/lib/api/run-action";
import { saveStages } from "@/lib/pipelines/actions";
import { IconButton } from "@saroh/ui/icon-button";
import { Tip } from "@saroh/ui/tooltip";

interface Row {
    /** Absent for a stage added in this dialog. */
    id?: string;
    key: string;
    name: string;
    was?: { name: string; order: number };
    leads: number;
}

/**
 * The pipeline's stages: rename, reorder, add, remove. Nothing reaches the
 * server until Save.
 *
 * A stage with leads in it cannot be removed. The API refuses (a lead must
 * sit in some stage), so the row says so and how many, instead of offering a
 * button that fails.
 */
export function StagesDialog({
    pipelineId,
    pipelineName,
    stages,
}: {
    pipelineId: string;
    pipelineName: string;
    stages: { id: string; name: string; leads: number }[];
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState<Row[]>([]);
    const [removed, setRemoved] = useState<Row[]>([]);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [tried, setTried] = useState(false);

    function start() {
        setRows(
            stages.map((s, i) => ({
                id: s.id,
                key: s.id,
                name: s.name,
                was: { name: s.name, order: i },
                leads: s.leads,
            })),
        );
        setRemoved([]);
        setDraft("");
        setTried(false);
    }

    const move = (i: number, by: -1 | 1) =>
        setRows((r) => {
            const next = [...r];
            const [row] = next.splice(i, 1);
            next.splice(i + by, 0, row);
            return next;
        });

    function add() {
        const name = draft.trim();
        if (!name) return;
        setRows((r) => [...r, { key: `new-${Date.now()}`, name, leads: 0 }]);
        setDraft("");
    }

    const blank = rows.some((r) => !r.name.trim());
    const dirty =
        removed.length > 0 ||
        rows.some((r, i) => r.was?.name !== r.name || r.was.order !== i);

    async function save() {
        setTried(true);
        if (blank) return;
        const res = await runAction(
            () =>
                saveStages(
                    pipelineId,
                    rows.map((r, i) => ({
                        id: r.id,
                        name: r.name.trim(),
                        order: i,
                        was: r.was,
                    })),
                    removed.flatMap((r) => (r.id ? [r.id] : [])),
                ),
            { setBusy: setSaving },
        );
        if (!res) return;
        if (!res.ok) {
            showError("Some of the stage changes were not saved.", res.error);
            router.refresh();
            return;
        }
        setOpen(false);
        showSuccess("Stages saved.");
        router.refresh();
    }

    return (
        <FormDialog
            open={open}
            size="lg"
            trigger={
                <Button variant="outline">
                    <Settings2 className="mr-1.5 size-4" />
                    Stages
                </Button>
            }
            title={`Stages of ${pipelineName}`}
            description="The columns of the board, left to right. Leads keep their stage when it is renamed or moved."
            pending={saving}
            dirty={dirty || draft.trim() !== ""}
            onOpen={() => {
                start();
                setOpen(true);
            }}
            onClose={() => setOpen(false)}
            onSubmit={save}
        >
            <ol className="overflow-hidden rounded-[11px] border border-border">
                {rows.map((r, i) => (
                    <li
                        key={r.key}
                        className="flex items-center gap-2 border-b border-border px-2.5 py-2 last:border-b-0"
                    >
                        <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted-foreground">
                            {i + 1}
                        </span>
                        <Input
                            dense
                            aria-label={`Stage ${i + 1} name`}
                            aria-invalid={
                                (tried && !r.name.trim()) || undefined
                            }
                            value={r.name}
                            maxLength={60}
                            className="min-w-0 flex-1"
                            onChange={(e) =>
                                setRows((all) =>
                                    all.map((x) =>
                                        x.key === r.key
                                            ? { ...x, name: e.target.value }
                                            : x,
                                    ),
                                )
                            }
                        />
                        <IconButton
                            label={`Move ${r.name || "this stage"} left`}
                            icon={<ArrowUp />}
                            variant="ghost"
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                        />
                        <IconButton
                            label={`Move ${r.name || "this stage"} right`}
                            icon={<ArrowDown />}
                            variant="ghost"
                            disabled={i === rows.length - 1}
                            onClick={() => move(i, 1)}
                        />
                        <Tip
                            label={
                                r.leads > 0
                                    ? `${count(r.leads, "lead")} still here. Move them first.`
                                    : undefined
                            }
                        >
                            <IconButton
                                label={
                                    r.leads > 0
                                        ? `${r.name} has ${count(r.leads, "lead")}; move them before removing it`
                                        : `Remove ${r.name || "this stage"}`
                                }
                                icon={<X className="size-4" />}
                                disabled={r.leads > 0 || rows.length === 1}
                                onClick={() => {
                                    setRows((all) =>
                                        all.filter((x) => x.key !== r.key),
                                    );
                                    if (r.id) setRemoved((x) => [...x, r]);
                                }}
                            />
                        </Tip>
                    </li>
                ))}
            </ol>

            {/* Not a form of its own: Enter in the box adds the stage,
                    and the dialog's Save stays the one submit. */}
            <div className="flex gap-2">
                <Input
                    aria-label="New stage name"
                    placeholder="New stage, e.g. Site visit"
                    value={draft}
                    maxLength={60}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        add();
                    }}
                />
                <Button
                    type="button"
                    variant="outline"
                    disabled={!draft.trim()}
                    onClick={add}
                >
                    <Plus className="mr-1.5 size-4" />
                    Add stage
                </Button>
            </div>
            {tried && blank ? (
                <p
                    role="alert"
                    className="text-[12.5px] font-medium text-destructive-subtle-foreground"
                >
                    Every stage needs a name.
                </p>
            ) : null}

            {removed.length > 0 ? (
                <p className="text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                    Removing {removed.map((r) => r.name).join(", ")} when you
                    save.{" "}
                    <Button
                        variant="link"
                        size="inline"
                        type="button"
                        onClick={() => {
                            setRows((all) =>
                                [...all, ...removed].sort(
                                    (a, b) =>
                                        (a.was?.order ?? 99) -
                                        (b.was?.order ?? 99),
                                ),
                            );
                            setRemoved([]);
                        }}
                    >
                        {plural(removed.length, "Put it back", "Put them back")}
                    </Button>
                </p>
            ) : null}
        </FormDialog>
    );
}
