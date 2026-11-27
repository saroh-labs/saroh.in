import "server-only";

import { listProducts } from "@/lib/products/service";
import type { ServerRead } from "@/lib/query/route";
import { dateRangeAsk, readDateRange } from "@/lib/views/date-range";

import { logKindId, logKinds } from "./log";
import type {
    StockChecksAsk,
    StockLevelsAsk,
    StockLogAsk,
    StockLogView,
} from "./queries";
import { stockChecksRead, stockLevelsRead, stockLogRead } from "./queries";
import type { StockChecks, StockLevels } from "./service";
import { getStockChecks, getStockLevels, getStockLog } from "./service";

/**
 * Stock's reads on the server (DEC-259): the services `/api/stock/*` and
 * the pages' prefetches answer with. Who may read them is Products' gate
 * (`mayReadProducts`): reading stock is reading the catalogue
 * (`store:read`), while Sell is on. Null (a 404): no business to read.
 */

/**
 * The business's Track stock switch, once per render: a gate (the shell's
 * Stock row, the pages), not a screen's data, so it stays a server read.
 */
export { stockTrackingOnce } from "./service";

export const stockLevelsServer: ServerRead<StockLevelsAsk, StockLevels> = {
    read: stockLevelsRead,
    service: ({ needs, ...ask }) =>
        getStockLevels({
            ...ask,
            needs: needs === "auto" ? "auto" : needs === "1",
        }),
};

export const stockLogServer: ServerRead<StockLogAsk, StockLogView> = {
    read: stockLogRead,
    service: async ({ kind, date, from, to, names, ...ask }) => {
        const [log, products] = await Promise.all([
            getStockLog({
                ...ask,
                kind: logKinds(logKindId(kind)),
                ...dateRangeAsk(readDateRange({ date, from, to })),
            }),
            // The screen's Product filter: optional, as it always was.
            names
                ? listProducts()
                      .then((all) =>
                          all.map((p) => ({ id: p.id, name: p.name })),
                      )
                      .catch(() => [])
                : undefined,
        ]);
        return log && { ...log, products };
    },
};

export const stockChecksServer: ServerRead<StockChecksAsk, StockChecks> = {
    read: stockChecksRead,
    service: (ask) => getStockChecks(ask),
};
