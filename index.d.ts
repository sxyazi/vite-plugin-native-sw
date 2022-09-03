declare module 'virtual:sw-plugin' {
  export function registerSW(): Promise<ServiceWorkerRegistration>
}

export * from './dist'
export {default} from './dist'
