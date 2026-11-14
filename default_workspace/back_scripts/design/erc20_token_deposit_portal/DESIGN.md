---
name: Decentralized Liquidity & Vault Protocol
colors:
  surface: '#0c1322'
  surface-dim: '#0c1322'
  surface-bright: '#323949'
  surface-container-lowest: '#070e1d'
  surface-container-low: '#141b2b'
  surface-container: '#191f2f'
  surface-container-high: '#232a3a'
  surface-container-highest: '#2e3545'
  on-surface: '#dce2f7'
  on-surface-variant: '#bcc9cd'
  inverse-surface: '#dce2f7'
  inverse-on-surface: '#293040'
  outline: '#869397'
  outline-variant: '#3d494c'
  surface-tint: '#4cd7f6'
  primary: '#4cd7f6'
  on-primary: '#003640'
  primary-container: '#06b6d4'
  on-primary-container: '#00424f'
  inverse-primary: '#00687a'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#adc6ff'
  on-tertiary: '#002e6a'
  tertiary-container: '#78a5ff'
  on-tertiary-container: '#00397f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#acedff'
  primary-fixed-dim: '#4cd7f6'
  on-primary-fixed: '#001f26'
  on-primary-fixed-variant: '#004e5c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#0c1322'
  on-background: '#dce2f7'
  surface-variant: '#2e3545'
typography:
  display:
    fontFamily: Sora
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Sora
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Sora
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Sora
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.005em
  headline-sm:
    fontFamily: Sora
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
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
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  numeric-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  numeric-md:
    fontFamily: JetBrains Mono
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 22px
  numeric-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an institutional-grade decentralized finance interface tailored for cross-chain liquidity vaults, staking mechanisms, and ERC-20 smart contract interactions. It targets crypto-native traders, liquidity providers, and treasury operators who prioritize transaction clarity, gas efficiency, and absolute execution confidence over decorative hype.

The visual aesthetic balances dark-mode technological sophistication with surgical clarity. Borrowing principles from modern financial terminals and atmospheric glassmorphism, the interface prioritizes high signal-to-noise ratios. Frosted translucent surfaces sit quietly above an inky, cosmic slate backdrop, allowing glowing neon status indicators and high-contrast typography to guide users effortlessly through state-critical actions like multi-step allowance approvals, slippage tolerances, and balance confirmations.

## Colors

The palette is engineered specifically for dark-mode clarity and rapid cognitive parsing under high financial volatility:

- **Canvas & Surfaces**: The base canvas is anchored at `#0B0F19` (Obsidian Void), layered with container surfaces using `#111827` (Slate Surface) and elevated module cards using `rgba(17, 24, 39, 0.75)` with backdrop blurs.
- **Accents & Signals**:
  - `Primary (#06B6D4 - Electric Cyan)`: Designates system actions, interactive selections, active tab highlights, and primary flow paths.
  - `Secondary (#10B981 - Emerald State)`: Reserved strictly for successful transaction receipts, yield/APR metrics, confirmation states, and positive delta values.
  - `Tertiary (#3B82F6 - Cobalt Flow)`: Used for protocol connectivity, secondary informational badges, network indicators (e.g., Arbitrum/Ethereum L1), and pending batch operations.
- **Status & Alerts**:
  - Amber (`#F59E0B`): Pending mempool broadcast, approval warnings, and price impact alerts.
  - Rose (`#EF4444`): Reverted transactions, slippage failures, and insufficient gas.
- **Typography & Structural Contrast**: Primary data and headlines render in `#F9FAFB` (Pure High-White). Secondary metadata, token tickers, and passive labels use `#9CA3AF` (Muted Steel). Borders and dividing axes utilize sharp, translucent strokes at `rgba(255, 255, 255, 0.08)`.

## Typography

The typographic hierarchy solves the distinct challenges of decentralized applications: human readability for conversational flows, and unyielding precision for numerical values.

- **Headlines (Sora)**: Geometric, confident, and distinctly modern. Used across modal titles, deposit panel headers, and core vault valuations.
- **Interface & Explanatory Text (Inter)**: Highly neutral and optimized for dense screen environments. Handles tooltips, transaction breakdown labels, and protocol disclaimers without distracting from data.
- **Cryptographic & Financial Quantities (JetBrains Mono)**: Mandatory for all hex addresses (`0x...`), token quantities, gas estimates, transaction hashes, and APY rates. The monospaced cadence prevents layout jitter when values re-render live from RPC blocks.

## Layout & Spacing

The system implements a centralized fluid-column architecture bounded by a max-width container to retain ergonomic spatial constraints:

- **Desktop (1024px and up)**: Centralized 12-column grid or single centered 480px / 560px interaction chassis (ideal for token swap and vault deposit widgets). Outer margin: `2rem`. Column gutters: `1.5rem`.
- **Tablet (768px - 1023px)**: 8-column layout. Outer margin: `1.5rem`. Gutters: `1rem`. Secondary telemetry stacks vertically beneath the primary deposit apparatus.
- **Mobile (< 768px)**: 4-column layout with fixed `1rem` edge margins. Input fields, token selectors, and multi-step action bars stretch across full canvas width, adhering to bottom-anchored mobile interaction conventions.

