<script lang="ts">
	import { onMount } from 'svelte';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';

	// Reactive States
	let pdfjs: any = $state(null);
	let PDFLib: any = $state(null);
	let JSZip: any = $state(null);

	let loadingLibs = $state(true);
	let isDragging = $state(false);
	let fileInput: HTMLInputElement | null = $state(null);

	// Document State
	let globalPdfJsDoc: any = $state(null);
	let globalPdfLibDoc: any = $state(null);
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
			const pdfjsModule = await import('pdfjs-dist');
			pdfjs = pdfjsModule;
			// Use the bundled worker from pdfjs-dist
			const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
			pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

			const pdfLibModule = await import('pdf-lib');
			PDFLib = pdfLibModule;

			const jszipModule = await import('jszip');
			JSZip = jszipModule.default || jszipModule;

			loadingLibs = false;
		} catch (err: any) {
			console.error("Libraries loading failed:", err);
			addLog(i18n.t('tools.splitPdf.logs.failed', { error: err.message }), 'error');
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

			globalPdfJsDoc = await pdfjs.getDocument({ data: arrayBuffer1 }).promise;
			globalPdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer2);

			totalPages = globalPdfLibDoc.getPageCount();
			addLog(i18n.t('tools.splitPdf.logs.loaded', { total: totalPages }), 'success');
			stepParsePdf = 'success';

			await loadPageText(1);
			guessInitialTarget();
		} catch (err: any) {
			console.error("Error parsing file:", err);
			addLog(i18n.t('tools.splitPdf.logs.failed', { error: err.message }), 'error');
			stepParsePdf = 'error';
			toast.show(i18n.t('tools.splitPdf.logs.failed', { error: err.message }), 'error');
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
		addLog('Document closed. Ready for next file.');
	}

	// Load page text & update inspector list
	async function loadPageText(pageNum: number) {
		if (!globalPdfJsDoc) return;
		isParsingText = true;

		try {
			if (pageLinesCache[pageNum]) {
				isParsingText = false;
				return;
			}

			const page = await globalPdfJsDoc.getPage(pageNum);
			const textContent = await page.getTextContent();
			
			// Map item strings & clean empty lines
			const lines = textContent.items
				.map((item: any) => item.str.trim())
				.filter((str: string) => str.length > 0);

			pageLinesCache[pageNum] = lines;
		} catch (err: any) {
			console.error("Error loading page text:", err);
			addLog(`Failed to extract page ${pageNum} text: ${err.message}`, 'error');
		} finally {
			isParsingText = false;
		}
	}

	// Render page visuals to Canvas
	async function renderPageCanvas(pageNum: number) {
		if (!globalPdfJsDoc || !canvasElement) return;
		isRenderingCanvas = true;

		try {
			const page = await globalPdfJsDoc.getPage(pageNum);
			
			// Dynamic scale based on current preview zoom
			const scale = (canvasZoom / 100) * 1.2;
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
		} catch (err: any) {
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
			renderPageCanvas(page);
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
		await loadPageText(pageNum);
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
		return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim() || "Recipient";
	}

	// Execute splitting procedure
	async function executePdfSplit() {
		if (!globalPdfLibDoc || !globalPdfJsDoc) {
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

				addLog(i18n.t('tools.splitPdf.logs.extracted', { page: pageNum, total: totalPages, filename }), 'info');
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

			// Trigger local download
			const downloadUrl = URL.createObjectURL(zipBlob);
			const downloadLink = document.createElement('a');
			downloadLink.href = downloadUrl;
			downloadLink.download = zipName;
			document.body.appendChild(downloadLink);
			downloadLink.click();
			document.body.removeChild(downloadLink);
			URL.revokeObjectURL(downloadUrl);

			addLog(i18n.t('tools.splitPdf.logs.completed', { name: zipName }), 'success');
			stepPackageZip = 'success';
			toast.show(i18n.t('tools.splitPdf.toastSuccess'), 'success');

		} catch (err: any) {
			console.error("PDF execution failed:", err);
			addLog(i18n.t('tools.splitPdf.logs.error', { error: err.message }), 'error');
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

	function adjustZoom(factor: number) {
		const newZoom = canvasZoom + factor;
		if (newZoom >= 50 && newZoom <= 200) {
			canvasZoom = newZoom;
		}
	}

	function resetZoom() {
		canvasZoom = 100;
	}
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
		<a href="/{i18n.current}" class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition">
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
			<div class="lg:col-span-7 space-y-6">
				<!-- Card 1: File Upload & Details -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5">
					<h3 class="text-base font-bold mb-4 text-slate-900 flex items-center gap-2.5 font-title">
						<span class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold shadow-sm">
							{i18n.t('tools.splitPdf.step1')}
						</span>
						{i18n.t('tools.splitPdf.step1Title')}
					</h3>

					{#if fileName}
						<!-- Display loaded file specs details -->
						<div class="border border-blue-200/80 bg-blue-50/10 rounded-xl p-4.5 space-y-4 shadow-sm relative overflow-hidden">
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
									class="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg border border-transparent hover:border-red-200 transition shadow-sm"
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

				<!-- Card 2: Recognition Rules config -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 space-y-5">
					<h3 class="text-base font-bold text-slate-900 flex items-center gap-2.5 font-title">
						<span class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold shadow-sm">
							{i18n.t('tools.splitPdf.step2')}
						</span>
						{i18n.t('tools.splitPdf.step2Title')}
					</h3>

					<div class="bg-blue-50/40 border border-blue-100/60 rounded-xl p-4 text-xs text-slate-700 space-y-2.5 leading-relaxed shadow-sm">
						<p class="font-bold text-slate-950 flex items-center gap-1.5">
							<span class="text-blue-600">💡</span> {i18n.t('tools.splitPdf.step2InstructionTitle')}
						</p>
						<ol class="list-decimal pl-4.5 space-y-1.5 text-slate-600 font-semibold">
						{#each i18n.tArray('tools.splitPdf.step2Instructions') as instruction}
							<li>{@html instruction}</li>
						{/each}
						</ol>
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

					<!-- Live Match Simulator -->
					<div class="bg-slate-50 border border-slate-200/80 rounded-xl p-4.5 flex items-center justify-between shadow-inner">
						<div class="space-y-1 pr-2 truncate">
							<span class="text-[10px] uppercase tracking-wider font-extrabold text-slate-450">
								{i18n.t('tools.splitPdf.livePreviewTitle', { page: currentPreviewPage })}
							</span>
							{#if currentPreviewName}
								<div class="text-sm font-extrabold text-blue-700 italic truncate font-title mt-0.5">
									"{currentPreviewName}"
								</div>
							{:else}
								<div class="text-xs font-bold text-slate-400 italic mt-0.5">
									{i18n.t('tools.splitPdf.livePreviewPlaceholder')}
								</div>
							{/if}
						</div>
						{#if currentPreviewName}
							<span class="shrink-0 px-2.5 py-1 text-[10px] rounded-lg bg-blue-600 text-white font-mono font-bold border border-blue-500 shadow-glow-blue animate-pulse">
								{i18n.t('tools.splitPdf.matchBadge')}
							</span>
						{/if}
					</div>
				</div>

				<!-- Card 3: Execution progress step panel -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 space-y-5">
					<h3 class="text-base font-bold text-slate-900 flex items-center gap-2.5 font-title">
						<span class="flex items-center justify-center w-6 h-6 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 text-xs font-bold shadow-sm">
							{i18n.t('tools.splitPdf.step3')}
						</span>
						{i18n.t('tools.splitPdf.step3Title')}
					</h3>

					<!-- Progress Checklist -->
					{#if globalPdfLibDoc}
						<div class="border border-slate-200/80 rounded-xl p-4 bg-slate-50/50 space-y-3.5 text-xs font-bold shadow-inner">
							<div class="flex items-center justify-between">
								<span class="flex items-center gap-2 text-slate-700">
									{#if stepParsePdf === 'success'}
										<span class="text-blue-600 font-extrabold text-sm">✓</span>
									{:else}
										<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
									{/if}
									{i18n.t('tools.splitPdf.checklistParse')}
								</span>
								<span class="text-slate-400 capitalize">{stepParsePdf}</span>
							</div>

							<div class="flex items-center justify-between">
								<span class="flex items-center gap-2 text-slate-700">
									{#if stepExtractNames === 'success'}
										<span class="text-blue-600 font-extrabold text-sm">✓</span>
									{:else if stepExtractNames === 'running'}
										<span class="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
									{:else}
										<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
									{/if}
									{i18n.t('tools.splitPdf.checklistSplit')}
								</span>
								<span class="text-slate-400 capitalize">{stepExtractNames}</span>
							</div>

							<div class="flex items-center justify-between">
								<span class="flex items-center gap-2 text-slate-700">
									{#if stepPackageZip === 'success'}
										<span class="text-blue-600 font-extrabold text-sm">✓</span>
									{:else if stepPackageZip === 'running'}
										<span class="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
									{:else}
										<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
									{/if}
									{i18n.t('tools.splitPdf.checklistZip')}
								</span>
								<span class="text-slate-400 capitalize">{stepPackageZip}</span>
							</div>
						</div>
					{/if}

					<!-- Main Progress Bar -->
					{#if isProcessing}
						<div class="space-y-2.5 bg-slate-50 border border-slate-200/80 p-4 rounded-xl shadow-inner border-l-4 border-l-blue-600 shadow-blue-500/5">
							<div class="flex justify-between text-xs font-bold text-slate-700">
								<span class="flex items-center gap-2">
									<svg class="animate-spin h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									{i18n.t('tools.splitPdf.processingText', { current: progressCurrent, total: totalPages })}
								</span>
								<span class="text-blue-600 font-mono font-extrabold">{progressPercent}%</span>
							</div>
							<div class="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden shadow-inner">
								<div class="bg-blue-600 h-2.5 rounded-full transition-all duration-300 shadow-glow-blue" style="width: {progressPercent}%"></div>
							</div>
						</div>
					{/if}

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
				</div>
			</div>

			<!-- RIGHT COLUMN: Interactive Dual Inspector & System Logs (5-col) -->
			<div class="lg:col-span-5 space-y-6">
				<!-- Card Panel Inspector (Sample PDF pages and texts) -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 flex flex-col h-[480px]">
					<div class="flex items-center justify-between mb-4 border-b border-slate-100 pb-3 shrink-0">
						<h3 class="text-xs font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2 font-title">
							<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
							</svg>
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
					<div class="flex-grow overflow-y-auto min-h-0 relative">
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
										{#each lines as line, index}
											{@const isSelected = selectedLineIndex === index}
											<button
												onclick={() => selectLine(index)}
												type="button"
												class="w-full text-left p-3.5 rounded-xl border flex items-center justify-between group transition-all duration-200
												{isSelected 
													? 'bg-blue-50/60 text-blue-900 border-blue-300 shadow-sm' 
													: 'bg-slate-50/50 hover:bg-slate-100/85 border-slate-200/60 text-slate-800'}"
											>
												<div class="flex items-center gap-3 truncate pr-2">
													<span class="text-[10px] font-mono font-bold w-5.5 h-5.5 flex items-center justify-center rounded-lg shrink-0 transition-colors
														{isSelected ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-500'}"
													>
														{index + 1}
													</span>
													<span class="truncate font-bold text-xs leading-relaxed">{line}</span>
												</div>
												<span class="shrink-0 text-[10px] font-extrabold px-2.5 py-1 rounded-lg transition border shadow-sm
													{isSelected 
														? 'bg-blue-600 text-white border-blue-500' 
														: 'bg-slate-200 text-slate-600 border-slate-300/40 group-hover:bg-slate-300/80'}"
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
								<div class="flex-grow w-full overflow-auto flex items-center justify-center bg-dot-grid-dark rounded border border-slate-950/20 max-h-[360px]">
									<canvas bind:this={canvasElement} class="max-w-full max-h-full object-contain rounded border border-slate-950 shadow-2xl transition-all duration-300"></canvas>
								</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Card Panel Terminal Logs -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm shadow-blue-500/5 flex flex-col h-[280px]">
					<div class="flex items-center justify-between mb-3 border-b border-slate-100 pb-3 shrink-0">
						<h3 class="text-xs font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2 font-title">
							<svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							{i18n.t('tools.splitPdf.terminalTitle')}
						</h3>
						<button
							onclick={clearLogs}
							class="text-[10px] text-slate-450 hover:text-blue-600 transition font-bold"
						>
							{i18n.t('tools.splitPdf.clearLogs')}
						</button>
					</div>

					<div
						id="log-terminal"
						class="flex-grow bg-slate-950 border border-slate-900 rounded-xl p-4 overflow-y-auto font-mono text-[10px] text-slate-350 select-text scrollbar-thin shadow-inner whitespace-pre-wrap space-y-1 relative"
					>
						<!-- Scanline overlay effect -->
						<div class="absolute inset-0 bg-gradient-to-b from-transparent to-black/10 pointer-events-none select-none"></div>
						
						{#each logs as log}
							<div class="leading-relaxed">
								<span class="text-slate-500 select-none">[{log.time}]</span>
								<span class="
									{log.type === 'success' ? 'text-emerald-450 font-bold' : ''}
									{log.type === 'error' ? 'text-amber-500 font-bold' : ''}
									{log.type === 'warn' ? 'text-yellow-450' : ''}
									{log.type === 'info' ? 'text-slate-300 font-semibold' : ''}"
								>
									{log.message}
								</span>
							</div>
						{/each}
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

<style>
	/* Subtle helper animations */
	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.animate-fade-in {
		animation: fadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
	}
	
	/* Color code terminal logs */
	.text-emerald-450 {
		color: #10b981;
	}
	.text-yellow-450 {
		color: #fbbf24;
	}
</style>
