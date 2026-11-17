"use client";

import type { AskAiLanguage } from "@saroh/api-contract";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@saroh/ui/select";
import { useId } from "react";

/**
 * Reply language (board 17): one select, desk and phone alike, in the
 * panel's foot. Just for the person asking.
 */

export const LANGUAGES: {
    value: AskAiLanguage;
    name: string;
    line?: string;
}[] = [
    {
        value: "MATCH",
        name: "Match my question",
        line: "The default. English in, English out. Hinglish in, Hinglish out.",
    },
    { value: "ENGLISH", name: "English" },
    { value: "HINGLISH", name: "Hinglish", line: "Hindi in English letters" },
    { value: "HINDI", name: "Hindi", line: "हिन्दी में" },
];

export const LANGUAGE_FOOT =
    "Just for you. Answers and the “Reading…” line follow it. Saroh's buttons and screens stay as they are.";

export function LanguageSelect({
    language,
    onLanguage,
}: {
    language: AskAiLanguage;
    onLanguage: (l: AskAiLanguage) => void;
}) {
    const id = useId();
    return (
        <div className="flex items-center gap-2 text-[12.5px] text-neutral-700 dark:text-foreground">
            <span data-ph-unmask="" id={`${id}-label`}>
                Reply language
            </span>
            <Select
                value={language}
                onValueChange={(v) => onLanguage(v as AskAiLanguage)}
            >
                <SelectTrigger
                    aria-labelledby={`${id}-label`}
                    aria-describedby={`${id}-foot`}
                    className="h-8 w-auto gap-1.5 text-[12.5px]"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" className="max-w-[300px]">
                    {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value} hint={l.line}>
                            {l.name}
                        </SelectItem>
                    ))}
                    <p
                        data-ph-unmask=""
                        className="m-0 px-2 pb-1.5 pt-1 text-xs leading-[1.45] text-muted-foreground"
                    >
                        {LANGUAGE_FOOT}
                    </p>
                </SelectContent>
            </Select>
            <span id={`${id}-foot`} className="sr-only">
                {LANGUAGE_FOOT}
            </span>
        </div>
    );
}
