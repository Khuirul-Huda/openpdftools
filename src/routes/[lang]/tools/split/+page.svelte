<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import {
		getPdfLib,
		getJSZip,
		generateThumbnail,
		generateBatchThumbnails,
		parsePageRanges,
		formatBytes,
		downloadBlob
	} from '$lib/utils/pdf-helper';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Split from '@lucide/svelte/icons/split';
	import FileText from '@lucide/svelte/icons/file-text';
	import FileArchive from '@lucide/svelte/icons/file-archive';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Download from '@lucide/svelte/icons/download';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Eye from '@lucide/svelte/icons/eye';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';

	let currentFile = $state<File | null>(null);
	let fileBuffer = $state<ArrayBuffer | null>(null);
	let totalPages = $state(0);
	let thumbnail = $state('');

	// Visual Page Grid & Preview State
	let pageThumbnails = $state<Record<number, string>>({});
	let isLoadingThumbnails = $state(false);
	let inspectedPage = $state<number | null>(null);
	let inspectedHighResUrl = $state('');
	let isLoadingHighRes = $state(false);

	// Split Options
	let splitMode = $state<'ranges' | 'all'>('ranges');
	let rangeInput = $state('1-2');
	let mergeRanges = $state(false);

	let isProcessing = $state(false);
	let progress = $state({ current: 0, total: 0 });
	let lastOutputUrl = $state('');
	let lastOutputName = $state('');
	let isOutputZip = $state(false);

	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	let parsedRanges = $derived.by(() => {
		if (totalPages <= 0) return [];
		if (splitMode === 'all') {
			return Array.from({ length: totalPages }, (_, i) => [i]);
		}
		return parsePageRanges(rangeInput, totalPages);
	});

	// Check if a 1-based page number is in any range
	function getPageRangeBadge(pageNum: number): { isSelected: boolean; rangeIndex: number } {
		const pageIdx = pageNum - 1;
		for (let r = 0; r < parsedRanges.length; r++) {
			if (parsedRanges[r].includes(pageIdx)) {
				return { isSelected: true, rangeIndex: r + 1 };
			}
		}
		return { isSelected: false, rangeIndex: 0 };
	}

	function numbersToRangeString(nums: number[]): string {
		if (nums.length === 0) return '';
		const sorted = Array.from(new Set(nums)).sort((a, b) => a - b);
		const ranges: string[] = [];
		let start = sorted[0];
		let prev = sorted[0];

		for (let i = 1; i < sorted.length; i++) {
			const curr = sorted[i];
			if (curr === prev + 1) {
				prev = curr;
			} else {
				ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
				start = curr;
				prev = curr;
			}
		}
		ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
		return ranges.join(', ');
	}

	function togglePageSelection(pageNum: number) {
		if (splitMode === 'all') {
			splitMode = 'ranges';
		}
		const currentPages = new Set(parsedRanges.flat().map((p) => p + 1));
		if (currentPages.has(pageNum)) {
			currentPages.delete(pageNum);
		} else {
			currentPages.add(pageNum);
		}
		rangeInput = numbersToRangeString(Array.from(currentPages));
	}

	function selectAllPages() {
		if (splitMode === 'all') splitMode = 'ranges';
		rangeInput = totalPages > 1 ? `1-${totalPages}` : '1';
	}

	function deselectAllPages() {
		if (splitMode === 'all') splitMode = 'ranges';
		rangeInput = '';
	}

	function invertSelection() {
		if (splitMode === 'all') splitMode = 'ranges';
		const currentPages = new Set(parsedRanges.flat().map((p) => p + 1));
		const inverted: number[] = [];
		for (let i = 1; i <= totalPages; i++) {
			if (!currentPages.has(i)) inverted.push(i);
		}
		rangeInput = numbersToRangeString(inverted);
	}

	async function openInspect(pageNum: number) {
		inspectedPage = pageNum;
		if (!fileBuffer) return;
		isLoadingHighRes = true;
		try {
			const highRes = await generateThumbnail(fileBuffer, pageNum, 700);
			inspectedHighResUrl = highRes;
		} finally {
			isLoadingHighRes = false;
		}
	}

	function closeInspect() {
		inspectedPage = null;
		inspectedHighResUrl = '';
	}

	function changeInspectPage(delta: number) {
		if (inspectedPage === null) return;
		const next = inspectedPage + delta;
		if (next >= 1 && next <= totalPages) {
			openInspect(next);
		}
	}

	async function handleFileSelect(files: File[]) {
		if (!files || files.length === 0) return;
		const file = files[0];
		currentFile = file;
		pageThumbnails = {};
		inspectedPage = null;
		inspectedHighResUrl = '';
		if (lastOutputUrl) {
			URL.revokeObjectURL(lastOutputUrl);
			lastOutputUrl = '';
		}

		try {
			const buffer = await file.arrayBuffer();
			fileBuffer = buffer;

			const PDFLib = await getPdfLib();
			const doc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
			totalPages = doc.getPageCount();

			rangeInput = totalPages > 1 ? `1-${Math.min(totalPages, 3)}` : '1';
			thumbnail = await generateThumbnail(buffer, 1, 160);
			pageThumbnails[1] = thumbnail;

			// Asynchronously generate remaining thumbnails without blocking
			isLoadingThumbnails = true;
			const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1);
			generateBatchThumbnails(buffer, pageNums, 160, (pageNum, dataUrl) => {
				pageThumbnails[pageNum] = dataUrl;
			}).finally(() => {
				isLoadingThumbnails = false;
			});
		} catch (err) {
			console.error('Failed to load PDF for split:', err);
			toast.show(i18n.t('tools.splitRangePdf.toastError'), 'error');
		}
	}

	function clearFile() {
		currentFile = null;
		fileBuffer = null;
		totalPages = 0;
		thumbnail = '';
		pageThumbnails = {};
		inspectedPage = null;
		inspectedHighResUrl = '';
		if (lastOutputUrl) {
			URL.revokeObjectURL(lastOutputUrl);
			lastOutputUrl = '';
		}
	}

	async function executeSplit() {
		if (!currentFile || !fileBuffer) {
			toast.show(i18n.t('tools.splitRangePdf.toastSelectPdf'), 'error');
			return;
		}

		if (parsedRanges.length === 0) {
			toast.show(i18n.t('tools.splitRangePdf.toastInvalidRange'), 'error');
			return;
		}

		isProcessing = true;
		progress = { current: 0, total: parsedRanges.length };

		try {
			const PDFLib = await getPdfLib();
			const baseName = currentFile.name.replace(/\.pdf$/i, '');

			// Case 1: Merge all ranges into a single PDF
			if (splitMode === 'ranges' && mergeRanges) {
				const srcDoc = await PDFLib.PDFDocument.load(fileBuffer, { ignoreEncryption: true });
				const outDoc = await PDFLib.PDFDocument.create();

				for (let i = 0; i < parsedRanges.length; i++) {
					progress.current = i + 1;
					const range = parsedRanges[i];
					const copied = await outDoc.copyPages(srcDoc, range);
					for (const p of copied) outDoc.addPage(p);
				}

				const outBytes = await outDoc.save();
				const blob = new Blob([outBytes], { type: 'application/pdf' });
				const filename = `${baseName}_extracted.pdf`;

				downloadBlob(blob, filename);
				lastOutputUrl = URL.createObjectURL(blob);
				lastOutputName = filename;
				isOutputZip = false;
				toast.show(i18n.t('tools.splitRangePdf.toastSuccess'), 'success');
				return;
			}

			// Case 2: Only 1 range extracted -> direct single PDF download
			if (splitMode === 'ranges' && parsedRanges.length === 1) {
				const srcDoc = await PDFLib.PDFDocument.load(fileBuffer, { ignoreEncryption: true });
				const outDoc = await PDFLib.PDFDocument.create();

				const copied = await outDoc.copyPages(srcDoc, parsedRanges[0]);
				for (const p of copied) outDoc.addPage(p);

				const outBytes = await outDoc.save();
				const blob = new Blob([outBytes], { type: 'application/pdf' });
				const filename = `${baseName}_range_${parsedRanges[0].map((idx) => idx + 1).join('-')}.pdf`;

				downloadBlob(blob, filename);
				lastOutputUrl = URL.createObjectURL(blob);
				lastOutputName = filename;
				isOutputZip = false;
				toast.show(i18n.t('tools.splitRangePdf.toastSuccess'), 'success');
				return;
			}

			// Case 3: Multiple ranges or Extract All Pages -> bundle into ZIP
			const JSZip = await getJSZip();
			const zip = new JSZip();
			const srcDoc = await PDFLib.PDFDocument.load(fileBuffer, { ignoreEncryption: true });

			for (let i = 0; i < parsedRanges.length; i++) {
				progress.current = i + 1;
				const range = parsedRanges[i];
				const outDoc = await PDFLib.PDFDocument.create();
				const copied = await outDoc.copyPages(srcDoc, range);
				for (const p of copied) outDoc.addPage(p);

				const outBytes = await outDoc.save();

				let fileLabel = '';
				if (splitMode === 'all') {
					fileLabel = `page_${String(range[0] + 1).padStart(3, '0')}.pdf`;
				} else {
					fileLabel = `range_${i + 1}_(pages_${range.map((idx) => idx + 1).join('-')}).pdf`;
				}

				zip.file(`${baseName}_${fileLabel}`, outBytes);
			}

			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const zipName = `${baseName}_split_pages.zip`;

			downloadBlob(zipBlob, zipName);
			lastOutputUrl = URL.createObjectURL(zipBlob);
			lastOutputName = zipName;
			isOutputZip = true;
			toast.show(i18n.t('tools.splitRangePdf.toastSuccess'), 'success');
		} catch (err) {
			console.error('Failed to split PDF:', err);
			toast.show(i18n.t('tools.splitRangePdf.toastError'), 'error');
		} finally {
			isProcessing = false;
		}
	}
