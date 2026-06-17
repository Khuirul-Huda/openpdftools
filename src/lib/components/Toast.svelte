<script lang="ts">
	import { toast } from './toast.svelte';
</script>

{#if toast.visible}
	<div
		class="fixed bottom-5 right-5 z-50 flex items-center p-4 border border-slate-200/80 bg-white dark:bg-slate-900 rounded-xl max-w-sm transition-all duration-300
		{toast.type === 'success' 
			? 'border-l-4 border-l-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.25)]' 
			: 'border-l-4 border-l-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.25)]'}"
	>
		<div class="mr-3 p-1.5 rounded-full {toast.type === 'success' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400'}">
			{#if toast.type === 'success'}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
			{:else}
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
			{/if}
		</div>
		<div class="text-sm font-semibold text-slate-800 dark:text-slate-200">
			{toast.message}
		</div>
	</div>
{/if}
