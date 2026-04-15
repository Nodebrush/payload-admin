import { cpSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = resolve(__dirname, '../../../packages/payload-config/public')
const dest = resolve(__dirname, '../public')

mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true, force: true })
console.log('Copied branding assets from payload-config to public/')
