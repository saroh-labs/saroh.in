"use client";

import { ListFilter } from "@/components/shared/lists/list-toolbar";
import { useScreenGo } from "@/components/shared/page/screen-pending";
import type { Option } from "@saroh/ui/option-select";

/**
 * A list's dropdown filter whose every choice is an address the server
 * draws: for a server component, which can hand down addresses but not a
 * function. Choosing one goes there, without scrolling, in the screen's
 * transition when it has one (`ScreenPending`), so its rows grey meanwhile.
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
    const go = useScreenGo();
    return (
        <ListFilter
            label={label}
            value={value}
            options={options}
            onValueChange={(v) => {
                const to = options.find((o) => o.value === v)?.href;
                if (to) go(to);
            }}
        />
    );
}
