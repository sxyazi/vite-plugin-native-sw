import type {Plugin, ResolvedConfig} from 'vite'
import {promises as fs, stat} from 'node:fs'
import {resolve} from 'node:path'
import {parse} from '@babel/parser'
import {createHash, randomBytes} from 'node:crypto'

const revealFile = async (entry: string, source: string): Promise<string> => {
	if (!/[./]/.test(source[1])) {
		return source
	}

	const file = resolve(entry, '..', source)
	return new Promise((resolve) => {
		stat(`${file}.ts`, (err) => {
			if (!err) resolve(`sw-import:${file}.ts`)
			else resolve(`sw-import:${file}.js`)
		})
	})
}

const replaceImports = async (entry: string, code: string): Promise<string> => {
	const ast = parse(code, {
		sourceType: 'module',
		plugins: ['typescript'],
	})

	let offset = 0
	for (const node of ast.program.body) {
		if (node.type !== 'ImportDeclaration') continue
		const start = node.source.start!
		const raw = node.source.extra!.raw as string

		const virtual = raw[0] + await revealFile(entry, raw.slice(1, -1)) + raw[0]
		code = code.slice(0, start + offset) + virtual + code.slice(start + offset + raw.length)
		offset += virtual.length - raw.length
	}

	return code
}

export async function createHashFromFiles(...files: string[]) {
	const contents = await Promise.all(files.map(file => fs.readFile(file, 'utf-8')))
	return createHash('md5').update(contents.join('')).digest('hex').slice(0, 8)
}

export interface Options {
	entries: {
		src: string
		dist: string
		genVersion?: () => Promise<string>
	}[]
}

export const nativeSW = ({entries}: Options): Plugin[] => {
	let conf: ResolvedConfig
	const versions: Record<string, string> = {}
	entries = entries.map(entry => ({...entry, dist: entry.dist.replace(/^\/+/, '')}))

	return [{
		name: 'sw-plugin',
		apply: 'build',
		enforce: 'post',
		async configResolved() {
			await Promise.all(
				entries.map(async ({src, dist, genVersion}) =>
					versions[dist] = genVersion ? await genVersion() : randomBytes(20).toString('hex').slice(0, 8)),
			)
		},
		buildStart() {
			entries.map(({src, dist}) =>
				this.emitFile({type: 'chunk', id: src, fileName: dist}))
		},
		load(id: string) {
			if (id.startsWith('sw-import:')) {
				return fs.readFile(id.slice('sw-import:'.length, -1), 'utf-8')
			}
			return undefined
		},
		transform(code: string, id: string) {
			for (const {src} of entries) {
				if (id === src) {
					return replaceImports(id, code)
				}
			}
			return undefined
		},
		generateBundle(_, bundle) {
			for (const {dist} of entries) {
				if (!(dist in bundle)) {
					throw new Error(`${dist} not found in bundle`)
				}

				const sw = bundle[dist] as { code: string }
				console.log('generateBundle', dist)
				sw.code = sw.code.replaceAll('%SW_VERSION%', versions[dist])
			}
		},
	}, {
		name: 'sw-plugin:dev',
		apply: 'serve',
		enforce: 'pre',
		configResolved(config: ResolvedConfig) {
			conf = config
		},
		resolveId(source: string) {
			return entries.find(({dist}) => source === `/${dist}`)?.src
		},
		async load(id: string) {
			for (const {src} of entries) {
				if (id !== src) {
					continue
				}

				let code = await fs.readFile(id, 'utf-8')
				if (Object.keys(conf.define ?? {}).length) {
					code = `import '/@vite/env'\n\n${code}`
				}
				return code.replaceAll('%SW_VERSION%', 'dev')
			}

			return undefined
		},
	}, {
		name: 'sw-plugin:virtual',
		configResolved(config: ResolvedConfig) {
			conf = config
		},
		resolveId(source) {
			if (source === 'virtual:sw-plugin') {
				return source
			}
			return undefined
		},
		load(id: string) {
			if (id !== 'virtual:sw-plugin') {
				return undefined
			}

			const packed = entries.map(({dist}) => ({
				dist,
				version: conf.mode === 'production' ? versions[dist] : 'dev',
			}))

			return `
export const packedSW = () => (${JSON.stringify(packed)})
export const registerSW = (dist, options) => ('serviceWorker' in navigator &&
								navigator.serviceWorker.register('/' + dist, {type: '${conf.mode === 'production' ? 'classic' : 'module'}', ...options}))`

		},
	}]
}