## Elevation & Depth

Visual plane differentiation relies on a hybrid of frosted glassmorphism, structured surface tiers, and calibrated ambient illumination:

- **Base Layer (L0)**: Background `#0B0F19`, occasionally textured with faint radial gradients of deep cyan (`rgba(6, 182, 212, 0.05)`) placed at screen corners to imply depth.
- **Container Panel (L1)**: Solid Slate `#111827` with a structural `1px` outer stroke of `rgba(255, 255, 255, 0.05)`.
- **Glass Vault Surface (L2)**: Semi-transparent fill (`rgba(17, 24, 39, 0.70)`) with `backdrop-filter: blur(16px)` and a crisp perimeter border `rgba(255, 255, 255, 0.08)`.
- **Hover & Active Popovers (L3)**: Modals and dropdown menus elevate with `rgba(15, 23, 42, 0.90)`, `backdrop-filter: blur(24px)`, and an ambient shadow: `0 20px 40px -15px rgba(0, 0, 0, 0.60), 0 0 1px 1px rgba(6, 182, 212, 0.20)`.
- **Light Source & Glows**: Active states (such as a pending wallet sign or success notification) emit subtle radial outer halos (`box-shadow: 0 0 24px rgba(16, 185, 129, 0.15)` for green, or cyan equivalent) without creating muddy visual artifacts.

## Shapes

The design uses a refined curvature profile. Primary interaction cards and deposit modules strictly adhere to `rounded-2xl` (16px / 1rem radius) to deliver a soft, contemporary silhouette that tempers the technical density of the UI.

Internal micro-elements follow a strict hierarchy:
- Primary Modules & Glass Cards: `1rem` (`rounded-2xl`).
- Inputs, Token Select Trigger Panels, and Buttons: `0.75rem` (`rounded-xl`).
- Small Status Chips, Badges, and Pill Toggles: Full circular encapsulation (`9999px`).

## Components

### Deposit & Allowance Action Buttons (Two-Step Flow)
- **Architecture**: A partitioned dual-action container or an adaptive stateful button.
  - **State 1 (Allowance Required)**: Left side shows "Step 1: Approve [Token]" (Primary Cyan Glow, solid fill `#06B6D4`, text `#0B0F19` bold). Right side shows "Step 2: Deposit" in a disabled, ghosted slate state (`rgba(255, 255, 255, 0.05)` fill, `#9CA3AF` text).
  - **State 1 (Pending Confirmation)**: Step 1 shows an indeterminate pulsating micro-spinner with `JetBrains Mono` label "Approving...".
  - **State 2 (Approved)**: Step 1 transforms into a completed icon (checkmark in `#10B981`) and Step 2 unlocks dynamically into the vibrant actionable state.
  - **Default Single Action**: High-contrast solid Cyan (`#06B6D4`) with instant hover glow (`box-shadow: 0 0 18px rgba(6, 182, 212, 0.4)`).

### Cards & Glass Vault Panels
- Built with `rgba(17, 24, 39, 0.70)`, `16px` backdrop blur, and `1px` border using `rgba(255, 255, 255, 0.08)`.
- Card headers feature clean vertical alignment: Token Pair icon stack on the left, slippage setting and gas priority icon triggers on the right.

### Input Fields (Token Amount Input)
- Surface: Recessed dark container (`#080C14`) with a soft inner shadow and subtle `rgba(255, 255, 255, 0.04)` border.
- Elements: Large numerical entry font (`numeric-lg`, JetBrains Mono), accompanied by a "MAX" pill toggle (`#06B6D4` outline) and a dropdown token selector pill displaying the token symbol and network badge.
- Active Focus: Stroke shifts to `#06B6D4` with `0 0 0 1px #06B6D4`.

### Status Badges & Chips
- Form factor: Compact height (`24px`), horizontal padding (`8px`), full pill shape (`rounded-full`), `numeric-sm` font.
- **Approved / Confirmed**: Emerald background tint (`rgba(16, 185, 129, 0.12)`), text `#10B981`, with a `6px` solid emerald status dot.
- **Pending**: Amber background tint (`rgba(245, 158, 11, 0.12)`), text `#F59E0B`, paired with a CSS pulse dot.
- **Informational / Route**: Blue background tint (`rgba(59, 130, 246, 0.12)`), text `#60A5FA`.

### Address & Hash Identifiers
- Form factor: Enclosed in a compact pill (`#111827`) with `1px` border (`rgba(255, 255, 255, 0.06)`).
- Truncated display: `0x71C...4982` in `JetBrains Mono` with an inline hover-to-copy trigger and instant visual feedback ("Copied!" tooltip).

### Lists & Breakdown Rows
- Clean border-delimited rows with `1px` border-bottom `rgba(255, 255, 255, 0.04)`.
- Key labels rendered in muted steel (`#9CA3AF`, `body-sm`), values rendered in crisp pure white (`#F9FAFB`, `numeric-sm`), with secondary USD estimates in muted parentheticals.