"use client";

import { useRef, useState } from "react";

import type { DetailsOnFile } from "@/components/organizations/business-details-sheet";
import {
    BusinessDetailsSheet,
    readDetailsOnFile,
} from "@/components/organizations/business-details-sheet";
import type { BusinessDetail } from "@/lib/organizations/business-details";
import { missingOnFile } from "@/lib/organizations/business-details";

/** Any action's result: a success, or a failure that may name what's missing. */
interface Outcome {
    ok: boolean;
    missing?: BusinessDetail[];
}

/**
 * Carry an action through the business-details step (DEC-068). `run` calls
 * the action; when the API refuses it for want of the registered address
 * or GSTIN, what is on file is read and the "Add your business details"
 * sheet opens in place ("Add your details" for Just me or A site for my
 * work, DEC-070), and once
 * saved the same action runs again and its result is returned as if
 * nothing had stood in the way. Closed without saving, `run` answers
 * `null`: the merchant chose not to, so there is nothing to report.
 *
 * Given what is on file as the page read it (`onFile`), `ensure` asks
 * before anything is sent: the sheet opens the moment the merchant presses
 * Issue, not after a save, a refusal and a read (#838). The API's refusal
 * still stands behind it, through `run`.
 *
 * Render `step` once, beside whatever opened it.
 */
export function useBusinessDetailsStep({
    then,
    continueLabel,
    onFile: readWithPage = null,
}: {
    /** What happens once saved ("issue it"). */
    then: string;
    /** The sheet's Save ("Save and issue"). */
    continueLabel: string;
    /** What is on file, read with the page; enables `ensure`. */
    onFile?: DetailsOnFile | null;
}) {
    const [asking, setAsking] = useState<{
        missing: BusinessDetail[];
        onFile: DetailsOnFile;
    } | null>(null);
    const answer = useRef<((saved: boolean) => void) | null>(null);
    // Once saved here, the page's read is out of date: only the API asks.
    const known = useRef(readWithPage);

    function ask(
        missing: BusinessDetail[],
        onFile: DetailsOnFile,
    ): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            answer.current = resolve;
            setAsking({ missing, onFile });
        });
    }

    /**
     * Ask now for what the page's read says is missing. True when nothing
     * is, or once saved; false when closed without saving.
     */
    async function ensure(): Promise<boolean> {
        const onFile = known.current;
        const missing = missingOnFile(onFile);
        if (!onFile || missing.length === 0) return true;
        const saved = await ask(missing, onFile);
        if (saved) known.current = null;
        return saved;
    }

    async function run<R extends Outcome>(
        action: () => Promise<R>,
    ): Promise<R | null> {
        const res = await action();
        if (res.ok || !res.missing?.length) return res;
        const missing = res.missing;
        // What is on file first: the sheet opens with it, in the business's
        // own words (DEC-070), while the action still shows busy.
        const onFile = await readDetailsOnFile();
        const saved = await ask(missing, onFile);
        if (!saved) return null;
        known.current = null;
        return run(action);
    }

    const done = (saved: boolean) => {
        setAsking(null);
        answer.current?.(saved);
        answer.current = null;
    };

    const step = (
        <BusinessDetailsSheet
            onFile={asking?.onFile ?? null}
            missing={asking?.missing ?? []}
            then={then}
            continueLabel={continueLabel}
            onDone={done}
        />
    );
    return { run, ensure, step };
}
