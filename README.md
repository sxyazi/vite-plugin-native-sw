# vite-plugin-native-sw

## Installation

```bash
npm i -D vite-plugin-native-sw

# yarn 
yarn add -D vite-plugin-native-sw

# pnpm 
pnpm add -D vite-plugin-native-sw
```

## Usage

Add this plugin to your `vite.config.js`:

```js
import nativeSW from 'vite-plugin-native-sw'

export default defineConfig({
	plugins: [
		nativeSW({
			src: resolve(__dirname, 'src/service-worker.ts')
		}),
	],
})
```

The `src/service-worker.ts` file will be used as the SW entry point. It might look like this:

```ts
/// <reference lib="webworker" />
export type {}
declare const self: ServiceWorkerGlobalScope
const SW_VERSION = '%SW_VERSION%'  // it will be replaced on each build

self.addEventListener('install', (event: ExtendableEvent) => {
	event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(async function () {
		await self.clients.claim()
		console.log('SW activated', SW_VERSION)
	}())
})
```

Finally, register it in `app.ts` or anywhere in your app:

```ts
/// <reference types="vite-plugin-native-sw/global" />
import {registerSW} from 'virtual:sw-plugin'

registerSW().catch(console.error)
```

## Options

- `src` - path to the SW entry point.
- `filename` - path to the SW output file. Default: `sw.js`.
- `genVersion` - function to generate the `SW_VERSION`. By default, it uses a random string for each build. You can use
	this option to get another behavior.

```ts
import nativeSW, {createHashFromFiles} from 'vite-plugin-native-sw'

nativeSW({
	src: resolve(__dirname, 'src/service-worker.ts'),
	filename: 'my-sw.js',
	genVersion: async () => createHashFromFiles('index.html', 'admin.html'),
})
```

## License

This project is [MIT licensed](LICENSE).
