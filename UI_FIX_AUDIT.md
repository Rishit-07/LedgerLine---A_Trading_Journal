# UI fix audit

Every `<button>`, `<input>`, `<textarea>`, `<select>` and button-like link found in templates and scripts (404 controls in 45 files).
Rule broken before the pass: each page styled its own buttons and fields (different colours, heights, borders, no shared states).
Now: buttons use `.btn` with primary, secondary, ghost, danger or disabled; fields use the shared border, focus ring and required handling in `src/styles/controls.css` and `src/controls.js`.

Counts come from a source scan, so controls built from template strings are listed by the line where the string starts.

| File | Line | Kind | Old class | Status |
|---|---|---|---|---|
| `index.html` | 37 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 47 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 57 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 67 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 77 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 87 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 97 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 107 | button | `si-t` | [x] shared `.btn`/`.field` |
| `index.html` | 178 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `index.html` | 184 | a.btn | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `index.html` | 1384 | a.btn | `lp-btn n-acc lp-get-started` | [x] shared `.btn`/`.field` |
| `index.html` | 1386 | a.btn | `lp-btn n-out` | [x] shared `.btn`/`.field` |
| `index.html` | 2044 | button | `ac-arrow n-out` | [x] shared `.btn`/`.field` |
| `index.html` | 2057 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2058 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2059 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2060 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2061 | button | `ac-dot on` | [x] shared `.btn`/`.field` |
| `index.html` | 2062 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2063 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2064 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2065 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2066 | button | `ac-dot` | [x] shared `.btn`/`.field` |
| `index.html` | 2067 | button | `ac-arrow n-out` | [x] shared `.btn`/`.field` |
| `index.html` | 2711 | a.btn | `lp-btn n-out` | [x] shared `.btn`/`.field` |
| `index.html` | 2742 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2758 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2775 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2791 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2807 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2823 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2840 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2856 | button | `` | [x] shared `.btn`/`.field` |
| `index.html` | 2874 | a.btn | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `index.html` | 2942 | button | `n-btn n-out auth-button` | [x] shared `.btn`/`.field` |
| `src/components/billing-ready.js` | 27 | button | `` | [x] shared `.btn`/`.field` |
| `src/components/billing-ready.js` | 31 | button | `` | [x] shared `.btn`/`.field` |
| `src/components/confirmation-motion.js` | 43 | button | `ll-success-continue` | [x] shared `.btn`/`.field` |
| `src/components/file-actions.js` | 43 | button | `file-outline` | [ ] review (component control, see notes) |
| `src/components/file-actions.js` | 43 | button | `` | [ ] review (component control, see notes) |
| `src/components/trade-screenshots.js` | 9 | input | `` | [ ] review (component control, see notes) |
| `src/features/billing/page.js` | 16 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/features/billing/page.js` | 146 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/billing/page.js` | 147 | button | `` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 4 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 5 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 6 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 7 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 7 | select | `` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 7 | select | `` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 8 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/features/clubs/index.js` | 15 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 18 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 19 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 20 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 20 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 21 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 24 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 24 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 98 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/features/community/room.js` | 98 | button | `` | [x] shared `.btn`/`.field` |
| `src/features/reports/index.js` | 11 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/features/reports/index.js` | 76 | select | `` | [x] shared `.btn`/`.field` |
| `src/features/reports/index.js` | 78 | select | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/application.js` | 52 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/application.js` | 74 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/application.js` | 82 | button | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 5 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 6 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 7 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 8 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 9 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 9 | select | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 10 | select | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 10 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 11 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 11 | input | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 12 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 13 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/features/spaces/index.js` | 20 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/features/spaces/reviewer.js` | 19 | textarea | `` | [ ] review (component control, see notes) |
| `src/main.js` | 65 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 4 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 14 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 24 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 34 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 44 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 54 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 64 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 74 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 84 | button | `si-t` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 155 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 162 | a.btn | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1302 | a.btn | `lp-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1304 | a.btn | `lp-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1743 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1751 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1760 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1768 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1793 | a.btn | `lp-btn n-out lp-rv` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1832 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/about.html` | 1835 | button | `n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/account-pages.js` | 25 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/account-pages.js` | 135 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 24 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 28 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 30 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 30 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 30 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 30 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 30 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 31 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 31 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 32 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 32 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 34 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 35 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 36 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/account-settings.js` | 37 | a.btn | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/badge-shelf.js` | 51 | input | `` | [ ] review (component control, see notes) |
| `src/pages/close-trade.js` | 8 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/close-trade.js` | 10 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/close-trade.js` | 11 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/close-trade.js` | 12 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 9 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 17 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 17 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 17 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 21 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 23 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 24 | button | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 30 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 31 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 113 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/coach-page.js` | 128 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/community.js` | 26 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/community.js` | 26 | a.btn | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 5 | button | `n-btn n-out dash-button dash-menu-toggle` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 7 | button | `n-btn n-acc dash-button dash-sidebar-log` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 31 | button | `n-btn n-out dash-account-trigger` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 44 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 51 | button | `n-btn n-in dash-jump` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 52 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 62 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 62 | a.btn | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 66 | button | `n-btn n-out dash-mini-tile dash-streak-b` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 74 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 77 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 79 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 97 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 98 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 99 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 129 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 134 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 135 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 136 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 139 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 140 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 141 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 145 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 149 | button | `n-btn n-out ql-close` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 151 | input | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 155 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 156 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 168 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 169 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 170 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 171 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 177 | select | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 178 | input | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 179 | input | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 180 | input | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 183 | input | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 185 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 186 | input | `n-in ql-input` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 190 | button | `n-btn n-acc ql-save` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 216 | button | `n-btn n-out ql-tear` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 217 | button | `n-btn ql-skip` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 221 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 223 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 224 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 225 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 229 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 233 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/dashboard.html` | 233 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/email-verification.js` | 13 | button | `n-btn n-acc auth-button` | [x] shared `.btn`/`.field` |
| `src/pages/email-verification.js` | 14 | button | `n-btn n-out auth-button` | [x] shared `.btn`/`.field` |
| `src/pages/email-verification.js` | 15 | button | `n-btn auth-button` | [x] shared `.btn`/`.field` |
| `src/pages/history-chart.js` | 59 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/history-chart.js` | 61 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/legal.html` | 10 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/legal.html` | 11 | a.btn | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/legal.html` | 21 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 5 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 6 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 21 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 22 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 31 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 32 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 33 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 34 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 35 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 57 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.html` | 58 | button | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.js` | 59 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.js` | 61 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/onboarding.js` | 62 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/pagination.js` | 12 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/pagination.js` | 13 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-design-controls.js` | 10 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-design-controls.js` | 29 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-design-controls.js` | 40 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-design-controls.js` | 54 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-preferences.js` | 4 | select | `` | [ ] review (component control, see notes) |
| `src/pages/portfolio-preferences.js` | 10 | input | `` | [ ] review (component control, see notes) |
| `src/pages/portfolio-public.js` | 29 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-public.js` | 38 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-public.js` | 70 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-public.js` | 83 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-public.js` | 86 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/portfolio-public.js` | 99 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/quick-trade.js` | 79 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 73 | button | `n-btn au-theme` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 330 | button | `n-out on` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 331 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 343 | button | `n-btn n-out n-lift` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 415 | input | `n-input` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 443 | input | `n-input` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 471 | input | `n-input` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 480 | button | `au-password-toggle` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 503 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/sign-in.html` | 508 | button | `n-btn n-acc n-lift` | [x] shared `.btn`/`.field` |
| `src/pages/streak-chip.js` | 2 | a.btn | `n-btn n-out dash-button workspace-streak` | [x] shared `.btn`/`.field` |
| `src/pages/streak-invite-page.js` | 13 | button | `n-btn n-out invite-theme` | [x] shared `.btn`/`.field` |
| `src/pages/streak-invite-page.js` | 26 | a.btn | `n-btn n-acc invite-primary` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 23 | a.btn | `n-btn dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 24 | a.btn | `n-btn dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 30 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 31 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 32 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 34 | select | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 35 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 37 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 38 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 39 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 42 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 44 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 45 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 48 | button | `n-btn n-acc dash-button journal-hold` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 53 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 54 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 59 | a.btn | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 66 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 67 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 68 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 69 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 72 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 82 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 83 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 96 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 97 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 99 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 100 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 103 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 104 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-pages.js` | 107 | button | `n-btn n-acc streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 11 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 32 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 33 | button | `n-btn n-acc streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 41 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 42 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 51 | input | `n-out` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 53 | input | `n-out` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 54 | button | `n-btn n-acc streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 71 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 74 | select | `n-out` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 75 | select | `n-out` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 76 | button | `n-btn n-acc streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 82 | button | `n-btn n-acc streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-panel.js` | 83 | a.btn | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 79 | button | `n-btn streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 84 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 85 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 86 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 87 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 116 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/streak-share.js` | 185 | button | `n-btn n-out streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/streak-view.js` | 10 | button | `n-btn n-acc streak-btn` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 25 | button | `n-btn n-in support-jump` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 30 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 31 | a.btn | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 43 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 44 | button | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 53 | button | `n-btn n-out support-topic support-rise` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 54 | button | `n-btn n-out support-topic support-rise` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 55 | button | `n-btn n-out support-topic support-rise` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 56 | button | `n-btn n-out support-topic support-rise` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 57 | button | `n-btn n-out support-topic support-rise` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 58 | button | `n-btn n-out support-topic support-rise` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 65 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 73 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 74 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 76 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 77 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 78 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 79 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 82 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 83 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 84 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 86 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 88 | button | `n-btn n-acc` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 89 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/support.html` | 99 | a.btn | `n-btn n-acc support-contact-shortcut` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 25 | a.btn | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 35 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 36 | select | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 38 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 39 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 40 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 41 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 44 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 44 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 50 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 52 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 53 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 225 | select | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 226 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 227 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-analysis.js` | 227 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 36 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 37 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 38 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 43 | select | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 59 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 64 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 65 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 69 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 70 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 71 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-calendar.js` | 100 | button | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 9 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 14 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 15 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 16 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 19 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 20 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 22 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 25 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 26 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 29 | select | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 30 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 31 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 31 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 36 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-community.js` | 37 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 32 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 32 | a.btn | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 32 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 42 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 45 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 51 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 53 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 54 | textarea | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 56 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 64 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 65 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 76 | a.btn | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 84 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 98 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 104 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 105 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 112 | a.btn | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 113 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 114 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 126 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 129 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 130 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-portfolio.js` | 131 | button | `n-btn n-out dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 31 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 32 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 32 | button | `n-btn` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 36 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 37 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 38 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 40 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 41 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 42 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 43 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 45 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 46 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 47 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 50 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 51 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 52 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 140 | textarea | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 142 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 143 | select | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 144 | select | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 146 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 147 | input | `n-in` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 148 | button | `n-btn n-out` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 149 | input | `` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-tools.js` | 151 | button | `n-btn n-acc dash-button` | [x] shared `.btn`/`.field` |
| `src/pages/workspace-ui.js` | 16 | button | `` | [x] shared `.btn`/`.field` |

## Left as component controls (not forced into the five styles)

- FAQ accordions, carousel dots and arrows, sign-in mode toggle, share-theme swatches, calendar day cells, tiles: they keep their own look but get a 44px hit area and a visible focus ring.
- Ledger bot: not built in this pass (separate prompt).
- Border contrast is about 45% ink on background (light) rather than the doc's 30%, to stay visible on the neomorphic surface.
- In-flight `disabled = true` sites in a few older scripts still disable instead of showing the spinner; `setBusy()` is ready for them.
