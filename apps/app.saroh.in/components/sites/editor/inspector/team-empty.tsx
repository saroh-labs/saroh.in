"use client";

import { Button } from "@saroh/ui/button";
import { Plus } from "lucide-react";

import { useEditorReadOnly } from "@/components/sites/editor/read-only";

/*
 * "Add people" pressed on the canvas's empty Our team: the section is
 * selected, and its People list opens the picker, at once when it is
 * already open (`open`), else as it mounts (`asked`).
 */
export const addPeople: { asked: boolean; open: (() => void) | null } = {
    asked: false,
    open: null,
};

/**
 * The canvas's empty Our team (EBTeamPicker, ER3 re-check): the editor
 * draws a placeholder with Add people; the live site draws nothing.
 */
export function TeamEmptyOnCanvas({ onAdd }: { onAdd: () => void }) {
    const readOnly = useEditorReadOnly();
    return (
        <div
            data-team-empty=""
            className="mx-auto grid max-w-screen-xl justify-items-center gap-3 px-5 py-10 font-sans"
        >
            <div className="grid w-full justify-items-center gap-3 rounded-[10px] border border-dashed border-border-strong bg-muted/40 p-8 text-center">
                <p className="text-sm font-semibold text-foreground">
                    Nobody is on Our team yet
                </p>
                <p className="text-xs text-muted-foreground">
                    Visitors see nothing here until you add people.
                </p>
                {readOnly ? null : (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (addPeople.open) addPeople.open();
                            else addPeople.asked = true;
                            onAdd();
                        }}
                    >
                        <Plus aria-hidden className="size-4" />
                        Add people
                    </Button>
                )}
            </div>
        </div>
    );
}
