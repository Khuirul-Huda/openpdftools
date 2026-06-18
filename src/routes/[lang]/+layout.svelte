<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { resolveRoute } from "$app/paths";
	import { i18n } from "$lib/i18n/index.svelte";
	import type { Locale } from "$lib/i18n/index.svelte";
	import Toast from "$lib/components/Toast.svelte";

	let { children } = $props();

	// Update i18n manager whenever route lang parameter changes
	$effect(() => {
		const routeLang = page.params.lang as Locale;
		if (routeLang && (routeLang === "en" || routeLang === "id")) {
			i18n.setLocale(routeLang);
		}
	});

	let showLangDropdown = $state(false);

	function changeLanguage(newLang: Locale) {
		showLangDropdown = false;
		const routeId = page.route.id;
		if (routeId) {
			goto(
				resolveRoute(routeId as "/[lang]", {
					...page.params,
					lang: newLang,
				}),
			);
		} else {
			goto(resolveRoute("/[lang]", { lang: newLang }));
		}
	}

	function toggleLangDropdown() {
		showLangDropdown = !showLangDropdown;
	}
</script>

<div
	class="min-h-screen bg-slate-50/50 bg-dot-grid flex flex-col justify-between selection:bg-blue-600 selection:text-white"
>
	<!-- Navbar / Header -->
	<header
		class="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-40 shadow-[0_4px_25px_rgba(59,130,246,0.05)]"
	>
		<div
			class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between"
		>
			<!-- Logo and Brand -->
			<a
				href={resolveRoute("/[lang]", { lang: i18n.current })}
				class="flex items-center gap-3 group"
			>
				<div
					class="bg-blue-600 p-2 rounded-xl text-white shadow-[0_0_15px_rgba(37,99,235,0.4)] group-hover:shadow-[0_0_20px_rgba(37,99,235,0.6)] transition duration-300"
				>
					<svg
						class="w-6 h-6"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
						/>
					</svg>
				</div>
				<div>
					<h1
						class="text-lg font-extrabold tracking-tight text-slate-900 font-title"
					>
						{i18n.t("common.siteName")}
					</h1>
					<p
						class="text-[10px] text-slate-500 font-semibold tracking-wide"
					>
						{i18n.t("common.tagLine")}
					</p>
				</div>
			</a>

			<!-- Right Section controls -->
			<div class="flex items-center gap-4">
				<!-- Local processing badge -->
				<span
					class="hidden md:inline-flex items-center rounded-full bg-blue-50 border border-blue-200/60 px-3.5 py-1 text-xs font-bold text-blue-700 shadow-[0_0_10px_rgba(59,130,246,0.1)]"
				>
					<span
						class="w-2 h-2 mr-2 rounded-full bg-blue-500 animate-pulse"
					></span>
					{i18n.t("common.safetyNotice")}
				</span>

				<!-- Language Selector Dropdown -->
				<div class="relative">
					<button
						onclick={toggleLangDropdown}
						type="button"
						class="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-bold transition shadow-sm"
					>
						<svg
							class="w-4 h-4 text-slate-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 002 2h2m.358 5.584A9 9 0 1118 12.072M12 2a9.97 9.97 0 012.983.458"
							/>
						</svg>
						{i18n.current === "id"
							? i18n.t("common.idLocaleName")
							: i18n.t("common.enLocaleName")}
						<svg
							class="w-3.5 h-3.5 text-slate-500 transition-transform {showLangDropdown
								? 'rotate-180'
								: ''}"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 9l-7 7-7-7"
							/>
						</svg>
					</button>

					{#if showLangDropdown}
						<!-- Click outside backdrop to dismiss -->
						<button
							tabindex="-1"
							aria-label="Close dropdown"
							onclick={() => (showLangDropdown = false)}
							class="fixed inset-0 z-10 cursor-default bg-transparent w-full h-full"
						></button>
						<div
							class="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-20 text-xs font-semibold"
						>
							<button
								onclick={() => changeLanguage("id")}
								class="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 hover:text-blue-600 transition flex items-center justify-between"
							>
								<span>{i18n.t("common.idLocaleName")}</span>
								{#if i18n.current === "id"}
									<svg
										class="w-4 h-4 text-blue-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</button>
							<button
								onclick={() => changeLanguage("en")}
								class="w-full text-left px-4 py-2 hover:bg-slate-50 text-slate-700 hover:text-blue-600 transition flex items-center justify-between"
							>
								<span>{i18n.t("common.enLocaleName")}</span>
								{#if i18n.current === "en"}
									<svg
										class="w-4 h-4 text-blue-600"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{/if}
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</header>

	<!-- Main Page Container -->
	<main class="grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="bg-white border-t border-slate-200 py-6 shadow-inner">
		<div
			class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4"
		>
			<div class="text-xs text-slate-500 font-semibold">
				&copy; {new Date().getFullYear()}
				{i18n.t("common.siteName")}. All rights reserved.
			</div>
			<div class="flex items-center text-xs text-slate-600 font-bold">
				{i18n.t("common.madeBy")} &nbsp;
				<svg
					class="w-3.5 h-3.5 text-rose-500 animate-pulse fill-rose-500"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fill-rule="evenodd"
						d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
						clip-rule="evenodd"
					/>
				</svg>
				&nbsp; by &nbsp;
				<a
					href="https://github.com/khuirulhuda"
					target="_blank"
					rel="noopener noreferrer"
					class="text-blue-600 hover:text-blue-700 hover:underline transition"
				>
					Khuirul Huda
				</a>
			</div>
		</div>
	</footer>

	<!-- Shared notifications toast alert -->
	<Toast />
</div>
