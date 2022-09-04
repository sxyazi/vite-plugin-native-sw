import type {Plugin, ResolvedConfig} from 'vite'
import {promises as fs} from 'node:fs'
import {resolve} from 'node:path'
import {parse} from '@babel/parser'
import {createHash, randomBytes} from 'node:crypto'

const replaceImports = (code: string) => {
	const ast = parse(code, {
		sourceType: 'module',
		plugins: ['typescript'],
	})

	let offset = 0
	for (const node of ast.program.body) {
		if (node.type !== 'ImportDeclaration') continue
		const start = node.source.start!
		const raw = node.source.extra!.raw as string

		const virtual = raw[0] + 'sw-import:' + raw.slice(1)
		code = code.slice(0, start + offset) + virtual + code.slice(start + offset + raw.length)
		offset += virtual.length - raw.length
	}

	return code
}

export async function createHashFromFiles(...files: string[]) {
	const contents = await Promise.all(files.map(file => fs.readFile(file, 'utf-8')))
	return createHash('md5').update(contents.join('')).digest('hex').substring(0, 8)
}

interface Options {
	src: string
	filename?: string
	genVersion?: () => Promise<string>
}

export const nativeSW = ({src, filename = 'sw.js', genVersion}: Options): Plugin[] => {
	let version: string
	let mode: string

	return [{
		name: 'sw-plugin',
		apply: 'build',
		enforce: 'post',
		async configResolved() {
			version = genVersion ? await genVersion() : randomBytes(20).toString('hex').substring(0, 8)
		},
		buildStart() {
			this.emitFile({
				type: 'chunk',
				id: src,
				fileName: filename,
			})
		},
		resolveId(source: string) {
			if (source.startsWith('sw-import:')) {
				return source.replace(/\.ts$/, '') + '.ts'
			}
			return undefined
		},
		load(id: string) {
			if (id.startsWith('sw-import:')) {
				return fs.readFile(resolve(src, '../', id.substring('sw-import:'.length)), 'utf-8')
			}
			return undefined
		},
		transform(code: string, id: string) {
			if (id === src) {
				return replaceImports(code)
			}
			return undefined
		},
		generateBundle(_, bundle) {
			if (!(filename in bundle)) {
				throw new Error(`${filename} not found in bundle`)
			}

			const sw = bundle[filename] as { code: string }
			sw.code = sw.code.replaceAll('%SW_VERSION%', version)
		},
	}, {
		name: 'sw-plugin:dev',
		apply: 'serve',
		enforce: 'pre',
		resolveId(source: string) {
			if (source === `/${filename}`) {
				return src
			}
			return undefined
		},
		async load(id: string) {
			if (id === src) {
				return (await fs.readFile(id, 'utf-8')).replaceAll('%SW_VERSION%', 'dev')
			}
			return undefined
		},
	}, {
		name: 'sw-plugin:virtual',
		configResolved(config: ResolvedConfig) {
			mode = config.mode
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

			return `export const registerSW = () => ('serviceWorker' in navigator &&
									navigator.serviceWorker.register('/${filename}', {type: '${mode === 'production' ? 'classic' : 'module'}'}))`
		},
	}]
}
