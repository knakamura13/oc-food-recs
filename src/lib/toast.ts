import { toast as sonner } from 'svelte-sonner';

export const toast = {
	success: (message: string) => sonner.success(message),
	error: (message: string) => sonner.error(message),
	info: (message: string) => sonner.info(message),
	warning: (message: string) => sonner.warning(message)
};
