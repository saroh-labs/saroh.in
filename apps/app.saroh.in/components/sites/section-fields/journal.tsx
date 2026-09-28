"use client";

import { Input } from "@saroh/ui/input";
import { Label } from "@saroh/ui/label";
import { Switch } from "@saroh/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import type { JournalContent } from "@/lib/sites/service";

import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `journal` section's editor fields (G10).
 *
 * Only how the posts show is chosen here: the title, three or six, and
 * whether photos and excerpts show. Which posts is not a choice — the newest
 * the site has published, read live — and the inspector's note above says
 * where they are written (Website › Posts). With none yet, the canvas says so.
 */
export function JournalFields({
    section,
    onChange,
}: SectionFieldsProps<"journal">) {
    const c = section.content;
    const patch = (next: Partial<JournalContent>) =>
        onChange({ ...section, content: { ...c, ...next } });
    const id = section.key ?? "journal";

    return (
        <div className="grid gap-3">
            <Field label="Title">
                <Input
                    value={c.title ?? ""}
                    onChange={(e) =>
                        patch({ title: e.target.value || undefined })
                    }
                    placeholder="Journal"
                />
            </Field>

            <Field label="Posts shown">
                <ToggleGroup
                    type="single"
                    value={String(c.count ?? 3)}
                    onValueChange={(v) => {
                        // Three is the default, so it is stored as absent.
                        if (v === "3") patch({ count: undefined });
                        if (v === "6") patch({ count: 6 });
                    }}
                    aria-label="Posts shown"
                    className={SEGMENTED}
                >
                    <ToggleGroupItem value="3" className={SEGMENT}>
                        Latest 3
                    </ToggleGroupItem>
                    <ToggleGroupItem value="6" className={SEGMENT}>
                        Latest 6
                    </ToggleGroupItem>
                </ToggleGroup>
            </Field>

            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-images`}>Photos</Label>
                <Switch
                    id={`${id}-images`}
                    checked={c.showImages !== false}
                    onCheckedChange={(on) =>
                        patch({ showImages: on ? undefined : false })
                    }
                />
            </div>
            <div className="flex items-center justify-between gap-3">
                <Label htmlFor={`${id}-excerpts`}>Excerpts</Label>
                <Switch
                    id={`${id}-excerpts`}
                    checked={c.showExcerpts !== false}
                    onCheckedChange={(on) =>
                        patch({ showExcerpts: on ? undefined : false })
                    }
                />
            </div>
        </div>
    );
}
