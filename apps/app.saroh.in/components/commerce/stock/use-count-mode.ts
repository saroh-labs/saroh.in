import { dismissToasts, showUndo } from "@saroh/ui/toast";
import { useCallback, useEffect, useRef, useState } from "react";

/** What Cancel says it dropped, beside its Undo. */
export function countCancelled(typed: number): string {
    return typed === 1
        ? "Count cancelled. The number you typed wasn't saved."
        : `Count cancelled. The ${typed} numbers you typed weren't saved.`;
}

/**
 * A stock count in progress (#527): whether the screen is counting, what
 * has been typed into each box, and the "Log says N" each box was shown.
 *
 * Cancel leaves count mode at once and asks nothing. When numbers had been
 * typed it offers Undo, which puts every one back and returns to counting:
 * a count is minutes of walking the shelves, and one stray press must not
 * cost it.
 */
export function useCountMode({
    onBack,
}: {
    /** Counting again, by Start or by Undo: show the levels. */
    onBack: () => void;
}) {
    const [counting, setCounting] = useState(false);
    const [values, setValues] = useState<Record<string, string>>({});
    const [logSays, setLogSays] = useState<Record<string, number>>({});
    const onBackRef = useRef(onBack);
    useEffect(() => {
        onBackRef.current = onBack;
    });

    const typed = Object.values(values).filter((v) => v.trim() !== "").length;

    /** Out of count mode with nothing kept: after a save, or a fresh start. */
    const clear = useCallback(() => {
        setCounting(false);
        setValues({});
        setLogSays({});
    }, []);

    const start = () => {
        // An older Cancel's Undo would put its numbers over this count.
        dismissToasts();
        setValues({});
        setLogSays({});
        setCounting(true);
        onBackRef.current();
    };

    const cancel = () => {
        const dropped = { values, logSays };
        clear();
        if (typed === 0) return;
        dismissToasts();
        showUndo(countCancelled(typed), () => {
            setValues(dropped.values);
            setLogSays(dropped.logSays);
            setCounting(true);
            onBackRef.current();
        });
    };

    const onValue = useCallback((key: string, raw: string, said: number) => {
        setValues((v) => ({ ...v, [key]: raw }));
        setLogSays((l) => (l[key] === said ? l : { ...l, [key]: said }));
    }, []);

    return { counting, values, logSays, typed, start, cancel, clear, onValue };
}
