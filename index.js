import express from 'express'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 8292
const MUSIC_DIR_PATH = process.env.MUSIC_DIR || './music'
const MUSIC_DIR = path.resolve(__dirname, MUSIC_DIR_PATH)

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a'])
const MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.flac': 'audio/flac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.m4a': 'audio/mp4',
}

const app = express()
app.set('view engine', 'ejs')

/**
 * Recursively finds all music files in a directory.
 * This function is synchronous and executed on each request to the root path,
 * ensuring the file list is always current. For very large libraries, this
 * synchronous I/O could introduce latency; in such cases, a caching
 * or background scanning strategy might be more suitable.
 *
 * @param {string} baseDir The absolute path to the root music directory.
 * @param {string} currentDir The current directory being scanned, relative to baseDir.
 * @returns {Array<Object>} An array of file objects, each with 'path' and 'mtime'.
 */
function findMusicFiles(baseDir, currentDir = '') {
    const fullCurrentDir = path.join(baseDir, currentDir)
    let files = []

    try {
        const entries = fs.readdirSync(fullCurrentDir, { withFileTypes: true })
        for (const entry of entries) {
            const entryRelativePath = path.join(currentDir, entry.name)
            if (entry.isDirectory()) {
                files = files.concat(findMusicFiles(baseDir, entryRelativePath))
            } else if (
                entry.isFile() &&
                SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
            ) {
                const stats = fs.statSync(path.join(baseDir, entryRelativePath))
                files.push({
                    path: entryRelativePath.replace(/\\/g, '/'), // Normalize path separators for web, only really needed on Windows
                    mtime: stats.mtime,
                })
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${fullCurrentDir}:`, error)
    }

    return files
}

if (!fs.existsSync(MUSIC_DIR)) {
    console.error(`Error: Music directory not found at '${MUSIC_DIR}'.`)
    console.error(
        'Please set the MUSIC_DIR environment variable or create the default ./music directory.',
    )
    process.exit(1)
}

app.get('/', (req, res) => {
    const musicFiles = findMusicFiles(MUSIC_DIR)
    musicFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    res.render(path.join(__dirname, 'assets', 'index.ejs'), {
        files: musicFiles,
    })
})

app.get('/style.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets', 'style.css'))
})
app.get('/icon.svg', (req, res) => {
    res.sendFile(path.join(__dirname, 'assets', 'icon.svg'))
})

app.get('/play/*filePath', (req, res) => {
    // The (*) in the route parameter allows file paths with slashes.
    const filePathParam = req.params.filePath[0]
    console.log(filePathParam)
    const fullFilePath = path.join(MUSIC_DIR, filePathParam)

    if (!fullFilePath.startsWith(MUSIC_DIR)) {
        return res.status(403).send('Forbidden: Access is denied.')
    }

    fs.stat(fullFilePath, (err, stats) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return res.status(404).send('File not found.')
            }
            return res.status(500).send(err.message)
        }

        const fileSize = stats.size
        const range = req.headers.range
        const ext = path.extname(fullFilePath).toLowerCase()
        const contentType = MIME_TYPES[ext] || 'application/octet-stream'

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
            const chunksize = end - start + 1

            const file = fs.createReadStream(fullFilePath, { start, end })
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
            }

            res.writeHead(206, head)
            file.pipe(res)
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
            }
            res.writeHead(200, head)
            fs.createReadStream(fullFilePath).pipe(res)
        }
    })
})

app.listen(PORT, () => {
    console.log(`Music server is running at http://localhost:${PORT}`)
    console.log(`Serving music from: ${MUSIC_DIR}`)
})
