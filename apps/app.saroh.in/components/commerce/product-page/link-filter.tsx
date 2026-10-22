"use client";

import type { Option } from "@saroh/ui/option-select";
import { useRouter } from "next/navigation";

import { ListFilter } from "@/components/shared/lists/list-toolbar";

/**
 * A list's dropdown filter whose every choice is an address the server
 * draws: for a server component, which can hand down addresses but not a
 * function. Choosing one goes there, without scrolling.
 */
export function LinkFilter<V extends string>({
    label,
    value,
    options,
}: {
    label: string;
    value: V;
    options: readonly (Option<V> & { href: string })[];
}) {
    const router = useRouter();
    return (
        <ListFilter
            label={label}
            value={value}
            options={options}
            onValueChange={(v) => {
                const to = options.find((o) => o.value === v)?.href;
                if (to) router.push(to, { scroll: false });
            }}
        />
    );
}
