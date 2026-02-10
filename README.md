# StoreShot

**App Store screenshot resizer** — Prepare App Store and Google Play screenshots. Resize, add device frames, and export in WebP, JPG, or PNG.

All processing happens in your browser. **Nothing is uploaded or stored.**

<img width="1674" height="830" alt="StoreShot – Upload and resize" src="https://github.com/user-attachments/assets/fd91d6b6-d104-4bf7-af2f-9809c971d587" />

<img width="1413" height="794" alt="StoreShot – Resize settings" src="https://github.com/user-attachments/assets/235f6747-1edb-4d85-b973-8e6e73138c99" />

<img width="1510" height="800" alt="StoreShot – Preview and download" src="https://github.com/user-attachments/assets/7ca204d9-8168-4e1f-8e3a-55da5e7cca4b" />

## Features

- Upload single or multiple images (batch processing)
- Preset sizes for iPhone, iPad, and Android (App Store & Google Play)
- Custom dimensions
- **Fill** (crop) or **Fit** (letterbox) modes with background options (transparent, solid, gradient)
- Device frames: iPhone, iPad, Android
- Zoom (80%–120%)
- Output formats: WebP, JPG, PNG with quality control
- Batch download as ZIP
- Clear all filters to reset settings

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deploy

The easiest way to deploy is with [Vercel](https://vercel.com):

```bash
npm run build
```

Then deploy this repo to Vercel or any Next.js host (no root directory needed).

## Tech

- [Next.js](https://nextjs.org)
- [JSZip](https://stuk.github.io/jszip/) for batch ZIP export
