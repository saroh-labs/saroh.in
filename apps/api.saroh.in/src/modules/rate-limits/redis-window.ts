import type Redis from "ioredis";

import type { LimitDecision } from "./memory-window";
import { gcraShape, gcraStep } from "./memory-window";

/**
 * `gcraStep` as one atomic Lua call, so every replica shares one window per
 * (scope, id). Returns the TAT it read (as text: Lua numbers become integers
 * in a reply) and whether it moved it on; the decision's numbers are then
 * worked out by `gcraStep` itself, so both windows describe a call alike.
 *
 * '%.0f', not '%d' or tostring: whole ms as plain digits on Redis's Lua 5.1
 * and on the test double's 5.3 alike.
 *
 * shortcut: `now` is this replica's clock, so skew between replicas shifts
 * the window by that much; switch to `redis.call('TIME')` if skew is seen.
 */
export const GCRA_LUA = `
local stored = tonumber(redis.call('GET', KEYS[1]))
local now = tonumber(ARGV[1])
local interval = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local tat = stored
if not tat or tat < now then tat = now end
local nextTat = tat + interval
if nextTat - burst > now then
  return {0, stored and string.format('%.0f', stored) or ''}
end
redis.call('SET', KEYS[1], string.format('%.0f', nextTat), 'PX', string.format('%.0f', nextTat - now))
return {1, stored and string.format('%.0f', stored) or ''}
`;

export async function redisTake(
    redis: Pick<Redis, "eval">,
    key: string,
    cap: number,
    now: number = Date.now(),
): Promise<LimitDecision> {
    if (cap <= 0) return gcraStep(null, now, cap);
    const { interval, burst } = gcraShape(cap);
    const reply = (await redis.eval(
        GCRA_LUA,
        1,
        key,
        String(now),
        String(interval),
        String(burst),
    )) as [number, string];
    const stored = reply[1] === "" ? null : Number(reply[1]);
    const step = gcraStep(stored, now, cap);
    // The script is the authority; the step only says how many are left.
    return {
        allowed: reply[0] === 1,
        remaining: reply[0] === 1 ? step.remaining : 0,
        resetAt: step.resetAt,
    };
}
