"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { runAction } from "@/lib/api/run-action";
import { useOrgId } from "@/lib/query/org";
import { useActionMutation } from "@/lib/query/use-action-mutation";

import { homeKeys, homeRead, homeSetupRead } from "./queries";

/** Home's aggregate, for the open business (DEC-259). */
export function useHome() {
    return useQuery(homeRead.options(useOrgId(), {}));
}

/** "Finish setup", read only for someone shown it. */
export function useHomeSetup(enabled: boolean) {
    return useQuery({ ...homeSetupRead.options(useOrgId(), {}), enabled });
}

/** Read every part of Home again, settled when they are back. */
export function useReadHomeAgain(): () => Promise<void> {
    const client = useQueryClient();
    const orgId = useOrgId();
    return () => client.refetchQueries({ queryKey: homeKeys(orgId) });
}

/**
 * Try again on a part of Home that couldn't be read: Home's own reads,
 * given by the container. Absent (a component rendered on its own), the
 * part's Try again does what it did before.
 */
export const HomeReadAgain = createContext<(() => Promise<void>) | null>(null);

export function useHomeReadAgain(): (() => Promise<void>) | null {
    return useContext(HomeReadAgain);
}

/** A write from Home, given the open business's id when there is one. */
export type HomeWrite<R> = (...orgId: [] | [string]) => Promise<R>;

export interface HomeSaveOptions {
    /** Read Home again once it worked: what the write changes is on it. */
    reread: boolean;
    /** Don't say "couldn't reach Saroh": the caller says it (a held send). */
    quiet?: boolean;
    /** On from the start until Home has been read again. */
    setBusy?: (busy: boolean) => void;
}

/**
 * How Home's parts save: `runAction`, then (`reread`) Home read again,
 * settled only once it is back, so a spinner lasts until the row changes.
 */
export type HomeSave = <R>(
    write: HomeWrite<R>,
    options: HomeSaveOptions,
) => Promise<R | undefined>;

/** Outside the container (a part rendered on its own): the plain action. */
const plainSave: HomeSave = (write, { quiet, setBusy }) =>
    runAction(() => write(), { quiet, setBusy });

export const HomeSaveContext = createContext<HomeSave>(plainSave);

/** How a part of Home saves. */
export function useHomeSave(): HomeSave {
    return useContext(HomeSaveContext);
}

type Write = (orgId: string) => Promise<unknown>;
const pass = (write: Write, orgId: string) => write(orgId);

/**
 * The container's saves (DEC-259): through `useActionMutation`, so the
 * action gets the tab's business (and refuses a moved tab), and Home's
 * queries are read again when the write changes them.
 */
export function useHomeSaveWithQuery(): HomeSave {
    // Home's aggregate only: a Needs you or Today write doesn't touch
    // "Finish setup", so it isn't read again.
    const home = [homeRead.key(useOrgId(), {})];
    const reread = useActionMutation(pass, { invalidates: home });
    const rereadQuiet = useActionMutation(pass, {
        invalidates: home,
        quiet: true,
    });
    const only = useActionMutation(pass, { invalidates: [] });
    const onlyQuiet = useActionMutation(pass, { invalidates: [], quiet: true });
    return async <R>(write: HomeWrite<R>, options: HomeSaveOptions) => {
        const m = options.reread
            ? options.quiet
                ? rereadQuiet
                : reread
            : options.quiet
              ? onlyQuiet
              : only;
        options.setBusy?.(true);
        try {
            return (await m.mutateAsync(write)) as R | undefined;
        } finally {
            options.setBusy?.(false);
        }
    };
}
