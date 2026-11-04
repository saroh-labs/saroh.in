import type { ReactNode, Ref } from "react";
import { useEffect, useRef } from "react";

import { cn } from "../../lib/utils";
import { textAction } from "../styles";

/**
 * A choice already made on Classic's booking page, folded to one row with
 * its Edit: the steps ahead get the room, and any answer can be reopened.
 */
export function ChosenRow({
    what,
    value,
    sub,
    end,
    onEdit,
    rowRef,
    className,
}: {
    /** For a screen reader: "Edit {what}, {value}". */
    what: string;
    value: string;
    sub?: ReactNode;
    end?: ReactNode;
    /** Left out when there is nothing else to choose. */
    onEdit?: () => void;
    rowRef?: Ref<HTMLDivElement>;
    className?: string;
}) {
    return (
        <div
            ref={rowRef}
            tabIndex={-1}
            data-chosen-row={what}
            className={cn("flex items-center gap-3 outline-none", className)}
        >
            <div className="min-w-0 flex-1">
                <p className="text-site-fg text-[15px] font-semibold [overflow-wrap:anywhere]">
                    {value}
                </p>
                {sub ? (
                    <div className="text-site-body mt-0.5 text-[13px]">
                        {sub}
                    </div>
                ) : null}
            </div>
            {end ? (
                <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">
                    {end}
                </span>
            ) : null}
            {onEdit ? (
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label={`Edit ${what}, ${value}`}
                    className={cn(textAction, "coarse:min-h-11 flex-none")}
                >
                    Edit
                </button>
            ) : null}
        </div>
    );
}

/**
 * Where focus goes when a step folds or opens. The button pressed has just
 * gone, and focus would fall to the top of the page. Its element holds
 * `tabIndex={-1}`; focusing it also brings it into view on a phone.
 */
export function useFocusOnChange<T>(stage: T) {
    const ref = useRef<HTMLDivElement>(null);
    const seen = useRef(stage);
    useEffect(() => {
        if (seen.current === stage) return;
        seen.current = stage;
        ref.current?.focus();
    }, [stage]);
    return ref;
}
