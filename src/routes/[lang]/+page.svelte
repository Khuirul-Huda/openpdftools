<script lang="ts">
	import { i18n } from '$lib/i18n/index.svelte';
	import Seo from '$lib/components/Seo.svelte';
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
		
		<div class="grid grid-cols-1 md:grid-cols-2 gap-8">
			<!-- PDF Certificate Splitter Card -->
			<div class="bg-white border border-slate-200 rounded-2xl p-7 shadow-[0_2px_12px_rgba(0,0,0,0.015)] hover:shadow-glow-blue-lg hover:border-blue-400/80 transition-all duration-300 flex flex-col justify-between group relative overflow-hidden">
				<!-- Subtle decorative top highlight border -->
				<div class="absolute top-0 left-0 w-full h-[3px] bg-blue-600"></div>

				<div class="space-y-4">
					<div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center group-hover:scale-105 transition-transform duration-300 shadow-sm">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
						</svg>
					</div>
					
					<h4 class="text-xl font-bold text-slate-900 font-title group-hover:text-blue-700 transition duration-200">
						{i18n.t('tools.splitPdf.title')}
					</h4>
					<p class="text-sm text-slate-500 font-semibold leading-relaxed">
						{i18n.t('tools.splitPdf.shortDescription')}
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100/80 flex items-center justify-between">
					<span class="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2.5 py-1 rounded-md shadow-sm">
						<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
						Popular
					</span>
					<a
						href="/{i18n.current}/tools/split-certificate"
						class="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-[0.98] rounded-xl shadow-[0_4px_14px_rgba(37,99,235,0.3)] hover:shadow-glow-blue-lg transition-all duration-300 group-hover:-translate-y-0.5"
					>
						<span>{i18n.t('dashboard.openTool')}</span>
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
						</svg>
					</a>
				</div>
			</div>
			
			<!-- Coming Soon Card placeholder -->
			<div class="bg-white/70 border border-slate-200/60 rounded-2xl p-7 shadow-sm flex flex-col justify-between select-none relative">
				<div class="space-y-4 opacity-60">
					<div class="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shadow-inner">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
						</svg>
					</div>
					
					<h4 class="text-xl font-bold text-slate-800 font-title">
						Merge PDF Files
					</h4>
					<p class="text-sm text-slate-500 font-semibold leading-relaxed">
						Combine multiple documents into a single PDF instantly in chronological or custom order.
					</p>
				</div>
				
				<div class="mt-8 pt-5 border-t border-slate-100/60 flex items-center justify-between">
					<span class="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm">
						{i18n.t('common.comingSoon')}
					</span>
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
		
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
			<!-- Card 1 -->
			<div class="bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm opacity-75 hover:opacity-100 transition-opacity duration-200">
				<div class="space-y-2">
					<h5 class="text-sm font-bold text-slate-900 font-title">PDF Image Extractor</h5>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">Extract and download all embedded images from inside any PDF document.</p>
				</div>
			</div>
			<!-- Card 2 -->
			<div class="bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm opacity-75 hover:opacity-100 transition-opacity duration-200">
				<div class="space-y-2">
					<h5 class="text-sm font-bold text-slate-900 font-title">PDF Compressor</h5>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">Compress file size of PDF documents without losing text sharpness.</p>
				</div>
			</div>
			<!-- Card 3 -->
			<div class="bg-white border border-slate-200/60 rounded-xl p-5 shadow-sm opacity-75 hover:opacity-100 transition-opacity duration-200">
				<div class="space-y-2">
					<h5 class="text-sm font-bold text-slate-900 font-title">Encrypt / Decrypt PDF</h5>
					<p class="text-xs text-slate-500 font-semibold leading-relaxed">Add password security encryption or unlock secured PDF files easily.</p>
				</div>
			</div>
		</div>
	</section>
</div>
