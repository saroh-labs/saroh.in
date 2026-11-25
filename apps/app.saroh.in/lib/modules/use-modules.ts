"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { modulesRead } from "./queries";

/** Settings › Modules, held for the visit (`settings` tier). */
export function useModulesScreen() {
    return useQuery(modulesRead.options(useOrgId(), {}));
}
