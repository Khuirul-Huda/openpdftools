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
	import Sparkles from '@lucide/svelte/icons/sparkles';

	let currentFile = $state<File | null>(null);
	let fileBuffer = $state<ArrayBuffer | null>(null);
	let totalPages = $state(0);
	let thumbnail = $state('');

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

	async function handleFileSelect(files: File[]) {
		if (!files || files.length === 0) return;
		const file = files[0];
		currentFile = file;
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
</div>
