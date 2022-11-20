import type {Plugin, ResolvedConfig} from 'vite'
import {promises as fs} from 'node:fs'
import {resolve} from 'node:path'
import {parse} from '@babel/parser'
import {createHash, randomBytes} from 'node:crypto'

const VIRTUAL_IMPORT = 'sw-import:'

const revealFile = async (entry: string, source: string): Promise<string> => {
	if (!/[./]/.test(source[1])) {
		return source
	}

	const file = resolve(entry, '..', source)
	return file + await fs.stat(`${file}.ts`).then(() => '.ts', () => '.js')
}

const replaceImports = async (index: number, entry: string, code: string): Promise<string> => {
	const ast = parse(code, {
		sourceType: 'module',
		plugins: ['typescript'],
	})

	let offset = 0
	for (const node of ast.program.body) {
		if (node.type !== 'ImportDeclaration') continue
		const start = node.source.start!
		const raw = node.source.extra!.raw as string

		const virtual = raw[0] + VIRTUAL_IMPORT + `${index},` +
			await revealFile(entry, raw.slice(1, -1)) + raw[0]

		code = code.slice(0, start + offset) + virtual + code.slice(start + offset + raw.length)
		offset += virtual.length - raw.length
	}

	return code
}

const loadModule = async (root: string, id: string): Promise<string> => {
	if (/[./]/.test(id)) {
		return fs.readFile(id, 'utf-8')
	}

	if (id.includes('/')) {
		id = resolve(root, 'node_modules', id)
		id += await fs.stat(`${id}.ts`).then(() => '.ts', () => '.js')
		return fs.readFile(id, 'utf-8')
	}

	let pkg: { module?: string }
	try {
		pkg = JSON.parse(await fs.readFile(
			resolve(root, 'node_modules', id, 'package.json'), 'utf-8'))
	} catch (e) {
		throw new Error(`Cannot find the package.json of module '${id}'`)
	}

	if (!pkg.module) {
		throw new Error(`Only ESM modules are supported, but the module '${id}' is not`)
	}
	return fs.readFile(resolve(root, 'node_modules', id, pkg.module), 'utf-8')
}

export async function createHashFromFiles(...files: string[]) {
	const contents = await Promise.all(files.map(file => fs.readFile(file, 'utf-8')))
	return createHash('md5').update(contents.join('')).digest('hex').slice(0, 8)
}

export interface Options {
	entries: {
		src: string
		dist: string
		index?: number
		genVersion?: () => Promise<string>
	}[]
}

export const nativeSW = ({entries}: Options): Plugin[] => {
	let conf: ResolvedConfig
	const versions: Record<string, string> = {}
	entries = entries.map((entry, i) => ({
		...entry,
		index: entry.index ?? i,
		dist: entry.dist.replace(/^\/+/, ''),
	}))

	return [{
		name: 'sw-plugin',
		apply: 'build',
		enforce: 'post',
		async configResolved(config: ResolvedConfig) {
			conf = config
			await Promise.all(
				entries.map(async ({src, dist, genVersion}) =>
					versions[dist] = genVersion ? await genVersion() : randomBytes(20).toString('hex').slice(0, 8)),
			)
		},
		buildStart() {
			entries.map(({src, dist}) =>
				this.emitFile({type: 'chunk', id: src, fileName: dist}))
		},
		resolveId(source: string) {
			if (source.startsWith(VIRTUAL_IMPORT)) {
				return source
			}
			return undefined
		},
		load(id: string) {
			if (!id.startsWith(VIRTUAL_IMPORT)) {
				return undefined
			}

			id = id.slice(VIRTUAL_IMPORT.length)
			return loadModule(conf.root, id.slice(id.indexOf(',') + 1))
		},
		transform(code: string, id: string) {
			for (const {src, index} of entries) {
				if (id === src) {
					return replaceImports(index!, id, code)
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
