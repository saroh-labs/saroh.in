"use client";
import React from "react";
import { IntlProvider } from "use-intl";

import en from "@/lib/language/en.json";

export default function Providers({ children }: { children: React.ReactNode }) {
    // shortcut: English only, until a person can choose (DEC-204). Text moves
    // into en.json as it's touched; a screen's words needn't all move at once.
    return (
        <IntlProvider locale="en" messages={en}>
            {children}
        </IntlProvider>
    );
}
