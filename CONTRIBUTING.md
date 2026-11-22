# Contributing to BhumiMap

Thank you for considering contributing to this open-source offline land area calculator!

## Core Principles

Before proposing changes, please keep these non-negotiable project principles in mind:

1. **Offline & Privacy-First**: Never introduce external telemetry, analytics, remote API calls, or cloud uploads for user measurement data. All calculations, storage, and exports must run 100% locally on the user's device.
2. **Mathematical Accuracy**: Geometry changes must preserve exact Heron triangulation, Law of Cosines vertex reconstruction, and statutory Bangladeshi conversion constants (`435.6 sq ft/Shotok`, `720 sq ft/Katha`, `14,400 sq ft/Bigha`).
3. **Mobile Field Usability**: Many users measure plots outdoors on smartphones. Maintain large touch targets (`>= 44px`), high daylight contrast, and crisp bilingual readability (English and বাংলা).

## Local Development Workflow

```bash
npm install
npm run dev
```

Before submitting a pull request, verify all checks pass:

```bash
npm run lint
npm test
npm run build
```

## Ways to Contribute

- **Bug Fixes**: Reproducible edge cases in quadrilateral geometry, diagram label placement, or print formatting.
- **Bengali Localization**: Improving natural Bengali surveying terminology (*Amin* usage across regions).
- **Testing**: Adding geometric edge-case tests in `src/lib/__tests__/`.
- **Accessibility & Mobile UX**: Improving keyboard flows, screen-reader labels, and small-screen ergonomics.

## Pull Request Guidelines

- Keep pull requests focused on a single feature or fix.
- Add or update unit tests in `src/lib/__tests__/` whenever modifying `src/lib/geometry.ts` or `src/lib/units.ts`.
- Verify both English (`EN`) and Bengali (`বাংলা`) layouts as well as mobile (~375px) and desktop (~1440px) viewports.
