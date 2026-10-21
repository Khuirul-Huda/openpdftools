<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import {
		getPdfLib,
		generateThumbnail,
		generateBatchThumbnails,
		formatBytes,
		downloadBlob
	} from '$lib/utils/pdf-helper';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Layers from '@lucide/svelte/icons/layers';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import FileText from '@lucide/svelte/icons/file-text';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Download from '@lucide/svelte/icons/download';
	import Eye from '@lucide/svelte/icons/eye';
	import X from '@lucide/svelte/icons/x';

	interface PdfItem {
		id: string;
		file: File;
		name: string;
		size: number;
		pages: number;
		thumbnail: string;
		buffer?: ArrayBuffer;
	}

	let pdfFiles = $state<PdfItem[]>([]);
	let isMerging = $state(false);
	let mergeProgress = $state({ current: 0, total: 0 });
	let outputFileName = $state('merged_document.pdf');
	let lastMergedUrl = $state('');
	let addMoreInput = $state<HTMLInputElement | null>(null);

	// Document Inspector State
	let inspectingItem = $state<PdfItem | null>(null);
	let inspectingThumbnails = $state<Record<number, string>>({});
	let isLoadingInspectThumbs = $state(false);

	async function openInspectModal(item: PdfItem) {
		inspectingItem = item;
		inspectingThumbnails = {};
		isLoadingInspectThumbs = true;
		const buffer = item.buffer || (await item.file.arrayBuffer());
		const pageNums = Array.from({ length: item.pages }, (_, i) => i + 1);
		if (item.thumbnail) inspectingThumbnails[1] = item.thumbnail;
		generateBatchThumbnails(buffer, pageNums, 150, (pageNum, url) => {
			inspectingThumbnails[pageNum] = url;
		}).finally(() => {
			isLoadingInspectThumbs = false;
		});
	}

	function closeInspectModal() {
		inspectingItem = null;
		inspectingThumbnails = {};
	}

	// FAQs Accordion State
	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	let totalPagesCount = $derived(
		pdfFiles.reduce((acc, item) => acc + item.pages, 0)
	);

	async function processIncomingFiles(newFiles: File[]) {
		const PDFLib = await getPdfLib();

		for (const file of newFiles) {
			const id = Math.random().toString(36).substring(2, 9);
			const buffer = await file.arrayBuffer();

			let pages = 1;
			try {
				const doc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
				pages = doc.getPageCount();
			} catch (err) {
				console.warn('Could not parse page count with pdf-lib, defaulting to 1:', err);
			}

			// Generate quick thumbnail asynchronously
			const thumbnail = await generateThumbnail(buffer, 1, 140);

			pdfFiles.push({
				id,
				file,
				name: file.name,
				size: file.size,
				pages,
				thumbnail,
				buffer
			});
		}
	}

	function moveItem(index: number, direction: 'up' | 'down') {
		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= pdfFiles.length) return;

		const updated = [...pdfFiles];
		const temp = updated[index];
		updated[index] = updated[targetIndex];
		updated[targetIndex] = temp;
		pdfFiles = updated;
	}

	function removeItem(index: number) {
		pdfFiles.splice(index, 1);
	}

	function clearAll() {
		pdfFiles = [];
		if (lastMergedUrl) {
			URL.revokeObjectURL(lastMergedUrl);
			lastMergedUrl = '';
		}
	}

	async function executeMerge() {
		if (pdfFiles.length < 2) {
			toast.show(i18n.t('tools.mergePdf.toastSelectMin'), 'error');
			return;
		}

		isMerging = true;
		mergeProgress = { current: 0, total: pdfFiles.length };

		try {
			const PDFLib = await getPdfLib();
			const mergedDoc = await PDFLib.PDFDocument.create();

			for (let i = 0; i < pdfFiles.length; i++) {
				mergeProgress.current = i + 1;
				const item = pdfFiles[i];
				const buffer = item.buffer || (await item.file.arrayBuffer());
				const srcDoc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
				const pageCount = srcDoc.getPageCount();
				const pageIndices = Array.from({ length: pageCount }, (_, idx) => idx);
				const copiedPages = await mergedDoc.copyPages(srcDoc, pageIndices);

				for (const page of copiedPages) {
					mergedDoc.addPage(page);
				}
			}

			mergedDoc.setTitle?.(outputFileName.replace(/\.pdf$/i, ''));
			mergedDoc.setProducer?.('OpenPDFTools (100% Client-Side)');

			const mergedBytes = await mergedDoc.save();
			const blob = new Blob([mergedBytes], { type: 'application/pdf' });

			let saveName = outputFileName.trim();
			if (!saveName.toLowerCase().endsWith('.pdf')) {
				saveName += '.pdf';
			}

			downloadBlob(blob, saveName);
			lastMergedUrl = URL.createObjectURL(blob);
			toast.show(i18n.t('tools.mergePdf.toastSuccess'), 'success');
		} catch (err) {
			console.error('Merge failed:', err);
			toast.show(i18n.t('tools.mergePdf.toastError'), 'error');
		} finally {
			isMerging = false;
		}
	}

	function handleAddMore(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const files = Array.from(target.files);
			processIncomingFiles(files);
			target.value = '';
		}
	}
