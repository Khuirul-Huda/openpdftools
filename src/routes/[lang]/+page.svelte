<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import { resolveRoute } from '$app/paths';
	import Seo from '$lib/components/Seo.svelte';
	import Layers from '@lucide/svelte/icons/layers';
	import Zap from '@lucide/svelte/icons/zap';
	import FileText from '@lucide/svelte/icons/file-text';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Image from '@lucide/svelte/icons/image';
	import FileUp from '@lucide/svelte/icons/file-up';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import Stamp from '@lucide/svelte/icons/stamp';
	import Lock from '@lucide/svelte/icons/lock';
</script>

<!-- SEO Optimization -->
<Seo />

<!-- Hero Area -->
<section class="text-center py-12 md:py-20 space-y-6">
	<span class="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-blue-700 bg-blue-50/70 border border-blue-200/60 rounded-full shadow-sm shadow-blue-500/5">
		<span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
		{i18n.t('common.privacyBadge')}
	</span>
	
	<h2 class="text-3xl sm:text-4xl md:text-5.5xl font-black text-slate-900 tracking-tight font-title leading-tight">
		{i18n.t('dashboard.heroTitle')}
	</h2>
	<p class="text-sm sm:text-base text-slate-500 max-w-2xl mx-auto font-semibold leading-relaxed">
		{i18n.t('dashboard.heroSubtitle')}
	</p>
</section>

<!-- Main Modules Area -->
<div class="space-y-16 max-w-6xl mx-auto">
	<!-- Active Modules -->
	<section class="space-y-6">
		<h3 class="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-3 flex items-center gap-2">
			<span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
			{i18n.t('dashboard.activeTools')}
		</h3>
		
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			<!-- 1. PDF Certificate Splitter Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-blue-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-blue-600"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<FileText class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-blue-700 transition duration-200">
						{i18n.t('tools.splitPdf.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.splitPdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
						Popular
					</span>
					<a
						href={resolveRoute('/[lang]/tools/split-certificate', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-blue transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			<!-- 2. PDF Merge Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-blue-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-indigo-600"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<Layers class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-indigo-700 transition duration-200">
						{i18n.t('tools.mergePdf.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.mergePdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
						Popular
					</span>
					<a
						href={resolveRoute('/[lang]/tools/merge', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] rounded-xl shadow-sm hover:shadow-glow-blue transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			<!-- 3. PDF Compressor Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-blue-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-emerald-600"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<Zap class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-emerald-700 transition duration-200">
						{i18n.t('tools.compressPdf.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.compressPdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
						Popular
					</span>
					<a
						href={resolveRoute('/[lang]/tools/compress', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] rounded-xl shadow-sm transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			<!-- 4. PDF to Images Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-blue-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-purple-600"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<Image class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-purple-700 transition duration-200">
						{i18n.t('tools.pdfToImg.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.pdfToImg.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 bg-purple-50 border border-purple-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
						New
					</span>
					<a
						href={resolveRoute('/[lang]/tools/pdf-to-img', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-[0.98] rounded-xl shadow-sm transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			<!-- 5. Images to PDF Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-yellow-lg hover:border-amber-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-amber-500"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<FileUp class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-amber-700 transition duration-200">
						{i18n.t('tools.imgToPdf.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.imgToPdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
						New
					</span>
					<a
						href={resolveRoute('/[lang]/tools/img-to-pdf', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500 active:scale-[0.98] rounded-xl shadow-sm transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			<!-- 6. Rotate & Organize Pages Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-teal-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-teal-500"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 border border-teal-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<RotateCw class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-teal-700 transition duration-200">
						{i18n.t('tools.organizePdf.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.organizePdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-teal-600 bg-teal-50 border border-teal-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
						New
					</span>
					<a
						href={resolveRoute('/[lang]/tools/organize', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-500 active:scale-[0.98] rounded-xl shadow-sm transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>

			<!-- 7. Page Numbers & Watermark Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-blue-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<div class="absolute top-0 left-0 w-full h-[3px] bg-blue-500"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<Stamp class="w-6 h-6" />
					</div>
					
					<h4 class="text-lg font-bold text-slate-900 font-title group-hover:text-blue-700 transition duration-200">
						{i18n.t('tools.watermarkPdf.title')}
					</h4>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.watermarkPdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 bg-blue-50 border border-blue-200/50 px-2 py-0.5 rounded-md shadow-xs">
						<span class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
						New
					</span>
					<a
						href={resolveRoute('/[lang]/tools/watermark', { lang: i18n.current })}
						class="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] rounded-xl shadow-sm transition-all duration-300"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<ArrowRight class="w-3.5 h-3.5" />
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- Future Modules -->
	<section class="space-y-6">
		<h3 class="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-3 flex items-center gap-2">
			<span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
			{i18n.t('dashboard.comingSoonTitle')}
		</h3>
		
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
			<!-- Upcoming 1: Protect & Unlock -->
			<div class="bg-white/80 border border-slate-200/70 rounded-xl p-5 shadow-xs opacity-80 hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between space-y-3">
				<div class="space-y-2">
					<div class="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
						<Lock class="w-5 h-5" />
					</div>
					<h5 class="text-xs font-bold text-slate-900 font-title">Protect & Unlock PDF</h5>
					<p class="text-[11px] text-slate-500 font-medium leading-relaxed">Secure files with password protection or remove passwords locally.</p>
				</div>
				<span class="self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">
					{i18n.t('common.comingSoon')}
				</span>
			</div>
		</div>
	</section>
</div>
