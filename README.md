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
import {nativeSW} from 'vite-plugin-native-sw'

export default defineConfig({
  plugins: [
    nativeSW({
      entries: [{
        src: resolve(__dirname, 'src/service-worker.ts'),
        dist: 'sw.js',
      }]
    }),
  ],
})
```

The `src/service-worker.ts` file will be used as the SW entry point, to be bundled as `/sw.js`. It might look like
this ([more examples](examples)):

```ts
/// <reference lib="webworker" />
export type {}
declare const self: ServiceWorkerGlobalScope
const SW_VERSION = '%SW_VERSION%'  // it will be replaced on each build, and only fixed string "dev" in development

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

registerSW('sw.js').catch(console.error)
```

## Options

- `entries` - an array of SW entries
  - `src` - path to the SW entry point.
  - `dist` - path to the SW output file.
  - `genVersion` - function to generate the `SW_VERSION`. By default, it uses a random string for each build. You can
    get other things with this option passed.

```ts
import {nativeSW, createHashFromFiles} from 'vite-plugin-native-sw'

nativeSW({
  entries: [{
    src: resolve(__dirname, 'src/service-worker.ts'),
    dist: 'my-sw.js',
    genVersion: async () => createHashFromFiles('index.html', 'admin.html'),
  }]
})
```

## License

This project is [MIT licensed](LICENSE).
