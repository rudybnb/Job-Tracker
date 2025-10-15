# Design Guidelines: 3-Site Workforce Management Platform

## Design Approach

**Selected Approach:** Design System (Productivity/Enterprise)

**Rationale:** This is a data-heavy, utility-focused workforce management application requiring consistency, efficiency, and information density across admin and worker interfaces.

**References:** Linear (clean aesthetics, data hierarchy), Notion (flexible layouts), Asana (task management patterns)

**Key Principles:**
- Data clarity over decoration
- Consistent patterns for predictable UX
- Information hierarchy through spacing and typography
- Efficient workflows with minimal clicks
- Mobile-first for worker interface, desktop-optimized for admin

---

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Background: 0 0% 100% (pure white)
- Surface: 210 20% 98% (off-white for cards)
- Border: 214 15% 91% (subtle separation)
- Text Primary: 222 47% 11% (near-black)
- Text Secondary: 215 16% 47% (muted)
- Primary Brand: 221 83% 53% (professional blue)
- Success: 142 71% 45% (attendance approved, clocked in)
- Warning: 38 92% 50% (pending approvals, late flags)
- Error: 0 84% 60% (conflicts, missed clock-outs)

**Dark Mode:**
- Background: 222 47% 11% (deep navy-black)
- Surface: 217 33% 17% (elevated cards)
- Border: 215 20% 25% (subtle borders)
- Text Primary: 210 20% 98% (near-white)
- Text Secondary: 215 16% 65% (muted)
- Primary Brand: 217 91% 60% (lighter blue)
- Success: 142 71% 55%
- Warning: 38 92% 60%
- Error: 0 84% 70%

**Accent Colors (Use Sparingly):**
- Site A Identifier: 280 65% 60% (purple)
- Site B Identifier: 168 76% 42% (teal)
- Site C Identifier: 30 85% 55% (orange)

---

### B. Typography

**Font Families:**
- Primary: 'Inter' (Google Fonts) - UI, data tables, forms
- Monospace: 'JetBrains Mono' - timestamps, IDs, codes

**Scale:**
- Page Title: text-3xl font-semibold (30px)
- Section Header: text-xl font-semibold (20px)
- Card Title: text-base font-medium (16px)
- Body: text-sm (14px)
- Caption/Meta: text-xs text-secondary (12px)
- Data Tables: text-sm font-mono for numbers

**Hierarchy:**
- Use font-weight variations (medium 500, semibold 600) over size changes
- Maintain consistent line-height: leading-relaxed for readability

---

### C. Layout System

**Spacing Primitives (Tailwind):**
- Primary units: **2, 4, 6, 8** (0.5rem, 1rem, 1.5rem, 2rem)
- Component padding: p-4 or p-6
- Section spacing: space-y-6 or space-y-8
- Card gaps: gap-4
- Page margins: px-4 md:px-6 lg:px-8

**Grid Structure:**
- Admin Dashboard: Sidebar (240px fixed) + Main Content (fluid)
- Content max-width: max-w-7xl mx-auto
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Data tables: Full width with horizontal scroll on mobile

**Responsive Breakpoints:**
- Mobile: base (< 640px) - Single column, stacked cards
- Tablet: md (≥ 768px) - 2 columns where appropriate
- Desktop: lg (≥ 1024px) - Full multi-column layouts

---

### D. Component Library

**Navigation:**
- Admin: Vertical sidebar with icon + label, collapsible on mobile
- Worker Mobile: Bottom tab bar with 5 primary actions (Home, Clock, Pay, Scan, Profile)
- Breadcrumbs for deep navigation (Rota > Week 15 > Edit Shift)

**Cards:**
- Border: border border-border rounded-lg
- Padding: p-4 or p-6
- Shadow: shadow-sm hover:shadow-md transition
- Header with title + action buttons aligned right

**Data Tables:**
- Striped rows: even:bg-surface/50
- Sticky header on scroll
- Row hover: hover:bg-surface transition
- Sort indicators in column headers
- Status badges inline with data

