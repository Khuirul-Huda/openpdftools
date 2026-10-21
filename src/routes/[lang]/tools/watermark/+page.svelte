<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import {
		getPdfLib,
		generateThumbnail,
		formatBytes,
		downloadBlob
	} from '$lib/utils/pdf-helper';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import FileText from '@lucide/svelte/icons/file-text';
	import Hash from '@lucide/svelte/icons/hash';
	import Stamp from '@lucide/svelte/icons/stamp';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Download from '@lucide/svelte/icons/download';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	let currentFile = $state<File | null>(null);
	let fileBuffer = $state<ArrayBuffer | null>(null);
	let totalPages = $state(0);
	let thumbnail = $state('');

	// Active tab
	let activeTab = $state<'numbers' | 'watermark'>('numbers');

	// Page Numbering State
	let enableNumbers = $state(true);
	let numberFormat = $state<'page_x_of_y' | 'simple' | 'dash'>('page_x_of_y');
	let numberPosition = $state<'bottom_center' | 'bottom_right' | 'bottom_left' | 'top_center' | 'top_right'>('bottom_center');
	let numberFontSize = $state(10);

	// Watermark State
	let enableWatermark = $state(false);
	let watermarkText = $state('CONFIDENTIAL');
	let watermarkOpacity = $state(0.2);
	let watermarkFontSize = $state(48);
	let watermarkColor = $state<'gray' | 'red' | 'blue'>('gray');
	let watermarkRotation = $state<'diagonal' | 'horizontal'>('diagonal');

	let isProcessing = $state(false);
	let lastSavedUrl = $state('');

	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	async function handleFileSelect(files: File[]) {
		if (!files || files.length === 0) return;
		const file = files[0];
		currentFile = file;
		if (lastSavedUrl) {
			URL.revokeObjectURL(lastSavedUrl);
			lastSavedUrl = '';
		}

		try {
			const buffer = await file.arrayBuffer();
			fileBuffer = buffer;

			const PDFLib = await getPdfLib();
			const doc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
			totalPages = doc.getPageCount();

			thumbnail = await generateThumbnail(buffer, 1, 160);
		} catch (err) {
			console.error('Failed to load PDF:', err);
			toast.show(i18n.t('tools.watermarkPdf.toastError'), 'error');
		}
	}

	function clearFile() {
		currentFile = null;
		fileBuffer = null;
		totalPages = 0;
		thumbnail = '';
		if (lastSavedUrl) {
			URL.revokeObjectURL(lastSavedUrl);
			lastSavedUrl = '';
		}
	}

	async function executeApply() {
		if (!currentFile || !fileBuffer) {
			toast.show(i18n.t('tools.watermarkPdf.toastSelectPdf'), 'error');
			return;
		}

		if (!enableNumbers && !enableWatermark) {
			toast.show('Please enable either Page Numbers or Watermark Text.', 'error');
			return;
		}

		isProcessing = true;

		try {
			const PDFLib = await getPdfLib();
			const pdfDoc = await PDFLib.PDFDocument.load(fileBuffer, { ignoreEncryption: true });
			const helvetica = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
			const helveticaBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

			const pageCount = pdfDoc.getPageCount();

			for (let i = 0; i < pageCount; i++) {
				const page = pdfDoc.getPage(i);
				const width = page.getWidth();
				const height = page.getHeight();

				// 1. Draw Watermark
				if (enableWatermark && watermarkText.trim()) {
					let rgbColor = PDFLib.rgb(0.5, 0.5, 0.5);
					if (watermarkColor === 'red') rgbColor = PDFLib.rgb(0.85, 0.15, 0.15);
					else if (watermarkColor === 'blue') rgbColor = PDFLib.rgb(0.15, 0.35, 0.85);

					const rotateAngle = watermarkRotation === 'diagonal' ? 45 : 0;
					const font = helveticaBold as { widthOfTextAtSize: (t: string, s: number) => number };
					const textWidth = font.widthOfTextAtSize(watermarkText, watermarkFontSize);

					const centerX = width / 2;
					const centerY = height / 2;

					page.drawText(watermarkText, {
						x: centerX - (textWidth / 2) * Math.cos((rotateAngle * Math.PI) / 180),
						y: centerY - (textWidth / 2) * Math.sin((rotateAngle * Math.PI) / 180),
						size: watermarkFontSize,
						font: helveticaBold,
						color: rgbColor,
						opacity: watermarkOpacity,
						rotate: PDFLib.degrees(rotateAngle)
					});
				}

				// 2. Draw Page Number
				if (enableNumbers) {
					let numText = '';
					if (numberFormat === 'page_x_of_y') numText = `Page ${i + 1} of ${pageCount}`;
					else if (numberFormat === 'simple') numText = `${i + 1}`;
					else if (numberFormat === 'dash') numText = `- ${i + 1} -`;

					const font = helvetica as { widthOfTextAtSize: (t: string, s: number) => number };
					const textWidth = font.widthOfTextAtSize(numText, numberFontSize);

					let x = 40;
					let y = 30;

					if (numberPosition === 'bottom_center') {
						x = (width - textWidth) / 2;
						y = 30;
					} else if (numberPosition === 'bottom_right') {
						x = width - textWidth - 40;
						y = 30;
					} else if (numberPosition === 'bottom_left') {
						x = 40;
						y = 30;
					} else if (numberPosition === 'top_center') {
						x = (width - textWidth) / 2;
						y = height - 40;
					} else if (numberPosition === 'top_right') {
						x = width - textWidth - 40;
						y = height - 40;
					}

					page.drawText(numText, {
						x,
						y,
						size: numberFontSize,
						font: helvetica,
						color: PDFLib.rgb(0.3, 0.3, 0.3),
						opacity: 0.9
					});
				}
			}

			pdfDoc.setTitle?.(currentFile.name.replace(/\.pdf$/i, '') + ' (Stamped)');
			pdfDoc.setProducer?.('OpenPDFTools (100% Client-Side)');

			const stampedBytes = await pdfDoc.save();
			const blob = new Blob([stampedBytes], { type: 'application/pdf' });
			const outputName = `${currentFile.name.replace(/\.pdf$/i, '')}_stamped.pdf`;

			downloadBlob(blob, outputName);
			lastSavedUrl = URL.createObjectURL(blob);
			toast.show(i18n.t('tools.watermarkPdf.toastSuccess'), 'success');
		} catch (err) {
			console.error('Failed to stamp PDF:', err);
			toast.show(i18n.t('tools.watermarkPdf.toastError'), 'error');
		} finally {
			isProcessing = false;
		}
	}
