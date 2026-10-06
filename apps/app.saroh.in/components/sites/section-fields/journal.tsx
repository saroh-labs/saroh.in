"use client";

import { resolveVariant } from "@saroh/block-contract";
import { Input } from "@saroh/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@saroh/ui/toggle-group";

import { SEGMENT, SEGMENTED } from "@/components/shared/segmented";
import type { JournalContent } from "@/lib/sites/service";

import {
    DisplayOptions,
    hiddenFlag,
    unlessDefault,
    wordsOrAbsent,
} from "./display-options";
import { Field } from "./field";
import type { SectionFieldsProps } from "./props";

/**
 * The `journal` section's editor fields (G10; display options G16).
 *
 * Only how the posts show is chosen here: the title, three or six, then Show
 * as, whether photos and excerpts show and the words at the foot of each
 * post. Which posts is not a choice — the newest the site has published,
 * read live — and the inspector's note above says where they are written
 * (Website › Posts). With none yet, the canvas says so.
 */
export function JournalFields({
    section,
    onChange,
}: SectionFieldsProps<"journal">) {
    const c = section.content;
    const patch = (next: Partial<JournalContent>) =>
        onChange({ ...section, content: { ...c, ...next } });

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

            {resolveVariant("journal", c) === "archive" ? (
                <p className="text-sm text-muted-foreground">
                    The archive lists every published post, newest first, each
                    with its date and first lines. Switch the look to Latest
                    posts to show three or six as cards.
                </p>
            ) : (
                <>
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

                    <DisplayOptions
                        layout={c.layout ?? "cards"}
                        onLayout={(v) =>
                            patch({ layout: unlessDefault(v, "cards") })
                        }
                        photos={{
                            value: c.showImages !== false,
                            onChange: (on) =>
                                patch({ showImages: hiddenFlag(on) }),
                        }}
                        descriptions={{
                            value: c.showExcerpts !== false,
                            onChange: (on) =>
                                patch({ showExcerpts: hiddenFlag(on) }),
                            note: "The first lines of each post.",
                        }}
                        button={{
                            value: c.buttonLabel ?? "",
                            onChange: (v) =>
                                patch({ buttonLabel: wordsOrAbsent(v) }),
                            placeholder: "Read",
                            note: "Words at the foot of each post, like “Read”. Leave empty for none: the whole post card opens it.",
                        }}
                    />
                </>
            )}
        </div>
    );
}
