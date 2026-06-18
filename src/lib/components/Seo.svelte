<script lang="ts">
	import { page } from '$app/state';
	import { i18n } from '$lib/i18n/index.svelte';

	let {
		title = '',
		description = '',
		keywords = '',
		canonicalUrl = ''
	} = $props();

	let displayTitle = $derived(title || i18n.t('meta.title'));
	let displayDescription = $derived(description || i18n.t('meta.description'));
	let displayKeywords = $derived(keywords || i18n.t('meta.keywords'));
	let url = $derived(canonicalUrl || page.url.href);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let schemaJson = $derived(JSON.stringify({
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"name": displayTitle,
		"description": displayDescription,
		"url": url,
		"applicationCategory": "UtilityApplication",
		"operatingSystem": "All",
		"offers": {
			"@type": "Offer",
			"price": "0",
			"priceCurrency": "USD"
		}
	}));
</script>

<svelte:head>
	<!-- Standard Meta -->
	<title>{displayTitle}</title>
	<meta name="description" content={displayDescription} />
	<meta name="keywords" content={displayKeywords} />
	<meta name="author" content="@khuirul_huda" />
	<link rel="canonical" href={url} />

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content={displayTitle} />
	<meta property="og:description" content={displayDescription} />
	<meta property="og:url" content={url} />
	<meta property="og:site_name" content="PDFTools" />

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={displayTitle} />
	<meta name="twitter:description" content={displayDescription} />

	<script type="application/ld+json">
		{@html schemaJson}
	</script>
</svelte:head>
