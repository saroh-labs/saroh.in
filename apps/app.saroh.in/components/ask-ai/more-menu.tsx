"use client";

import type { AskAiLanguage } from "@saroh/api-contract";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { IconButton } from "@saroh/ui/icon-button";
import { Ellipsis, ExternalLink, Settings } from "lucide-react";
import Link from "next/link";

import { MARKETING_URL } from "@/lib/help/links";

import { HINGLISH } from "./words";

const SETTINGS_HREF = "/settings/developers/ask-ai";
const SETTINGS_LINE = "Owner and Admin: switch, usage, who can use it";
const PRIVACY_HREF = `${MARKETING_URL}/privacy`;

/** Hinglish and Hindi where the edition's captions offer them (India), never on Global. */
export const LANGUAGES: {
    value: AskAiLanguage;
    name: string;
    line?: string;
}[] = HINGLISH
    ? [
          {
              value: "MATCH",
              name: "Match my question",
              line: "The default. English in, English out. Hinglish in, Hinglish out.",
          },
          { value: "ENGLISH", name: "English" },
          {
              value: "HINGLISH",
              name: "Hinglish",
              line: "Hindi in English letters",
          },
          { value: "HINDI", name: "Hindi", line: "हिन्दी में" },
      ]
    : [
          {
              value: "MATCH",
              name: "Match my question",
              line: "The default. Answers in the language you ask in.",
          },
          { value: "ENGLISH", name: "English" },
      ];

export const LANGUAGE_FOOT =
    "Just for you. Answers and the “Reading…” line follow it. Saroh's buttons and screens stay as they are.";

/**
 * ⋯ (board 17), desk and phone: the reply language, how the data is used,
 * and Ask AI settings for Owner and Admin.
 */
export function MoreMenu({
    language,
    onLanguage,
    canSwitch,
    className,
}: {
    language: AskAiLanguage;
    onLanguage: (l: AskAiLanguage) => void;
    canSwitch: boolean;
    className: string;
}) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <IconButton
                    label="More, language and settings"
                    icon={<Ellipsis />}
                    size="md"
                    className={className}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[300px] p-1.5">
                <DropdownMenuLabel className="label px-2.5 pb-1 pt-2">
                    Reply language
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={language}
                    onValueChange={(v) => onLanguage(v as AskAiLanguage)}
                >
                    {LANGUAGES.map((l) => (
                        <DropdownMenuRadioItem
                            data-ph-unmask=""
                            key={l.value}
                            value={l.value}
                            className="items-start py-[9px] text-sm"
                        >
                            <span>
                                {l.name}
                                {l.line ? (
                                    <small className="mt-px block text-xs leading-[1.4] text-muted-foreground">
                                        {l.line}
                                    </small>
                                ) : null}
                            </span>
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
                <p
                    data-ph-unmask=""
                    className="m-0 px-2.5 pb-1.5 pt-1 text-xs leading-[1.45] text-muted-foreground"
                >
                    {LANGUAGE_FOOT}
                </p>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="gap-2.5 py-[9px]">
                    <a href={PRIVACY_HREF} target="_blank" rel="noreferrer">
                        <ExternalLink
                            className="size-[17px] text-muted-foreground"
                            aria-hidden
                        />
                        How your data is used
                    </a>
                </DropdownMenuItem>
                {canSwitch ? (
                    <DropdownMenuItem
                        asChild
                        className="items-start gap-2.5 py-[9px]"
                    >
                        <Link href={SETTINGS_HREF}>
                            <Settings
                                className="mt-px size-[17px] text-muted-foreground"
                                aria-hidden
                            />
                            <span>
                                Ask AI settings
                                <small className="mt-px block text-xs leading-[1.4] text-muted-foreground">
                                    {SETTINGS_LINE}
                                </small>
                            </span>
                        </Link>
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
