<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { resolveRoute } from '$app/paths';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import { Info, FileText, Eye, Download, X } from '@lucide/svelte';

	// Svelte 5 & TypeScript specific interfaces for typing libraries safely without using 'any'
	interface PdfJsTextItem {
		str: string;
	}

	interface PdfJsPage {
		getViewport: (options: { scale: number }) => { width: number; height: number };
		render: (options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
		getTextContent: () => Promise<{ items: PdfJsTextItem[] }>;
	}

	interface PdfJsDocument {
		getPage: (pageNum: number) => Promise<PdfJsPage>;
	}

	interface PdfJsModule {
		GlobalWorkerOptions: { workerSrc: string | null };
		getDocument: (options: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
	}

	type PdfLibPage = unknown;

	interface PdfLibDocument {
		getPageCount: () => number;
		copyPages: (srcDoc: PdfLibDocument, pageIndexes: number[]) => Promise<PdfLibPage[]>;
		addPage: (page: PdfLibPage) => void;
		save: () => Promise<Uint8Array>;
	}

	interface PdfLibModule {
		PDFDocument: {
			create: () => Promise<PdfLibDocument>;
			load: (data: ArrayBuffer) => Promise<PdfLibDocument>;
		};
	}

	interface JSZipInstance {
		file: (name: string, data: Uint8Array) => void;
		generateAsync: (options: { type: 'blob' }) => Promise<Blob>;
	}

	interface JSZipModule {
		default?: unknown;
		new (): JSZipInstance;
	}

	// Reactive States
	let pdfjs = $state<PdfJsModule | null>(null);
	let PDFLib = $state<PdfLibModule | null>(null);
	let JSZip = $state<JSZipModule | null>(null);

	let loadingLibs = $state(true);
	let isDragging = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);

	// Document State
	let globalPdfJsDoc = $state<PdfJsDocument | null>(null);
	let globalPdfLibDoc = $state<PdfLibDocument | null>(null);
	let fileName = $state('');
	let fileSize = $state('');
	let totalPages = $state(0);
	let currentPreviewPage = $state(1);
	let selectedLineIndex = $state(-1);
	let pageLinesCache = $state<Record<number, string[]>>({});

	// Processing State
	let isParsingText = $state(false);
	let isProcessing = $state(false);
	let progressCurrent = $state(0);
	let progressPercent = $state(0);
	let downloadZipUrl = $state('');
	let downloadZipName = $state('');
	let lastExtractedFile = $state('');
	
	// Individual generated split files
	interface GeneratedFile {
		name: string;
		url: string;
	}
	let generatedFiles = $state<GeneratedFile[]>([]);
	let previewModalFile = $state<GeneratedFile | null>(null);
	
	// Canvas Render & Zoom State
	let canvasElement: HTMLCanvasElement | null = $state(null);
	let isRenderingCanvas = $state(false);
	let activeTab = $state<'list' | 'preview'>('list');
	let canvasZoom = $state(100); // percentage zoom, 50% to 200%

	// Step Checklist State
	let stepParsePdf = $state<'pending' | 'running' | 'success' | 'error'>('pending');
	let stepExtractNames = $state<'pending' | 'running' | 'success' | 'error'>('pending');
	let stepPackageZip = $state<'pending' | 'running' | 'success' | 'error'>('pending');

	// Mock Console Terminal State
	type LogEntry = { time: string; message: string; type: 'info' | 'success' | 'error' | 'warn' };
	let logs = $state<LogEntry[]>([]);

	// FAQs Accordion State
	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	function addLog(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
		const time = new Date().toLocaleTimeString();
		logs.push({ time, message, type });
		if (typeof document !== 'undefined') {
			setTimeout(() => {
				const el = document.getElementById('log-terminal');
				if (el) el.scrollTop = el.scrollHeight;
			}, 50);
		}
	}

	function clearLogs() {
		logs = [];
		addLog('Console cleared.');
	}

	onMount(async () => {
		addLog(i18n.t('tools.splitPdf.logs.ready'));
		try {
			const pdfjsModule = await import('pdfjs-dist') as unknown as PdfJsModule;
			pdfjs = pdfjsModule;
			// Use the bundled worker from pdfjs-dist
			const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
			pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

			const pdfLibModule = await import('pdf-lib') as unknown as PdfLibModule;
			PDFLib = pdfLibModule;

			const jszipModule = await import('jszip');
			JSZip = (jszipModule.default || jszipModule) as unknown as JSZipModule;

			loadingLibs = false;
		} catch (err) {
			console.error("Libraries loading failed:", err);
			addLog(i18n.t('tools.splitPdf.logs.failed', { error: (err as Error).message }), 'error');
		}
	});

	// Handle PDF file select & load
	async function handleFileSelect(files: FileList | null) {
		if (!files || files.length === 0) return;
		const file = files[0];
		if (file.type !== 'application/pdf') {
			toast.show(i18n.current === 'id' ? 'Format file harus PDF!' : 'File must be a PDF!', 'error');
			return;
		}

		fileName = file.name;
		fileSize = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
		addLog(i18n.t('tools.splitPdf.logs.reading', { name: file.name }));

		// Reset States
		pageLinesCache = {};
		selectedLineIndex = -1;
		currentPreviewPage = 1;
		totalPages = 0;
		progressCurrent = 0;
		progressPercent = 0;
		stepParsePdf = 'running';
		stepExtractNames = 'pending';
		stepPackageZip = 'pending';

		try {
			const arrayBuffer1 = await file.arrayBuffer();
			const arrayBuffer2 = arrayBuffer1.slice(0);

			if (!pdfjs || !PDFLib) return;

			globalPdfJsDoc = await pdfjs.getDocument({ data: arrayBuffer1 }).promise;
			globalPdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer2);

			totalPages = globalPdfLibDoc.getPageCount();
			addLog(i18n.t('tools.splitPdf.logs.loaded', { total: totalPages }), 'success');
			stepParsePdf = 'success';

			await loadPageText(1, false);
			let autoDetected = false;
			if (totalPages > 1) {
				addLog('Analyzing document layout to auto-detect recipient name row...', 'info');
				try {
					const pagesToCompare = Math.min(10, totalPages);
					// Load text for compared pages
					for (let p = 1; p <= pagesToCompare; p++) {
						await loadPageText(p, false);
					}

					// Collect page lines and find min lines count
					const pagesLines: string[][] = [];
					let minLinesCount = Infinity;
					for (let p = 1; p <= pagesToCompare; p++) {
						const lines = pageLinesCache[p] || [];
						pagesLines.push(lines);
						if (lines.length < minLinesCount) {
							minLinesCount = lines.length;
						}
					}

					// Find the row index with the highest unique value count (highest diversity)
					let bestIndex = -1;
					let maxUniqueCount = 1;
					if (minLinesCount !== Infinity) {
						for (let i = 0; i < minLinesCount; i++) {
							const uniqueVals = new Set<string>();
							for (let p = 0; p < pagesToCompare; p++) {
								const txt = pagesLines[p][i].trim();
								if (txt.length > 0) {
									uniqueVals.add(txt.toLowerCase());
								}
							}
							if (uniqueVals.size > maxUniqueCount) {
								maxUniqueCount = uniqueVals.size;
								bestIndex = i;
							}
						}
					}

					if (bestIndex !== -1 && maxUniqueCount > 1) {
						selectLine(bestIndex);
						autoDetected = true;
						const sampleText = pagesLines[0][bestIndex].trim();
						addLog(i18n.current === 'id' 
							? `Sistem mendeteksi nama otomatis di Baris #${bestIndex + 1} ("${sampleText}") dengan variasi teks tertinggi (${maxUniqueCount} teks unik dari ${pagesToCompare} halaman).`
							: `Auto-detected recipient name row at Row #${bestIndex + 1} ("${sampleText}") with highest text variation: ${maxUniqueCount} unique values across ${pagesToCompare} pages.`, 'success');
					}
				} catch (err) {
					console.error("Auto-detect failed:", err);
				}
			}

			if (!autoDetected) {
				guessInitialTarget();
			}
		} catch (err) {
			console.error("Error parsing file:", err);
			addLog(i18n.t('tools.splitPdf.logs.failed', { error: (err as Error).message }), 'error');
			stepParsePdf = 'error';
			toast.show(i18n.t('tools.splitPdf.logs.failed', { error: (err as Error).message }), 'error');
		}
	}

	// Reset full state to allow uploading another document
	function removeUploadedFile() {
		globalPdfJsDoc = null;
		globalPdfLibDoc = null;
		fileName = '';
		fileSize = '';
		totalPages = 0;
		currentPreviewPage = 1;
		selectedLineIndex = -1;
		pageLinesCache = {};
		progressCurrent = 0;
		progressPercent = 0;
		stepParsePdf = 'pending';
		stepExtractNames = 'pending';
		stepPackageZip = 'pending';
		if (downloadZipUrl) {
			URL.revokeObjectURL(downloadZipUrl);
		}
		downloadZipUrl = '';
		downloadZipName = '';
		lastExtractedFile = '';
		
		// Clean up generated files URLs
		generatedFiles.forEach(f => URL.revokeObjectURL(f.url));
		generatedFiles = [];
		previewModalFile = null;

		addLog('Document closed. Ready for next file.');
	}

	// Load page text & update inspector list
	async function loadPageText(pageNum: number, showLoader = true) {
		if (!globalPdfJsDoc) return;
		if (showLoader) isParsingText = true;

		try {
			if (pageLinesCache[pageNum]) {
				if (showLoader) isParsingText = false;
				return;
			}

			const page = await globalPdfJsDoc.getPage(pageNum);
			const textContent = await page.getTextContent();
			
			// Map item strings & clean empty lines
			const lines = textContent.items
				.map((item: PdfJsTextItem) => item.str.trim())
				.filter((str: string) => str.length > 0);

			pageLinesCache[pageNum] = lines;
		} catch (err) {
			console.error("Error loading page text:", err);
			addLog(`Failed to extract page ${pageNum} text: ${(err as Error).message}`, 'error');
		} finally {
			if (showLoader) isParsingText = false;
		}
	}

	// Render page visuals to Canvas
	async function renderPageCanvas(pageNum: number, currentZoom: number) {
		if (!globalPdfJsDoc || !canvasElement) return;
		isRenderingCanvas = true;

		try {
			const page = await globalPdfJsDoc.getPage(pageNum);
			
			// Dynamic scale based on current preview zoom
			const scale = (currentZoom / 100) * 1.2;
			const viewport = page.getViewport({ scale });
			const canvas = canvasElement;
			const context = canvas.getContext('2d');
			
			if (context) {
				canvas.height = viewport.height;
				canvas.width = viewport.width;
				const renderContext = {
					canvasContext: context,
					viewport: viewport
				};
				await page.render(renderContext).promise;
			}
		} catch (err) {
			console.error("Canvas rendering failed:", err);
		} finally {
			isRenderingCanvas = false;
		}
	}

	// Reactive preview page visual & text updates
	$effect(() => {
		// Read states to trigger reactive dependency tracking
		const page = currentPreviewPage;
		const zoom = canvasZoom;
		const doc = globalPdfJsDoc;
		const canvas = canvasElement;
		const tab = activeTab;
		const parsing = isParsingText;

		if (doc && page && canvas && tab === 'preview' && !parsing) {
			renderPageCanvas(page, zoom);
		}
	});

	// Trigger manual text loading when changing preview pages
	async function navigatePage(direction: number) {
		if (!globalPdfJsDoc) return;
		const targetPage = currentPreviewPage + direction;
		if (targetPage < 1 || targetPage > totalPages) return;

		currentPreviewPage = targetPage;
		await loadPageText(currentPreviewPage);
	}

	function selectLine(index: number) {
		selectedLineIndex = index;
		const textSample = pageLinesCache[currentPreviewPage]?.[index] || '';
		addLog(i18n.t('tools.splitPdf.logs.setTarget', { index: index + 1, text: textSample }), 'info');
	}

	// Attempt to guess target index containing name from standard keywords
	function guessInitialTarget() {
		const lines = pageLinesCache[1];
		if (!lines) return;

		const commonKeywords = ['nama', 'name', 'diberikan kepada', 'presented to', 'kepada', 'sertifikat', 'certificate'];
		for (let i = 0; i < lines.length; i++) {
			const lineLower = lines[i].toLowerCase();
			for (const kw of commonKeywords) {
				if (lineLower.includes(kw)) {
					if (lineLower.includes(':') && lines[i].split(':')[1].trim().length > 3) {
						selectLine(i);
						return;
					} else if (i + 1 < lines.length && lines[i + 1].length > 3) {
						selectLine(i + 1);
						return;
					}
				}
			}
		}
		// Fallback to center lines
		if (lines.length > 5) {
			selectLine(Math.floor(lines.length / 2));
		}
	}

	// Extract recipient name helper
	async function extractNameFromPage(pageNum: number): Promise<string> {
		await loadPageText(pageNum, false);
		const lines = pageLinesCache[pageNum] || [];
		if (lines.length === 0) return `Page_${pageNum}`;

		if (selectedLineIndex !== -1 && selectedLineIndex < lines.length) {
			let name = lines[selectedLineIndex].trim();
			// Strip prefix symbols
			if (name.startsWith(':') || name.startsWith('-')) {
				name = name.substring(1).trim();
			}
			if (name.length > 1) return name;
		}
		return `Page_${pageNum}`;
	}

	function sanitizeFilename(name: string): string {
		const range = '\\x00' + '-' + '\\x1F';
		const controlRegex = new RegExp('[' + range + ']', 'g');
		return name.replace(/[<>:"/\\|?*]/g, "").replace(controlRegex, "").trim() || "Recipient";
	}

	// Execute splitting procedure
	async function executePdfSplit() {
		if (!globalPdfLibDoc || !globalPdfJsDoc || !PDFLib || !JSZip) {
			toast.show(i18n.t('tools.splitPdf.toastPdfRequired'), 'error');
			return;
		}
		if (selectedLineIndex === -1) {
			toast.show(i18n.t('tools.splitPdf.toastLineRequired'), 'error');
			return;
		}

		isProcessing = true;
		progressCurrent = 0;
		progressPercent = 0;
		stepExtractNames = 'running';
		addLog(i18n.t('tools.splitPdf.logs.start', { total: totalPages }));

		try {
			// Clean up previous generated file URLs
			generatedFiles.forEach(f => URL.revokeObjectURL(f.url));
			generatedFiles = [];

			const zip = new JSZip();

			for (let i = 0; i < totalPages; i++) {
				const pageNum = i + 1;
				const rawName = await extractNameFromPage(pageNum);
				const cleanName = sanitizeFilename(rawName);

				// Create sub-PDF document
				const subPdf = await PDFLib.PDFDocument.create();
				const [copiedPage] = await subPdf.copyPages(globalPdfLibDoc, [i]);
				subPdf.addPage(copiedPage);
				const subPdfBytes = await subPdf.save();

				const filename = `${cleanName}.pdf`;
				zip.file(filename, subPdfBytes);

				const pdfBlob = new Blob([subPdfBytes] as any[], { type: 'application/pdf' });
				const pdfUrl = URL.createObjectURL(pdfBlob);
				generatedFiles.push({
					name: filename,
					url: pdfUrl
				});

				addLog(i18n.t('tools.splitPdf.logs.extracted', { page: pageNum, total: totalPages, filename }), 'info');
				lastExtractedFile = filename;
				progressCurrent = pageNum;
				progressPercent = Math.round((pageNum / totalPages) * 100);

				// Frame delay for DOM rendering thread
				await new Promise(r => setTimeout(r, 10));
			}

			stepExtractNames = 'success';
			stepPackageZip = 'running';
			addLog(i18n.t('tools.splitPdf.logs.compressing'), 'info');

			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const zipName = fileName.replace('.pdf', '_Split.zip');

			// Revoke previous URL if any
			if (downloadZipUrl) {
				URL.revokeObjectURL(downloadZipUrl);
			}

			// Save to states
			downloadZipUrl = URL.createObjectURL(zipBlob);
			downloadZipName = zipName;

			// Trigger local download
			const downloadLink = document.createElement('a');
			downloadLink.href = downloadZipUrl;
			downloadLink.download = downloadZipName;
			document.body.appendChild(downloadLink);
			downloadLink.click();
			document.body.removeChild(downloadLink);

			addLog(i18n.t('tools.splitPdf.logs.completed', { name: zipName }), 'success');
			stepPackageZip = 'success';
			toast.show(i18n.t('tools.splitPdf.toastSuccess'), 'success');

		} catch (err) {
			console.error("PDF execution failed:", err);
			addLog(i18n.t('tools.splitPdf.logs.error', { error: (err as Error).message }), 'error');
			stepExtractNames = 'error';
			stepPackageZip = 'error';
			toast.show(i18n.t('tools.splitPdf.toastError'), 'error');
		} finally {
			isProcessing = false;
		}
	}

	// Helper for previewing name
	let currentPreviewName = $derived.by(() => {
		const lines = pageLinesCache[currentPreviewPage];
		if (!lines || selectedLineIndex === -1 || selectedLineIndex >= lines.length) return '';
		let val = lines[selectedLineIndex].trim();
		if (val.startsWith(':') || val.startsWith('-')) {
			val = val.substring(1).trim();
		}
		return val;
	});

	// Zoom operations
	function adjustZoom(factor: number) {
		const newZoom = canvasZoom + factor;
		if (newZoom >= 50 && newZoom <= 200) {
			canvasZoom = newZoom;
		}
	}

	function resetZoom() {
		canvasZoom = 100;
	}

	// Action for auto-scrolling the selected text line into view
	function scrollIntoViewIfSelected(node: HTMLElement, isSelected: boolean) {
		if (isSelected) {
			node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
		return {
			update(newIsSelected: boolean) {
				if (newIsSelected) {
					node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
				}
			}
		};
	}

	// Generate up to 5 preview filenames based on the selected row
	let previewFilenames = $derived.by(() => {
		if (!globalPdfJsDoc || selectedLineIndex === -1) return [];
		const list: { page: number; filename: string }[] = [];
		const count = Math.min(5, totalPages);
		for (let p = 1; p <= count; p++) {
			const lines = pageLinesCache[p];
			if (lines && selectedLineIndex < lines.length) {
				let name = lines[selectedLineIndex].trim();
				if (name.startsWith(':') || name.startsWith('-')) {
					name = name.substring(1).trim();
				}
				list.push({ page: p, filename: `${sanitizeFilename(name)}.pdf` });
			} else {
				list.push({ page: p, filename: `Page_${p}.pdf` });
			}
		}
		return list;
	});
</script>

<Seo 
	title={i18n.t('tools.splitPdf.title')} 
	description={i18n.t('tools.splitPdf.shortDescription')}
/>

{#if loadingLibs}
	<div class="min-h-[60vh] flex flex-col items-center justify-center gap-4">
		<div class="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
		<p class="text-sm font-semibold text-slate-500 animate-pulse">{i18n.t('tools.splitPdf.loadingLibs')}</p>
	</div>
{:else}
	<div class="space-y-6 animate-fade-in max-w-7xl mx-auto">
		<!-- Navigation back button -->
		<a href={resolveRoute('/[lang]', { lang: i18n.current })} class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
			</svg>
			{i18n.t('tools.splitPdf.btnBack')}
		</a>

		<!-- Header Title Block -->
		<div class="border-b border-slate-200/80 pb-5 space-y-1.5">
			<h2 class="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight font-title">
				{i18n.t('tools.splitPdf.title')}
			</h2>
			<p class="text-xs sm:text-sm text-slate-500 font-semibold leading-relaxed max-w-4xl">
				{i18n.t('tools.splitPdf.longDescription')}
			</p>
		</div>

		<!-- Main Workspace Grid -->
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
			<!-- LEFT COLUMN: Configurations & Processing steps (7-col) -->
			<div class="contents lg:block lg:col-span-7 lg:space-y-6">
				<!-- Card 1: File Upload & Details -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 order-1 lg:order-none">
					<h3 class="text-base font-bold mb-4 text-slate-900 flex items-center gap-2.5 font-title">
						<span class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold shadow-sm">
							{i18n.t('tools.splitPdf.step1')}
						</span>
						{i18n.t('tools.splitPdf.step1Title')}
					</h3>

					{#if fileName}
						<!-- Display loaded file specs details, with drop replacement support -->
						<div 
							role="presentation"
							ondragover={(e) => { e.preventDefault(); isDragging = true; }}
							ondragleave={() => { isDragging = false; }}
							ondrop={(e) => { e.preventDefault(); isDragging = false; if (e.dataTransfer) handleFileSelect(e.dataTransfer.files); }}
							class="border border-blue-200/80 bg-blue-50/10 rounded-xl p-4.5 space-y-4 shadow-sm relative overflow-hidden transition-all duration-300
							{isDragging ? 'bg-blue-100/30 border-blue-400 shadow-glow-blue-sm' : ''}"
						>
							<div class="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl pointer-events-none"></div>
							
							<div class="flex items-start justify-between gap-4">
								<div class="flex items-center gap-3">
									<div class="p-2.5 bg-blue-600 text-white rounded-lg shadow-md shadow-blue-500/10">
										<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
										</svg>
									</div>
									<div class="truncate max-w-[260px] sm:max-w-[360px]">
										<p class="text-sm font-extrabold text-slate-950 truncate" title={fileName}>{fileName}</p>
										<p class="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{i18n.t('tools.splitPdf.fileDetails')}</p>
									</div>
								</div>
								
								<button 
									onclick={removeUploadedFile}
									type="button" 
									class="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg border border-transparent hover:border-red-200 transition shadow-sm z-10"
									title="Remove File"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>

							<!-- Metrics Specs -->
							<div class="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-xs font-semibold">
								<div class="bg-white/80 p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col">
									<span class="text-slate-400 text-[10px] uppercase font-bold tracking-wide">Size</span>
									<span class="text-slate-900 font-extrabold font-mono mt-0.5">{fileSize}</span>
								</div>
								<div class="bg-white/80 p-3 rounded-lg border border-slate-100 shadow-sm flex flex-col">
									<span class="text-slate-400 text-[10px] uppercase font-bold tracking-wide">Total Pages</span>
									<span class="text-slate-900 font-extrabold font-mono mt-0.5">{totalPages} Pages</span>
								</div>
							</div>
						</div>
					{:else}
						<!-- Dropzone screen -->
						<div
							role="presentation"
							onclick={() => fileInput?.click()}
							ondragover={(e) => { e.preventDefault(); isDragging = true; }}
							ondragleave={() => { isDragging = false; }}
							ondrop={(e) => { e.preventDefault(); isDragging = false; if (e.dataTransfer) handleFileSelect(e.dataTransfer.files); }}
							class="border-2 border-dashed rounded-xl p-9 text-center cursor-pointer transition duration-300 shadow-inner flex flex-col items-center justify-center space-y-4
							{isDragging 
								? 'border-blue-500 bg-blue-50/50 shadow-glow-blue-lg' 
								: 'border-slate-200 hover:border-blue-400 bg-slate-50/30 hover:bg-blue-50/5'}"
						>
							<input
								bind:this={fileInput}
								type="file"
								accept="application/pdf"
								class="hidden"
								onchange={(e) => handleFileSelect(e.currentTarget.files)}
							/>

							<div class="p-3 bg-white border border-slate-100 rounded-full text-slate-400 shadow-sm group-hover:scale-105 transition duration-300">
								<svg class="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
								</svg>
							</div>

							<div class="space-y-1">
								<p class="text-sm font-extrabold text-slate-700">{i18n.t('tools.splitPdf.step1Dropzone')}</p>
								<p class="text-xs text-slate-400 font-semibold leading-relaxed max-w-[280px] sm:max-w-[420px] mx-auto">{i18n.t('tools.splitPdf.step1Helper')}</p>
							</div>
						</div>
					{/if}
				</div>

				<!-- Card 2: Extracted Filenames Preview configuration -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 space-y-5 order-3 lg:order-none">
					<h3 class="text-base font-bold text-slate-900 flex items-center gap-2.5 font-title">
						<span class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold shadow-sm">
							3
						</span>
						{i18n.t('tools.splitPdf.step2Title')}
					</h3>

					<!-- Comprehensive Tutorial Box -->
					<div class="bg-blue-50/45 border border-blue-100/80 rounded-xl p-4 space-y-2 text-xs text-slate-650 leading-relaxed shadow-sm">
						<h4 class="font-extrabold text-blue-805 flex items-center gap-1.5 font-title">
							<Info class="w-4 h-4 text-blue-600 shrink-0" />
							{i18n.current === 'id' ? 'Panduan' : 'Quick Guide'}
						</h4>
						<p class="font-semibold text-slate-600">
							{i18n.current === 'id' 
								? 'Sistem mendeteksi baris nama peserta secara otomatis. Jika salah, silakan klik baris nama yang benar di panel inspektur.' 
								: 'We automatically detect the recipient name row. If incorrect, simply click the correct line in the inspector panel.'}
						</p>
					</div>

					<!-- Selection index display -->
					<div class="flex items-center justify-between bg-slate-50 border border-slate-200/80 p-4 rounded-xl shadow-inner">
						<span class="text-xs font-bold text-slate-500">{i18n.t('tools.splitPdf.targetLineBadge')}</span>
						<span class="text-xs font-mono font-bold px-3 py-1.5 rounded-lg border shadow-sm transition-all duration-300
							{selectedLineIndex === -1 
								? 'bg-slate-100 text-slate-500 border-slate-200' 
								: 'bg-blue-50 text-blue-700 border-blue-200 shadow-glow-blue animate-pulse-glow-blue'}"
						>
							{selectedLineIndex === -1 
								? i18n.t('tools.splitPdf.targetLineNotSelected') 
								: i18n.t('tools.splitPdf.targetLineSelected', { index: selectedLineIndex + 1 })}
						</span>
					</div>

					<!-- Filename Previews (Up to 5 Pages) -->
					<div class="bg-slate-50 border border-slate-200/80 rounded-xl p-4.5 shadow-inner space-y-3">
						<div class="flex items-center justify-between">
							<span class="text-[10px] uppercase tracking-wider font-extrabold text-slate-450">
								{i18n.current === 'id' ? 'Hasil Pratinjau Nama File (Hal 1-5)' : 'File Name Previews (Pages 1-5)'}
							</span>
						</div>

						{#if previewFilenames.length > 0}
							<div class="grid grid-cols-1 gap-2.5">
								{#each previewFilenames as item}
									<div class="flex items-center gap-3.5 bg-white border border-blue-50/60 hover:border-blue-200 rounded-xl p-3 shadow-xs hover:shadow-sm transition-all duration-300">
										<div class="w-7 h-7 rounded-lg bg-rose-50 border border-rose-100/80 text-rose-650 flex items-center justify-center font-mono font-black text-[10px] shrink-0" title="Page {item.page}">
											{item.page}
										</div>
										<div class="min-w-0 flex-1">
											<p class="text-xs font-bold text-slate-800 truncate leading-snug">
												{item.filename}
											</p>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-xs font-bold text-slate-450 italic text-center py-4">
								{i18n.t('tools.splitPdf.livePreviewPlaceholder')}
							</div>
						{/if}
					</div>
				</div>

				<!-- Card 3: Execution progress step panel -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 space-y-5 order-4 lg:order-none">
					<h3 class="text-base font-bold text-slate-900 flex items-center gap-2.5 font-title">
						<span class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold shadow-sm">
							4
						</span>
						{i18n.t('tools.splitPdf.step3Title')}
					</h3>

					<!-- Progress Timeline Stepper -->
					{#if globalPdfLibDoc}
						<div class="border border-slate-200/60 rounded-xl p-5 bg-slate-50/30 shadow-inner">
							<div class="relative pl-6 space-y-5 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200/80">
								<!-- Step 1: Parse PDF -->
								<div class="relative flex items-center justify-between text-xs font-bold animate-fade-in">
									<div class="flex items-center gap-3">
										<div class="absolute -left-6 w-6 h-6 flex items-center justify-center rounded-full border-2 transition-all duration-300
											{stepParsePdf === 'success' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : ''}
											{stepParsePdf === 'running' ? 'bg-white border-blue-600 text-blue-600 shadow-glow-blue animate-pulse' : ''}
											{stepParsePdf === 'pending' ? 'bg-white border-slate-300 text-slate-450' : ''}
											{stepParsePdf === 'error' ? 'bg-rose-500 border-rose-500 text-white' : ''}"
										>
											{#if stepParsePdf === 'success'}
												<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
												</svg>
											{:else if stepParsePdf === 'running'}
												<span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
											{:else if stepParsePdf === 'error'}
												<span class="text-[10px] font-extrabold">!</span>
											{:else}
												<span class="text-[9px] text-slate-400">1</span>
											{/if}
										</div>
										<span class="{stepParsePdf === 'success' ? 'text-slate-800' : 'text-slate-600'} transition-colors duration-300">
											{i18n.t('tools.splitPdf.checklistParse')}
										</span>
									</div>
									<span class="text-[10px] font-bold uppercase tracking-wider transition-colors duration-300
										{stepParsePdf === 'success' ? 'text-emerald-600' : ''}
										{stepParsePdf === 'running' ? 'text-blue-600 animate-pulse' : ''}
										{stepParsePdf === 'pending' ? 'text-slate-400' : ''}
										{stepParsePdf === 'error' ? 'text-rose-600 font-extrabold' : ''}"
									>
										{stepParsePdf}
									</span>
								</div>

								<!-- Step 2: Extract Names & Split -->
								<div class="relative space-y-2 animate-fade-in">
									<div class="flex items-center justify-between text-xs font-bold">
										<div class="flex items-center gap-3">
											<div class="absolute -left-6 w-6 h-6 flex items-center justify-center rounded-full border-2 transition-all duration-300
												{stepExtractNames === 'success' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : ''}
												{stepExtractNames === 'running' ? 'bg-white border-blue-600 text-blue-600 shadow-glow-blue animate-pulse' : ''}
												{stepExtractNames === 'pending' ? 'bg-white border-slate-300 text-slate-450' : ''}
												{stepExtractNames === 'error' ? 'bg-rose-500 border-rose-500 text-white' : ''}"
											>
												{#if stepExtractNames === 'success'}
													<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
													</svg>
												{:else if stepExtractNames === 'running'}
													<span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
												{:else if stepExtractNames === 'error'}
													<span class="text-[10px] font-extrabold">!</span>
												{:else}
													<span class="text-[9px] text-slate-400">2</span>
												{/if}
											</div>
											<span class="{stepExtractNames === 'success' ? 'text-slate-800' : 'text-slate-600'} transition-colors duration-300">
												{i18n.t('tools.splitPdf.checklistSplit')}
											</span>
										</div>
										<span class="text-[10px] font-bold uppercase tracking-wider transition-colors duration-300
											{stepExtractNames === 'success' ? 'text-emerald-600' : ''}
											{stepExtractNames === 'running' ? 'text-blue-600 animate-pulse' : ''}
											{stepExtractNames === 'pending' ? 'text-slate-400' : ''}
											{stepExtractNames === 'error' ? 'text-rose-600 font-extrabold' : ''}"
										>
											{stepExtractNames}
										</span>
									</div>

									<!-- Nested Progress Bar inside Step 2 while running -->
									{#if stepExtractNames === 'running'}
										<div class="mt-2.5 pl-0.5 space-y-2 max-w-md animate-fade-in">
											<div class="flex justify-between text-[10px] font-bold text-slate-500">
												<span class="flex items-center gap-1.5">
													<svg class="animate-spin h-3.5 w-3.5 text-blue-600 animate-duration-1200" fill="none" viewBox="0 0 24 24">
														<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
														<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
													</svg>
													<span>{progressCurrent} / {totalPages} {i18n.current === 'id' ? 'Halaman' : 'Pages'}</span>
												</span>
												<span class="text-blue-650 font-mono font-extrabold">{progressPercent}%</span>
											</div>
											<div class="w-full bg-slate-200/70 border border-slate-350/20 rounded-full h-2 overflow-hidden shadow-inner">
												<div class="bg-blue-600 h-2 rounded-full transition-all duration-300 shadow-glow-blue" style="width: {progressPercent}%"></div>
											</div>
											{#if lastExtractedFile}
												<div class="text-[9.5px] text-slate-500 truncate flex items-center gap-1 mt-1 font-semibold animate-fade-in">
													<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
													<span>{i18n.current === 'id' ? 'Memproses:' : 'Processing:'} <span class="font-mono text-slate-700 font-bold">{lastExtractedFile}</span></span>
												</div>
											{/if}
										</div>
									{/if}
								</div>

								<!-- Step 3: Package & Download Zip -->
								<div class="relative space-y-2 animate-fade-in">
									<div class="flex items-center justify-between text-xs font-bold">
										<div class="flex items-center gap-3">
											<div class="absolute -left-6 w-6 h-6 flex items-center justify-center rounded-full border-2 transition-all duration-300
												{stepPackageZip === 'success' ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : ''}
												{stepPackageZip === 'running' ? 'bg-white border-blue-600 text-blue-600 shadow-glow-blue animate-pulse' : ''}
												{stepPackageZip === 'pending' ? 'bg-white border-slate-300 text-slate-450' : ''}
												{stepPackageZip === 'error' ? 'bg-rose-500 border-rose-500 text-white' : ''}"
											>
												{#if stepPackageZip === 'success'}
													<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
														<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
													</svg>
												{:else if stepPackageZip === 'running'}
													<span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
												{:else if stepPackageZip === 'error'}
													<span class="text-[10px] font-extrabold">!</span>
												{:else}
													<span class="text-[9px] text-slate-400">3</span>
												{/if}
											</div>
											<span class="{stepPackageZip === 'success' ? 'text-slate-800' : 'text-slate-600'} transition-colors duration-300">
												{i18n.t('tools.splitPdf.checklistZip')}
											</span>
										</div>
										<span class="text-[10px] font-bold uppercase tracking-wider transition-colors duration-300
											{stepPackageZip === 'success' ? 'text-emerald-600' : ''}
											{stepPackageZip === 'running' ? 'text-blue-600 animate-pulse' : ''}
											{stepPackageZip === 'pending' ? 'text-slate-400' : ''}
											{stepPackageZip === 'error' ? 'text-rose-600 font-extrabold' : ''}"
										>
											{stepPackageZip}
										</span>
									</div>

									<!-- Nested Status Loader for Step 3 zipping while running -->
									{#if stepPackageZip === 'running'}
										<div class="mt-2 pl-0.5 max-w-md flex items-center gap-2 text-[9px] text-slate-500 font-semibold italic animate-pulse">
											<span class="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
											{i18n.current === 'id' ? 'Mengompresi file ke ZIP...' : 'Compressing files to ZIP...'}
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}

					{#if stepPackageZip === 'success' && downloadZipUrl}
						<div class="bg-emerald-50/40 border border-emerald-200 rounded-xl p-5 text-center space-y-4 shadow-xs animate-fade-in">
							<div class="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-500/10">
								<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
								</svg>
							</div>
							<div class="space-y-1">
								<p class="text-sm font-extrabold text-slate-900">{i18n.current === 'id' ? 'Pemisahan PDF Selesai!' : 'Splitting Completed!'}</p>
								<p class="text-xs font-semibold text-slate-500 leading-relaxed max-w-[260px] mx-auto">
									{i18n.current === 'id' 
										? `Berhasil memisahkan ${totalPages} sertifikat ke dalam satu file ZIP.` 
										: `Successfully split ${totalPages} certificates into a ZIP archive.`}
								</p>
							</div>

							<!-- Display mock ZIP file block -->
							<div class="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs flex items-center gap-3 max-w-xs mx-auto text-left hover:border-emerald-300 transition-colors duration-300">
								<div class="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0 border border-emerald-100">
									<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
									</svg>
								</div>
								<div class="min-w-0 flex-1">
									<p class="text-xs font-bold text-slate-900 truncate leading-snug">
										{downloadZipName}
									</p>
									<p class="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
										{fileSize} • {totalPages} Pages
									</p>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-3 pt-2">
								<a
									href={downloadZipUrl}
									download={downloadZipName}
									class="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm shadow-emerald-500/10 text-center flex items-center justify-center gap-1.5 transition active:scale-[0.98]"
								>
									<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
									</svg>
									{i18n.current === 'id' ? 'Unduh Lagi' : 'Download Again'}
								</a>
								<button
									onclick={removeUploadedFile}
									type="button"
									class="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs text-center transition active:scale-[0.98]"
								>
									{i18n.current === 'id' ? 'Proses File Baru' : 'New File'}
								</button>
							</div>

							<!-- Individual Files Download/Preview Section -->
							{#if generatedFiles.length > 0}
								<div class="border-t border-slate-200/60 pt-4 text-left space-y-2.5">
									<p class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
										{i18n.current === 'id' ? 'Unduh / Pratinjau File Individual' : 'Download / Preview Individual Files'}
									</p>
									<div class="max-h-[200px] overflow-y-auto space-y-2 pr-1 scrollbar-thin">
										{#each generatedFiles as file, idx}
											<div class="flex items-center justify-between gap-3 bg-white border border-slate-250/70 hover:border-blue-300 rounded-xl p-2.5 shadow-xs transition-colors duration-200">
												<div class="flex items-center gap-2.5 min-w-0 flex-1">
													<div class="w-6 h-6 rounded-lg bg-rose-50 text-rose-650 flex items-center justify-center font-mono font-black text-[9px] border border-rose-100/80 shrink-0">
														{idx + 1}
													</div>
													<span class="text-xs font-bold text-slate-800 truncate" title={file.name}>
														{file.name}
													</span>
												</div>
												<div class="flex items-center gap-1.5 shrink-0">
													<!-- Preview Button -->
													<button
														onclick={() => previewModalFile = file}
														type="button"
														class="p-1.5 bg-slate-55 hover:bg-blue-55 text-slate-500 hover:text-blue-600 border border-slate-200/70 hover:border-blue-200 rounded-lg transition flex items-center justify-center"
														title={i18n.current === 'id' ? 'Pratinjau' : 'Preview'}
													>
														<Eye class="w-3.5 h-3.5" />
													</button>
													<!-- Download Button -->
													<a
														href={file.url}
														download={file.name}
														class="p-1.5 bg-slate-55 hover:bg-emerald-55 text-slate-500 hover:text-emerald-600 border border-slate-200/70 hover:border-emerald-200 rounded-lg transition flex items-center justify-center"
														title={i18n.current === 'id' ? 'Unduh' : 'Download'}
													>
														<Download class="w-3.5 h-3.5" />
													</a>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{:else}
						<button
							onclick={executePdfSplit}
							disabled={isProcessing || !globalPdfLibDoc || selectedLineIndex === -1}
							class="w-full py-4 px-6 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 group transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
							bg-blue-600 hover:bg-blue-500 shadow-glow-blue hover:shadow-glow-blue-lg active:scale-[0.99]"
						>
							<svg class="w-5 h-5 group-hover:translate-y-0.5 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
							</svg>
							{i18n.t('tools.splitPdf.processBtn')}
						</button>
					{/if}
				</div>
			</div>

			<!-- RIGHT COLUMN: Interactive Dual Inspector & System Logs (5-col) -->
			<div class="contents lg:block lg:col-span-5 lg:space-y-6">
				<!-- Card Panel Inspector (Sample PDF pages and texts) -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 flex flex-col h-[540px] order-2 lg:order-none">
					<div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 shrink-0">
						<h3 class="text-xs font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2 font-title">
							<span class="flex items-center justify-center w-5 h-5 rounded bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold shadow-xs">
								2
							</span>
							{i18n.t('tools.splitPdf.inspectorTitle')}
						</h3>
						
						<!-- Page Navigation buttons -->
						<div class="flex items-center gap-1 bg-slate-100 border border-slate-200 p-1 rounded-lg">
							<button
								onclick={() => navigatePage(-1)}
								disabled={!globalPdfJsDoc || currentPreviewPage === 1}
								class="p-1 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent rounded text-slate-600 transition"
								aria-label="Previous Page"
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
								</svg>
							</button>
							<span class="text-[10px] font-extrabold text-slate-650 px-1.5 font-mono">
								{i18n.t('tools.splitPdf.pageLabel', { current: currentPreviewPage, total: totalPages || 1 })}
							</span>
							<button
								onclick={() => navigatePage(1)}
								disabled={!globalPdfJsDoc || currentPreviewPage === totalPages}
								class="p-1 hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent rounded text-slate-600 transition"
								aria-label="Next Page"
							>
								<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
								</svg>
							</button>
						</div>
					</div>

					<!-- Tutorial Tip in Inspector -->
					<div class="mb-4 bg-blue-50/40 border border-blue-100/60 rounded-xl p-3 text-[11px] text-slate-650 leading-relaxed shadow-sm shrink-0">
						<span class="font-bold text-blue-700">💡 {i18n.current === 'id' ? 'Petunjuk Cepat:' : 'Quick Tutorial:'}</span>
						{i18n.current === 'id'
							? 'Pilih baris yang berisi nama peserta di bawah. Urutan baris ini akan diekstrak otomatis dari seluruh halaman untuk menamai file.'
							: 'Select the line containing the recipient\'s name below. This line index will be used to extract names from all pages to rename each file.'}
					</div>

					<!-- Tab buttons -->
					<div class="flex bg-slate-100 p-1 rounded-lg mb-4 text-xs font-bold shrink-0">
						<button
							onclick={() => activeTab = 'list'}
							class="flex-1 py-1.5 rounded-md text-center transition-all duration-200 {activeTab === 'list' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}"
						>
							{i18n.t('tools.splitPdf.tabTextLines')}
						</button>
						<button
							onclick={() => activeTab = 'preview'}
							class="flex-1 py-1.5 rounded-md text-center transition-all duration-200 {activeTab === 'preview' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'}"
						>
							{i18n.t('tools.splitPdf.tabImagePreview')}
						</button>
					</div>

					<!-- Inspector workbench contents -->
					<div class="grow overflow-y-auto min-h-0 relative">
						{#if !globalPdfJsDoc}
							<!-- Empty screen -->
							<div class="flex flex-col items-center justify-center h-full text-slate-400 py-10 font-medium select-none">
								<svg class="w-12 h-12 text-slate-350 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
								</svg>
								<p class="text-xs text-center max-w-[200px] font-semibold leading-relaxed">{i18n.t('tools.splitPdf.inspectorEmpty')}</p>
							</div>
						{:else}
							<!-- Text list pane (Only visible when activeTab === 'list') -->
							<div class="space-y-1.5 p-0.5" class:hidden={activeTab !== 'list'}>
								{#if isParsingText}
									<div class="flex flex-col items-center justify-center py-24 text-slate-400">
										<div class="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
										<p class="text-xs font-semibold">{i18n.t('tools.splitPdf.inspectorLoading')}</p>
									</div>
								{:else}
									{@const lines = pageLinesCache[currentPreviewPage] || []}
									{#if lines.length === 0}
										<div class="flex flex-col items-center justify-center py-24 text-amber-600 text-center font-bold">
											<p class="text-xs">{i18n.t('tools.splitPdf.inspectorNoText')}</p>
										</div>
									{:else}
										{#each lines as line, index (index)}
											{@const isSelected = selectedLineIndex === index}
											<button
												use:scrollIntoViewIfSelected={isSelected}
												onclick={() => selectLine(index)}
												type="button"
												class="w-full text-left p-3.5 rounded-xl border flex items-center justify-between group transition-all duration-200 active:scale-[0.99]
												{isSelected 
													? 'bg-blue-50/70 text-blue-950 border-blue-400 shadow-sm font-semibold' 
													: 'bg-slate-50/40 hover:bg-slate-100/80 border-slate-200/65 hover:border-slate-350 text-slate-850 hover:text-slate-950'}"
											>
												<div class="flex items-center gap-3 truncate pr-2">
													<span class="text-[10px] font-mono font-bold w-5.5 h-5.5 flex items-center justify-center rounded-lg shrink-0 transition-colors
														{isSelected ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-555'}"
													>
														{index + 1}
													</span>
													<span class="truncate font-bold text-xs leading-relaxed">{line}</span>

												</div>
												<span class="shrink-0 text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition border shadow-sm
													{isSelected 
														? 'bg-blue-600 text-white border-blue-500' 
														: 'bg-slate-200 text-slate-650 border-slate-300/40 group-hover:bg-slate-300/80'}"
												>
													{isSelected ? i18n.t('tools.splitPdf.inspectorBtnSelected') : i18n.t('tools.splitPdf.inspectorBtnSelect')}
												</span>
											</button>
										{/each}
									{/if}
								{/if}
							</div>

							<!-- Page Canvas visual pane (Only visible when activeTab === 'preview') -->
							<div class="h-full flex flex-col justify-between items-center bg-slate-900 border border-slate-850 rounded-xl p-3 relative shadow-inner overflow-hidden" class:hidden={activeTab !== 'preview'}>
								<!-- Render Spinner -->
								{#if isRenderingCanvas}
									<div class="absolute inset-0 bg-slate-950/75 flex items-center justify-center z-20 rounded-xl">
										<div class="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
									</div>
								{/if}
								
								<!-- Zoom Toolbar Overlay -->
								<div class="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 bg-slate-950/80 backdrop-blur-sm border border-slate-800 p-1.5 rounded-lg shadow-lg">
									<button 
										onclick={() => adjustZoom(-10)} 
										disabled={canvasZoom <= 50} 
										class="p-1 text-slate-400 hover:text-white disabled:opacity-35 disabled:hover:text-slate-400 rounded transition" 
										title="Zoom Out"
									>
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
										</svg>
									</button>
									<button 
										onclick={resetZoom} 
										class="text-[9px] font-mono font-bold text-slate-300 px-1 hover:text-white"
										title="Reset Zoom"
									>
										{canvasZoom}%
									</button>
									<button 
										onclick={() => adjustZoom(10)} 
										disabled={canvasZoom >= 200} 
										class="p-1 text-slate-400 hover:text-white disabled:opacity-35 disabled:hover:text-slate-400 rounded transition" 
										title="Zoom In"
									>
										<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
										</svg>
									</button>
								</div>

								<!-- Canvas Scroll Container -->
								<div class="grow w-full overflow-auto flex items-center justify-center bg-dot-grid-dark rounded border border-slate-950/20 max-h-[360px]">
									<canvas bind:this={canvasElement} class="max-w-full max-h-full object-contain rounded border border-slate-950 shadow-2xl transition-all duration-300"></canvas>
								</div>
							</div>
						{/if}
					</div>
				</div>

			</div>
		</div>

		<!-- INFORMATION & SEO BLOCK -->
		<section class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm shadow-blue-500/5 space-y-8">
			<div class="border-b border-slate-100 pb-5 space-y-1">
				<h3 class="text-lg font-bold text-slate-900 font-title">
					{i18n.t('tools.splitPdf.aboutTitle')}
				</h3>
				<p class="text-xs text-slate-500 font-semibold leading-relaxed">
					{i18n.t('tools.splitPdf.aboutSubtitle')}
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-8 leading-relaxed">
				<div class="space-y-3.5">
					<h4 class="text-sm font-extrabold text-blue-700 flex items-center gap-2 font-title">
						<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
						</svg>
						{i18n.t('tools.splitPdf.featureClientSide')}
					</h4>
					<p class="text-xs text-slate-600 font-semibold">{i18n.t('tools.splitPdf.aboutP1')}</p>
				</div>
				<div class="space-y-3.5">
					<h4 class="text-sm font-extrabold text-blue-700 flex items-center gap-2 font-title">
						<svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
						</svg>
						{i18n.t('tools.splitPdf.featureHighSpeed')}
					</h4>
					<p class="text-xs text-slate-600 font-semibold">{i18n.t('tools.splitPdf.aboutP2')}</p>
				</div>
			</div>

			<!-- FAQ Accordion section -->
			<div class="space-y-4 border-t border-slate-100 pt-6">
				<h4 class="text-sm font-extrabold text-slate-900 flex items-center gap-2 font-title">
					<svg class="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					{i18n.t('tools.splitPdf.faqTitle')}
				</h4>

				<div class="space-y-3">
					<!-- Q1 Accordion -->
					<div class="border border-slate-200 rounded-xl overflow-hidden transition shadow-sm bg-slate-50/50">
						<button
							onclick={() => toggleFaq('q1')}
							class="w-full p-4 flex items-center justify-between text-left font-bold text-xs text-slate-800 hover:bg-slate-100/50 transition"
						>
							<span>{i18n.t('tools.splitPdf.faqQ1')}</span>
							<svg class="w-4 h-4 text-slate-400 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						{#if faqOpen.q1}
							<div class="p-4 border-t border-slate-200 text-xs text-slate-600 bg-white font-semibold leading-relaxed animate-fade-in">
								{i18n.t('tools.splitPdf.faqA1')}
							</div>
						{/if}
					</div>

					<!-- Q2 Accordion -->
					<div class="border border-slate-200 rounded-xl overflow-hidden transition shadow-sm bg-slate-50/50">
						<button
							onclick={() => toggleFaq('q2')}
							class="w-full p-4 flex items-center justify-between text-left font-bold text-xs text-slate-800 hover:bg-slate-100/50 transition"
						>
							<span>{i18n.t('tools.splitPdf.faqQ2')}</span>
							<svg class="w-4 h-4 text-slate-400 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
							</svg>
						</button>
						{#if faqOpen.q2}
							<div class="p-4 border-t border-slate-200 text-xs text-slate-650 bg-white font-semibold leading-relaxed animate-fade-in">
								{i18n.t('tools.splitPdf.faqA2')}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</section>
	</div>
{/if}

{#if previewModalFile}
	<!-- Modal Overlay -->
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-905/65 backdrop-blur-xs animate-fade-in" role="dialog" aria-modal="true">
		<div class="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
			<!-- Modal Header -->
			<div class="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 shrink-0">
				<div class="flex items-center gap-2.5 min-w-0">
					<div class="p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-100/80 shrink-0">
						<FileText class="w-5 h-5 text-rose-600" />
					</div>
					<h3 class="text-sm font-extrabold text-slate-950 truncate leading-snug" title={previewModalFile.name}>
						{previewModalFile.name}
					</h3>
				</div>
				<div class="flex items-center gap-2">
					<a
						href={previewModalFile.url}
						download={previewModalFile.name}
						class="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition active:scale-[0.98]"
					>
						<Download class="w-3.5 h-3.5" />
						{i18n.current === 'id' ? 'Unduh' : 'Download'}
					</a>
					<button
						onclick={() => previewModalFile = null}
						type="button"
						class="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
						title={i18n.current === 'id' ? 'Tutup' : 'Close'}
					>
						<X class="w-5 h-5" />
					</button>
				</div>
			</div>
			<!-- Modal Content (PDF viewer iframe) -->
			<div class="grow bg-slate-100 p-2 relative">
				<iframe
					src={previewModalFile.url}
					title={previewModalFile.name}
					class="w-full h-full rounded-lg border border-slate-200/50 shadow-inner bg-white"
				></iframe>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Subtle helper animations */
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.animate-fade-in {
		animation: fadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	
</style>
