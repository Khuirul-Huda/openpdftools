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
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import Download from '@lucide/svelte/icons/download';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	interface PageItem {
		id: string;
		originalIndex: number;
		rotation: number; // 0, 90, 180, 270
		thumbnail: string;
		isDeleted: boolean;
	}

	let currentFile = $state<File | null>(null);
	let fileBuffer = $state<ArrayBuffer | null>(null);
	let pages = $state<PageItem[]>([]);
	let isLoadingThumbnails = $state(false);
	let isSaving = $state(false);
	let lastSavedUrl = $state('');

	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	let activePagesCount = $derived(pages.filter((p) => !p.isDeleted).length);

	async function handleFileSelect(files: File[]) {
		if (!files || files.length === 0) return;
		const file = files[0];
		currentFile = file;
		pages = [];
		if (lastSavedUrl) {
			URL.revokeObjectURL(lastSavedUrl);
			lastSavedUrl = '';
		}

		isLoadingThumbnails = true;

		try {
			const buffer = await file.arrayBuffer();
			fileBuffer = buffer;

			const PDFLib = await getPdfLib();
			const doc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
			const total = doc.getPageCount();

			const pageList: PageItem[] = [];
			for (let i = 0; i < total; i++) {
				const id = Math.random().toString(36).substring(2, 9);
				const thumb = await generateThumbnail(buffer, i + 1, 140);
				pageList.push({
					id,
					originalIndex: i,
					rotation: 0,
					thumbnail: thumb,
					isDeleted: false
				});
			}

			pages = pageList;
		} catch (err) {
			console.error('Failed to load document pages:', err);
			toast.show(i18n.t('tools.organizePdf.toastError'), 'error');
		} finally {
			isLoadingThumbnails = false;
		}
	}

	function clearFile() {
		currentFile = null;
		fileBuffer = null;
		pages = [];
		if (lastSavedUrl) {
			URL.revokeObjectURL(lastSavedUrl);
			lastSavedUrl = '';
		}
	}

	function rotatePage(index: number, delta: number) {
		pages[index].rotation = (pages[index].rotation + delta + 360) % 360;
	}

	function rotateAll() {
		for (const page of pages) {
			page.rotation = (page.rotation + 90) % 360;
		}
	}

	function resetAll() {
		for (let i = 0; i < pages.length; i++) {
			pages[i].rotation = 0;
			pages[i].isDeleted = false;
		}
	}

	function moveItem(index: number, direction: 'prev' | 'next') {
		const targetIndex = direction === 'prev' ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= pages.length) return;

		const updated = [...pages];
		const temp = updated[index];
		updated[index] = updated[targetIndex];
		updated[targetIndex] = temp;
		pages = updated;
	}

	function toggleDelete(index: number) {
		pages[index].isDeleted = !pages[index].isDeleted;
	}

	async function executeSave() {
		const active = pages.filter((p) => !p.isDeleted);
		if (active.length === 0) {
			toast.show('Please keep at least 1 page in your document.', 'error');
			return;
		}

		if (!currentFile || !fileBuffer) return;

		isSaving = true;

		try {
			const PDFLib = await getPdfLib();
			const srcDoc = await PDFLib.PDFDocument.load(fileBuffer, { ignoreEncryption: true });
			const outDoc = await PDFLib.PDFDocument.create();

			for (const item of active) {
				const [copiedPage] = await outDoc.copyPages(srcDoc, [item.originalIndex]);
				const baseAngle = copiedPage.getRotation().angle || 0;
				const newAngle = (baseAngle + item.rotation) % 360;
				copiedPage.setRotation(PDFLib.degrees(newAngle));
				outDoc.addPage(copiedPage);
			}

			outDoc.setTitle?.(currentFile.name.replace(/\.pdf$/i, '') + ' (Organized)');
			outDoc.setProducer?.('OpenPDFTools (100% Client-Side Page Organizer)');

			const outBytes = await outDoc.save();
			const blob = new Blob([outBytes], { type: 'application/pdf' });
			const outputName = `${currentFile.name.replace(/\.pdf$/i, '')}_organized.pdf`;

			downloadBlob(blob, outputName);
			lastSavedUrl = URL.createObjectURL(blob);
			toast.show(i18n.t('tools.organizePdf.toastSuccess'), 'success');
		} catch (err) {
			console.error('Failed to save organized PDF:', err);
			toast.show(i18n.t('tools.organizePdf.toastError'), 'error');
		} finally {
			isSaving = false;
		}
	}
</script>

<Seo
	title={i18n.t('tools.organizePdf.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.organizePdf.longDescription')}
/>