</script>

<Seo
	title={i18n.t('tools.mergePdf.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.mergePdf.longDescription')}
/>

<div class="space-y-10 max-w-5xl mx-auto">
	<!-- Top Navigation & Heading -->
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
					<Layers class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.mergePdf.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.mergePdf.shortDescription')}
			</p>
		</div>

		<span class="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shadow-sm">
			<ShieldCheck class="w-4 h-4 text-emerald-600" />
			{i18n.t('common.privacyBadge')}
		</span>
	</div>

	<!-- Empty State: Dropzone -->
	{#if pdfFiles.length === 0}
		<div class="space-y-4">
			<DropZone
				multiple={true}
				title={i18n.t('tools.mergePdf.step1Dropzone')}
				subtitle={i18n.t('tools.mergePdf.step1Helper')}
				onfiles={processIncomingFiles}
			/>
		</div>
	{:else}
		<!-- Active Files Workspace -->
		<div class="space-y-6">
			<!-- Header toolbar -->
			<div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex items-center gap-4">
					<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-lg">
						{i18n.t('tools.mergePdf.filesCount', { count: pdfFiles.length })}
					</span>
					<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg">
						{i18n.t('tools.mergePdf.totalPagesCount', { count: totalPagesCount })}
					</span>
				</div>

				<div class="flex items-center gap-2">
					<input
						bind:this={addMoreInput}
						type="file"
						accept=".pdf,application/pdf"
						multiple
						onchange={handleAddMore}
						class="hidden"
					/>
					<button
						type="button"
						onclick={() => addMoreInput?.click()}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
					>
						<Plus class="w-3.5 h-3.5" />
						{i18n.t('tools.mergePdf.addMore')}
					</button>

					<button
						type="button"
						onclick={clearAll}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
					>
						<Trash2 class="w-3.5 h-3.5" />
						{i18n.t('tools.mergePdf.clearAll')}
					</button>
				</div>
			</div>

			<!-- Grid of uploaded PDF cards -->
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
				{#each pdfFiles as item, index (item.id)}
					<div class="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between group relative overflow-hidden">
						<!-- Sequence Badge -->
						<div class="absolute top-2.5 left-2.5 z-10 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center shadow">
							{index + 1}
						</div>

						<!-- Action buttons -->
						<div class="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
							<button
								type="button"
								disabled={index === 0}
								onclick={() => moveItem(index, 'up')}
								class="p-1 rounded bg-white/90 border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs transition"
								title={i18n.t('tools.mergePdf.moveUp')}
							>
								<ArrowUp class="w-3.5 h-3.5 text-slate-700" />
							</button>
							<button
								type="button"
								disabled={index === pdfFiles.length - 1}
								onclick={() => moveItem(index, 'down')}
								class="p-1 rounded bg-white/90 border border-slate-200 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed shadow-xs transition"
								title={i18n.t('tools.mergePdf.moveDown')}
							>
								<ArrowDown class="w-3.5 h-3.5 text-slate-700" />
							</button>
							<button
								type="button"
								onclick={() => removeItem(index)}
								class="p-1 rounded bg-white/90 border border-slate-200 hover:bg-rose-50 hover:border-rose-300 text-rose-600 shadow-xs transition"
								title={i18n.t('tools.mergePdf.remove')}
							>
								<Trash2 class="w-3.5 h-3.5" />
							</button>
						</div>

						<!-- Thumbnail / Visual -->
						<div class="w-full h-36 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden mb-3 border border-slate-100">
							{#if item.thumbnail}
								<img
									src={item.thumbnail}
									alt={item.name}
									class="max-w-full max-h-full object-contain shadow-xs group-hover:scale-105 transition-transform duration-300"
								/>
							{:else}
								<div class="flex flex-col items-center justify-center text-slate-400 gap-1">
									<FileText class="w-8 h-8" />
									<span class="text-[10px] font-bold uppercase tracking-wider">PDF</span>
								</div>
							{/if}
						</div>

						<!-- Details -->
						<div class="space-y-1">
							<h4 class="text-xs font-bold text-slate-800 truncate" title={item.name}>
								{item.name}
							</h4>
							<div class="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
								<span>{formatBytes(item.size)}</span>
								<span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-100">
									{i18n.t('tools.mergePdf.pageCount', { count: item.pages })}
								</span>
							</div>
						</div>

						<button
							type="button"
							onclick={() => openInspectModal(item)}
							class="w-full mt-2.5 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 border border-slate-200 rounded-lg transition cursor-pointer"
						>
							<Eye class="w-3.5 h-3.5" />
							<span>{i18n.t('tools.mergePdf.inspectBtn')}</span>
						</button>
					</div>
				{/each}
			</div>

			<!-- Bottom CTA / Action Bar -->
			<div class="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div class="flex-1 max-w-md">
						<label for="output-name" class="block text-xs font-bold text-slate-700 mb-1">
							{i18n.t('tools.mergePdf.filenamePlaceholder')}
						</label>
						<input
							id="output-name"
							type="text"
							bind:value={outputFileName}
							placeholder="merged_document.pdf"
							class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					<div class="flex items-center gap-3">
						<button
							type="button"
							disabled={isMerging || pdfFiles.length < 2}
							onclick={executeMerge}
							class="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] rounded-xl shadow-glow-button hover:shadow-glow-blue-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 cursor-pointer"
						>
							{#if isMerging}
								<Loader2 class="w-4 h-4 animate-spin" />
								<span>{i18n.t('tools.mergePdf.merging', { current: mergeProgress.current, total: mergeProgress.total })}</span>
							{:else}
								<CheckCircle2 class="w-4 h-4" />
								<span>{i18n.t('tools.mergePdf.mergeBtn')}</span>
							{/if}
						</button>
					</div>
				</div>

				{#if lastMergedUrl}
					<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
						<div class="flex items-center gap-2 text-xs font-bold text-emerald-800">
							<CheckCircle2 class="w-4 h-4 text-emerald-600" />
							<span>{i18n.t('tools.mergePdf.successText')}</span>
						</div>
						<a
							href={lastMergedUrl}
							download={outputFileName}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
						>
							<Download class="w-3.5 h-3.5" />
							<span>{i18n.t('tools.mergePdf.downloadBtn')}</span>
						</a>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- SEO & Explanatory Info Card -->
	<div class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="space-y-2">
			<h3 class="text-base sm:text-lg font-bold text-slate-900 font-title">
				{i18n.t('tools.mergePdf.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.mergePdf.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.mergePdf.aboutP2')}
			</p>
		</div>

		<!-- FAQs Accordion -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.mergePdf.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.mergePdf.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.mergePdf.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.mergePdf.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.mergePdf.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Document Page Inspector Modal -->
	{#if inspectingItem}
		<div class="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-3xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-slate-100 pb-3">
					<div class="flex items-center gap-2 overflow-hidden">
						<Eye class="w-4 h-4 text-blue-600 shrink-0" />
						<h3 class="text-sm font-bold text-slate-900 truncate" title={inspectingItem.name}>
							{inspectingItem.name} ({inspectingItem.pages} pages)
						</h3>
						{#if isLoadingInspectThumbs}
							<Loader2 class="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />
						{/if}
					</div>

					<button
						type="button"
						onclick={closeInspectModal}
						class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
						title="Close"
					>
						<X class="w-5 h-5" />
					</button>
				</div>

				<!-- Page Thumbnails Grid -->
				<div class="flex-1 overflow-y-auto max-h-[60vh] p-2 bg-slate-50/70 rounded-xl border border-slate-200/80">
					<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{#each Array.from({ length: inspectingItem.pages }, (_, i) => i + 1) as pageNum}
							<div class="bg-white border border-slate-200 rounded-xl p-2.5 flex flex-col justify-between shadow-xs">
								<div class="w-full h-36 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-100 mb-2">
									{#if inspectingThumbnails[pageNum]}
										<img
											src={inspectingThumbnails[pageNum]}
											alt="Page {pageNum}"
											class="max-w-full max-h-full object-contain"
										/>
									{:else}
										<div class="flex flex-col items-center gap-1 text-slate-400">
											<Loader2 class="w-4 h-4 animate-spin text-slate-400" />
											<span class="text-[10px] font-semibold">P.{pageNum}</span>
										</div>
									{/if}
								</div>
								<div class="text-center">
									<span class="text-xs font-bold text-slate-700">Page {pageNum}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Footer -->
				<div class="flex justify-end pt-2 border-t border-slate-100">
					<button
						type="button"
						onclick={closeInspectModal}
						class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
					>
						{i18n.t('tools.mergePdf.inspectClose')}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
