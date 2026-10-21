<script lang="ts">
	import { resolveRoute } from '$app/paths';
	import { i18n } from '$lib/i18n/index.svelte';
	import { toast } from '$lib/components/toast.svelte';
	import Seo from '$lib/components/Seo.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import {
		getPdfLib,
		formatBytes,
		downloadBlob
	} from '$lib/utils/pdf-helper';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
	import FileUp from '@lucide/svelte/icons/file-up';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import HelpCircle from '@lucide/svelte/icons/help-circle';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Download from '@lucide/svelte/icons/download';
	import Sliders from '@lucide/svelte/icons/sliders';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Eye from '@lucide/svelte/icons/eye';
	import ZoomIn from '@lucide/svelte/icons/zoom-in';
	import ZoomOut from '@lucide/svelte/icons/zoom-out';
	import X from '@lucide/svelte/icons/x';

	interface ImageItem {
		id: string;
		file: File;
		name: string;
		size: number;
		url: string;
		width: number;
		height: number;
	}

	let images = $state<ImageItem[]>([]);
	let pageSize = $state<'a4' | 'letter' | 'fit'>('a4');
	let orientation = $state<'auto' | 'portrait' | 'landscape'>('auto');
	let margin = $state<'none' | 'small' | 'big'>('small');

	// Preview State
	let inspectedImageIndex = $state<number | null>(null);
	let previewActiveIndex = $state(0);
	let lightboxZoom = $state(100);

	function openImageLightbox(index: number) {
		inspectedImageIndex = index;
		lightboxZoom = 100;
	}

	function closeImageLightbox() {
		inspectedImageIndex = null;
		lightboxZoom = 100;
	}

	function cycleImageLightbox(delta: number) {
		if (inspectedImageIndex === null) return;
		const next = inspectedImageIndex + delta;
		if (next >= 0 && next < images.length) {
			inspectedImageIndex = next;
		}
	}

	let isProcessing = $state(false);
	let progress = $state({ current: 0, total: 0 });
	let outputFileName = $state('images_document.pdf');
	let lastCreatedUrl = $state('');
	let addMoreInput = $state<HTMLInputElement | null>(null);

	let faqOpen = $state<Record<string, boolean>>({ q1: false, q2: false });

	function toggleFaq(key: string) {
		faqOpen[key] = !faqOpen[key];
	}

	async function processIncomingFiles(newFiles: File[]) {
		for (const file of newFiles) {
			const id = Math.random().toString(36).substring(2, 9);
			const url = URL.createObjectURL(file);

			// Read dimensions
			const dims = await new Promise<{ width: number; height: number }>((resolve) => {
				const img = new window.Image();
				img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
				img.onerror = () => resolve({ width: 800, height: 600 });
				img.src = url;
			});

			images.push({
				id,
				file,
				name: file.name,
				size: file.size,
				url,
				width: dims.width,
				height: dims.height
			});
		}
	}

	function moveItem(index: number, direction: 'up' | 'down') {
		const targetIndex = direction === 'up' ? index - 1 : index + 1;
		if (targetIndex < 0 || targetIndex >= images.length) return;

		const updated = [...images];
		const temp = updated[index];
		updated[index] = updated[targetIndex];
		updated[targetIndex] = temp;
		images = updated;
	}

	function removeItem(index: number) {
		const item = images[index];
		if (item.url) URL.revokeObjectURL(item.url);
		images.splice(index, 1);
	}

	function clearAll() {
		for (const item of images) {
			if (item.url) URL.revokeObjectURL(item.url);
		}
		images = [];
		if (lastCreatedUrl) {
			URL.revokeObjectURL(lastCreatedUrl);
			lastCreatedUrl = '';
		}
	}

	async function getImageBytes(file: File): Promise<{ bytes: Uint8Array; type: 'jpg' | 'png' }> {
		const isPng = file.type === 'image/png';
		const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg';

		if (isPng) {
			return { bytes: new Uint8Array(await file.arrayBuffer()), type: 'png' };
		}
		if (isJpg) {
			return { bytes: new Uint8Array(await file.arrayBuffer()), type: 'jpg' };
		}

		// Convert WebP or other formats via offscreen canvas to JPEG
		return new Promise((resolve, reject) => {
			const img = new window.Image();
			const url = URL.createObjectURL(file);
			img.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const ctx = canvas.getContext('2d');
				if (!ctx) {
					URL.revokeObjectURL(url);
					return reject(new Error('Canvas context unavailable'));
				}
				ctx.drawImage(img, 0, 0);
				canvas.toBlob(
					async (blob) => {
						URL.revokeObjectURL(url);
						if (blob) {
							const bytes = new Uint8Array(await blob.arrayBuffer());
							resolve({ bytes, type: 'jpg' });
						} else {
							reject(new Error('Conversion to blob failed'));
						}
					},
					'image/jpeg',
					0.92
				);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Could not load image'));
			};
			img.src = url;
		});
	}

	async function executeConvert() {
		if (images.length === 0) {
			toast.show(i18n.t('tools.imgToPdf.toastSelectImages'), 'error');
			return;
		}

		isProcessing = true;
		progress = { current: 0, total: images.length };

		try {
			const PDFLib = await getPdfLib();
			const pdfDoc = await PDFLib.PDFDocument.create();

			// Margin definitions in points
			const marginPoints = margin === 'none' ? 0 : margin === 'small' ? 20 : 40;

			// Base dimensions: A4 is 595.28 x 841.89; Letter is 612 x 792
			const baseWidth = pageSize === 'letter' ? 612 : 595.28;
			const baseHeight = pageSize === 'letter' ? 792 : 841.89;

			for (let i = 0; i < images.length; i++) {
				progress.current = i + 1;
				const item = images[i];
				const { bytes, type } = await getImageBytes(item.file);
				const embedded = type === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);

				let pageWidth = baseWidth;
				let pageHeight = baseHeight;

				if (pageSize === 'fit') {
					pageWidth = embedded.width + marginPoints * 2;
					pageHeight = embedded.height + marginPoints * 2;
				} else {
					let isLandscape = false;
					if (orientation === 'landscape') isLandscape = true;
					else if (orientation === 'auto') isLandscape = embedded.width > embedded.height;

					if (isLandscape) {
						pageWidth = baseHeight;
						pageHeight = baseWidth;
					}
				}

				const page = pdfDoc.addPage([pageWidth, pageHeight]);

				// Available box for image
				const availWidth = pageWidth - marginPoints * 2;
				const availHeight = pageHeight - marginPoints * 2;

				const scale = Math.min(availWidth / embedded.width, availHeight / embedded.height);
				const drawWidth = embedded.width * scale;
				const drawHeight = embedded.height * scale;

				// Center on page
				const x = marginPoints + (availWidth - drawWidth) / 2;
				const y = marginPoints + (availHeight - drawHeight) / 2;

				page.drawImage(embedded, {
					x,
					y,
					width: drawWidth,
					height: drawHeight
				});
			}

			pdfDoc.setTitle?.(outputFileName.replace(/\.pdf$/i, ''));
			pdfDoc.setProducer?.('OpenPDFTools (100% Client-Side)');

			const pdfBytes = await pdfDoc.save();
			const blob = new Blob([pdfBytes], { type: 'application/pdf' });

			let saveName = outputFileName.trim();
			if (!saveName.toLowerCase().endsWith('.pdf')) saveName += '.pdf';

			downloadBlob(blob, saveName);
			lastCreatedUrl = URL.createObjectURL(blob);
			toast.show(i18n.t('tools.imgToPdf.toastSuccess'), 'success');
		} catch (err) {
			console.error('Image to PDF conversion failed:', err);
			toast.show(i18n.t('tools.imgToPdf.toastError'), 'error');
		} finally {
			isProcessing = false;
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
	title={i18n.t('tools.imgToPdf.title') + ' - ' + i18n.t('common.siteName')}
	description={i18n.t('tools.imgToPdf.longDescription')}
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
				<div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shadow-sm">
					<FileUp class="w-5 h-5" />
				</div>
				<h1 class="text-2xl sm:text-3xl font-black text-slate-900 font-title tracking-tight">
					{i18n.t('tools.imgToPdf.title')}
				</h1>
			</div>
			<p class="text-xs sm:text-sm text-slate-500 font-medium max-w-2xl">
				{i18n.t('tools.imgToPdf.shortDescription')}
			</p>
		</div>

		<span class="self-start sm:self-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold shadow-sm">
			<ShieldCheck class="w-4 h-4 text-emerald-600" />
			{i18n.t('common.privacyBadge')}
		</span>
	</div>

	<!-- Step 1: Upload or Workspace -->
	{#if images.length === 0}
		<DropZone
			multiple={true}
			accept="image/png,image/jpeg,image/webp,image/*"
			title={i18n.t('tools.imgToPdf.step1Dropzone')}
			subtitle={i18n.t('tools.imgToPdf.step1Helper')}
			onfiles={processIncomingFiles}
		/>
	{:else}
		<div class="space-y-6">
			<!-- Toolbar -->
			<div class="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<span class="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-lg">
					{i18n.t('tools.imgToPdf.imagesCount', { count: images.length })}
				</span>

				<div class="flex items-center gap-2">
					<input
						bind:this={addMoreInput}
						type="file"
						accept="image/png,image/jpeg,image/webp,image/*"
						multiple
						onchange={handleAddMore}
						class="hidden"
					/>
					<button
						type="button"
						onclick={() => addMoreInput?.click()}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
					>
						<Plus class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.mergePdf.addMore')}</span>
					</button>

					<button
						type="button"
						onclick={clearAll}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
					>
						<Trash2 class="w-3.5 h-3.5" />
						<span>{i18n.t('tools.mergePdf.clearAll')}</span>
					</button>
				</div>
			</div>

			<!-- Image Cards Grid -->
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
				{#each images as item, index (item.id)}
					<div class="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition flex flex-col justify-between group relative overflow-hidden">
						<div class="absolute top-2 left-2 z-10 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-black flex items-center justify-center shadow">
							{index + 1}
						</div>

						<div class="absolute top-2 right-2 z-10 flex items-center gap-0.5">
							<button
								type="button"
								disabled={index === 0}
								onclick={() => moveItem(index, 'up')}
								class="p-1 rounded bg-white/90 border border-slate-200 hover:bg-slate-100 disabled:opacity-20 shadow-xs transition"
								title={i18n.t('tools.mergePdf.moveUp')}
							>
								<ArrowUp class="w-3 h-3 text-slate-700" />
							</button>
							<button
								type="button"
								disabled={index === images.length - 1}
								onclick={() => moveItem(index, 'down')}
								class="p-1 rounded bg-white/90 border border-slate-200 hover:bg-slate-100 disabled:opacity-20 shadow-xs transition"
								title={i18n.t('tools.mergePdf.moveDown')}
							>
								<ArrowDown class="w-3 h-3 text-slate-700" />
							</button>
							<button
								type="button"
								onclick={() => removeItem(index)}
								class="p-1 rounded bg-white/90 border border-slate-200 hover:bg-rose-50 text-rose-600 shadow-xs transition"
								title={i18n.t('tools.mergePdf.remove')}
							>
								<Trash2 class="w-3 h-3" />
							</button>
						</div>

						<div
							role="button"
							tabindex="0"
							onclick={() => openImageLightbox(index)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									openImageLightbox(index);
								}
							}}
							class="w-full h-32 bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden mb-2 border border-slate-100 relative cursor-pointer"
						>
							<img src={item.url} alt={item.name} class="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform" />
							<span class="absolute bottom-1 right-1 p-1 rounded-md bg-white/90 text-slate-700 shadow-xs border border-slate-200 opacity-0 group-hover:opacity-100 transition">
								<ZoomIn class="w-3 h-3" />
							</span>
						</div>

						<div class="space-y-0.5">
							<h4 class="text-[11px] font-bold text-slate-800 truncate" title={item.name}>{item.name}</h4>
							<div class="text-[10px] font-semibold text-slate-400 flex items-center justify-between">
								<span>{item.width}&times;{item.height}</span>
								<span>{formatBytes(item.size)}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Layout & Conversion Settings -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
				<div class="grid grid-cols-1 md:grid-cols-3 gap-5">
					<!-- Page Size -->
					<div>
						<label for="page-size" class="block text-xs font-bold text-slate-700 mb-2">
							{i18n.t('tools.imgToPdf.pageSize')}
						</label>
						<div class="grid grid-cols-3 gap-1.5">
							<button
								type="button"
								onclick={() => (pageSize = 'a4')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {pageSize === 'a4'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.sizeA4')}
							</button>
							<button
								type="button"
								onclick={() => (pageSize = 'letter')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {pageSize === 'letter'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.sizeLetter')}
							</button>
							<button
								type="button"
								onclick={() => (pageSize = 'fit')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {pageSize === 'fit'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.sizeFit')}
							</button>
						</div>
					</div>

					<!-- Orientation -->
					<div>
						<label for="orientation" class="block text-xs font-bold text-slate-700 mb-2">
							{i18n.t('tools.imgToPdf.orientation')}
						</label>
						<div class="grid grid-cols-3 gap-1.5">
							<button
								type="button"
								onclick={() => (orientation = 'auto')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {orientation === 'auto'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.orientAuto')}
							</button>
							<button
								type="button"
								onclick={() => (orientation = 'portrait')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {orientation === 'portrait'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.orientPortrait')}
							</button>
							<button
								type="button"
								onclick={() => (orientation = 'landscape')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {orientation === 'landscape'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.orientLandscape')}
							</button>
						</div>
					</div>

					<!-- Margin -->
					<div>
						<label for="margin" class="block text-xs font-bold text-slate-700 mb-2">
							{i18n.t('tools.imgToPdf.margin')}
						</label>
						<div class="grid grid-cols-3 gap-1.5">
							<button
								type="button"
								onclick={() => (margin = 'none')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {margin === 'none'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.marginNone')}
							</button>
							<button
								type="button"
								onclick={() => (margin = 'small')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {margin === 'small'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.marginSmall')}
							</button>
							<button
								type="button"
								onclick={() => (margin = 'big')}
								class="px-2 py-1.5 text-xs font-bold rounded-lg border transition {margin === 'big'
									? 'bg-amber-500 text-white border-amber-500 shadow-xs'
									: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}"
							>
								{i18n.t('tools.imgToPdf.marginBig')}
							</button>
						</div>
					</div>
				</div>

				<!-- Live Virtual Sheet Preview -->
				{#if images.length > 0}
					{@const activeImg = images[previewActiveIndex] || images[0]}
					{@const isLandscape = orientation === 'landscape' || (orientation === 'auto' && activeImg && activeImg.width > activeImg.height)}
					{@const paperRatio = pageSize === 'fit' ? (activeImg ? activeImg.width / activeImg.height : 1) : (pageSize === 'letter' ? (isLandscape ? 792 / 612 : 612 / 792) : (isLandscape ? 842 / 595 : 595 / 842))}
					{@const marginPadding = margin === 'none' ? '0px' : margin === 'big' ? '22px' : '12px'}

					<div class="border-t border-slate-100 pt-5 space-y-3">
						<div class="flex items-center justify-between flex-wrap gap-2">
							<div class="flex items-center gap-2">
								<Eye class="w-4 h-4 text-amber-600" />
								<div>
									<h4 class="text-xs font-bold text-slate-800">
										{i18n.t('tools.imgToPdf.layoutPreview')}
									</h4>
									<p class="text-[10px] text-slate-400">
										{i18n.t('tools.imgToPdf.layoutSubtitle')}
									</p>
								</div>
							</div>

							<!-- Image Selector in Preview -->
							{#if images.length > 1}
								<div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
									<button
										type="button"
										disabled={previewActiveIndex <= 0}
										onclick={() => (previewActiveIndex = Math.max(0, previewActiveIndex - 1))}
										class="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
										title="Previous Image"
									>
										<ChevronLeft class="w-3.5 h-3.5" />
									</button>
									<span class="text-[11px] font-bold text-slate-700 px-2 select-none">
										{previewActiveIndex + 1} / {images.length}
									</span>
									<button
										type="button"
										disabled={previewActiveIndex >= images.length - 1}
										onclick={() => (previewActiveIndex = Math.min(images.length - 1, previewActiveIndex + 1))}
										class="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
										title="Next Image"
									>
										<ChevronRight class="w-3.5 h-3.5" />
									</button>
								</div>
							{/if}
						</div>

						<!-- Realistic Virtual Paper Sheet on Canvas Background -->
						<div class="w-full bg-slate-100/70 bg-dot-grid rounded-xl border border-slate-200/80 p-6 flex flex-col items-center justify-center min-h-[360px] overflow-hidden shadow-inner">
							<div
								style="aspect-ratio: {paperRatio}; width: {isLandscape ? '340px' : '240px'}; padding: {marginPadding};"
								class="bg-white rounded shadow-md border border-slate-300 flex items-center justify-center relative transition-all duration-300"
							>
								<!-- Guideline dashes for margin -->
								{#if margin !== 'none'}
									<div
										class="absolute inset-0 pointer-events-none border border-dashed border-amber-300/80 rounded"
										style="margin: {marginPadding};"
									></div>
								{/if}

								<img
									src={activeImg.url}
									alt={activeImg.name}
									class="max-w-full max-h-full object-contain shadow-xs select-none"
								/>
							</div>

							<div class="mt-3 text-[11px] font-bold text-slate-500 text-center">
								Sheet: {pageSize.toUpperCase()} ({isLandscape ? 'Landscape' : 'Portrait'}) • Margin: {margin} • {activeImg.name} ({activeImg.width} × {activeImg.height}px)
							</div>
						</div>
					</div>
				{/if}

				<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-5">
					<div class="flex-1 max-w-sm">
						<input
							type="text"
							bind:value={outputFileName}
							placeholder="images_document.pdf"
							class="w-full text-xs font-semibold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
						/>
					</div>

					<button
						type="button"
						disabled={isProcessing || images.length === 0}
						onclick={executeConvert}
						class="inline-flex items-center justify-center gap-2 px-6 py-3 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-yellow disabled:opacity-50 disabled:cursor-not-allowed transition cursor-pointer"
					>
						{#if isProcessing}
							<Loader2 class="w-4 h-4 animate-spin" />
							<span>{i18n.t('tools.imgToPdf.creating', { current: progress.current, total: progress.total })}</span>
						{:else}
							<Sparkles class="w-4 h-4" />
							<span>{i18n.t('tools.imgToPdf.createPdfBtn')}</span>
						{/if}
					</button>
				</div>

				{#if lastCreatedUrl}
					<div class="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
						<div class="flex items-center gap-2 text-xs font-bold text-emerald-800">
							<CheckCircle2 class="w-4 h-4 text-emerald-600" />
							<span>{i18n.t('tools.imgToPdf.successTitle')}</span>
						</div>
						<a
							href={lastCreatedUrl}
							download={outputFileName}
							class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
						>
							<Download class="w-3.5 h-3.5" />
							<span>{i18n.t('tools.imgToPdf.downloadBtn')}</span>
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
				{i18n.t('tools.imgToPdf.aboutTitle')}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.imgToPdf.aboutP1')}
			</p>
			<p class="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
				{i18n.t('tools.imgToPdf.aboutP2')}
			</p>
		</div>

		<!-- FAQs -->
		<div class="border-t border-slate-100 pt-6 space-y-3">
			<h4 class="text-xs font-extrabold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
				<HelpCircle class="w-3.5 h-3.5" />
				{i18n.t('tools.imgToPdf.faqTitle')}
			</h4>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q1')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.imgToPdf.faqQ1')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q1 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q1}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.imgToPdf.faqA1')}
					</div>
				{/if}
			</div>

			<div class="border border-slate-200 rounded-xl overflow-hidden">
				<button
					type="button"
					onclick={() => toggleFaq('q2')}
					class="w-full text-left px-4 py-3 bg-slate-50 hover:bg-slate-100 font-bold text-xs text-slate-800 flex items-center justify-between transition cursor-pointer"
				>
					<span>{i18n.t('tools.imgToPdf.faqQ2')}</span>
					<ChevronDown class="w-4 h-4 text-slate-500 transition-transform {faqOpen.q2 ? 'rotate-180' : ''}" />
				</button>
				{#if faqOpen.q2}
					<div class="p-4 bg-white text-xs text-slate-600 font-medium border-t border-slate-100 leading-relaxed">
						{i18n.t('tools.imgToPdf.faqA2')}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Source Image Lightbox Modal -->
	{#if inspectedImageIndex !== null && images[inspectedImageIndex]}
		{@const inspectedImg = images[inspectedImageIndex]}
		<div class="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
			<div class="bg-white rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col">
				<!-- Header -->
				<div class="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
					<div class="flex items-center gap-2 overflow-hidden">
						<Eye class="w-4 h-4 text-amber-600 shrink-0" />
						<h3 class="text-sm font-bold text-slate-900 truncate" title={inspectedImg.name}>
							{i18n.t('tools.imgToPdf.enlargeImage')} — {inspectedImg.name}
						</h3>
						<span class="text-xs text-slate-500 font-semibold shrink-0">
							({inspectedImg.width} × {inspectedImg.height}px, {formatBytes(inspectedImg.size)})
						</span>
					</div>

					<div class="flex items-center gap-3">
						<!-- Page Nav -->
						<div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
							<button
								type="button"
								disabled={inspectedImageIndex <= 0}
								onclick={() => cycleImageLightbox(-1)}
								class="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
								title="Previous Image"
							>
								<ChevronLeft class="w-4 h-4" />
							</button>
							<span class="text-[11px] font-bold text-slate-700 px-2 select-none">
								{inspectedImageIndex + 1} / {images.length}
							</span>
							<button
								type="button"
								disabled={inspectedImageIndex >= images.length - 1}
								onclick={() => cycleImageLightbox(1)}
								class="p-1 rounded hover:bg-white text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
								title="Next Image"
							>
								<ChevronRight class="w-4 h-4" />
							</button>
						</div>

						<!-- Zoom Controls -->
						<div class="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
							<button
								type="button"
								onclick={() => (lightboxZoom = Math.max(60, lightboxZoom - 20))}
								class="p-1 rounded hover:bg-white text-slate-600 transition cursor-pointer"
								title="Zoom Out"
							>
								<ZoomOut class="w-3.5 h-3.5" />
							</button>
							<span class="text-[10px] font-bold text-slate-600 px-1 select-none">{lightboxZoom}%</span>
							<button
								type="button"
								onclick={() => (lightboxZoom = Math.min(200, lightboxZoom + 20))}
								class="p-1 rounded hover:bg-white text-slate-600 transition cursor-pointer"
								title="Zoom In"
							>
								<ZoomIn class="w-3.5 h-3.5" />
							</button>
						</div>

						<button
							type="button"
							onclick={closeImageLightbox}
							class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
							title="Close"
						>
							<X class="w-5 h-5" />
						</button>
					</div>
				</div>

				<!-- Image Display Area -->
				<div class="w-full flex-1 min-h-[380px] bg-slate-100/80 bg-dot-grid rounded-xl border border-slate-200/80 p-4 flex items-center justify-center overflow-auto shadow-inner">
					<img
						src={inspectedImg.url}
						alt={inspectedImg.name}
						style="transform: scale({lightboxZoom / 100}); transform-origin: center center;"
						class="max-w-full max-h-[60vh] object-contain rounded shadow bg-white border border-slate-200 transition-transform duration-150 select-none"
					/>
				</div>

				<!-- Modal Footer -->
				<div class="flex items-center justify-between pt-2 border-t border-slate-100">
					<span class="text-xs text-slate-500 font-medium">
						Image {inspectedImageIndex + 1} of {images.length}
					</span>

					<button
						type="button"
						onclick={closeImageLightbox}
						class="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
