<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import {
		getPdfJs,
		getPdfLib,
		getJSZip,
		formatBytes,
		downloadBlob
	} from '$lib/utils/pdf-helper';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Image from '@lucide/svelte/icons/image';
	import Download from '@lucide/svelte/icons/download';
	import FileArchive from '@lucide/svelte/icons/file-archive';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Sliders from '@lucide/svelte/icons/sliders';
	import Sparkles from '@lucide/svelte/icons/sparkles';

	interface RenderedPage {
		pageNum: number;
		dataUrl: string;
		blob: Blob;
		size: number;
	}

	let currentFile = $state<File | null>(null);
	let fileBuffer = $state<ArrayBuffer | null>(null);
	let totalPages = $state(0);

	let imageFormat = $state<'jpeg' | 'png'>('jpeg');
	let resolution = $state<'standard' | 'high'>('standard');

	let isConverting = $state(false);
	let isZipping = $state(false);
	let progress = $state({ current: 0, total: 0 });
	let renderedPages = $state<RenderedPage[]>([]);

	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	async function handleFileSelect(files: File[]) {
		if (!files || files.length === 0) return;
		const file = files[0];
		currentFile = file;
		renderedPages = [];

		try {
			const buffer = await file.arrayBuffer();
			fileBuffer = buffer;

			const PDFLib = await getPdfLib();
			const doc = await PDFLib.PDFDocument.load(buffer, { ignoreEncryption: true });
			totalPages = doc.getPageCount();
		} catch (err) {
			console.error('Failed to parse uploaded PDF:', err);
			toast.show(i18n.t('tools.pdfToImg.toastError'), 'error');
		}
	}

	function clearFile() {
		currentFile = null;
		fileBuffer = null;
		totalPages = 0;
		renderedPages = [];
	}

	async function executeConversion() {
		if (!currentFile || !fileBuffer) {
			toast.show(i18n.t('tools.pdfToImg.toastSelectPdf'), 'error');
			return;
		}

		isConverting = true;
		progress = { current: 0, total: totalPages };
		renderedPages = [];

		try {
			const pdfjs = await getPdfJs();
			const srcDoc = await pdfjs.getDocument({ data: fileBuffer }).promise;
			const scale = resolution === 'high' ? 2.2 : 1.4;
			const mimeType = imageFormat === 'png' ? 'image/png' : 'image/jpeg';
			const quality = imageFormat === 'png' ? undefined : 0.85;

			const pagesOutput: RenderedPage[] = [];

			for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
				progress.current = pageNum;
				const page = await srcDoc.getPage(pageNum);
				const viewport = page.getViewport({ scale });

				const canvas = document.createElement('canvas');
				canvas.width = Math.floor(viewport.width);
				canvas.height = Math.floor(viewport.height);
				const ctx = canvas.getContext('2d');

				if (ctx) {
					await page.render({ canvasContext: ctx, viewport }).promise;

					const blob = await new Promise<Blob | null>((resolve) =>
						canvas.toBlob((b) => resolve(b), mimeType, quality)
					);

					if (blob) {
						const dataUrl = canvas.toDataURL(mimeType, quality);
						pagesOutput.push({
							pageNum,
							dataUrl,
							blob,
							size: blob.size
						});
					}
				}

				canvas.width = 0;
				canvas.height = 0;
			}

			await srcDoc.destroy();
			renderedPages = pagesOutput;
			toast.show(i18n.t('tools.pdfToImg.toastSuccess'), 'success');
		} catch (err) {
			console.error('PDF to image conversion failed:', err);
			toast.show(i18n.t('tools.pdfToImg.toastError'), 'error');
		} finally {
			isConverting = false;
		}
	}

	function downloadSinglePage(page: RenderedPage) {
		if (!currentFile) return;
		const baseName = currentFile.name.replace(/\.pdf$/i, '');
		const ext = imageFormat === 'png' ? 'png' : 'jpg';
		const filename = `${baseName}_page_${page.pageNum}.${ext}`;
		downloadBlob(page.blob, filename);
	}

	async function downloadAllZip() {
		if (renderedPages.length === 0 || !currentFile) return;
		isZipping = true;

		try {
			const JSZip = await getJSZip();
			const zip = new JSZip();
			const baseName = currentFile.name.replace(/\.pdf$/i, '');
			const ext = imageFormat === 'png' ? 'png' : 'jpg';

			for (const page of renderedPages) {
				const filename = `${baseName}_page_${String(page.pageNum).padStart(3, '0')}.${ext}`;
				zip.file(filename, page.blob);
			}

			const zipBlob = await zip.generateAsync({ type: 'blob' });
			downloadBlob(zipBlob, `${baseName}_images.zip`);
		} catch (err) {
			console.error('Failed to create ZIP package:', err);
		} finally {
			isZipping = false;
		}
	}
</script>

<Seo
	title={i18n.t('tools.pdfToImg.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.pdfToImg.longDescription')}
/>