<div class="space-y-10 max-w-5xl mx-auto">
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
				<div class="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center shadow-sm">
					<RotateCw class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.organizePdf.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.organizePdf.shortDescription')}
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
			title={i18n.t('tools.organizePdf.step1Dropzone')}
			subtitle={i18n.t('tools.organizePdf.step1Helper')}
			onfiles={handleFileSelect}
		/>
	{:else}
		<div class="space-y-6">
			<!-- Toolbar -->
			<div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold rounded-lg">
						{activePagesCount} / {pages.length} Pages Active
					</span>
					<span class="text-xs text-slate-500 font-semibold truncate max-w-xs" title={currentFile.name}>
						{currentFile.name} ({formatBytes(currentFile.size)})
					</span>
				</div>

				<div class="flex items-center gap-2 flex-wrap">
					<button
						type="button"
						onclick={rotateAll}
						class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition"
					>
						<RotateCw class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.organizePdf.rotateAll')}</span>
					</button>

					<button
						type="button"
						onclick={resetAll}
						class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition"
					>
						<Undo2 class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.organizePdf.resetAll')}</span>
					</button>

					<button
						type="button"
						onclick={clearFile}
						class="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.mergePdf.clearAll')}</span>
					</button>
				</div>
			</div>

			<!-- Loading State -->
			{#if isLoadingThumbnails}
				<div class="p-12 text-center bg-white border border-slate-200 rounded-2xl space-y-3">
					<Loader2 class="w-8 h-8 text-teal-600 animate-spin mx-auto" />
					<p class="text-xs font-bold text-slate-600">Generating page thumbnails...</p>
				</div>
			{:else}
				<!-- Page Grid -->
				<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
					{#each pages as page, index (page.id)}
						<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-2 group relative overflow-hidden {page.isDeleted ? 'opacity-40 bg-slate-100' : ''}">
							<!-- Badges -->
							<div class="flex items-center justify-between text-[11px] font-bold">
								<span class="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px]">
									{i18n.t('tools.organizePdf.pageNumber', { page: index + 1 })}
								</span>
								<span class="text-slate-400 text-[10px]">
									{i18n.t('tools.organizePdf.originalPage', { orig: page.originalIndex + 1 })}
								</span>
							</div>

							<!-- Page Visual Preview with CSS Rotation -->
							<div class="w-full h-40 bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden border border-slate-100 relative">
								<img
									src={page.thumbnail}
									alt="Page {page.originalIndex + 1}"
									style="transform: rotate({page.rotation}deg);"
									class="max-w-full max-h-full object-contain transition-transform duration-300"
								/>
								{#if page.isDeleted}
									<div class="absolute inset-0 bg-rose-500/10 flex items-center justify-center font-bold text-rose-700 text-xs uppercase tracking-wider backdrop-blur-[1px]">
										Deleted
									</div>
								{/if}
							</div>

							<!-- Controls -->
							<div class="flex items-center justify-between pt-1 border-t border-slate-100">
								<div class="flex items-center gap-1">
									<button
										type="button"
										onclick={() => rotatePage(index, -90)}
										class="p-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition"
										title={i18n.t('tools.organizePdf.rotateLeft')}
									>
										<RotateCcw class="w-3.5 h-3.5" />
									</button>
									<button
										type="button"
										onclick={() => rotatePage(index, 90)}
										class="p-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition"
										title={i18n.t('tools.organizePdf.rotateRight')}
									>
										<RotateCw class="w-3.5 h-3.5" />
									</button>
									<button
										type="button"
										disabled={index === 0}
										onclick={() => moveItem(index, 'prev')}
										class="p-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-20 transition"
										title={i18n.t('tools.organizePdf.moveLeft')}
									>
										<ArrowUp class="w-3.5 h-3.5 -rotate-90" />
									</button>
									<button
										type="button"
										disabled={index === pages.length - 1}
										onclick={() => moveItem(index, 'next')}
										class="p-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 disabled:opacity-20 transition"
										title={i18n.t('tools.organizePdf.moveRight')}
									>
										<ArrowDown class="w-3.5 h-3.5 -rotate-90" />
									</button>
								</div>

								<button
									type="button"
									onclick={() => toggleDelete(index)}
									class="p-1 rounded border transition {page.isDeleted
										? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
										: 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'}"
									title={page.isDeleted ? i18n.t('tools.organizePdf.restorePage') : i18n.t('tools.organizePdf.deletePage')}
								>
									{#if page.isDeleted}
										<Undo2 class="w-3.5 h-3.5" />
									{:else}
										<Trash2 class="w-3.5 h-3.5" />
									{/if}
								</button>
							</div>
						</div>
					{/each}
				</div>

				<!-- Save Action Bar -->
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
					<div class="space-y-0.5">
						<h4 class="text-xs font-bold text-slate-800">Ready to save?</h4>
						<p class="text-[11px] text-slate-500 font-medium">
							Your updated PDF will contain {activePagesCount} pages with the chosen rotations and sequence.
						</p>
					</div>

					<button
						type="button"
						disabled={isSaving || activePagesCount === 0}
						onclick={executeSave}
						class="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-white bg-teal-600 hover:bg-teal-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-blue disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
					>
						{#if isSaving}
							<Loader2 class="w-4 h-4 animate-spin" />
							<span>{i18n.t('tools.organizePdf.saving')}</span>
						{:else}
							<Sparkles class="w-4 h-4" />
							<span>{i18n.t('tools.organizePdf.savePdfBtn')}</span>
						{/if}
					</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- SEO & Info Card -->
	<div class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="space-y-2">
			<h3 class="text-base sm:text-lg font-bold text-slate-900 font-title">
				{i18n.t('tools.organizePdf.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.organizePdf.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.organizePdf.aboutP2')}
			</p>
		</div>

		<!-- FAQs -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.organizePdf.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.organizePdf.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.organizePdf.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.organizePdf.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.organizePdf.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
