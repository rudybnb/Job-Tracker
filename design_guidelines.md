# Design Guidelines: Workforce Management Platform

## Design Approach

**Selected Approach:** Charcoal Luxury Theme - Sophisticated & Modern

**Rationale:** A premium, professional aesthetic using a rich charcoal background with elegant purple, white, gold, and brown accents. This creates visual hierarchy while maintaining a modern, enterprise feel.

**Key Principles:**
- Charcoal background for reduced eye strain and premium feel
- Purple and white text for primary content
- Gold accents for highlights and important actions
- Brown accents for secondary elements
- High contrast for readability
- Elegant, professional appearance

---

## Core Design Elements

### A. Color Palette

**Charcoal Theme (Default):**
- **Background**: 0 0% 12% (deep charcoal, almost black)
- **Surface/Cards**: 0 0% 16% (slightly lighter charcoal)
- **Border**: 0 0% 22% (subtle charcoal borders)
- **Text Primary**: 0 0% 98% (crisp white)
- **Text Secondary**: 270 30% 70% (light purple)
- **Primary Brand**: 270 75% 60% (vibrant purple for buttons/links)
- **Accent Gold**: 45 90% 55% (warm gold for highlights)
- **Accent Brown**: 25 40% 35% (rich brown for secondary elements)
- **Success**: 142 71% 55% (green for approved/success states)
- **Warning**: 38 92% 60% (amber for warnings)
- **Error**: 0 84% 60% (red for errors/conflicts)

**Site-Specific Colors:**
- Site Kent: 280 65% 60% (purple - complementary to primary)
- Site London: 168 76% 42% (teal)
- Site Essex: 30 85% 55% (orange)

**Usage Guidelines:**
- Use white (98%) for primary headings and important text
- Use light purple (270 30% 70%) for body text and secondary information
- Use vibrant purple (270 75% 60%) for interactive elements, links, primary buttons
- Use gold (45 90% 55%) sparingly for special highlights, premium features, or key metrics
- Use brown (25 40% 35%) for secondary buttons, alternate cards, or tertiary information
- Maintain high contrast between text and background (minimum 7:1 ratio)

---

### B. Typography

**Font Families:**
- Primary: 'Inter' - Clean, modern sans-serif for UI and data
- Monospace: 'JetBrains Mono' - For timestamps, IDs, codes

**Scale:**
- Page Title: text-3xl font-semibold text-white (30px white)
- Section Header: text-xl font-semibold text-white (20px white)
- Card Title: text-base font-medium text-white (16px white)
- Body Text: text-sm text-purple-200 (14px light purple)
- Caption/Meta: text-xs text-muted-foreground (12px muted purple)
- Emphasis: text-accent (gold) or text-primary (purple)

**Hierarchy:**
- White for main headings and labels
- Light purple for body text and descriptions
- Purple for interactive elements
- Gold for special emphasis
- Use font-weight (medium 500, semibold 600, bold 700) to create hierarchy

---

### C. Layout System

**Spacing Primitives:**
- Primary units: 2, 4, 6, 8 (0.5rem, 1rem, 1.5rem, 2rem)
- Component padding: p-4 or p-6
- Section spacing: space-y-6 or space-y-8
- Card gaps: gap-4
- Page margins: px-4 md:px-6 lg:px-8

**Grid Structure:**
- Admin: Darker charcoal sidebar (0 0% 10%) + Main content area
- Content max-width: max-w-7xl mx-auto
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Tables: Full width with horizontal scroll on mobile

**Responsive Breakpoints:**
- Mobile: base (< 640px) - Single column
- Tablet: md (≥ 768px) - 2 columns
- Desktop: lg (≥ 1024px) - Full multi-column

---

### D. Component Library

**Navigation:**
- Admin Sidebar: Darker charcoal (0 0% 10%) with white text and purple highlights
- Active items: Purple background with white text
- Hover: Subtle purple glow
- Worker Mobile: Bottom tabs with purple active state

**Cards:**
- Background: Charcoal (0 0% 16%)
- Border: Subtle (0 0% 24%)
- Padding: p-4 or p-6
- Shadow: Elevated shadows for depth
- Title: White, bold
- Content: Light purple text