<div class="space-y-10 max-w-5xl mx-auto">
	<!-- Top Navigation -->
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
				<div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center shadow-sm">
					<Image class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.pdfToImg.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.pdfToImg.shortDescription')}
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
			title={i18n.t('tools.pdfToImg.step1Dropzone')}
			subtitle={i18n.t('tools.pdfToImg.step1Helper')}
			onfiles={handleFileSelect}
		/>
	{:else}
		<div class="space-y-6">
			<!-- Document Card & Settings -->
			<div class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
				<div class="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-slate-100 pb-4">
					<div class="space-y-1 overflow-hidden w-full sm:w-auto">
						<h3 class="text-sm font-bold text-slate-900 truncate" title={currentFile.name}>
							{currentFile.name}
						</h3>
						<div class="flex items-center gap-2 text-xs text-slate-500 font-semibold">
							<span>{formatBytes(currentFile.size)}</span>
							<span>&bull;</span>
							<span class="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-100">
								{i18n.t('tools.mergePdf.pageCount', { count: totalPages })}
							</span>
						</div>
					</div>

					<button
						type="button"
						onclick={clearFile}
						class="self-end sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.mergePdf.remove')}</span>
					</button>
				</div>

				<!-- Option Controls -->
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
					<div>
						<label for="format-select" class="block text-xs font-bold text-slate-700 mb-1.5">
							{i18n.t('tools.pdfToImg.formatLabel')}
						</label>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								onclick={() => (imageFormat = 'jpeg')}
								class="px-3 py-2 text-xs font-bold rounded-lg border transition {imageFormat === 'jpeg'
									? 'bg-purple-600 text-white border-purple-600 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								JPG (Compact)
							</button>
							<button
								type="button"
								onclick={() => (imageFormat = 'png')}
								class="px-3 py-2 text-xs font-bold rounded-lg border transition {imageFormat === 'png'
									? 'bg-purple-600 text-white border-purple-600 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								PNG (Crisp)
							</button>
						</div>
					</div>

					<div>
						<label for="res-select" class="block text-xs font-bold text-slate-700 mb-1.5">
							{i18n.t('tools.pdfToImg.resolutionLabel')}
						</label>
						<div class="grid grid-cols-2 gap-2">
							<button
								type="button"
								onclick={() => (resolution = 'standard')}
								class="px-3 py-2 text-xs font-bold rounded-lg border transition {resolution === 'standard'
									? 'bg-purple-600 text-white border-purple-600 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.pdfToImg.resStandard')}
							</button>
							<button
								type="button"
								onclick={() => (resolution = 'high')}
								class="px-3 py-2 text-xs font-bold rounded-lg border transition {resolution === 'high'
									? 'bg-purple-600 text-white border-purple-600 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.pdfToImg.resHigh')}
							</button>
						</div>
					</div>
				</div>

				<div class="pt-3 flex justify-end">
					<button
						type="button"
						disabled={isConverting}
						onclick={executeConversion}
						class="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-blue disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
					>
						{#if isConverting}
							<Loader2 class="w-4 h-4 animate-spin" />
							<span>{i18n.t('tools.pdfToImg.converting', { current: progress.current, total: progress.total })}</span>
						{:else}
							<Sparkles class="w-4 h-4" />
							<span>{i18n.t('tools.pdfToImg.convertBtn')}</span>
						{/if}
					</button>
				</div>
			</div>

			<!-- Rendered Pages Gallery -->
			{#if renderedPages.length > 0}
				<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
					<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
						<div class="flex items-center gap-2">
							<CheckCircle2 class="w-5 h-5 text-emerald-600" />
							<h3 class="text-base font-bold text-slate-900 font-title">
								{i18n.t('tools.pdfToImg.successTitle')}
							</h3>
							<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
								{renderedPages.length}
							</span>
						</div>

						<button
							type="button"
							disabled={isZipping}
							onclick={downloadAllZip}
							class="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-xs transition active:scale-[0.98] cursor-pointer"
						>
							{#if isZipping}
								<Loader2 class="w-3.5 h-3.5 animate-spin" />
								<span>Packaging ZIP...</span>
							{:else}
								<FileArchive class="w-3.5 h-3.5" />
								<span>{i18n.t('tools.pdfToImg.downloadAllZip')}</span>
							{/if}
						</button>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
						{#each renderedPages as page}
							<div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between space-y-2 group">
								<div class="w-full h-44 bg-white rounded-lg flex items-center justify-center overflow-hidden border border-slate-100 relative">
									<img
										src={page.dataUrl}
										alt="Page {page.pageNum}"
										class="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
									/>
									<span class="absolute top-2 left-2 px-2 py-0.5 rounded bg-slate-900/80 text-white text-[10px] font-bold">
										{i18n.t('tools.pdfToImg.pageNumber', { page: page.pageNum })}
									</span>
								</div>

								<div class="flex items-center justify-between pt-1">
									<span class="text-[11px] font-semibold text-slate-500">
										{formatBytes(page.size)}
									</span>
									<button
										type="button"
										onclick={() => downloadSinglePage(page)}
										class="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md transition"
									>
										<Download class="w-3 h-3" />
										<span>{i18n.t('tools.pdfToImg.downloadPage')}</span>
									</button>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- SEO & Info Card -->
	<div class="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
		<div class="space-y-2">
			<h3 class="text-base sm:text-lg font-bold text-slate-900 font-title">
				{i18n.t('tools.pdfToImg.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.pdfToImg.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.pdfToImg.aboutP2')}
			</p>
		</div>

		<!-- FAQs -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.pdfToImg.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.pdfToImg.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.pdfToImg.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.pdfToImg.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.pdfToImg.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
