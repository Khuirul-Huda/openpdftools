<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	onMount(() => {
		let lang = 'en';
		if (browser) {
			const saved = localStorage.getItem('lang');
			if (saved === 'en' || saved === 'id') {
				lang = saved;
			} else {
				const navLang = navigator.language.substring(0, 2);
				if (navLang === 'id') {
					lang = 'id';
				}
			}
		}
		goto(`/${lang}`, { replaceState: true });
	});
</script>

<div class="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
	<div class="flex flex-col items-center gap-3">
		<div class="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
		<p class="text-sm font-semibold">Redirecting...</p>
	</div>
</div>
