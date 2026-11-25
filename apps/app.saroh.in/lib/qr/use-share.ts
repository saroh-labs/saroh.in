"use client";

import { useQuery } from "@tanstack/react-query";

import { useOrgId } from "@/lib/query/org";

import { shareRead } from "./queries";

/** Settings › Share's codes and maker (`settings` tier). */
export function useShareScreen() {
    return useQuery(shareRead.options(useOrgId(), {}));
}
