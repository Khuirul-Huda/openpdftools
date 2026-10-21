<script lang="ts">
	import UploadCloud from '@lucide/svelte/icons/upload-cloud';
	import FileUp from '@lucide/svelte/icons/file-up';

	interface Props {
		multiple?: boolean;
		accept?: string;
		title?: string;
		subtitle?: string;
		helper?: string;
		onfiles: (files: File[]) => void;
	}

	let {
		multiple = false,
		accept = '.pdf,application/pdf',
		title = 'Drag & drop PDF files here',
		subtitle = 'or click to browse from your device',
		helper = 'Files are processed 100% locally in your browser sandbox',
		onfiles
	}: Props = $props();

	let isDragging = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			const validFiles = Array.from(e.dataTransfer.files).filter(
				(f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
			);
			if (validFiles.length > 0) {
				onfiles(multiple ? validFiles : [validFiles[0]]);
			}
		}
	}

	function handleFileChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			const validFiles = Array.from(target.files);
			onfiles(multiple ? validFiles : [validFiles[0]]);
			target.value = '';
		}
	}

	function triggerBrowse() {
		fileInput?.click();
	}
</script>

<div
	role="button"
	tabindex="0"
	onclick={triggerBrowse}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			triggerBrowse();
		}
	}}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	class="relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-300 cursor-pointer group {isDragging
		? 'border-blue-500 bg-blue-50/70 scale-[1.01] shadow-glow-blue'
		: 'border-slate-300/80 bg-white hover:border-blue-400 hover:bg-blue-50/20 shadow-sm'}"
>
	<input
		bind:this={fileInput}
		type="file"
		{accept}
		{multiple}
		onchange={handleFileChange}
		class="hidden"
	/>

	<div class="flex flex-col items-center justify-center space-y-4">
		<div
			class="w-16 h-16 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 {isDragging
				? 'bg-blue-600 text-white shadow-glow-blue'
				: 'bg-blue-50 text-blue-600 border border-blue-100 group-hover:bg-blue-600 group-hover:text-white'}"
		>
			{#if isDragging}
				<FileUp class="w-8 h-8 animate-bounce" />
			{:else}
				<UploadCloud class="w-8 h-8" />
			{/if}
		</div>

		<div class="space-y-1.5">
			<h3 class="text-base sm:text-lg font-bold text-slate-800 font-title group-hover:text-blue-600 transition">
				{title}
			</h3>
			<p class="text-xs sm:text-sm text-slate-500 font-medium">
				{subtitle}
			</p>
		</div>

		{#if helper}
			<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
				<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
				{helper}
			</div>
		{/if}
	</div>
</div>
