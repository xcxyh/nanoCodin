# Landing Page Design

Marketing site for Nano Codin with editorial pacing and a CLI-native visual language.

## Dependencies
- New standalone app in `frontend/`
- Vite + React + TypeScript
- Static content only. No backend dependency
- References product positioning from `README.md` and `README.zh-CN.md`

## Goals
- Explain what Nano Codin is within the first viewport
- Drive GitHub visits and stars
- Present the project as a calm, experimental, production-minded coding tool
- Blend manifesto tone with concrete product proof

## Audience
- Developers exploring coding agents
- Open-source users deciding whether to star or try the project
- Builders who care about terminal workflows, control, and architecture

## Visual Thesis
- Poster-like first viewport
- Editorial typography with serif + mono pairing
- Sparse composition, large copy, long vertical rhythm
- Dark atmospheric background with warm highlights
- Terminal artifact as proof, not as dashboard clutter

## Content Plan
- Hero: product name, one-line promise, GitHub CTA, install command
- Manifesto: why terminal-native coding matters
- Proof: terminal scene and short narrative about agent flow
- Features: focused list of technical advantages
- Install: simple start path
- Final CTA: GitHub star / explore repository

## API
- `App`
  - Owns language state (`en` default, `zh` optional)
  - Renders all sections from local content objects
- `LanguageToggle`
  - Switches between English and Chinese copy
- `RevealSection`
  - Adds intersection-based section reveal
- `TerminalFrame`
  - Shows CLI-style proof snippet and flow markers

## Interaction
- Soft hero entrance on load
- Scroll reveal for long-form sections
- Subtle hover treatment on CTA and feature rows
- Sticky language toggle only on larger screens

## Content Rules
- Brand first
- Keep hero copy short
- Each section has one job
- Feature list must stay concrete and technical
- Avoid generic AI marketing claims

## Error Handling
- No runtime data fetching
- If intersection observer is unavailable, sections stay visible
- Language toggle falls back to English strings

## Constraints
- Keep the app static and easy to deploy
- Keep public repo and CLI messaging consistent with existing README
- Avoid card-heavy SaaS layout patterns
