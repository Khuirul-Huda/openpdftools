<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import {
		getPdfLib,
		getPdfJs,
		generateThumbnail,
		formatBytes,
		downloadBlob
	} from '$lib/utils/pdf-helper';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import FileText from '@lucide/svelte/icons/file-text';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Download from '@lucide/svelte/icons/download';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Zap from '@lucide/svelte/icons/zap';
	import Sliders from '@lucide/svelte/icons/sliders';
	import Eye from '@lucide/svelte/icons/eye';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import ZoomOut from '@lucide/svelte/icons/zoom-out';

	type CompressionPreset = 'extreme' | 'recommended' | 'light';

	interface PresetConfig {
		scale: number;
		quality: number;
		id: CompressionPreset;
		titleKey: string;
		descKey: string;
		badge: string;
	}

	const presets: PresetConfig[] = [
		{
			id: 'extreme',
			scale: 1.0,
			quality: 0.5,
			titleKey: 'tools.compressPdf.presetExtreme',
			descKey: 'tools.compressPdf.presetExtremeDesc',
			badge: 'Max Savings'
		},
		{
			id: 'recommended',
			scale: 1.3,
			quality: 0.72,
			titleKey: 'tools.compressPdf.presetRecommended',
			descKey: 'tools.compressPdf.presetRecommendedDesc',
			badge: 'Recommended'
		},
		{
			id: 'light',
			scale: 1.8,
			quality: 0.88,
			titleKey: 'tools.compressPdf.presetLight',
			descKey: 'tools.compressPdf.presetLightDesc',
			badge: 'Crisp'
		}
	];

	let selectedPreset = $state<CompressionPreset>('recommended');
	let currentFile = $state<File | null>(null);
	let fileBuffer = $state<ArrayBuffer | null>(null);
	let totalPages = $state(0);
	let thumbnail = $state('');

	// Quality Inspector State
	let previewCanvas = $state<HTMLCanvasElement | null>(null);
	let previewMode = $state<'compressed' | 'original'>('compressed');
	let previewZoom = $state(90);
	let isRenderingPreview = $state(false);
	let previewEstimatedKB = $state(0);

	let isCompressing = $state(false);
	let progress = $state({ current: 0, total: 0 });
	let compressedBlob = $state<Blob | null>(null);
	let compressedSize = $state(0);
	let downloadUrl = $state('');

	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	let savedPercentage = $derived.by(() => {
		if (!currentFile || compressedSize === 0) return 0;
		const diff = currentFile.size - compressedSize;
		if (diff <= 0) return 0;
		return Math.round((diff / currentFile.size) * 100);
	});

	async function renderQualityPreview() {
		if (!fileBuffer || !previewCanvas) return;
		isRenderingPreview = true;
		try {
			const pdfjs = await getPdfJs();
			const doc = await pdfjs.getDocument({ data: fileBuffer }).promise;
			const page = await doc.getPage(1);

			const config = presets.find((p) => p.id === selectedPreset) || presets[1];
			const displayScale = (previewZoom / 100);

			if (previewMode === 'original') {
				const viewport = page.getViewport({ scale: displayScale * 1.25 });
				const canvas = previewCanvas;
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const ctx = canvas.getContext('2d');
				if (ctx) {
					await page.render({ canvasContext: ctx, viewport }).promise;
				}
				previewEstimatedKB = Math.round((currentFile ? currentFile.size / Math.max(1, totalPages) : 120000) / 1024);
			} else {
				// Render at preset scale & quality
				const renderScale = config.scale;
				const viewport = page.getViewport({ scale: renderScale });
				const offCanvas = document.createElement('canvas');
				offCanvas.width = Math.floor(viewport.width);
				offCanvas.height = Math.floor(viewport.height);
				const offCtx = offCanvas.getContext('2d');
				if (offCtx) {
					await page.render({ canvasContext: offCtx, viewport }).promise;
					const blob = await new Promise<Blob | null>((resolve) =>
						offCanvas.toBlob((b) => resolve(b), 'image/jpeg', config.quality)
					);
					if (blob) {
						previewEstimatedKB = Math.round(blob.size / 1024);
						const imgUrl = URL.createObjectURL(blob);
						const img = new Image();
						await new Promise((resolve) => {
							img.onload = resolve;
							img.src = imgUrl;
						});
						const canvas = previewCanvas;
						const finalViewport = page.getViewport({ scale: displayScale * 1.25 });
						canvas.width = Math.floor(finalViewport.width);
						canvas.height = Math.floor(finalViewport.height);
						const ctx = canvas.getContext('2d');
						if (ctx) {
							ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
						}
						URL.revokeObjectURL(imgUrl);
					}
				}
			}
			await doc.destroy();
		} catch (e) {
			console.warn('Quality preview render error:', e);
		} finally {
			isRenderingPreview = false;
		}
	}

	$effect(() => {
		if (fileBuffer && previewCanvas) {
			const _p = selectedPreset;
			const _m = previewMode;
			const _z = previewZoom;
			renderQualityPreview();
		}
	});

	async function handleFileSelect(files: File[]) {
		if (!files || files.length === 0) return;
		const file = files[0];
		currentFile = file;
		compressedBlob = null;
		compressedSize = 0;
		if (downloadUrl) {
			URL.revokeObjectURL(downloadUrl);
			downloadUrl = '';
		}

		try {
			const buffer = await file.arrayBuffer();
			fileBuffer = buffer;

			const PDFLib = await getPdfLib();
			const doc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
			totalPages = doc.getPageCount();

			thumbnail = await generateThumbnail(buffer, 1, 160);
			renderQualityPreview();
		} catch (err) {
			console.error('Failed to parse uploaded PDF:', err);
			toast.show(i18n.t('tools.compressPdf.toastError'), 'error');
		}
	}

	function clearFile() {
		currentFile = null;
		fileBuffer = null;
		totalPages = 0;
		thumbnail = '';
		compressedBlob = null;
		compressedSize = 0;
		if (downloadUrl) {
			URL.revokeObjectURL(downloadUrl);
			downloadUrl = '';
		}
	}

	async function executeCompression() {
		if (!currentFile || !fileBuffer) {
			toast.show(i18n.t('tools.compressPdf.toastSelectPdf'), 'error');
			return;
		}

		isCompressing = true;
		progress = { current: 0, total: totalPages };

		try {
			const config = presets.find((p) => p.id === selectedPreset) || presets[1];
			const pdfjs = await getPdfJs();
			const PDFLib = await getPdfLib();

			const srcDoc = await pdfjs.getDocument({ data: fileBuffer }).promise;
			const outDoc = await PDFLib.PDFDocument.create();

			for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
				progress.current = pageNum;
				const page = await srcDoc.getPage(pageNum);
				const viewport = page.getViewport({ scale: config.scale });

				const canvas = document.createElement('canvas');
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const ctx = canvas.getContext('2d');

				if (ctx) {
					// Render page to canvas
					await page.render({ canvasContext: ctx, viewport }).promise;

					// Export as compressed JPEG
					const blob = await new Promise<Blob | null>((resolve) =>
						canvas.toBlob((b) => resolve(b), 'image/jpeg', config.quality)
					);

					if (blob) {
						const imgBytes = new Uint8Array(await blob.arrayBuffer());
						const embeddedImg = await outDoc.embedJpg(imgBytes);

						// Add page to new document with exact dimensions
						const newPage = outDoc.addPage([viewport.width, viewport.height]);
						newPage.drawImage(embeddedImg, {
							x: 0,
							y: 0,
							width: viewport.width,
							height: viewport.height
						});
					}
				}

				// Free canvas element
				canvas.width = 0;
				canvas.height = 0;
			}

			await srcDoc.destroy();

			outDoc.setTitle?.(currentFile.name.replace(/\.pdf$/i, '') + ' (Compressed)');
			outDoc.setProducer?.('OpenPDFTools (100% Client-Side Compressor)');

			const outBytes = await outDoc.save();
			compressedBlob = new Blob([outBytes], { type: 'application/pdf' });
			compressedSize = compressedBlob.size;
			downloadUrl = URL.createObjectURL(compressedBlob);

			toast.show(i18n.t('tools.compressPdf.toastSuccess'), 'success');
		} catch (err) {
			console.error('Compression failed:', err);
			toast.show(i18n.t('tools.compressPdf.toastError'), 'error');
		} finally {
			isCompressing = false;
		}
	}

	function handleDownload() {
		if (!compressedBlob || !currentFile) return;
		const baseName = currentFile.name.replace(/\.pdf$/i, '');
		const outputName = `${baseName}_compressed.pdf`;
		downloadBlob(compressedBlob, outputName);
	}
