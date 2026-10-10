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
    // button: a chip, one of a segmented choice (radio)
    "components/bookings/availability/availability-editor.tsx": ["button"],
    // button: a row or card that is one button
    "components/bookings/availability/time-off-card.tsx": ["button"],
    // button: a chip, a row or card that is one button
    "components/bookings/availability/weekly-hours.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or card that is one button
    "components/bookings/calendar/agenda-month.tsx": ["button"],
    // button: a chip
    "components/bookings/calendar/booking-quick-look.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/bookings/calendar/calendar-screen.tsx": ["button"],
    // button: a cell covered by its button, a control styled by its screen's own helper, a row or card that is one button
    "components/bookings/calendar/day-by-person.tsx": ["button"],
    // button: a control styled by its screen's own helper, a row or card that is one button
    "components/bookings/calendar/week-view.tsx": ["button"],
    // button: one of a segmented choice (radio); label: a label that wraps its control
    "components/bookings/new-booking-dialog.tsx": ["button", "label"],
    // label: a label that wraps its control
    "components/bookings/pay-link-panel.tsx": ["label"],
    // label: a label that wraps its control
    "components/bookings/take-payment.tsx": ["label"],
    // button: a pressed-or-not toggle or filter chip
    "components/calendar/layer-switches.tsx": ["button"],
    // button: a calendar cell
    "components/calendar/month-grid.tsx": ["button"],
    // button: a row or card that is one button
    "components/calendar/month-strip.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/calendar/view-switch.tsx": ["button"],
    // button: a choice in a list
    "components/calendar/week-columns.tsx": ["button"],
    // button: a choice in a list
    "components/calendar/week-hour-grid.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/class-packs/pack-detail/detail-header.tsx": ["button"],
    // button: a tab
    "components/class-packs/pack-detail/holders-tab.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/class-packs/pack-detail/overview.tsx": ["button"],
    // button: a tab
    "components/class-packs/pack-detail/pack-detail.tsx": ["button"],
    // label: a label that wraps its control
    "components/class-packs/pack-editor/pack-sections.tsx": ["label"],
    // label: a label that wraps its control
    "components/class-packs/pack-editor/validity-chips.tsx": ["label"],
    // label: a label that wraps its control
    "components/commerce/collections/collection-fields.tsx": ["label"],
    // button: one of a segmented choice (radio)
    "components/commerce/collections/kind-choice.tsx": ["button"],
    // button: a row that is a tick
    "components/commerce/collections/product-collections-sheet.tsx": ["button"],
    // button: a row that is a tick; label: a label that wraps its control
    "components/commerce/collections/products-picker.tsx": ["button", "label"],
    // label: a label that wraps its control
    "components/commerce/new-order/pay-step.tsx": ["label"],
    // input: a native tick inside its own label; label: a label that wraps its control
    "components/commerce/order-detail/cancel-panel.tsx": ["input", "label"],
    // button: one of a segmented choice (radio); label: a label that wraps its control
    "components/commerce/order-detail/courier-panel.tsx": ["button", "label"],
    // label: a label that wraps its control
    "components/commerce/order-detail/edit-panel.tsx": ["label"],
    // button: one of a segmented choice (radio); input: a native tick inside its own label; label: a label that wraps its control
    "components/commerce/order-detail/fulfilment-panel.tsx": [
        "button",
        "input",
        "label",
    ],
    // button: a row that is a tick; label: a label that wraps its control
    "components/commerce/order-detail/refund-panel.tsx": ["button", "label"],
    // button: a row or card that is one button
    "components/commerce/order-detail/stepper.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/orders/bulk-bar.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/commerce/orders/order-filters.tsx": ["button"],
    // button: a control styled by its screen's own helper, a row or card that is one button
    "components/commerce/orders/order-row.tsx": ["button"],
    // button: a combobox trigger
    "components/commerce/product-editor-v2/category-picker.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/commerce/product-editor-v2/details-section.tsx": ["button"],
    // label: a label that wraps its control
    "components/commerce/product-editor-v2/fields.tsx": ["label"],
    // button: one of a segmented choice (radio)
    "components/commerce/product-editor-v2/made-by-section.tsx": ["button"],
    // label: a label that wraps its control
    "components/commerce/product-editor-v2/option-values-inline.tsx": ["label"],
    // button: a pressed-or-not toggle or filter chip
    "components/commerce/product-editor-v2/photo-library-panel.tsx": ["button"],
    // button: a control styled by its screen's own helper; input: a file picker
    "components/commerce/product-editor-v2/photos-section.tsx": [
        "button",
        "input",
    ],
    // label: a label that wraps its control
    "components/commerce/product-editor-v2/stock-fields.tsx": ["label"],
    // button: one of a segmented choice (radio)
    "components/commerce/product-editor-v2/variant-add-row.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, one of a segmented choice (radio)
    "components/commerce/product-editor-v2/variant-row.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-editor-v2/visibility-section.tsx": ["button"],
    // button: a row or pill that is a switch
    "components/commerce/product-page/customer-view.tsx": ["button"],
    // label: a label that wraps its control
    "components/commerce/product-page/sheets/stock-sheet-row.tsx": ["label"],
    // label: a label that wraps its control
    "components/commerce/product-page/sheets/stock-sheet.tsx": ["label"],
    // button: a control styled by its screen's own helper
    "components/commerce/product-page/sold-out-actions.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/stock-tab.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/stock-table.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-page/tab-row.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/commerce/product-page/tracking-actions.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or pill that is a switch, one of a segmented choice (radio); label: a label that wraps its control
    "components/commerce/product-sections/description-editor.tsx": [
        "button",
        "label",
    ],
    // button: a row or card that is one button; label: a label that wraps its control
    "components/commerce/product-sections/photos-field.tsx": [
        "button",
        "label",
    ],
    // button: a row or pill that is a switch, one of a segmented choice (radio)
    "components/commerce/product-sections/shop-switch.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/commerce/product-settings/category-merge-sheet.tsx": ["button"],
    // button: a row that is a tick, one of a segmented choice (radio); input: a field its screen draws itself; label: a label that wraps its control
    "components/commerce/product-settings/defaults-tab.tsx": [
        "button",
        "input",
        "label",
    ],
    // button: a pressed-or-not toggle or filter chip, one of a segmented choice (radio)
    "components/commerce/product-settings/field-sheet.tsx": ["button"],
    // button: a row or card that is one button
    "components/commerce/product-settings/option-sheet.tsx": ["button"],
    // button: a chip, a row that is a tick; input: a field its screen draws itself; label: a label that wraps its control
    "components/commerce/product-settings/sku-tab.tsx": [
        "button",
        "input",
        "label",
    ],
    // label: a label that wraps its control
    "components/commerce/record-paid-dialog.tsx": ["label"],
    // button: one of a segmented choice (radio)
    "components/commerce/stock/entry-sheet.tsx": ["button"],
    // button: a chip
    "components/customers/customer-picker.tsx": ["button"],
    // button: one of a segmented choice (radio); label: a label that wraps its control
    "components/customers/detail/attention-sheet.tsx": ["button", "label"],
    // button: one of a segmented choice (radio); label: a label that wraps its control
    "components/customers/detail/attention-suggestions.tsx": [
        "button",
        "label",
    ],
    // button: a tab
    "components/customers/detail/header.tsx": ["button"],
    // button: one of a segmented choice (radio); label: a label that wraps its control
    "components/customers/detail/merge-parts.tsx": ["button", "label"],
    // button: a row or card that is one button; label: a label that wraps its control
    "components/customers/detail/merge-search.tsx": ["button", "label"],
    // label: a label that wraps its control
    "components/customers/detail/messages-tab.tsx": ["label"],
    // button: a control styled by its screen's own helper
    "components/customers/detail/overview.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip
    "components/customers/detail/parts.tsx": ["button"],
    // label: a label that wraps its control
    "components/customers/detail/remove-details-dialog.tsx": ["label"],
    // button: a pressed-or-not toggle or filter chip
    "components/customers/list/filters.tsx": ["button"],
    // button: a row or card that is one button
    "components/home/first-run-jobs.tsx": ["button"],
    // button: a control styled by its screen's own helper, one of a segmented choice (radio)
    "components/invoices/invoice-form.tsx": ["button"],
    // button: a row or card that is one button
    "components/invoices/invoice-row.tsx": ["button"],
    // button: a tab
    "components/invoices/invoices-screen.tsx": ["button"],
    // input: a native radio inside its own label; label: a label that wraps its control
    "components/leads/add-lead-dialog.tsx": ["input", "label"],
    // label: a label that wraps its control
    "components/modules/module-goal-picker.tsx": ["label"],
    // label: a label that wraps its control
    "components/modules/turn-on/bookings-fields.tsx": ["label"],
    // label: a label that wraps its control
    "components/modules/turn-on/setup-fields.tsx": ["label"],
    // button: a control styled by its screen's own helper
    "components/notifications/notifications-inbox.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/organizations/business-setup-form.tsx": ["button"],
    // label: a label that wraps its control
    "components/organizations/invite-diary-person.tsx": ["label"],
    // label: a label that wraps its control
    "components/organizations/invoice-number-fields.tsx": ["label"],
    // button: a row or pill that is a switch
    "components/organizations/member-extras.tsx": ["button"],
    // button: a choice in a list
    "components/organizations/organization-switcher.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, a row or card that is one button; input: a native radio inside its own label; label: a label that wraps its control
    "components/organizations/roles-tab.tsx": ["button", "input", "label"],
    // button: one of a segmented choice (radio)
    "components/organizations/setup-kind-choice.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip, one of a segmented choice (radio); input: a native radio inside its own label, a native tick inside its own label; label: a label that wraps its control
    "components/organizations/team-screen.tsx": ["button", "input", "label"],
    // input: a native radio inside its own label; label: a label that wraps its control
    "components/providers/provider-setup-sheet.tsx": ["input", "label"],
    // button: one of a segmented choice (radio)
    "components/qr/choice-group.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/qr/qr-add-logo.tsx": ["button"],
    // label: a label that wraps its control
    "components/qr/qr-look-controls.tsx": ["label"],
    // button: a pressed-or-not toggle or filter chip; label: a label that wraps its control
    "components/qr/qr-target-picker.tsx": ["button", "label"],
    // label: a label that wraps its control
    "components/services/also-sell.tsx": ["label"],
    // label: a label that wraps its control
    "components/services/service-editor/editor-sections.tsx": ["label"],
    // label: a label that wraps its control
    "components/services/service-editor/fields.tsx": ["label"],
    // label: a label that wraps its control
    "components/services/service-editor/more-settings.tsx": ["label"],
    // label: a label that wraps its control
    "components/services/service-editor/where-field.tsx": ["label"],
    // button: a row that opens
    "components/settings/activity-list.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/settings/plan-billing/plan-chooser.tsx": ["button"],
    // button: a control styled by its screen's own helper, an option in a list; input: a field its screen draws itself
    "components/settings/settings-search.tsx": ["button", "input"],
    // button: a row or card that is one button
    "components/shared/app-sidebar.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/shared/chip.tsx": ["button"],
    // button: a control styled by its screen's own helper
    "components/shared/failed-read.tsx": ["button"],
    // input: a file picker
    "components/shared/logo-upload.tsx": ["input"],
    // button: a tab
    "components/shared/settings-tab-strip.tsx": ["button"],
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
    // label: a label that wraps its control
    "components/sites/block-feedback.tsx": ["label"],
    // button: a pressed-or-not toggle or filter chip
    "components/sites/choice-field.tsx": ["button"],
    // button: a tab
    "components/sites/editor-chrome.tsx": ["button"],
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
    // label: a label that wraps its control
    "components/sites/page-settings.tsx": ["label"],
    // button: a row or card that is one button, an option in a list
    "components/sites/pages-panel.tsx": ["button"],
    // input: a field its screen draws itself
    "components/sites/post-editor.tsx": ["input"],
    // button: a row or card that is one button
    "components/sites/pre-publish-check.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/sites/preview-links.tsx": ["button"],
    // button: a pressed-or-not toggle or filter chip; input: a field its screen draws itself
    "components/sites/rich-text-editor.tsx": ["button", "input"],
    // label: a label that wraps its control
    "components/sites/search-tracking/tracker-setup-dialog.tsx": ["label"],
    // input: a native tick inside its own label; label: a label that wraps its control
    "components/sites/section-fields/enquiry.tsx": ["input", "label"],
    // input: a slider
    "components/sites/section-fields/padding.tsx": ["input"],
    // button: a chip, a pressed-or-not toggle or filter chip
    "components/sites/section-preview.tsx": ["button"],
    // label: a label that wraps its control
    "components/sites/section-review.tsx": ["label"],
    // label: a label that wraps its control
    "components/sites/sells-from-row.tsx": ["label"],
    // button: a pressed-or-not toggle or filter chip
    "components/sites/settings/menu-footer-sheets.tsx": ["button"],
    // button: a tab; label: a label that wraps its control
    "components/sites/settings/settings-sections.tsx": ["button", "label"],
    // button: one of a segmented choice (radio); input: a slider; label: a label that wraps its control
    "components/sites/style-panel.tsx": ["button", "input", "label"],
    // button: a pressed-or-not toggle or filter chip; label: a label that wraps its control
    "components/sites/template-picker.tsx": ["button", "label"],
    // button: one of a segmented choice (radio)
    "components/sites/test-releases/go-live-dialog.tsx": ["button"],
    // button: one of a segmented choice (radio)
    "components/sites/test-releases/release-links.tsx": ["button"],
    // label: a label that wraps its control
    "components/sites/verdict-controls.tsx": ["label"],
    // label: a label that wraps its control
    "components/stores/catalogue/quick-look-stock.tsx": ["label"],
    // input: a file picker
    "components/stores/csv-import.tsx": ["input"],
    // label: a label that wraps its control
    "components/stores/invite-reviews-sheet.tsx": ["label"],
    // button: a tab
    "components/stores/location-tabs.tsx": ["button"],
    // label: a label that wraps its control
    "components/stores/reviews-view.tsx": ["label"],
    // label: a label that wraps its control
    "components/subscriptions/members-pause-row.tsx": ["label"],
    // button: a tab
    "components/subscriptions/plan-detail/detail-screen.tsx": ["button"],
    // label: a label that wraps its control
    "components/subscriptions/plan-detail/plan-autopay-timing.tsx": ["label"],
    // label: a label that wraps its control
    "components/subscriptions/plan-editor/classes-section.tsx": ["label"],
    // label: a label that wraps its control
    "components/subscriptions/plan-editor/details-section.tsx": ["label"],
    // button: a chip; label: a label that wraps its control
    "components/subscriptions/plan-editor/price-section.tsx": [
        "button",
        "label",
    ],
    // button: one of a segmented choice (radio)
    "components/subscriptions/subscription-detail/action-dialogs.tsx": [
        "button",
    ],
    // button: one of a segmented choice (radio)
    "components/subscriptions/subscription-detail/autopay-panel.tsx": [
        "button",
    ],
    // button: a row or card that is one button
    "components/subscriptions/subscription-row.tsx": ["button"],
    // button: a tab; label: a label that wraps its control
    "components/subscriptions/subscriptions-screen.tsx": ["button", "label"],
    // input: a native radio inside its own label; label: a label that wraps its control
    "components/subscriptions/timing-card.tsx": ["input", "label"],
};
