"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { TradeSwitcher } from "../kit/trade-switcher";

/**
 * "Examples from a · Bakery · Salon · Gym · Florist" over the hero's
 * drawing: each trade's drawing is already in the HTML (the server draws
 * them all), and the switch only shows the one picked. No reload, so the
 * page stays static.
 */
export function ExampleSwitch({
    legend,
    options,
    children,
}: {
    legend: string;
    options: readonly { id: string; label: string; drawing: ReactNode }[];
    children?: ReactNode;
}) {
    const [value, setValue] = useState(options[0]?.id ?? "");
    return (
        <div className="grid gap-6">
            <TradeSwitcher
                legend={legend}
                options={options.map(({ id, label }) => ({ id, label }))}
                value={value}
                onSelect={setValue}
            />
            {children}
            {options.map((o) => (
                <div key={o.id} hidden={o.id !== value}>
                    {o.drawing}
                </div>
            ))}
        </div>
    );
}