</script>

<Seo
	title={i18n.t('tools.compressPdf.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.compressPdf.longDescription')}
/>

<div class="space-y-10 max-w-4xl mx-auto">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-6">
		<div class="space-y-1.5">
			<a
				href={resolveRoute('/[lang]', { lang: i18n.current })}
				class="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition"
			>
				<ArrowLeft class="w-4 h-4" />
				<span>{i18n.t('tools.splitPdf.btnBack')}</span>
			</a>
			<div class="flex items-center gap-3">
				<div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shadow-sm">
					<Zap class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.compressPdf.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.compressPdf.shortDescription')}
			</p>
		</div>

		<span class="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shadow-sm">
			<ShieldCheck class="w-4 h-4 text-emerald-600" />
			{i18n.t('common.privacyBadge')}
		</span>
	</div>

	<!-- Step 1: Upload or Active Document -->
	{#if !currentFile}
		<DropZone
			multiple={false}
			title={i18n.t('tools.compressPdf.step1Dropzone')}
			subtitle={i18n.t('tools.compressPdf.step1Helper')}
			onfiles={handleFileSelect}
		/>
	{:else}
		<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
			<!-- Left Column: Controls & Result (5 cols) -->
			<div class="lg:col-span-5 space-y-6">
				<!-- Document Card -->
				<div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
					<div class="flex items-center gap-4 w-full sm:w-auto">
						<div class="w-16 h-20 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
							{#if thumbnail}
								<img src={thumbnail} alt={currentFile.name} class="max-w-full max-h-full object-contain" />
							{:else}
								<FileText class="w-8 h-8 text-slate-400" />
							{/if}
						</div>

						<div class="space-y-1 overflow-hidden">
							<h3 class="text-sm font-bold text-slate-900 truncate" title={currentFile.name}>
								{currentFile.name}
							</h3>
							<div class="flex items-center gap-2 text-xs text-slate-500 font-semibold">
								<span>{formatBytes(currentFile.size)}</span>
								<span>&bull;</span>
								<span class="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-100">
									{i18n.t('tools.mergePdf.pageCount', { count: totalPages })}
								</span>
							</div>
						</div>
					</div>

					<button
						type="button"
						onclick={clearFile}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.mergePdf.remove')}</span>
					</button>
				</div>

				<!-- Preset Selection -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
					<div class="flex items-center gap-2 border-b border-slate-100 pb-3">
						<Sliders class="w-4 h-4 text-blue-600" />
						<h3 class="text-sm font-bold text-slate-800">
							{i18n.t('tools.compressPdf.compressionLevel')}
						</h3>
					</div>

					<div class="grid grid-cols-1 gap-3">
						{#each presets as preset}
							<button
								type="button"
								onclick={() => (selectedPreset = preset.id)}
								class="text-left p-3.5 rounded-xl border transition-all duration-200 flex flex-col justify-between space-y-1.5 cursor-pointer {selectedPreset === preset.id
									? 'border-blue-600 bg-blue-50/50 shadow-sm shadow-blue-500/10 ring-2 ring-blue-500/20'
									: 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'}"
							>
								<div class="flex items-center justify-between">
									<span class="text-xs font-bold text-slate-900">{i18n.t(preset.titleKey)}</span>
									<span class="text-[10px] font-bold px-2 py-0.5 rounded-full {selectedPreset === preset.id
										? 'bg-blue-600 text-white'
										: 'bg-slate-100 text-slate-600'}">
										{preset.badge}
									</span>
								</div>
								<p class="text-[11px] text-slate-500 font-medium leading-relaxed">
									{i18n.t(preset.descKey)}
								</p>
							</button>
						{/each}
					</div>

					<div class="pt-2 flex justify-end">
						<button
							type="button"
							disabled={isCompressing}
							onclick={executeCompression}
							class="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] rounded-xl shadow-glow-button hover:shadow-glow-blue-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
						>
							{#if isCompressing}
								<Loader2 class="w-4 h-4 animate-spin" />
								<span>{i18n.t('tools.compressPdf.compressing', { current: progress.current, total: progress.total })}</span>
							{:else}
								<Sparkles class="w-4 h-4" />
								<span>{i18n.t('tools.compressPdf.compressBtn')}</span>
							{/if}
						</button>
					</div>
				</div>

				<!-- Result Card -->
				{#if compressedBlob}
					<div class="bg-gradient-to-br from-emerald-50/80 to-blue-50/50 border border-emerald-200 rounded-2xl p-6 shadow-sm space-y-5">
						<div class="flex items-center justify-between flex-wrap gap-2">
							<div class="flex items-center gap-2.5">
								<div class="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
									<CheckCircle2 class="w-5 h-5" />
								</div>
								<div>
									<h3 class="text-base font-bold text-slate-900 font-title">
										{i18n.t('tools.compressPdf.successTitle')}
									</h3>
									<p class="text-xs text-slate-500 font-medium">
										{i18n.t('tools.compressPdf.toastSuccess')}
									</p>
								</div>
							</div>

							{#if savedPercentage > 0}
								<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-black shadow-xs animate-pulse">
									<span>-{savedPercentage}%</span>
									<span>{i18n.t('tools.compressPdf.spaceSaved')}</span>
								</div>
							{/if}
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div class="bg-white/90 border border-slate-200 rounded-xl p-3 space-y-0.5">
								<span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{i18n.t('tools.compressPdf.originalSize')}</span>
								<div class="text-xs font-extrabold text-slate-700">{formatBytes(currentFile.size)}</div>
							</div>

							<div class="bg-white/90 border border-emerald-300 rounded-xl p-3 space-y-0.5 shadow-xs">
								<span class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">{i18n.t('tools.compressPdf.compressedSize')}</span>
								<div class="text-xs font-extrabold text-emerald-700">{formatBytes(compressedSize)}</div>
							</div>
						</div>

						<div class="flex items-center justify-between flex-wrap gap-3 pt-1">
							<button
								type="button"
								onclick={clearFile}
								class="text-xs font-bold text-slate-600 hover:text-slate-900 transition underline underline-offset-4"
							>
								{i18n.t('tools.compressPdf.compressAnother')}
							</button>

							<button
								type="button"
								onclick={handleDownload}
								class="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition active:scale-[0.98] cursor-pointer"
							>
								<Download class="w-4 h-4" />
								<span>{i18n.t('tools.compressPdf.downloadBtn')}</span>
							</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Right Column: Live Quality Inspector (7 cols) -->
			<div class="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
				<div class="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
					<div class="flex items-center gap-2">
						<Eye class="w-4 h-4 text-blue-600" />
						<div>
							<h3 class="text-xs font-bold text-slate-800">
								{i18n.t('tools.compressPdf.inspectQuality')}
							</h3>
						</div>
					</div>

					<div class="flex items-center gap-2.5">
						<!-- Toggle Original vs Compressed -->
						<div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
							<button
								type="button"
								onclick={() => (previewMode = 'original')}
								class="px-2.5 py-1 text-[11px] font-bold rounded-md transition {previewMode === 'original'
									? 'bg-white text-slate-800 shadow-xs'
									: 'text-slate-500 hover:text-slate-800'}"
							>
								{i18n.t('tools.compressPdf.compareOriginal')}
							</button>
							<button
								type="button"
								onclick={() => (previewMode = 'compressed')}
								class="px-2.5 py-1 text-[11px] font-bold rounded-md transition {previewMode === 'compressed'
									? 'bg-white text-blue-600 shadow-xs'
									: 'text-slate-500 hover:text-slate-800'}"
							>
								{i18n.t('tools.compressPdf.compareCompressed')}
							</button>
						</div>

						<!-- Zoom Controls -->
						<div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
							<button
								type="button"
								onclick={() => (previewZoom = Math.max(50, previewZoom - 15))}
								class="p-1 rounded hover:bg-white text-slate-600 transition"
								title="Zoom Out"
							>
								<ZoomOut class="w-3.5 h-3.5" />
							</button>
							<span class="text-[10px] font-bold text-slate-600 px-1 select-none">{previewZoom}%</span>
							<button
								type="button"
								onclick={() => (previewZoom = Math.min(150, previewZoom + 15))}
								class="p-1 rounded hover:bg-white text-slate-600 transition"
								title="Zoom In"
							>
								<ZoomIn class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				</div>

				<div class="flex items-center justify-between text-[11px] text-slate-500">
					<span>{i18n.t('tools.compressPdf.inspectHint')}</span>
					{#if previewEstimatedKB > 0}
						<span class="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
							Page 1: ~{previewEstimatedKB} KB
						</span>
					{/if}
				</div>

				<!-- Live Preview Canvas Viewport -->
				<div class="w-full min-h-[460px] max-h-[580px] bg-slate-100/70 bg-dot-grid rounded-xl border border-slate-200/80 p-4 flex items-center justify-center overflow-auto relative shadow-inner">
					{#if isRenderingPreview}
						<div class="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center z-10">
							<Loader2 class="w-6 h-6 text-blue-600 animate-spin" />
						</div>
					{/if}

					<canvas
						bind:this={previewCanvas}
						class="max-w-full rounded shadow-md bg-white border border-slate-200 transition-all duration-200"
					></canvas>
				</div>
			</div>
		</div>
	{/if}

	<!-- SEO & Info Card -->
	<div class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="space-y-2">
			<h3 class="text-base sm:text-lg font-bold text-slate-900 font-title">
				{i18n.t('tools.compressPdf.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.compressPdf.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.compressPdf.aboutP2')}
			</p>
		</div>

		<!-- FAQs -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.compressPdf.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.compressPdf.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.compressPdf.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.compressPdf.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.compressPdf.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
