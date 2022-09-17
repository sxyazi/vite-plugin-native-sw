declare module 'virtual:sw-plugin' {
	export function packedSW(): { dist: string, version: string }[]

	export function registerSW(dist: string, options?: RegistrationOptions): Promise<ServiceWorkerRegistration>
}
