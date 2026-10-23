"use client";

import { useState } from "react";

import { RadioCards } from "@/components/shared/fields/choice-group";
import { FormDialog } from "@/components/shared/forms/form-dialog";
import { count, plural } from "@/lib/format/plural";
import { optionPlural } from "@/lib/products/editor-sections";
import { productSettingsHref } from "@/lib/products/links";
import { TextLink } from "@saroh/ui/text-link";

/**
 * "Customers choose by Shade · Change option…" (products audit, 16 Oct
 * 2026). Once variants are listed under an option only that option is
 * shown: the others' chips looked choosable and then refused.
 */
export function OptionShown({
    name,
    locked,
    onChange,
}: {
    name: string;
    locked: boolean;
    onChange: () => void;
}) {
    return (
        <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-medium">Customers choose by {name}</span>
            {locked ? null : (
                <TextLink onClick={onChange} className="coarse:min-h-11">
                    Change option…
                </TextLink>
            )}
            <TextLink href={productSettingsHref("options")}>
                Manage options
            </TextLink>
        </div>
    );
}

/**
 * Change the option a product's variants are picked from. A variant's
 * value belongs to its option, so the listed ones come off the list and the
 * new option's are added instead. Staged like every change in Variants:
 * nothing changes until it is saved, and Discard brings the list back.
 */
export function ChangeOption({
    open,
    current,
    options,
    listed,
    opt,
    onClose,
    onChoose,
}: {
    open: boolean;
    current: string;
    options: { id: string; name: string }[];
    /** How many variants are listed now. */
    listed: number;
    /** The current option's name, lower case. */
    opt: string;
    onClose: () => void;
    onChoose: (optionId: string) => void;
}) {
    const others = options.filter((o) => o.id !== current);
    const [picked, setPicked] = useState<string | null>(null);
    const [tried, setTried] = useState(false);
    const chosen = others.find((o) => o.id === picked) ?? null;
    const many = optionPlural(opt);
    const listedWords = count(
        listed,
        many === "variants" ? "variant" : opt,
        many,
    );
    return (
        <FormDialog
            open={open}
            size="sm"
            title="Change option"
            description={`Its ${listedWords} ${plural(listed, "comes", "come")} off the list, and you add ${chosen ? optionPlural(chosen.name) : "the new option's values"} instead. Nothing changes until you save Variants.`}
            dirty={picked !== null}
            saveLabel={chosen ? `Choose by ${chosen.name}` : "Change option"}
            footNote={
                tried && !chosen
                    ? "Choose the option to sell it by."
                    : "One promised to open orders can't come off. Saving says which."
            }
            onClose={() => {
                setPicked(null);
                setTried(false);
                onClose();
            }}
            onSubmit={(e) => {
                e.preventDefault();
                if (!chosen) {
                    setTried(true);
                    return;
                }
                setPicked(null);
                setTried(false);
                onChoose(chosen.id);
            }}
        >
            <RadioCards
                label="Customers choose by"
                options={others.map((o) => ({ value: o.id, label: o.name }))}
                value={picked}
                invalid={tried && !chosen}
                onChange={setPicked}
            />
        </FormDialog>
    );
}
