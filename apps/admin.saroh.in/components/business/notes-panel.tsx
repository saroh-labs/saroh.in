"use client";

import { Button } from "@saroh/ui/button";
import { Label } from "@saroh/ui/label";
import { Textarea } from "@saroh/ui/textarea";
import { useState, useTransition } from "react";

import { addNoteAction } from "@/lib/business-actions";
import { formatDateTime } from "@/lib/format";

/**
 * Operator notes on the business: what the next person to open it should
 * know. Only operators ever see them; the business never does.
 */
export function NotesPanel({
    organizationId,
    notes,
    canWrite,
}: {
    organizationId: string;
    notes: {
        id: string;
        authorUserId: string;
        author: string | null;
        body: string;
        createdAt: string;
    }[];
    canWrite: boolean;
}) {
    const [body, setBody] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    return (
        <div className="grid gap-4">
            {notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
                <ul className="grid gap-3">
                    {notes.map((note) => (
                        <li
                            key={note.id}
                            className="grid gap-1 border-l-2 border-border pl-3"
                        >
                            <p className="whitespace-pre-wrap text-sm">
                                {note.body}
                            </p>
                            <p className="font-mono text-[12px] text-muted-foreground">
                                {formatDateTime(note.createdAt)} ·{" "}
                                {note.author ?? "An operator"}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            {canWrite && (
                <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setError(null);
                        startTransition(async () => {
                            const result = await addNoteAction(
                                organizationId,
                                body.trim(),
                            );
                            if (!result.ok) {
                                setError(result.error);
                                return;
                            }
                            setBody("");
                        });
                    }}
                >
                    <Label htmlFor="note-body">Add a note</Label>
                    <Textarea
                        id="note-body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        disabled={pending}
                    />
                    {error && (
                        <p className="text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                    <div>
                        <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            disabled={pending || body.trim().length < 2}
                        >
                            {pending ? "Saving…" : "Save note"}
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