**Forms:**
- Input fields: border rounded-md px-3 py-2 focus:ring-2 focus:ring-primary
- Labels: text-sm font-medium mb-1
- Helper text: text-xs text-secondary mt-1
- Validation: border-error text-error for errors
- Field grouping: space-y-4

**Buttons:**
- Primary: bg-primary text-white hover:bg-primary/90 px-4 py-2 rounded-md font-medium
- Secondary: bg-surface border hover:bg-surface/80
- Danger: bg-error text-white
- Icon buttons: p-2 rounded-md hover:bg-surface

**Status Badges:**
- Pill shape: rounded-full px-2.5 py-0.5 text-xs font-medium
- Colors: bg-success/10 text-success, bg-warning/10 text-warning, etc.
- States: Scheduled, Clocked In, Approved, Pending, Late, Missed, Published

**Modals/Dialogs:**
- Overlay: bg-black/50 backdrop-blur-sm
- Dialog: max-w-lg bg-background rounded-lg shadow-xl p-6
- Header with close button, content section, footer with actions

**Stats Cards:**
- Large number: text-3xl font-bold
- Label: text-sm text-secondary
- Trend indicator: small arrow + percentage
- Grid layout for dashboard overview (4 cards across on desktop)

**Timeline/Audit Log:**
- Vertical line with dots for events
- Timestamp + user + action description
- Expandable details for each entry

---

### E. Module-Specific Patterns

**Rota/Schedule:**
- Weekly calendar grid view (7 columns for days)
- Shift cards with time, role, site badge
- Color-coded by site or status
- Drag-drop visual feedback (not functional in initial version)
- Conflict warnings as yellow border + icon

**Attendance:**
- Live view: List with status badges (Clocked In = green pulse)
- Clock-in cards: Large timestamp, duration counter, site/room info
- Approval queue: Checkbox selection + bulk actions

**Room Scans:**
- QR code display: Centered with expiry countdown
- Scan log table: Timestamp, room, confidence score, device
- Compliance chart: Expected vs completed rounds visualization

**Payroll:**
- Pay statement cards with period, gross, net
- Expandable line items table (earnings + deductions)
- Drill-down links to source shifts (blue underlined)
- Export button with icon

**Reports:**
- Filter bar at top: Date range, site selector, role selector
- Chart.js visualizations: Bar for hours, Line for trends
- Summary cards above detailed tables
- Export CSV button in top-right

**Worker Mobile:**
- Large touch targets (min 44px height)
- Bottom sheet for actions (Clock In/Out)
- Swipe gestures for navigation between dates
- Simplified payslip view with tap-to-expand deductions

---

### F. Interactive States

**Hover:** Subtle background change (hover:bg-surface) + shadow increase
**Active:** Slight scale down (active:scale-95) for buttons
**Focus:** Ring outline (focus:ring-2 ring-primary)
**Loading:** Spinner + disabled state (opacity-50 cursor-not-allowed)
**Empty States:** Centered icon + message + action button

**Animations:** Minimal, use sparingly
- Page transitions: Fade in (100ms)
- Modal entry: Slide up + fade (200ms ease-out)
- Toast notifications: Slide in from top-right
- NO decorative animations, parallax, or scroll effects

---

### Images

**No hero images** - This is an enterprise application, not a marketing site.

**Functional imagery only:**
- User avatars: 32px circular, initials fallback with colored background
- Site logos: Small icons in navigation and cards
- QR codes: Generated, centered in scan interface
- Empty state illustrations: Simple line art (optional)

---

## Implementation Notes

- Maintain strict dark mode consistency across ALL components including form inputs
- Use semantic color variables (not hardcoded hex values) for easy theme switching
- Mobile worker interface prioritizes single-column, large touch targets, bottom navigation
- Admin interface optimizes for data density with tables and multi-column layouts
- Status indicators use color + icon + text label (never color alone for accessibility)
- All interactive elements meet WCAG 2.1 AA contrast requirements