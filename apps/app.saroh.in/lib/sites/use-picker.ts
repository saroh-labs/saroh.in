"use client";

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientContext, useQuery } from "@tanstack/react-query";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { makeQueryClient, ReadFailed } from "@/lib/query/client";
import { useOrgIdOrNull } from "@/lib/query/org";

import type { PickerKind } from "./queries";
import { pickerRead } from "./queries";

type Pick = { ok: true } | { ok: false; forbidden: boolean };

/** A picker's read that failed, or that the role may not make. */
export interface PickFailed {
    ok: false;
    forbidden: boolean;
}

/**
 * A client for a picker drawn with no React Query above it (a test, a
 * host not on it): its query is off, so it never fetches or holds a row.
 */
let standby: QueryClient | undefined;
const standbyClient = () => (standby ??= makeQueryClient());

/**
 * What one of the editor's pickers reads (U33, DEC-259): one cached entry
 * per kind for the open business, under that kind's own domain, shared by
 * every picker that asks, so a picker opens from the cache and reads again
 * when its tier says it's stale, when a save there invalidates it
 * (`products`), or when `version` is bumped (a price changed in the
 * editor). A refusal is `{ ok: false, forbidden }`, never an empty list.
 *
 * Without a provider (a test), it reads through `legacy`, the Server
 * Action it always used, on mount and on Try again.
 */
export function usePickerRead<T extends Pick>(
    kind: PickerKind,
    legacy: () => Promise<T>,
    version = 0,
): { read: T | "loading"; retry: () => void } {
    const provided = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull();
    const cached = Boolean(provided && orgId);
    const query = useQuery(
        {
            ...pickerRead.options(orgId ?? "standby", { kind }),
            enabled: cached,
        },
        provided ?? standbyClient(),
    );
    const { refetch } = query;

    // A bump reads again, keeping the rows on screen meanwhile.
    const seen = useRef(version);
    useEffect(() => {
        if (!cached || seen.current === version) return;
        seen.current = version;
        void refetch();
    }, [cached, version, refetch]);

    const [own, setOwn] = useState<T | "loading">("loading");
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        if (cached) return;
        let live = true;
        legacy()
            .then((next) => {
                if (live) setOwn(next);
            })
            .catch(() => {
                if (live) setOwn({ ok: false, forbidden: false } as T);
            });
        return () => {
            live = false;
        };
        // `legacy` is a module's action: the same function every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cached, attempt, version]);

    if (!cached) {
        return {
            read: own,
            retry: () => {
                setOwn("loading");
                setAttempt((n) => n + 1);
            },
        };
    }
    const failed: T | null = query.isError
        ? ({
              ok: false,
              forbidden:
                  query.error instanceof ReadFailed &&
                  query.error.status === 403,
          } as T)
        : null;
    return {
        read: (query.data as T | undefined) ?? failed ?? "loading",
        retry: () => void refetch(),
    };
}

/**
 * A picker read asked for at a moment (Add people pressed, an inspector
 * opened): the cached answer while its tier says it's fresh, else read
 * now, through the same entry `usePickerRead` shares. Without a provider
 * (a test), the Server Action it always used.
 */
export function usePickerFetch<T>(
    kind: PickerKind,
    legacy: () => Promise<T>,
): () => Promise<T> {
    const provided = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull();
    return useCallback(
        () =>
            provided && orgId
                ? (provided.fetchQuery(
                      pickerRead.options(orgId, { kind }),
                  ) as Promise<T>)
                : legacy(),
        // `legacy` is a module's action: the same function every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [provided, orgId, kind],
    );
}

/** After a write that changes a picker's answer (who is on Our team): read it again when next asked. */
export function usePickerStale(kind: PickerKind): () => void {
    const provided = useContext(QueryClientContext);
    const orgId = useOrgIdOrNull();
    return useCallback(() => {
        if (!provided || !orgId) return;
        void provided.invalidateQueries({
            queryKey: pickerRead.key(orgId, { kind }),
            refetchType: "none",
        });
    }, [provided, orgId, kind]);
}
