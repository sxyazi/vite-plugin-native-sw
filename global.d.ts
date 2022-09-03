declare module 'virtual:sw-plugin' {
	export function registerSW(): Promise<ServiceWorkerRegistration>
}
