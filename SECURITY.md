# Security & Privacy Policy

## Privacy Architecture

BhumiMap is designed as a strictly **offline, local-first** web application:

- All land boundary calculations, SVG/PNG rendering, and print formatting execute entirely inside the user's browser.
- Saved plots are stored exclusively in browser `localStorage` on the user's device and are never transmitted to any server.
- No analytics, trackers, or third-party measurement endpoints are used.

## Reporting a Vulnerability

If you discover a security issue (for example, an XSS vector in SVG export or JSON backup import), please report it responsibly by opening a private security advisory on the repository or contacting the maintainers directly before public disclosure.

Please include:
- A concise description of the issue and potential impact.
- Steps to reproduce or a minimal proof-of-concept.
