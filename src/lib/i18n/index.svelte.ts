import { en } from './en';
import { id } from './id';

export type Locale = 'en' | 'id';

export const translations = { en, id };

class I18nManager {
	current = $state<Locale>('en');

	setLocale(locale: Locale) {
		if (translations[locale]) {
			this.current = locale;
			if (typeof document !== 'undefined') {
				document.documentElement.lang = locale;
				localStorage.setItem('lang', locale);
			}
		}
	}

	t(key: string, data?: Record<string, string | number>): string {
		const dict = translations[this.current];
		const keys = key.split('.');
		let value: any = dict;
		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) {
				value = value[k];
			} else {
				return key; // Fallback to key if translation is missing
			}
		}
		if (typeof value !== 'string') return key;
		if (data) {
			return Object.entries(data).reduce((str, [k, val]) => {
				return str.replace(new RegExp(`{${k}}`, 'g'), String(val));
			}, value);
		}
		return value;
	}

	tArray(key: string): string[] {
		const dict = translations[this.current];
		const keys = key.split('.');
		let value: any = dict;
		for (const k of keys) {
			if (value && typeof value === 'object' && k in value) {
				value = value[k];
			} else {
				return [key];
			}
		}
		if (Array.isArray(value)) return value;
		if (typeof value === 'string') return [value];
		return [key];
	}
}

export const i18n = new I18nManager();
