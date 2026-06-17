# PDFTools 🛠️

A premium, open-source, multi-module document utilities platform built with Svelte 5 and Tailwind CSS v4. Designed for speed, SEO excellence, and 100% private client-side file processing.


[![Built with Svelte 5](https://img.shields.io/badge/Svelte-5-orange.svg?style=flat&logo=svelte)](https://svelte.dev)
[![Styled with Tailwind v4](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg?style=flat&logo=tailwindcss)](https://tailwindcss.com)
[![Package Manager: Bun](https://img.shields.io/badge/Package_Manager-Bun-fbf0e9.svg?style=flat&logo=bun)](https://bun.sh)

---

## 🔒 Security & Privacy Philosophy

Unlike traditional document converters that upload your confidential files to remote servers, **PDFTools operates 100% client-side**. 

* **No Server Uploads**: File processing, text extraction, page rendering, and PDF splitting occur entirely inside your browser's local sandbox memory.
* **Completely Private**: Your certificates, invoices, and sensitive documents never touch a network connection or external database.
* **Offline Capable**: Once loaded, you can disconnect your internet completely and process hundreds of files locally.

---

## 📦 Module Highlight: PDF Certificate Splitter & Renamer

The first core utility in PDFTools is the **PDF Certificate Splitter**. It is designed to take a large, compiled certificate PDF (e.g., from a webinar, workshop, or course) and automatically separate it into individual files named after each recipient.

### Core Features:
* **Instant Name Detection**: Scans the text structure of the document to locate participant names dynamically.
* **Visual Document Workbench**: Inspect text strings or toggle over to the **Visual Page Preview** featuring zoom controls (50% to 200%) and fit overlays to inspect text placement on actual pages.
* **Local ZIP Generation**: Packages all split, custom-named certificates into a compressed `.zip` archive instantly.
* **Developer Terminal Console**: Outputs colored runtime execution logs in real-time.

---

## 🛠️ Technical Architecture & Stack

* **UI Engine**: [Svelte 5](https://svelte.dev) (Runes mode for lightning-fast reactive state management).
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (Vibrant Royal Blue and Amber/Gold colors, custom interactive shadow-glows, technical dot-grid canvas themes, and CSS animations).
* **Language Support (i18n)**: Fully reactive local localization router prefixing pages with standard locales `/en` and `/id`.
* **SEO Optimizations**: Highly semantic HTML structure with dynamic OpenGraph meta configuration and structured JSON-LD `WebApplication` schemas injected inside `<svelte:head>`.
* **Prerendering**: Structured static site generation (SSG) configurations pre-rendering dynamic routes for SEO crawl bots.
* **PDF Operations**:
  - `pdfjs-dist` (version 6.0.227) for local client-side text layer parse operations and canvas rendering.
  - `pdf-lib` for document extraction, copying page buffers, and saving new sub-PDF streams.
* **Archiving**: `jszip` for client-side multi-file ZIP compression.
* **Package Management**: Managed with [Bun](https://bun.sh) package manager.

---

## 🚀 Getting Started

Ensure you have [Bun](https://bun.sh) installed.

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd pdftools
bun install
```

### 2. Run the Development Server
```bash
bun run dev
# Starts Vite on local port (default: http://localhost:5173/ or config override)
```

### 3. Check types & Code Quality
```bash
bun run check
```

### 4. Compile Production build
```bash
bun run build
# Compiles SvelteKit routes and pre-renders static HTML pages for deployment
```

---

## 🗺️ Roadmap & Upcoming Modules

We are designing PDFTools to grow into an open-source hub of document utilities. Future modules include:
- [ ] **PDF Merge**: Combine multiple individual PDF documents in custom or chronological order.
- [ ] **PDF Compressor**: Reduce file sizes locally without losing text sharpness or vector fidelity.
- [ ] **PDF Image Extractor**: Extract, download, and zip all raster image assets from inside PDF pages.
- [ ] **Encrypt / Decrypt PDF**: Locally password-protect files or remove encryption layers.

---


