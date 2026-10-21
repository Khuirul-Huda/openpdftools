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

## 📦 Modules & Capabilities

### 1. PDF Certificate Splitter & Renamer
Automatically split a bulk certificate PDF into individual files named after each recipient.
* **Instant Name Detection**: Scans the text structure of the document to locate participant names dynamically.
* **Visual Document Workbench**: Visual preview with zoom controls (50% to 200%) to inspect text placement.
* **Local ZIP Generation**: Packages all split, custom-named certificates into a compressed `.zip` archive.

### 2. Split PDF by Range
Extract specific page ranges or extract all pages into separate files.
* **Flexible Modes**: Specify custom ranges (e.g. `1-3, 5, 8-10`) or extract every page into individual 1-page documents.
* **Merge Option**: Optionally combine all chosen ranges into one continuous output document.
* **Smart Downloads**: Automatically downloads single PDF for single range, or packages multiple parts into a `.zip` archive.

### 3. PDF Merge
Combine multiple individual PDF documents into a single document with custom ordering.
* **Interactive Ordering**: Drag or use up/down controls to arrange documents in the exact order desired.
* **Live Thumbnails**: Instant client-side page 1 preview for each uploaded document.
* **Metadata & Custom Output**: Define output file name and auto-aggregate page counts.

### 3. PDF Compressor
Reduce PDF file sizes locally without uploading sensitive files to cloud servers.
* **3 Preset Levels**: Extreme (72 DPI, high reduction), Recommended (130 DPI, balanced), and Light (200 DPI, crisp).
* **Before/After Analysis**: Real-time display of original size, compressed size, and savings percentage badge.
* **100% Private**: Browser canvas rasterization and re-encoding with zero network transmission.

### 4. PDF to Images
Convert multi-page PDF documents into high-resolution JPG or PNG image files.
* **Format & DPI Options**: Choose JPG or PNG with Standard (150 DPI) or High (300 DPI) resolution.
* **Flexible Download**: Download individual page images or package everything into a single ZIP archive.

### 5. Images to PDF
Transform multiple photo scans and digital images into a formatted PDF document.
* **Multi-format Support**: Upload JPG, PNG, and WebP images.
* **Custom Layouts**: Select paper sizes (A4, US Letter, Fit to Image), orientations (Auto, Portrait, Landscape), and margins.
* **Interactive Sequence**: Reorder pictures freely before compiling the PDF document.

### 6. Rotate & Organize Pages
Visually inspect, reorder, rotate, and delete pages from any PDF document.
* **Interactive Grid**: Thumbnails for every page with CSS-rendered rotation feedback.
* **Reorder & Purge**: Move pages forward/backward or delete unwanted/blank pages.
* **Bulk Rotation**: Rotate individual pages or all pages at once in 90-degree increments.

### 7. Page Numbers & Watermark
Stamp official confidential watermarks and customized page numbers onto documents.
* **Dual Feature Controls**: Apply page numbers, watermarks, or both simultaneously.
* **Full Customization**: Control positions, text content, opacity, font size, colors, and diagonal rotation.
* **Vector Text Embedding**: Uses standard Helvetica typography embedded directly in browser memory.

---

## 🛠️ Technical Architecture & Stack

* **UI Engine**: [Svelte 5](https://svelte.dev) (Runes mode for lightning-fast reactive state management).
* **Styling**: [Tailwind CSS v4](https://tailwindcss.com) (Vibrant Royal Blue and Amber/Gold colors, custom interactive shadow-glows, technical dot-grid canvas themes, and CSS animations).
* **Language Support (i18n)**: Fully reactive local localization router prefixing pages with standard locales `/en` and `/id`.
* **SEO Optimizations**: Highly semantic HTML structure with dynamic OpenGraph meta configuration and structured JSON-LD `WebApplication` schemas injected inside `<svelte:head>`.
* **Prerendering**: Structured static site generation (SSG) configurations pre-rendering dynamic routes for SEO crawl bots.
* **PDF Operations**:
  - `pdfjs-dist` (version 6.0.227) for local client-side text layer parse operations and canvas rendering.
  - `pdf-lib` for document extraction, copying page buffers, merging, and compression.
* **Archiving**: `jszip` for client-side multi-file ZIP compression.
* **Package Management**: Managed with [Bun](https://bun.sh) package manager.

---

## 🚀 Getting Started

Ensure you have [Bun](https://bun.sh) installed.

### 1. Clone & Install Dependencies
```bash
git clone <repository-url>
cd openpdftools
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

We are designing PDFTools to grow into a complete open-source, client-side alternative to services like iLovePDF.

- [x] **PDF Certificate Splitter & Renamer** (Completed)
- [x] **Split PDF by Range** (Completed)
- [x] **PDF Merge** (Completed)
- [x] **PDF Compressor** (Completed)
- [x] **PDF to Images / Image Extractor** (Completed)
- [x] **Images to PDF** (Completed)
- [x] **Rotate & Organize Pages** (Completed)
- [x] **Page Numbers & Watermark** (Completed)

---


