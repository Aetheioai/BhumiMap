# BhumiMap (ভূমিমাপ)

**English** · [বাংলা (README.bn.md)](README.bn.md)

**Live App:** [https://aetheioai.github.io/BhumiMap/](https://aetheioai.github.io/BhumiMap/)

An offline, privacy-first Bangladeshi land (*jomi*) area calculator and scaled survey diagram generator for irregular four-sided plots.

Built for landowners, surveyors (*Amin*), and families who want fast, exact land calculations in **Shotok (শতক)**, **Katha (কাঠা)**, **Bigha (বিঘা)**, and **Square Feet (বর্গফুট)** directly on their phone or computer — without uploading sensitive property measurements to any server.

## Try It Online or Offline (PWA)

Open **[aetheioai.github.io/BhumiMap](https://aetheioai.github.io/BhumiMap/)** in Chrome, Edge, or Safari and tap **Install** (*Add to Home Screen* on iOS) to use BhumiMap completely offline in the field with no internet connection.

## Features

- **Exact Quadrilateral Area (Heron Triangulation)**: Enter all four boundary sides (`A–B`, `B–C`, `C–D`, `D–A`) and either diagonal (`A–C` or `B–D`) to split the plot into two exact triangles. Supports both standard convex plots and concave (re-entrant) plots, with automatic triangle inequality validation and exact valid diagonal bounds.
- **Bangladeshi Statutory Land Units**: Instant conversion into **Shotok**, **Katha**, **Bigha**, **Square Feet**, **Acre**, **Square Meters**, **Chotak**, and **Ojutangsho**, plus traditional `Bigha · Katha · Chotak` breakdown.
- **Flexible Length Inputs**: Measure in **Decimal Feet (`ft`)**, **Feet & Inches (`ft & in`)**, **Meters (`m`)**, **Gunter's Links (`links`)**, or **Haat / Cubits (`haat`)** with seamless unit conversion.
- **Scaled Vector Survey Diagram**: Automatically reconstructs exact 2D vertex coordinates, interior corner angles, outward dimension callouts, triangulation split, dynamic scale bar, and rotatable North compass bearing.
- **Local Print & Share**: Print a clean single-page A4 survey sheet, download high-resolution **PNG** or **Vector SVG** diagrams, share via the device share sheet, or copy a formatted summary for WhatsApp/SMS.
- **100% Offline & Privacy-First**: Installable Progressive Web App (PWA) with service worker caching. Saved plots stay exclusively inside browser `localStorage` with local JSON backup/restore. Zero backend, zero tracking, zero analytics.
- **Bilingual UI**: Switch instantly between **English** and **বাংলা (Bengali)**.

## Mathematical Basis & Statutory Units

An irregular four-sided plot does not have a unique area from its four sides alone. Measuring one diagonal rigidly divides the quadrilateral into two triangles, each solved exactly via Heron's formula:

$$s = \frac{a + b + c}{2}, \qquad \text{Area} = \sqrt{s(s - a)(s - b)(s - c)}$$

Official Bangladesh statutory conversion factors used throughout the app:

| Unit | Bengali | Exact Equivalent |
| --- | --- | --- |
| 1 Shotok (Decimal) | ১ শতক / শতাংশ | `435.6 sq ft` (`1/100 Acre`) |
| 1 Katha | ১ কাঠা | `720 sq ft` (`16 Chotak`) |
| 1 Bigha | ১ বিঘা | `14,400 sq ft` (`20 Katha`) |
| 1 Acre | ১ একর | `43,560 sq ft` (`100 Shotok`) |
| 1 Chotak | ১ ছটাক | `45 sq ft` (`1/16 Katha`) |
| 1 Ojutangsho | ১ অযুতাংশ | `4.356 sq ft` (`1/100 Shotok`) |
| 1 Gunter's Link | ১ লিংক | `0.66 ft` (`100 Links = 66 ft Chain`) |
| 1 Haat (Cubit) | ১ হাত | `1.5 ft` (`18 inches`) |

## Getting Started

### Prerequisites

- Node.js `>= 20`
- npm `>= 10`

### Local Development

```bash
# Install dependencies
npm install

# Start development server on http://localhost:3000
npm run dev
```

### Verification & Production Build

```bash
# Type-check with TypeScript
npm run lint

# Run unit tests for geometry solver and Bangladeshi unit conversions
npm test

# Build optimized offline-ready production bundle
npm run build
```

## Project Structure

```text
src/
├── App.tsx                       # Main responsive workspace & state orchestration
├── main.tsx                      # Entry point & PWA service worker registration
├── index.css                     # Tailwind CSS v4 theme & A4 @media print rules
├── hooks/
│   └── usePWAInstall.ts          # PWA install prompt & offline connectivity hooks
├── components/
│   ├── PlotDiagram.tsx           # Interactive scaled SVG survey diagram
│   ├── MiniPlotGuide.tsx         # Mobile-friendly live boundary guide
│   ├── PrintSheet.tsx            # Dedicated single-page A4 print layout
│   ├── ShareExportModal.tsx      # Responsive bottom-sheet / modal for Print, PNG, SVG & Share
│   ├── SavedPlotsView.tsx        # Local-only saved plots & JSON backup manager
│   ├── UnitReferenceView.tsx     # Instant area unit converter & statutory table
│   └── PWAControls.tsx           # Install prompt button & offline indicator
└── lib/
    ├── geometry.ts               # Exact Heron solver, Law of Cosines & coordinate projection
    ├── units.ts                  # Bangladeshi area & length unit conversions
    ├── exportDiagram.ts          # Standalone SVG generator, offscreen PNG rasterizer & share text
    ├── i18n.ts                   # English & Bengali translations
    ├── storage.ts                # LocalStorage persistence & sample presets
    └── __tests__/
        └── geometry.test.ts      # Automated geometry & unit conversion tests
```

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security & Privacy

This application executes 100% locally in the browser and transmits no user measurements to any external server. See [SECURITY.md](SECURITY.md) for details.

## License

Licensed under the [MIT License](LICENSE).