**Buttons:**
- **Primary**: Purple background (270 75% 60%) + white text
  - Hover: Slightly lighter purple
  - Active: Slightly darker purple
- **Secondary**: Brown background (25 40% 35%) + white text
- **Accent/Special**: Gold background (45 90% 55%) + dark text
- **Ghost**: Transparent + purple text, hover shows purple background
- Icon buttons: p-2 with purple hover

**Status Badges:**
- Pill shape: rounded-full px-2.5 py-0.5 text-xs font-medium
- Color-coded backgrounds with white text:
  - Success: Green tint
  - Warning: Gold/amber tint
  - Error: Red tint
  - Info: Purple tint
  - Neutral: Brown tint

**Forms:**
- Input fields: Dark charcoal background with light borders
- Text: White input text, light purple placeholder
- Focus: Purple ring (ring-2 ring-primary)
- Labels: White, font-medium
- Helper text: Light purple

**Data Tables:**
- Header: White text on darker charcoal
- Rows: Alternating subtle charcoal shades
- Hover: Purple tint overlay
- Numbers/data: Monospace font in white

**Modals/Dialogs:**
- Overlay: bg-black/70 backdrop-blur
- Dialog: Charcoal background with borders
- Header: White text
- Content: Light purple text
- Actions: Purple and brown buttons

**Stats Cards:**
- Large numbers: White, text-3xl font-bold
- Labels: Light purple, text-sm
- Icons: Gold or purple
- Background: Slightly lighter charcoal with subtle border

---

### E. Module-Specific Patterns

**Shift Scheduling (Rota):**
- Weekly grid with charcoal cells
- Shift cards: Lighter charcoal with colored left border (site color)
- Text: White for names, light purple for details
- Conflicts: Red border with warning badge

**Attendance:**
- Live status: Green pulse for "Clocked In"
- Approval queue: Purple checkboxes
- Duration: Monospace white text
- Status badges: Color-coded

**Room Scans:**
- QR code: White on dark background
- Expiry countdown: Gold text when < 2 minutes
- Scan log: Monospace timestamps in light purple
- Confidence score: Color gradient (green to red)

**Payroll:**
- Pay period card: White heading, light purple dates
- Amounts: Large white numbers with currency symbol
- Line items: Light purple with brown separators
- Totals: Bold white with gold highlight
- Download button: Gold accent

**Reports:**
- Charts: Purple, gold, brown color scheme
- Filter bar: Darker charcoal with white inputs
- Summary cards: Gold icons, white numbers
- Export: Purple button with download icon

**Worker Mobile:**
- Large touch targets (min 44px)
- Bottom nav: Purple active state
- Quick actions: Purple buttons
- Status: Color-coded badges
- Clock display: Large white numbers

---

### F. Interactive States

**Hover:** 
- Purple tint overlay
- Shadow increase
- Smooth transition (150ms)

**Active:** 
- Slightly deeper purple
- Subtle scale (active:scale-98)

**Focus:** 
- Purple ring (focus:ring-2 ring-primary)
- Outline offset

**Loading:** 
- Purple spinner
- Disabled state with opacity-50

**Empty States:** 
- Purple icon
- White heading
- Light purple message
- Gold action button

**Animations:**
- Minimal, purposeful only
- Transitions: 150-200ms ease-out
- NO decorative animations

---

### G. Special Elements

**Gold Accents - Use For:**
- Important metrics/KPIs
- Premium features
- Achievement indicators
- Special highlights
- Download/export buttons
- Promotional badges

**Brown Accents - Use For:**
- Secondary buttons
- Alternate cards
- Supporting information
- Tertiary navigation
- Background variations
- Subtle dividers

**Purple Gradients:**
- Use sparingly for hero sections
- CTAs and important banners
- Status indicators
- Progress bars

---

## Implementation Notes

- Charcoal theme is the default
- Light mode available as fallback (toggle if needed)
- All text maintains 7:1 contrast ratio minimum
- Purple used for all primary interactive elements
- Gold reserved for special emphasis and highlights
- Brown for secondary/supporting elements
- White for primary text and headings
- Light purple for body text and descriptions
- Strict consistency across all components
- Mobile-first responsive design
- Accessibility: Color + icon + text for all status indicators
