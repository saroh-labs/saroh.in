import type { QueryClient } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { failed, runAction } from "@/lib/api/run-action";
import type { DomainKey } from "@/lib/query/keys";
import { useOrgId } from "@/lib/query/org";

/**
 * A Server Action from a migrated screen (DEC-259): `runAction` as before
 * (busy cleared, one sentence when it never got there, Next's interrupts
 * passed on, `{ ok: false }` handed back untouched), then the reads it
 * changed, named in `invalidates`, read again. The promise resolves once
 * they are back, so a spinner lasts until the row changes, as today.
 *
 * The action gets the open business's id as its last argument and checks
 * it first (`assertActiveOrg`): a tab left on business A can't write into
 * B after another tab switched.
 *
 * `optimistic` only where DEC-259 names it: patch the cache, return the
 * undo, which runs when the save fails.
 */
export function useActionMutation<V, R>(
    action: (variables: V, orgId: string) => Promise<R>,
    {
        invalidates,
        optimistic,
        ...run
    }: {
        invalidates: readonly DomainKey[];
        optimistic?: (client: QueryClient, variables: V) => () => void;
    } & NonNullable<Parameters<typeof runAction>[1]>,
) {
    const client = useQueryClient();
    const orgId = useOrgId();
    return useMutation({
        mutationFn: async (variables: V) => {
            let undo: (() => void) | undefined;
            if (optimistic) {
                await Promise.all(
                    invalidates.map((queryKey) =>
                        client.cancelQueries({ queryKey }),
                    ),
                );
                undo = optimistic(client, variables);
            }
            const result = await runAction(() => action(variables, orgId), run);
            if (result === undefined || failed(result)) {
                undo?.();
                return result;
            }
            await Promise.all(
                invalidates.map((queryKey) =>
                    client.invalidateQueries({ queryKey }),
                ),
            );
            return result;
        },
    });
}
