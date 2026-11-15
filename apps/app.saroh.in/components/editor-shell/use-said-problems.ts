import { useCallback, useState } from "react";

import { fieldErrors, sayProblems } from "@/lib/editor-shell/state";
import type { EditorProblem } from "@/lib/editor-shell/types";

type ErrorInput = Parameters<typeof fieldErrors>[0];

function addAll(fields: readonly string[]) {
    return (was: ReadonlySet<string>): ReadonlySet<string> => {
        if (fields.every((f) => was.has(f))) return was;
        const next = new Set(was);
        for (const f of fields) next.add(f);
        return next;
    };
}

/**
 * Which of an editor's problems are said, and how (the rules are pure, in
 * `lib/editor-shell/state.ts`).
 *
 * - What a published record was opened with (`held`) is a note beside its
 *   field until that field is left or Publish is pressed: the page never
 *   opens in an error state over a rule newer than the record.
 * - A field's error shows once that field is changed or left, or once
 *   Publish is pressed: typing a name never turns the untouched price red.
 * - A draft opened again was never published: its problems are its to-do
 *   list, said at once.
 */
export function useSaidProblems(input: {
    problems: EditorProblem[];
    /** `heldAtOpen`, worked out once as the page opens. */
    held: () => string[];
    draftReopened: boolean;
    save: ErrorInput["save"];
    refused: ErrorInput["refused"];
}) {
    const [held] = useState(input.held);
    const [left, setLeft] = useState<ReadonlySet<string>>(() => new Set());
    const [touched, setTouched] = useState<ReadonlySet<string>>(
        () => new Set(),
    );
    const [tried, setTried] = useState(false);
    const { shown: problems, notes } = sayProblems({
        problems: input.problems,
        held,
        left,
        tried,
    });
    const errors = fieldErrors({
        problems,
        touched,
        tried: tried || input.draftReopened,
        save: input.save,
        refused: input.refused,
    });
    const touch = useCallback(
        (fields: readonly string[]) => setTouched(addAll(fields)),
        [],
    );
    const leave = (field: string) => {
        touch([field]);
        if (held.includes(field)) setLeft(addAll([field]));
    };
    return {
        problems,
        notes,
        errors,
        /** The fields drawn with their error, for the line beside Publish. */
        marked: new Set(Object.keys(errors)),
        /** Some problem is held back as a note, so Publish says them first. */
        holding: problems.length < input.problems.length,
        touch,
        leave,
        /** Publish was pressed: every problem is said now. */
        sayAll: () => setTried(true),
    };
}