</script>

<Seo
	title={i18n.t('tools.watermarkPdf.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.watermarkPdf.longDescription')}
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
					<Stamp class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.watermarkPdf.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.watermarkPdf.shortDescription')}
			</p>
		</div>

		<span class="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shadow-sm">
			<ShieldCheck class="w-4 h-4 text-emerald-600" />
			{i18n.t('common.privacyBadge')}
		</span>
	</div>

	<!-- Step 1: Upload or Workspace -->
	{#if !currentFile}
		<DropZone
			multiple={false}
			title={i18n.t('tools.watermarkPdf.step1Dropzone')}
			subtitle={i18n.t('tools.watermarkPdf.step1Helper')}
			onfiles={handleFileSelect}
		/>
	{:else}
		<div class="space-y-6">
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

			<!-- Options Tabs -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
				<!-- Tab Navigation -->
				<div class="flex border-b border-slate-200">
					<button
						type="button"
						onclick={() => (activeTab = 'numbers')}
						class="flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition -mb-px {activeTab === 'numbers'
							? 'border-blue-600 text-blue-600'
							: 'border-transparent text-slate-500 hover:text-slate-800'}"
					>
						<Hash class="w-4 h-4" />
						<span>{i18n.t('tools.watermarkPdf.tabNumbers')}</span>
					</button>

					<button
						type="button"
						onclick={() => (activeTab = 'watermark')}
						class="flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition -mb-px {activeTab === 'watermark'
							? 'border-blue-600 text-blue-600'
							: 'border-transparent text-slate-500 hover:text-slate-800'}"
					>
						<Stamp class="w-4 h-4" />
						<span>{i18n.t('tools.watermarkPdf.tabWatermark')}</span>
					</button>
				</div>

				<!-- Tab 1: Page Numbers -->
				{#if activeTab === 'numbers'}
					<div class="space-y-5">
						<label class="flex items-center gap-3 cursor-pointer select-none">
							<input
								type="checkbox"
								bind:checked={enableNumbers}
								class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
							/>
							<span class="text-xs font-bold text-slate-900">Enable Page Numbering</span>
						</label>

						{#if enableNumbers}
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
								<!-- Number format -->
								<div>
									<label for="format-select" class="block text-xs font-bold text-slate-700 mb-1.5">
										{i18n.t('tools.watermarkPdf.formatLabel')}
									</label>
									<select
										id="format-select"
										bind:value={numberFormat}
										class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
									>
										<option value="page_x_of_y">{i18n.t('tools.watermarkPdf.formatPageXofY')}</option>
										<option value="simple">{i18n.t('tools.watermarkPdf.formatSimple')}</option>
										<option value="dash">{i18n.t('tools.watermarkPdf.formatDash')}</option>
									</select>
								</div>

								<!-- Number position -->
								<div>
									<label for="position-select" class="block text-xs font-bold text-slate-700 mb-1.5">
										{i18n.t('tools.watermarkPdf.positionLabel')}
									</label>
									<select
										id="position-select"
										bind:value={numberPosition}
										class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
									>
										<option value="bottom_center">{i18n.t('tools.watermarkPdf.posBottomCenter')}</option>
										<option value="bottom_right">{i18n.t('tools.watermarkPdf.posBottomRight')}</option>
										<option value="bottom_left">{i18n.t('tools.watermarkPdf.posBottomLeft')}</option>
										<option value="top_center">{i18n.t('tools.watermarkPdf.posTopCenter')}</option>
										<option value="top_right">{i18n.t('tools.watermarkPdf.posTopRight')}</option>
									</select>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Tab 2: Watermark Text -->
				{#if activeTab === 'watermark'}
					<div class="space-y-5">
						<label class="flex items-center gap-3 cursor-pointer select-none">
							<input
								type="checkbox"
								bind:checked={enableWatermark}
								class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
							/>
							<span class="text-xs font-bold text-slate-900">Enable Watermark Stamp</span>
						</label>

						{#if enableWatermark}
							<div class="space-y-4 pt-2">
								<div>
									<label for="wm-text" class="block text-xs font-bold text-slate-700 mb-1">
										{i18n.t('tools.watermarkPdf.watermarkTextLabel')}
									</label>
									<input
										id="wm-text"
										type="text"
										bind:value={watermarkText}
										placeholder={i18n.t('tools.watermarkPdf.watermarkPlaceholder')}
										class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
									/>
								</div>

								<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
									<div>
										<label for="wm-color" class="block text-xs font-bold text-slate-700 mb-1">Color</label>
										<select
											id="wm-color"
											bind:value={watermarkColor}
											class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
										>
											<option value="gray">Subtle Gray</option>
											<option value="red">Warning Red</option>
											<option value="blue">Corporate Blue</option>
										</select>
									</div>

									<div>
										<label for="wm-rotation" class="block text-xs font-bold text-slate-700 mb-1">Rotation</label>
										<select
											id="wm-rotation"
											bind:value={watermarkRotation}
											class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
										>
											<option value="diagonal">Diagonal (45&deg;)</option>
											<option value="horizontal">Horizontal (0&deg;)</option>
										</select>
									</div>

									<div>
										<label for="wm-opacity" class="block text-xs font-bold text-slate-700 mb-1">
											{i18n.t('tools.watermarkPdf.opacityLabel')}: {Math.round(watermarkOpacity * 100)}%
										</label>
										<input
											id="wm-opacity"
											type="range"
											min="0.05"
											max="0.8"
											step="0.05"
											bind:value={watermarkOpacity}
											class="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 mt-2"
										/>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Action Bottom -->
				<div class="flex items-center justify-end border-t border-slate-100 pt-5">
					<button
						type="button"
						disabled={isProcessing}
						onclick={executeApply}
						class="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-blue disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
					>
						{#if isProcessing}
							<Loader2 class="w-4 h-4 animate-spin" />
							<span>{i18n.t('tools.watermarkPdf.applying')}</span>
						{:else}
							<Sparkles class="w-4 h-4" />
							<span>{i18n.t('tools.watermarkPdf.applyBtn')}</span>
						{/if}
					</button>
				</div>

				{#if lastSavedUrl}
					<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
						<div class="flex items-center gap-2 text-xs font-bold text-emerald-800">
							<CheckCircle2 class="w-4 h-4 text-emerald-600" />
							<span>{i18n.t('tools.watermarkPdf.successTitle')}</span>
						</div>
						<a
							href={lastSavedUrl}
							download={`${currentFile.name.replace(/\.pdf$/i, '')}_stamped.pdf`}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
						>
							<Download class="w-3.5 h-3.5" />
							<span>{i18n.t('tools.watermarkPdf.downloadBtn')}</span>
						</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- SEO & Info Card -->
	<div class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="space-y-2">
			<h3 class="text-base sm:text-lg font-bold text-slate-900 font-title">
				{i18n.t('tools.watermarkPdf.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.watermarkPdf.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.watermarkPdf.aboutP2')}
			</p>
		</div>

		<!-- FAQs -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.watermarkPdf.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.watermarkPdf.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.watermarkPdf.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.watermarkPdf.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.watermarkPdf.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
