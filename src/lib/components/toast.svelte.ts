export class ToastManager {
	message = $state('');
	type = $state<'success' | 'error'>('success');
	visible = $state(false);
	timer: any = null;

	show(message: string, type: 'success' | 'error' = 'success') {
		this.message = message;
		this.type = type;
		this.visible = true;

		if (this.timer) clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			this.visible = false;
		}, 4000);
	}
}

export const toast = new ToastManager();
