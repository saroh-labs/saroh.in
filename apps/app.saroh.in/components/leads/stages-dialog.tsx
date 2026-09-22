"use client";

import { Button } from "@saroh/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@saroh/ui/dialog";
import { Input } from "@saroh/ui/input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { ArrowDown, ArrowUp, Plus, Settings2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveStages } from "@/lib/pipelines/actions";

interface Row {
    /** Absent for a stage added in this dialog. */
    id?: string;
    key: string;
    name: string;
    was?: { name: string; order: number };
    leads: number;
}

/**
 * The pipeline's stages: rename, reorder, add, remove — after the CRUD Flows
 * rule for dialogs, nothing reaches the server until Save.
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
        setSaving(true);
        const res = await saveStages(
            pipelineId,
            rows.map((r, i) => ({
                id: r.id,
                name: r.name.trim(),
                order: i,
                was: r.was,
            })),
            removed.flatMap((r) => (r.id ? [r.id] : [])),
        );
        setSaving(false);
        if (!res.ok) {
            showError("Some of the stage changes were not saved.", res.error);
            router.refresh();
            return;
        }
        setOpen(false);
        showSuccess("Stages saved");
        router.refresh();
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (o) start();
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline">
                    <Settings2 className="mr-1.5 size-4" />
                    Stages
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="font-display text-[19px] tracking-[-0.025em]">
                        Stages of {pipelineName}
                    </DialogTitle>
                    <DialogDescription>
                        The columns of the board, left to right. Leads keep
                        their stage when it is renamed or moved.
                    </DialogDescription>
                </DialogHeader>

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
                                aria-label={`Stage ${i + 1} name`}
                                value={r.name}
                                maxLength={60}
                                className="h-8 min-w-0 flex-1"
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
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Move ${r.name || "this stage"} left`}
                                disabled={i === 0}
                                onClick={() => move(i, -1)}
                            >
                                <ArrowUp className="size-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={`Move ${r.name || "this stage"} right`}
                                disabled={i === rows.length - 1}
                                onClick={() => move(i, 1)}
                            >
                                <ArrowDown className="size-4" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                aria-label={
                                    r.leads > 0
                                        ? `${r.name} has ${r.leads} lead${r.leads === 1 ? "" : "s"}; move them before removing it`
                                        : `Remove ${r.name || "this stage"}`
                                }
                                title={
                                    r.leads > 0
                                        ? `${r.leads} lead${r.leads === 1 ? "" : "s"} still here — move them first`
                                        : undefined
                                }
                                disabled={r.leads > 0 || rows.length === 1}
                                onClick={() => {
                                    setRows((all) =>
                                        all.filter((x) => x.key !== r.key),
                                    );
                                    if (r.id) setRemoved((x) => [...x, r]);
                                }}
                            >
                                <X className="size-4" />
                            </Button>
                        </li>
                    ))}
                </ol>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        add();
                    }}
                    className="flex gap-2"
                >
                    <Input
                        aria-label="New stage name"
                        placeholder="New stage, e.g. Site visit"
                        value={draft}
                        maxLength={60}
                        onChange={(e) => setDraft(e.target.value)}
                    />
                    <Button
                        type="submit"
                        variant="outline"
                        disabled={!draft.trim()}
                    >
                        <Plus className="mr-1.5 size-4" />
                        Add
                    </Button>
                </form>

                {removed.length > 0 ? (
                    <p className="text-pretty text-[11.5px] leading-[1.5] text-muted-foreground">
                        Removing {removed.map((r) => r.name).join(", ")} when
                        you save.{" "}
                        <button
                            type="button"
                            className="font-medium text-foreground underline-offset-4 hover:underline"
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
                            {removed.length === 1
                                ? "Put it back"
                                : "Put them back"}
                        </button>
                    </p>
                ) : null}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setOpen(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        disabled={saving || !dirty || blank}
                        onClick={() => void save()}
                    >
                        {saving ? "Saving…" : "Save stages"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
