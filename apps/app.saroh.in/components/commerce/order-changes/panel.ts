/**
 * Order Detail's side sheets, one open at a time: `courier` hands the
 * order over; `tracking` fills in its details after; `fulfilment` and
 * `cancel` are B9's. Its own file so the sheet's frame and the hooks that
 * close a sheet can both name it without importing each other.
 */
export type Panel =
    null | "refund" | "edit" | "courier" | "tracking" | "fulfilment" | "cancel";
