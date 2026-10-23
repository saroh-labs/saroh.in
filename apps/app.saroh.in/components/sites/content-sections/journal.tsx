"use client";

import { resolveVariant } from "@saroh/block-contract";
import { Field } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";

import type { JournalContent } from "@/lib/sites/service";

import {
    DisplayOptions,
    hiddenFlag,
    unlessDefault,
    wordsOrAbsent,
} from "@/components/sites/section-fields/display-options";
import { OptionSwitch } from "@/components/sites/section-fields/option-switch";
import type { SectionFieldsProps } from "@/components/sites/section-fields/props";
import { Segmented } from "@saroh/ui/segmented";

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
    const look = resolveVariant("journal", c);

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

            {look === "lead" ? (
                <p className="text-sm text-muted-foreground">
                    Opens on your newest post: its title, its first paragraphs
                    and Continue reading. Put another Journal section under it,
                    with “Leave out the newest” on, for the rest.
                </p>
            ) : look === "archive" ? (
                <>
                    <p className="text-sm text-muted-foreground">
                        The archive lists every published post, newest first,
                        each with its date and first lines. Switch the look to
                        Latest posts to show three or six as cards.
                    </p>
                    <Field label="Posts listed">
                        <Segmented
                            label="Posts listed"
                            value={c.archiveLimit ? "latest" : "all"}
                            onValueChange={(v) => {
                                if (v === "all")
                                    patch({ archiveLimit: undefined });
                                if (v === "latest") patch({ archiveLimit: 3 });
                            }}
                            options={[
                                { value: "all", label: "Every post" },
                                {
                                    value: "latest",
                                    label: "Latest 3, and a link to all",
                                },
                            ]}
                        />
                    </Field>
                    <OptionSwitch
                        label="Group by year"
                        checked={c.groupByYear === true}
                        onChange={(on) =>
                            patch({ groupByYear: on ? true : undefined })
                        }
                        note="Each year in a column, its posts beside it."
                    />
                    {c.archiveLimit ? null : (
                        <OptionSwitch
                            label="Say how many in all"
                            checked={c.showTotal === true}
                            onChange={(on) =>
                                patch({ showTotal: on ? true : undefined })
                            }
                            note="“24 pieces in all” beside the title, counted from your published posts."
                        />
                    )}
                    {c.groupByYear ? null : (
                        <OptionSwitch
                            label="Leave the year off this year's dates"
                            checked={c.shortDates === true}
                            onChange={(on) =>
                                patch({ shortDates: on ? true : undefined })
                            }
                            note="“2 Apr” rather than “2 Apr 2026”."
                        />
                    )}
                    <DisplayOptionsExcerpts
                        value={c.showExcerpts !== false}
                        onChange={(on) =>
                            patch({ showExcerpts: hiddenFlag(on) })
                        }
                    />
                </>
            ) : (
                <>
                    <Field label="Posts shown">
                        <Segmented
                            label="Posts shown"
                            value={String(c.count ?? 3)}
                            onValueChange={(v) => {
                                // Three is the default, so it is stored as absent.
                                if (v === "3") patch({ count: undefined });
                                if (v === "6") patch({ count: 6 });
                            }}
                            options={[
                                { value: "3", label: "Latest 3" },
                                { value: "6", label: "Latest 6" },
                            ]}
                        />
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
            {look === "lead" ? null : (
                <OptionSwitch
                    label="Leave out the newest"
                    checked={c.afterLead === true}
                    onChange={(on) =>
                        patch({ afterLead: on ? true : undefined })
                    }
                    note="For a section under one that opens on your newest post, so it is not shown twice."
                />
            )}
        </div>
    );
}

/** The archive's one display option: each post's first lines. */
function DisplayOptionsExcerpts({
    value,
    onChange,
}: {
    value: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <OptionSwitch
            label="First lines"
            checked={value}
            onChange={onChange}
            note="A line from each post under its title."
        />
    );
}
