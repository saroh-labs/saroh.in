/**
 * What app.saroh.in still draws by hand, by file, and what each one is.
 *
 * `controls.js` forbids a raw `<button>`, `<input>`, `<select>`,
 * `<textarea>` and `<label>` in app code. A file here keeps only the tags
 * it names. Two kinds of entry:
 *
 * - A different control: a row or card that is one button, a chip, a tab,
 *   a segmented choice, a calendar cell, a file picker, a slider. These are
 *   not `Button` or `Input` and stay as they are until a shared piece of
 *   their own kind exists (tabs, segmented controls and chips are being
 *   built beside this list).
 * - Not moved yet: a label that wraps its control (it becomes `Field`), a
 *   native tick or radio inside one (`Checkbox`, `RadioGroup`).
 *
 * A new file is added only for the first kind. When a file stops drawing a
 * tag, take the tag off its line: `apps/app.saroh.in/lib/controls-allowlist.test.ts` fails on a
 * line that no longer matches the code.
 */
export const RAW_ALLOWED = {
    // button: a row or card that is one button; input: a hidden form value
    "app/choose/page.tsx": ["button", "input"],
    // button: a pressed-or-not toggle or filter chip
    "components/analytics/readout-bars.tsx": ["button"],
    // button: a row or card that is one button
    "components/bookings/availability/time-off-card.tsx": ["button"],
    // button: a chip, a row or card that is one button
    "components/bookings/availability/weekly-hours.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or card that is one button
    "components/bookings/calendar/agenda-month.tsx": ["button"],
    // button: a chip
    "components/bookings/calendar/booking-quick-look.tsx": ["button"],
    // button: a cell covered by its button, a row or card that is one button
    "components/bookings/calendar/day-by-person.tsx": ["button"],
    // button: a row or card that is one button
    "components/bookings/calendar/week-view.tsx": ["button"],
    // button: a choice in a list
    "components/bookings/reschedule-booking.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/calendar/layer-switches.tsx": ["button"],
    // button: a calendar cell
    "components/calendar/month-grid.tsx": ["button"],
    // button: a row or card that is one button
    "components/calendar/month-strip.tsx": ["button"],
    // button: a choice in a list
    "components/calendar/week-columns.tsx": ["button"],
    // button: a choice in a list
    "components/calendar/week-hour-grid.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/class-packs/pack-detail/overview.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/order-detail/stepper.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/orders/bulk-bar.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/orders/order-row.tsx": ["button"],
    // button: a combobox trigger
    "components/commerce/product-editor-v2/category-picker.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-editor-v2/photo-library-panel.tsx": ["button"],
    // button: a control styled by its screen's own helper; input: a file picker
    "components/commerce/product-editor-v2/photos-section.tsx": [
        "button",
        "input",
    ],
    // button: a row or card that is one button
    "components/commerce/product-editor-v2/visibility-section.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/commerce/product-page/sold-out-actions.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/stock-tab.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/stock-table.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/commerce/product-page/tracking-actions.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or pill that is a switch, one of a segmented choice (radio)
    "components/commerce/product-sections/description-editor.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-sections/photos-field.tsx": ["button"],
    // button: a row or pill that is a switch
    "components/commerce/product-sections/shop-switch.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-settings/option-sheet.tsx": ["button"],
    // button: a chip, a row that is a tick
    "components/commerce/product-settings/sku-tab.tsx": ["button"],
    // button: a chip
    "components/customers/customer-picker.tsx": ["button"],
    // button: a row or card that is one button
    "components/customers/detail/merge-search.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/customers/detail/overview.tsx": ["button"],
    // button: a row or card that is one button
    "components/home/first-run-jobs.tsx": ["button"],
    // button: a control styled by its screen's own helper, one of a segmented choice (radio)
    "components/invoices/invoice-form.tsx": ["button"],
    // button: a row or card that is one button
    "components/invoices/invoice-row.tsx": ["button"],
    // button: a row or card that is one button
    "components/organizations/organization-switcher.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or card that is one button
    "components/organizations/roles-tab.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/qr/qr-add-logo.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/qr/qr-target-picker.tsx": ["button"],
    // button: a row or card that is one button
    "components/settings/activity-list.tsx": ["button"],
    // button: a control styled by its screen's own helper, an option in a list; input: a field its screen draws itself
    "components/settings/settings-search.tsx": ["button", "input"],
    // button: a row or card that is one button
    "components/shared/app-sidebar.tsx": ["button"],
    // button: a shared piece that passes its props to the button
    "components/shared/chip.tsx": ["button"],
    // button: the one hand-drawn radio, shared by every choice group
    "components/shared/choice-group.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/shared/failed-read.tsx": ["button"],
    // input: a file picker
    "components/shared/logo-upload.tsx": ["input"],
    // button: a tab
    "components/shared/section-list.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/shared/tab-bar.tsx": ["button"],
    // button: a chip
    "components/shared/user-menu.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/add-block-panel.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/add-page-panel.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/add-section-dialog.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/sites/choice-field.tsx": ["button"],
    // button: a row or card that is one button
    "components/sites/editor/editor-canvas.tsx": ["button"],
    // button: a choice in a list
    "components/sites/editor/editor-rail.tsx": ["button"],
    // button: a row or card that is one button, a row that opens
    "components/sites/editor/editor-top-bar.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/sites/editor/rail-bottom-bar.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or card that is one button
    "components/sites/editor/top-bar-actions.tsx": ["button"],
    // input: a file picker
    "components/sites/media-picker.tsx": ["input"],
    // button: a row or card that is one button, an option in a list
    "components/sites/pages-panel.tsx": ["button"],
    // input: a field its screen draws itself
    "components/sites/post-editor.tsx": ["input"],
    // button: a row or card that is one button
    "components/sites/pre-publish-check.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip; input: a field its screen draws itself
    "components/sites/rich-text-editor.tsx": ["button", "input"],
    // input: a slider
    "components/sites/section-fields/padding.tsx": ["input"],
    // button: a chip, a pressed-or-not toggle or filter chip
    "components/sites/section-preview.tsx": ["button"],
    // input: a slider
    "components/sites/style-panel.tsx": ["input"],
    // input: a file picker
    "components/stores/csv-import.tsx": ["input"],
    // button: a chip
    "components/subscriptions/plan-editor/price-section.tsx": ["button"],
    // button: a row or card that is one button
    "components/subscriptions/subscription-row.tsx": ["button"],
    // input: a native radio inside its own label; label: a label that wraps its control
    "components/subscriptions/timing-card.tsx": ["input", "label"],
};