</script>

<Seo
	title={i18n.t('tools.splitRangePdf.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.splitRangePdf.longDescription')}
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
				<div class="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shadow-sm">
					<Split class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.splitRangePdf.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.splitRangePdf.shortDescription')}
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
			title={i18n.t('tools.splitRangePdf.step1Dropzone')}
			subtitle={i18n.t('tools.splitRangePdf.step1Helper')}
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
							<span class="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-100">
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

			<!-- Split Configuration -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
				<div>
					<label for="split-mode" class="block text-xs font-bold text-slate-700 mb-2">
						{i18n.t('tools.splitRangePdf.splitModeLabel')}
					</label>
					<div class="grid grid-cols-2 gap-3 max-w-md">
						<button
							type="button"
							onclick={() => (splitMode = 'ranges')}
							class="px-4 py-2.5 text-xs font-bold rounded-xl border transition {splitMode === 'ranges'
								? 'bg-rose-600 text-white border-rose-600 shadow-xs'
								: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
						>
							{i18n.t('tools.splitRangePdf.modeCustomRanges')}
						</button>
						<button
							type="button"
							onclick={() => (splitMode = 'all')}
							class="px-4 py-2.5 text-xs font-bold rounded-xl border transition {splitMode === 'all'
								? 'bg-rose-600 text-white border-rose-600 shadow-xs'
								: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
						>
							{i18n.t('tools.splitRangePdf.modeExtractAll')}
						</button>
					</div>
				</div>

				{#if splitMode === 'ranges'}
					<div class="space-y-4 pt-1">
						<div>
							<label for="range-input" class="block text-xs font-bold text-slate-700 mb-1.5">
								{i18n.t('tools.splitRangePdf.rangeInputLabel')}
							</label>
							<input
								id="range-input"
								type="text"
								bind:value={rangeInput}
								placeholder="1-3, 5, 8-10"
								class="w-full max-w-md text-xs font-semibold px-3 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
							/>
						</div>

						<label class="flex items-center gap-2.5 cursor-pointer select-none">
							<input
								type="checkbox"
								bind:checked={mergeRanges}
								class="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
							/>
							<span class="text-xs font-semibold text-slate-700">
								{i18n.t('tools.splitRangePdf.mergeRangesLabel')}
							</span>
						</label>
					</div>
				{/if}

				<!-- Extracted Sections Preview -->
				{#if parsedRanges.length > 0}
					<div class="border-t border-slate-100 pt-5 space-y-3">
						<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
							{i18n.t('tools.splitRangePdf.previewTitle')} ({parsedRanges.length} output files)
						</h4>
						<div class="flex flex-wrap gap-2">
							{#each parsedRanges as range, idx}
								<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg">
									<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
									{i18n.t('tools.splitRangePdf.sectionLabel', {
										index: idx + 1,
										pages: range.map((p) => p + 1).join(', ')
									})}
								</span>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Interactive Visual Page Grid & Preview -->
				<div class="border-t border-slate-100 pt-6 space-y-4">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
						<div class="space-y-0.5">
							<div class="flex items-center gap-2">
								<Eye class="w-4 h-4 text-rose-600" />
								<h4 class="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
									{i18n.t('tools.splitRangePdf.visualGridTitle')}
								</h4>
								{#if isLoadingThumbnails}
									<Loader2 class="w-3.5 h-3.5 text-rose-500 animate-spin" />
								{/if}
							</div>
							<p class="text-[11px] text-slate-500 font-medium">
								{i18n.t('tools.splitRangePdf.visualGridSubtitle')}
							</p>
						</div>

						<div class="flex items-center gap-1.5 flex-wrap">
							<button
								type="button"
								onclick={selectAllPages}
								class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
							>
								{i18n.t('tools.splitRangePdf.selectAll')}
							</button>
							<button
								type="button"
								onclick={deselectAllPages}
								class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
							>
								{i18n.t('tools.splitRangePdf.deselectAll')}
							</button>
							<button
								type="button"
								onclick={invertSelection}
								class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
							>
								{i18n.t('tools.splitRangePdf.invertSelection')}
							</button>
						</div>
					</div>

					<!-- Page Grid Thumbnails -->
					<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[460px] overflow-y-auto p-2 bg-slate-50/70 border border-slate-200/80 rounded-xl">
						{#each Array.from({ length: totalPages }, (_, i) => i + 1) as pageNum}
							{@const rangeBadge = getPageRangeBadge(pageNum)}
							<div
								role="button"
								tabindex="0"
								onclick={() => togglePageSelection(pageNum)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										togglePageSelection(pageNum);
									}
								}}
								class="group relative rounded-xl border-2 transition-all cursor-pointer overflow-hidden p-2 flex flex-col justify-between select-none {rangeBadge.isSelected
									? 'bg-rose-50/40 border-rose-500 shadow-xs'
									: 'bg-white border-slate-200 hover:border-slate-300 opacity-60 hover:opacity-100'}"
							>
								<!-- Top Status Bar in Card -->
								<div class="flex items-center justify-between w-full mb-1.5 z-10">
									{#if rangeBadge.isSelected}
										<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-bold shadow-xs">
											<Check class="w-3 h-3 stroke-[3]" />
											<span>{splitMode === 'all' ? `P.${pageNum}` : `R#${rangeBadge.rangeIndex}`}</span>
										</span>
									{:else}
										<span class="px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-600 text-[10px] font-bold">
											P.{pageNum}
										</span>
									{/if}

									<!-- Click-to-Inspect Button -->
									<button
										type="button"
										onclick={(e) => {
											e.stopPropagation();
											openInspect(pageNum);
										}}
										class="p-1 rounded-md bg-white/90 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border border-slate-200/70 shadow-xs transition"
										title={i18n.t('tools.splitRangePdf.inspectPage')}
									>
										<ZoomIn class="w-3.5 h-3.5" />
									</button>
								</div>

								<!-- Document Thumbnail Preview -->
								<div class="w-full h-32 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200/60 relative">
									{#if pageThumbnails[pageNum]}
										<img
											src={pageThumbnails[pageNum]}
											alt="Page {pageNum}"
											class="max-w-full max-h-full object-contain pointer-events-none"
										/>
									{:else}
										<div class="flex flex-col items-center gap-1 text-slate-400">
											<Loader2 class="w-4 h-4 animate-spin text-slate-400" />
											<span class="text-[10px] font-semibold">P.{pageNum}</span>
										</div>
									{/if}
								</div>

								<!-- Bottom Label -->
								<div class="mt-1.5 text-center">
									<span class="text-[11px] font-bold text-slate-700">
										Page {pageNum}
									</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Action CTA -->
				<div class="border-t border-slate-100 pt-5 flex justify-end">
					<button
						type="button"
						disabled={isProcessing || parsedRanges.length === 0}
						onclick={executeSplit}
						class="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-blue disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
					>
						{#if isProcessing}
							<Loader2 class="w-4 h-4 animate-spin" />
							<span>{i18n.t('tools.splitRangePdf.splitting', { current: progress.current, total: progress.total })}</span>
						{:else}
							<Sparkles class="w-4 h-4" />
							<span>{i18n.t('tools.splitRangePdf.splitBtn')}</span>
						{/if}
					</button>
				</div>

				{#if lastOutputUrl}
					<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
						<div class="flex items-center gap-2 text-xs font-bold text-emerald-800">
							<CheckCircle2 class="w-4 h-4 text-emerald-600" />
							<span>{i18n.t('tools.splitRangePdf.successTitle')}</span>
						</div>
						<a
							href={lastOutputUrl}
							download={lastOutputName}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
						>
							{#if isOutputZip}
								<FileArchive class="w-3.5 h-3.5" />
								<span>{i18n.t('tools.splitRangePdf.downloadZipBtn')}</span>
							{:else}
								<Download class="w-3.5 h-3.5" />
								<span>{i18n.t('tools.splitRangePdf.downloadPdfBtn')}</span>
							{/if}
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
				{i18n.t('tools.splitRangePdf.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.splitRangePdf.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.splitRangePdf.aboutP2')}
			</p>
		</div>

		<!-- FAQs -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.splitRangePdf.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.splitRangePdf.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.splitRangePdf.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.splitRangePdf.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.splitRangePdf.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Page Lightbox / Inspector Modal -->
	{#if inspectedPage !== null}
		{@const rangeBadge = getPageRangeBadge(inspectedPage)}
		<div class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
				<!-- Modal Header -->
				<div class="flex items-center justify-between border-b border-slate-100 pb-3">
					<div class="flex items-center gap-2">
						<Eye class="w-4 h-4 text-rose-600" />
						<h3 class="text-sm font-bold text-slate-900 font-title">
							{i18n.t('tools.splitRangePdf.pagePreviewModal')} — Page {inspectedPage} of {totalPages}
						</h3>
					</div>

					<div class="flex items-center gap-2">
						<!-- Prev / Next Page -->
						<div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
							<button
								type="button"
								disabled={inspectedPage <= 1}
								onclick={() => changeInspectPage(-1)}
								class="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
								title="Previous Page"
							>
								<ChevronLeft class="w-4 h-4" />
							</button>
							<button
								type="button"
								disabled={inspectedPage >= totalPages}
								onclick={() => changeInspectPage(1)}
								class="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
								title="Next Page"
							>
								<ChevronRight class="w-4 h-4" />
							</button>
						</div>

						<button
							type="button"
							onclick={closeInspect}
							class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
							title="Close"
						>
							<X class="w-5 h-5" />
						</button>
					</div>
				</div>

				<!-- High-Res Document Render Viewport -->
				<div class="w-full flex-1 min-h-[350px] bg-slate-100/80 bg-dot-grid rounded-xl border border-slate-200/80 p-4 flex items-center justify-center overflow-auto relative shadow-inner">
					{#if isLoadingHighRes}
						<div class="flex flex-col items-center gap-2 text-rose-600">
							<Loader2 class="w-7 h-7 animate-spin" />
							<span class="text-xs font-semibold text-slate-600">Rendering high-res page...</span>
						</div>
					{:else if inspectedHighResUrl}
						<img
							src={inspectedHighResUrl}
							alt="Page {inspectedPage} Preview"
							class="max-w-full max-h-[60vh] object-contain rounded shadow bg-white border border-slate-200"
						/>
					{/if}
				</div>

				<!-- Modal Actions -->
				<div class="flex items-center justify-between pt-2 border-t border-slate-100">
					<button
						type="button"
						onclick={() => inspectedPage && togglePageSelection(inspectedPage)}
						class="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition {rangeBadge.isSelected
							? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
							: 'bg-rose-600 text-white hover:bg-rose-700'}"
					>
						{#if rangeBadge.isSelected}
							<Check class="w-4 h-4" />
							<span>Included in Range (Click to Remove)</span>
						{:else}
							<span>+ Add Page to Range</span>
						{/if}
					</button>

					<button
						type="button"
						onclick={closeInspect}
						class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
