---
name: Seva Hospitality Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#564338'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#897267'
  outline-variant: '#ddc1b3'
  surface-tint: '#9b4500'
  primary: '#903f00'
  on-primary: '#ffffff'
  primary-container: '#b45309'
  on-primary-container: '#fff1eb'
  inverse-primary: '#ffb68e'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#006444'
  on-tertiary: '#ffffff'
  tertiary-container: '#007f58'
  on-tertiary-container: '#ccffe3'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbca'
  primary-fixed-dim: '#ffb68e'
  on-primary-fixed: '#331200'
  on-primary-fixed-variant: '#763300'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  data-tabular:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system serves operational sevaks (volunteers) and administrative teams managing large-scale devotee hospitality across sacred mandir campuses. The personality blends spiritual reverence with institutional rigor: calm, ordered, dependable, and warm. 

The aesthetic is **Spiritual-Modern Corporate**: high operational utility merged with cultural sanctity. It avoids chaotic enterprise clutter through structured data grids, generous micro-spacing, precise typographic hierarchies, and dignified tonal accents. The interface prioritizes rapid scanning during peak arrival windows, immediate situational clarity across logistics (Transport, Samarpan & Offsite Accommodation, Mahaprasad Kitchens), and error-free data entry in high-throughput environments.

## Colors

The palette establishes clear operational meaning through deliberate functional assignment:

- **Sacred Saffron / Amber (`#B45309`, `#D97706`):** The primary anchor. Conveys sacred hospitality, service, and primary focal actions (active tabs, primary commands, key devotee counters).
- **Deep Temple Navy (`#0F172A`, `#1E293B`):** Structural foundation. Drives headers, primary sidebars, dense data table text, and high-emphasis boundaries.
- **Surface Neutrals (`#FFFFFF`, `#F8FAFC`, `#F1F5F9`, `#E2E8F0`):** Pure and slate-tinted canvas surfaces ensuring zero eye strain during prolonged shift rotations.
- **Status Accents:**
  - **Confirmed / Arrived / Completed:** Emerald Green (`#059669`, background tint `#ECFDF5`).
  - **In-Transit / Pending Allocation:** Warm Amber (`#D97706`, background tint `#FFFBEB`).
  - **Urgent / Turnover Required / Immediate Departure:** Rose Carmine (`#E11D48`, background tint `#FFF1F2`).
  - **Informational / Scheduled:** Steel Blue (`#0284C7`, background tint `#F0F9FF`).

Use tinted backgrounds for badges, table row highlights, and alert banners to maintain high legibility without visual exhaustion.

## Typography

Typography pairs **Plus Jakarta Sans** for welcoming yet commanding headings with **Inter** for dense, scannable data layouts.

All tabular numbers, timestamps, room allocations, guest counts, and plate tallies must apply `font-feature-settings: 'tnum' on, 'cv05' on` to guarantee columnar alignment. Labels use uppercase sparingly, reserved exclusively for micro status pills (`label-sm`) and table column headers to maintain quiet authority.

## Layout & Spacing

The layout is built on a responsive 12-column fluid grid tailored for heavy data density:

- **Desktop (≥ 1280px):** 12 columns, 24px (`1.5rem`) gutters, 32px (`2rem`) outer canvas margins. Features a fixed 260px collapsible command sidebar alongside the dynamic operational viewport.
- **Tablet (768px – 1279px):** 8 columns, 24px (`1.5rem`) gutters, 24px (`1.5rem`) margins. Sidebar transforms into a compact icon rail or sliding drawer.
- **Mobile (< 768px):** 4 columns, 16px (`1rem`) gutters, 16px (`1rem`) margins. Metric cards stack vertically; multi-column operational tables shift into swipeable summary cards.

Grid elements conform to strict multiples of 4px. Data rows maintain an intentional 40px compact height for high-density mode and 48px standard height for check-in counters.

## Elevation & Depth

Visual hierarchy uses a **tonal layering and crisp low-contrast outline system** to preserve operational clarity under bright campus and lobby lighting:

- **Base Layer:** `#F8FAFC` background provides a soft, glare-free canvas.
- **Surface Layer (Cards, Table Containers):** `#FFFFFF` bounded by a 1px solid border in `#E2E8F0`. 
- **Elevation 1 (Resting Cards & Filters):** Shadow: `0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Elevation 2 (Dropdowns, Popovers, Active Hover):** Shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Elevation 3 (Modals, Room Reassignment Drawers):** Shadow: `0 12px 24px -4px rgba(15, 23, 42, 0.12), 0 4px 6px -2px rgba(15, 23, 42, 0.04)`.
- **Scrim Overlay:** Hex `#0F172A` at 40% opacity with a 2px backdrop blur.

## Shapes

The interface adopts a **Soft (`1`)** shape language (`0.25rem` / `4px` base radius, `0.5rem` / `8px` for containers and cards). 

This delivers clean geometric order suited for multi-row data grids and dense inputs, avoiding casual or overly rounded silhouettes while softening harsh industrial edges. Full pill styling is strictly limited to status badges and indicator dots.

## Components

### Buttons
- **Primary:** Background `#B45309` (hover: `#92400E`), text `#FFFFFF`, border-radius 6px. Focused with a 2px saffron outline offset by 2px.
- **Secondary:** Surface `#FFFFFF`, border 1px solid `#CBD5E1`, text `#1E293B` (hover: `#F8FAFC`).
- **Destructive / Urgent:** Background `#E11D48`, text `#FFFFFF` (hover: `#BE123C`).

### Status Badges & Chips
- Compact pills (height: 22px, padding: 0 8px, font: `label-sm`, full rounded `9999px`).
- **Confirmed / Ready:** Background `#ECFDF5`, text `#065F46`, border 1px solid `#A7F3D0`.
- **In-Transit / Pending:** Background `#FFFBEB`, text `#92400E`, border 1px solid `#FDE68A`.
- **Linen Refresh / Priority:** Background `#FFF1F2`, text `#9F1239`, border 1px solid `#FECDD3`.

### Operational Data Tables
- Header row: Background `#F8FAFC`, bottom border 1px solid `#CBD5E1`, text `#64748B` (`label-sm`, uppercase).
- Body rows: Minimum height 44px, alternating hover state `#F1F5F9`, border-bottom 1px solid `#E2E8F0`.
- High-priority cells (room status, vehicle pickup) use inline badges with 6px status dots.

### Input Fields & Select Menus
- Base height 38px, background `#FFFFFF`, border 1px solid `#CBD5E1`, border-radius 6px, padding `0 12px`.
- Focus state: Border color `#B45309`, box-shadow `0 0 0 1px #B45309`.
- Search bars include an inline search icon (`#94A3B8`) and clear trigger.

### Metric KPI Cards
- Modular cards with a 1px solid `#E2E8F0` border and 8px border-radius.
- Top section: Subtitle in `label-md` (`#64748B`) paired with a contextual micro-icon.
- Center: Key figure in `headline-lg` (`#0F172A`), followed by delta pills (e.g., "+18 arriving before 14:00").

### Departmental Tabs
- Underline tab pattern: `#1E293B` default text. Active tab marked with a 2px bottom border in `#B45309` and bold text. Includes count chips (e.g., "Samarpan Onsite (142)").