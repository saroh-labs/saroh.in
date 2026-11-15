"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { TradeSwitcher } from "@saroh/marketing/kit/trade-switcher";
import { TextLink } from "@saroh/marketing/text-link";

export interface DoorOption {
    id: string;
    label: string;
    /** "Spend a day at Rye & Co.", or the trade's page where no day is written. */
    link: string;
    href: string;
}

/**
 * The door to Solutions (`#day`): one line, a trade picker and one link,
 * which follows the picker ("Spend a day at Rye & Co. →"). The day itself
 * lives on the trade pages. `children` sits under it: the trades it works
 * for.
 */
export function DayDoor({
    title,
    line,
    legend,
    options,
    children,
}: {
    title: string;
    line: string;
    legend: string;
    options: readonly DoorOption[];
    children?: ReactNode;
}) {
    const [id, setId] = useState(options[0].id);
    const on = options.find((o) => o.id === id) ?? options[0];
    return (
        <div className="rounded-mk-card bg-card p-5 shadow-[0_1px_2px_rgba(40,30,15,0.06),0_12px_32px_-14px_rgba(40,30,15,0.18)] min-[760px]:px-8 min-[760px]:py-[26px]">
            <div className="grid gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[1100px]:items-center min-[1100px]:gap-8">
                <div>
                    <h3 className="m-0 font-display text-mk-kit-h3 font-bold">
                        {title}
                    </h3>
                    <p className="m-0 mt-1.5 text-[16px] leading-normal text-mk-copy">
                        {line}
                    </p>
                </div>
                <TradeSwitcher
                    legend={legend}
                    value={on.id}
                    onSelect={setId}
                    options={options.map((o) => ({ id: o.id, label: o.label }))}
                />
                <TextLink href={on.href} tone="ink" arrow>
                    {on.link}
                </TextLink>
            </div>
            {children}
        </div>
    );
}
