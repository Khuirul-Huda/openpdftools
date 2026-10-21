// Shared PDF utility helpers for 100% client-side operations

export interface PdfJsTextItem {
	str: string;
}

export interface PdfJsPage {
	getViewport: (options: { scale: number }) => { width: number; height: number };
	render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
	getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
}

export interface PdfJsDocument {
	numPages: number;
	getPage: (pageNum: number) => Promise<PdfJsPage>;
	destroy: () => Promise<void>;
}

export interface PdfJsModule {
	GlobalWorkerOptions: { workerSrc: string | null };
	getDocument: (options: { data: ArrayBuffer | Uint8Array }) => { promise: Promise<PdfJsDocument> };
}

export interface PdfLibPage {
	getWidth: () => number;
	getHeight: () => number;
	getRotation: () => { angle: number };
	setRotation: (angle: unknown) => void;
	drawText: (text: string, options?: Record<string, unknown>) => void;
}

export interface PdfLibDocument {
	getPageCount: () => number;
	getPage: (index: number) => PdfLibPage;
	getPages: () => PdfLibPage[];
	copyPages: (srcDoc: PdfLibDocument, pageIndexes: number[]) => Promise<PdfLibPage[]>;
	addPage: (page?: PdfLibPage | [number, number]) => PdfLibPage;
	removePage: (index: number) => void;
	save: () => Promise<Uint8Array>;
	setTitle?: (title: string) => void;
	setProducer?: (producer: string) => void;
	setCreator?: (creator: string) => void;
	embedFont: (font: unknown) => Promise<unknown>;
	embedPng: (bytes: Uint8Array) => Promise<{ width: number; height: number }>;
	embedJpg: (bytes: Uint8Array) => Promise<{ width: number; height: number }>;
}

export interface PdfLibModule {
	degrees: (deg: number) => unknown;
	rgb: (r: number, g: number, b: number) => unknown;
	StandardFonts: {
		Helvetica: string;
		HelveticaBold: string;
		TimesRoman: string;
		Courier: string;
	};
	PDFDocument: {
		create: () => Promise<PdfLibDocument>;
		load: (data: ArrayBuffer | Uint8Array, options?: { ignoreEncryption?: boolean }) => Promise<PdfLibDocument>;
	};
}

let cachedPdfJs: PdfJsModule | null = null;
let cachedPdfLib: PdfLibModule | null = null;
let cachedJSZip: JSZipConstructor | null = null;

export interface JSZipInstance {
	file: (name: string, data: Uint8Array | Blob | ArrayBuffer) => void;
	generateAsync: (options: { type: 'blob' }, onUpdate?: (metadata: { percent: number }) => void) => Promise<Blob>;
}

export type JSZipConstructor = new () => JSZipInstance;

export async function getJSZip(): Promise<JSZipConstructor> {
	if (cachedJSZip) return cachedJSZip;
	const jszipModule = await import('jszip');
	const ctor = (jszipModule.default || jszipModule) as unknown as JSZipConstructor;
	cachedJSZip = ctor;
	return ctor;
}

export async function getPdfJs(): Promise<PdfJsModule> {
	if (cachedPdfJs) return cachedPdfJs;
	const pdfjs = (await import('pdfjs-dist')) as unknown as PdfJsModule;
	const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
	pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;
	cachedPdfJs = pdfjs;
	return pdfjs;
}

export async function getPdfLib(): Promise<PdfLibModule> {
	if (cachedPdfLib) return cachedPdfLib;
	const pdfLib = (await import('pdf-lib')) as unknown as PdfLibModule;
	cachedPdfLib = pdfLib;
	return pdfLib;
}

export function parsePageRanges(rangeStr: string, maxPages: number): number[][] {
	const parts = rangeStr.split(',').map((s) => s.trim()).filter(Boolean);
	const result: number[][] = [];
	for (const part of parts) {
		if (part.includes('-')) {
			const [startStr, endStr] = part.split('-').map((s) => s.trim());
			const start = parseInt(startStr, 10);
			const end = parseInt(endStr, 10);
			if (!isNaN(start) && !isNaN(end) && start > 0 && end >= start) {
				const range: number[] = [];
				for (let i = Math.max(1, start); i <= Math.min(maxPages, end); i++) {
					range.push(i - 1); // 0-based
				}
				if (range.length > 0) result.push(range);
			}
		} else {
			const num = parseInt(part, 10);
			if (!isNaN(num) && num > 0 && num <= maxPages) {
				result.push([num - 1]);
			}
		}
	}
	return result;
}

export function formatBytes(bytes: number, decimals = 1): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function generateThumbnail(data: ArrayBuffer | Uint8Array, pageNum = 1, maxWidth = 180): Promise<string> {
	try {
		const pdfjs = await getPdfJs();
		const doc = await pdfjs.getDocument({ data }).promise;
		const page = await doc.getPage(pageNum);
		const unscaledViewport = page.getViewport({ scale: 1 });
		const scale = maxWidth / unscaledViewport.width;
		const viewport = page.getViewport({ scale });

		const canvas = document.createElement('canvas');
		canvas.width = Math.floor(viewport.width);
		canvas.height = Math.floor(viewport.height);
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			await doc.destroy();
			return '';
		}

		await page.render({ canvasContext: ctx, viewport }).promise;
		const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
		await doc.destroy();
		return dataUrl;
	} catch (e) {
		console.warn('Failed to generate thumbnail:', e);
		return '';
	}
}
