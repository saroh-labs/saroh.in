"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { dataExportsRead } from "./queries";

/** Settings › Your data's downloads (`records` tier). */
export function useDataExports() {
    return useQuery(dataExportsRead.options(useOrgId(), {}));
}
