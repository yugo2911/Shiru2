import JASSUB from 'jassub'
import { hex2arr, bin2hex } from 'uint8-util'
import { toTS, subRx, videoRx } from '@/modules/util.js'
import { settings } from '@/modules/settings.js'
import { client } from '@/modules/torrent.js'
import { jimakuClient } from '@/modules/jimaku.js'
import clipboard from '@/modules/clipboard.js'
import { SUPPORTS } from '@/modules/support.js'

/**
 * MPV-like default ASS header (tweak fonts/names to your environment)
 */
const defaultHeader = `[Script Info]
Title: English (US)
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1280
PlayResY: 720
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default, ${settings.value.font?.name || 'Roboto Medium'},54,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,3,0,2,20,20,40,1
[Events]

`

// capture full style line (name and properties)
const stylesRx = /^Style:\s*([^\r\n]+)/gmi
// compact JP test set (expanded)
export const JP_SUB_COMMON_EXT = "、。「」『』（）【】〈〉《》・ー〜～—–‑…⋯々ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮ\uFF66-\uFF9D゛゜︙︰︱︳︴♪♫※★☆→←↑↓℃％°＃＠＆Ａ-Ｚａ-ｚ０-９，．：；！？"

// remove control and zero-width characters
export function stripInvisible(text) {
  if (!text) return text
  return text.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\uFEFF]/g, '')
}

// normalize common variants (wave dash, tilde, fullwidth ASCII -> canonical)
export function normalizeVariants(text) {
  if (!text) return text
  return text
    .replace(/\u301C/g, '\uFF5E')   // map U+301C to fullwidth tilde
    .replace(/\u223C/g, '\uFF5E')   // map tilde operator to fullwidth tilde
    .replace(/\u2014/g, '\u2013')   // em dash -> en dash (optional)
    .replace(/~/g, '\uFF5E')        // ascii tilde -> fullwidth tilde
}

// canvas glyph test: returns true if canvas width differs from fallback marker
export function hasGlyphCanvas(fontFamily, ch) {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    ctx.font = `32px ${fontFamily}, monospace`
    const w1 = ctx.measureText(ch).width
    ctx.font = '32px monospace'
    const w2 = ctx.measureText(ch).width
    return w1 !== w2
  } catch (e) {
    return true // assume present if canvas fails
  }
}

// test a set of characters and return missing ones (uses canvas fallback)
export function findMissingGlyphsCanvas(chars, fontFamily) {
  const missing = []
  for (const ch of Array.from(chars)) {
    if (!hasGlyphCanvas(fontFamily, ch)) missing.push(ch)
  }
  return missing
}

/**
 * Convert common HTML inline tags to ASS override tags.
 * Supports <b>, <i>, <u>, <br>, <font color="#RRGGBB">.
 */
function htmlToAss (text) {
  if (!text) return ''
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, '\\h')
  text = text.replace(/<br\s*\/?>/gi, '\\N')
  text = text.replace(/<b>(.*?)<\/b>/gi, '{\\b1}$1{\\b0}')
  text = text.replace(/<i>(.*?)<\/i>/gi, '{\\i1}$1{\\i0}')
  text = text.replace(/<u>(.*?)<\/u>/gi, '{\\u1}$1{\\u0}')
  text = text.replace(/<font\s+color=["']#?([0-9a-f]{6})["']>(.*?)<\/font>/gi, (m, col, inner) => {
    const r = col.slice(0, 2), g = col.slice(2, 4), b = col.slice(4, 6)
    return `{\\c&H${b}${g}${r}&}${inner}{\\c}`
  })
  // strip any remaining tags but keep content
  text = text.replace(/<\/?[^>]+(>|$)/g, '')
  return text
}

export default class Subtitles {
  constructor (video, files, selected, onHeader) {
    this.video = video
    this.selected = selected || null
    this.files = files || []
    this.headers = []
    this.tracks = []
    this._tracksString = []
    this._stylesMap = []
    this.fonts = ['/Roboto.ttf', './NotoSansCJK.otf']
    this.renderer = null
    this.parsed = false
    this.stream = null
    this.parser = null
    this.current = 0
    this.onHeader = onHeader
    this.videoFiles = files.filter(file => videoRx.test(file.name))
    this.subtitleFiles = []
    this.timeout = null

    // renderer readiness promise helpers
    this.rendererReady = Promise.resolve()
    this._resolveRendererReady = null

    this.handleFile = ({ detail }) => {
      if (this.selected) {
        const uint8 = hex2arr(bin2hex(detail))
        this.fonts.push(uint8)
        // if renderer exists, add font immediately and nudge readiness
        if (this.renderer && typeof this.renderer.addFont === 'function') {
          try {
            this.renderer.addFont(uint8)
            // small delay to allow font registration
            if (this._resolveRendererReady) {
              clearTimeout(this._rendererReadyTimeout)
              this._rendererReadyTimeout = setTimeout(() => {
                this._resolveRendererReady()
                this._resolveRendererReady = null
              }, 80)
            }
          } catch (e) {
            console.error('addFont failed:', e)
          }
        }
      }
    }

    // make handler async so we can await renderer readiness before creating events
    this.handleSubtitle = async ({ detail }) => {
      const { subtitle, trackNumber } = detail
      if (this.selected) {
        const string = JSON.stringify(subtitle)
        if (this._tracksString[trackNumber] && !this._tracksString[trackNumber].has(string)) {
          this._tracksString[trackNumber].add(string)
          const assSub = this.constructSub(subtitle, this.headers[trackNumber].type !== 'ass', this.tracks[trackNumber].length, trackNumber)
          this.tracks[trackNumber].push(assSub)
          if (this.current === trackNumber && this.renderer) {
            await this._waitRendererReady()
            try {
              this.renderer.createEvent(assSub)
            } catch (e) {
              console.error('createEvent failed:', e)
            }
          }
        }
      }
    }

    this.handleTracks = ({ detail }) => {
      if (this.selected) {
        for (const track of detail) {
          if (!this.tracks[track.number]) {
            // overwrite webvtt or other header with custom one
            if (track.type !== 'ass') track.header = defaultHeader
            this.tracks[track.number] = []
            this._tracksString[track.number] = new Set()
            this.headers[track.number] = track
            this._stylesMap[track.number] = { Default: 'Default' }

            // parse style names from header
            let m
            stylesRx.lastIndex = 0
            const styleMatches = []
            while ((m = stylesRx.exec(track.header)) !== null) {
              // m[1] contains the full style line after "Style:"
              const styleLine = m[1].trim()
              // style name is the first comma-separated token
              const styleName = styleLine.split(',')[0].trim()
              styleMatches.push(styleName)
            }
            for (const name of styleMatches) {
              this._stylesMap[track.number][name] = name
            }

            this.onHeader()
          }
        }
        this.initSubtitleRenderer()
        const tracks = this.headers?.filter(t => t)
        if (tracks?.length && settings.value.subtitleLanguage) {
          if (tracks.length === 1) {
            this.selectCaptions(tracks[0].number)
          } else {
            let wantedTrack = tracks.find(({ language }) => {
              if (language == null) language = 'eng'
              return language === settings.value.subtitleLanguage
            })
            if (!wantedTrack) wantedTrack = tracks.find(track => (track.name?.toLowerCase() ?? '').includes(settings.value.subtitleLanguage.toLowerCase()))
            if (wantedTrack) return this.selectCaptions(wantedTrack.number)

            const englishTrack = tracks.find(({ language }) => language == null || language === 'eng')
            if (englishTrack) return this.selectCaptions(englishTrack.number)

            this.selectCaptions(tracks[0].number)
          }
        }
      }
    }

    this.handleClipboardText = ({ detail }) => {
      for (const { text, type } of detail) {
        if (text.startsWith('[Script Info]')) this.addSingleSubtitleFile(new File([text], 'Subtitle', { type }))
      }
    }
    this.handleClipboardFiles = ({ detail }) => {
      for (const file of detail) {
        if (subRx.test(file.name)) this.addSingleSubtitleFile(file)
      }
    }
    this.handleSubtitleFile = ({ detail }) => {
      this.addSingleSubtitleFile(new File([detail.data], detail.name))
    }

    client.on('tracks', this.handleTracks)
    client.on('subtitle', this.handleSubtitle)
    client.on('file', this.handleFile)
    client.on('subtitleFile', this.handleSubtitleFile)
    clipboard.on('text', this.handleClipboardText)
    clipboard.on('files', this.handleClipboardFiles)

    if (settings.value.jimakuKey) this.loadJimakuSubtitles()
  }

  /**
   * Wait for renderer readiness; resolves immediately if already ready.
   */
  _waitRendererReady () {
    return this._waitRendererReadyInternal ? this._waitRendererReadyInternal() : Promise.resolve()
  }

  _createRendererReadyPromise () {
    if (this._waitRendererReadyInternal) return
    this.rendererReady = new Promise(resolve => {
      this._resolveRendererReady = resolve
      // safety timeout in case renderer doesn't emit ready
      this._rendererReadyTimeout = setTimeout(() => {
        if (this._resolveRendererReady) {
          this._resolveRendererReady()
          this._resolveRendererReady = null
        }
      }, 200)
    })
    this._waitRendererReadyInternal = async () => {
      await this.rendererReady
    }
  }

  async loadJimakuSubtitles () {
    const aniId = this.selected?.media?.media?.id
    const episode = this.selected?.media?.episode
    if (!aniId || !episode) return

    try {
      const search = await jimakuClient.search({ anilist_id: aniId })
      const entry = search?.[0]
      if (!entry) return

      let files = await jimakuClient.getFiles(entry.id, { episode })
      if (!files?.length) return

      files = files
        .filter(file => subRx.test(file.name))
        .map(file => {
          let score = 0
          const name = file.name.toLowerCase()

          if (name.includes('haruhana')) score += 50
          if (name.includes('nekomoe kissaten')) score += 50
          if (name.includes('loliHouse')) score += 50
          if (name.includes('retimed')) score += 50
          if (name.includes('netflix')) score += 50
          if (name.includes('amzn')) score += 50
          if (name.includes('amazon')) score += 50
          if (name.includes('webrip')) score += 40
          if (name.includes('web-dl')) score += 40
          if (name.includes('web')) score += 30
          if (name.includes('[sdh]') || name.includes('[cc]')) score += 10
          if (name.includes('chs')) score -= 70
          if (name.includes('cht')) score -= 70
          if (name.includes('shincaps')) score -= 60
          if (name.includes('nanakoraws')) score -= 60
          if (name.includes('at-x') || name.includes('bs11') || name.includes('tokyo mx')) score -= 30

          const videoKeywords = this.selected.name.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2)
          for (const word of videoKeywords) {
            if (name.includes(word)) score += 5
          }

          return { ...file, score }
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      let loadedCount = 0
      for (const file of files) {
        try {
          const res = await fetch(file.url, {
            headers: { 'Authorization': settings.value.jimakuKey }
          })
          if (res.ok) {
            const data = await res.arrayBuffer()
            const name = `[Jimaku] ${file.name}`
            this.addSingleSubtitleFile(new File([data], name))
            loadedCount++
          }
        } catch (e) {
          console.error(`Failed to load Jimaku file ${file.name}:`, e)
        }
      }

      if (loadedCount > 0) {
        console.log(`Jimaku: Loaded ${loadedCount} subtitle(s)`)
      }
    } catch (err) {
      console.error('Jimaku search failed:', err)
    }
  }

  async addSingleSubtitleFile (file) {
    const index = 100 + this.headers.length
    this.subtitleFiles[index] = file
    const type = file.name.substring(file.name.lastIndexOf('.') + 1).toLowerCase()
    const subname = file.name.slice(0, file.name.lastIndexOf('.'))
    const name = subname.includes(this.selected.name)
      ? subname.replace(this.selected.name, '')
      : subname.replace(this.selected.name.slice(0, this.selected.name.lastIndexOf('.')), '')
    this.headers[index] = {
      header: defaultHeader,
      language: name.replace(/[,._-]/g, ' ').trim() || 'Track ' + index,
      number: index,
      type
    }
    this.onHeader()
    this.tracks[index] = []
    const subtitles = Subtitles.convertSubText(await file.text(), type)
    if (subtitles) {
      if (type === 'ass') this.headers[index].header = subtitles
      else this.headers[index].header += subtitles.join('\n')
      if (!this.current) {
        this.current = index
        this.initSubtitleRenderer()
        this.selectCaptions(this.current)
        this.onHeader()
      }
    } else console.debug(`Failed to load the file ${file.name} as it is not a subtitle file.`)
  }

  initSubtitleRenderer () {
    if (!this.renderer) {
      const options = {
        video: this.video,
        subContent: defaultHeader,
        fonts: this.fonts,
        offscreenRender: SUPPORTS.offscreenRender,
        libassMemoryLimit: 1024,
        libassGlyphLimit: 120000,
        maxRenderHeight: parseInt(settings.value.subtitleRenderHeight) || 0,
        fallbackFont: settings.value.font?.name || 'roboto medium',
        availableFonts: {
          'roboto medium': './Roboto.ttf',
          'noto sans cjk regular': './NotoSansCJK.otf'
        },
        workerUrl: new URL('jassub/dist/jassub-worker.js', import.meta.url).toString(),
        wasmUrl: new URL('jassub/dist/jassub-worker.wasm', import.meta.url).toString(),
        legacyWasmUrl: new URL('jassub/dist/jassub-worker.wasm.js', import.meta.url).toString(),
        modernWasmUrl: new URL('jassub/dist/jassub-worker-modern.wasm', import.meta.url).toString(),
        useLocalFonts: settings.value.missingFont,
        dropAllBlur: settings.value.disableSubtitleBlur === true ? false : false
      }
      if (SUPPORTS.isAndroid) JASSUB._hasBitmapBug = true
      this.renderer = new JASSUB(options)
      // create renderer readiness promise and resolve after worker init or 'ready' event
      this._createRendererReadyPromise()
      if (typeof this.renderer.on === 'function') {
        try {
          this.renderer.on('ready', () => {
            if (this._resolveRendererReady) {
              this._resolveRendererReady()
              this._resolveRendererReady = null
            }
          })
        } catch (e) {
          // ignore if not supported
        }
      }
      // fallback resolve shortly after creation
      if (this._resolveRendererReady) {
        setTimeout(() => {
          if (this._resolveRendererReady) {
            this._resolveRendererReady()
            this._resolveRendererReady = null
          }
        }, 120)
      }
      this.renderer?.setDefaultFont('noto sans cjk regular')
    }
  }

  static convertSubText (text, type) {
    const srtRx = /(?:\d+\r?\n)?(\S{9,12})\s?-->\s?(\S{9,12})(.*)\r?\n([\s\S]*)$/i
    const srt = text => {
      const subtitles = []
      const replaced = text.replace(/\r/g, '')
      for (const split of replaced.split(/\r?\n\r?\n/)) {
        const match = split.match(srtRx)
        if (match) {
          match[1] = match[1].match(/.*[.,]\d{2}/)[0]
          match[2] = match[2].match(/.*[.,]\d{2}/)[0]
          if (match[1].length === 9) {
            match[1] = '0:' + match[1]
          } else {
            if (match[1][0] === '0') {
              match[1] = match[1].substring(1)
            }
          }
          match[1].replace(',', '.')
          if (match[2].length === 9) {
            match[2] = '0:' + match[2]
          } else {
            if (match[2][0] === '0') {
              match[2] = match[2].substring(1)
            }
          }
          match[2].replace(',', '.')
          const matches = match[4].match(/<[^>]+>/g)
          if (matches) {
            matches.forEach(matched => {
              if (/<\//.test(matched)) {
                match[4] = match[4].replace(matched, matched.replace('</', '{\\').replace('>', '0}'))
              } else {
                match[4] = match[4].replace(matched, matched.replace('<', '{\\').replace('>', '1}'))
              }
            })
          }
          subtitles.push('Dialogue: 0,' + match[1].replace(',', '.') + ',' + match[2].replace(',', '.') + ',Default,,0,0,0,,' + match[4].replace(/\r?\n/g, '\\N'))
        }
      }
      return subtitles
    }
    const subRxLocal = /[{[](\d+)[}\]][{[](\d+)[}\]](.+)/i
    const sub = text => {
      const subtitles = []
      const replaced = text.replace(/\r/g, '')
      let frames = 1000 / Number(replaced.match(subRxLocal)[3])
      if (!frames || isNaN(frames)) frames = 41.708
      for (const split of replaced.split('\r?\n')) {
        const match = split.match(subRxLocal)
        if (match) subtitles.push('Dialogue: 0,' + toTS((match[1] * frames) / 1000, 1) + ',' + toTS((match[2] * frames) / 1000, 1) + ',Default,,0,0,0,,' + match[3].replace('|', '\\N'))
      }
      return subtitles
    }
    const subtitles = type === 'ass' ? text : []
    if (type === 'ass') {
      return subtitles
    } else if (type === 'srt' || type === 'vtt') {
      return srt(text)
    } else if (type === 'sub') {
      return sub(text)
    } else {
      if (srtRx.test(text)) return srt(text)
      if (subRxLocal.test(text)) return sub(text)
    }
  }

  constructSub (subtitle, isNotAss, subtitleIndex, trackNumber) {
    if (isNotAss === true) {
      // convert HTML to ASS override tags
      subtitle.text = htmlToAss(subtitle.text)
      subtitle.text = subtitle.text.replace(/\r?\n/g, '\\N')
    }
    return {
      Start: subtitle.time,
      Duration: subtitle.duration,
      // use style name (string) not numeric index
      Style: this._stylesMap[trackNumber][subtitle.style || 'Default'] || 'Default',
      Name: subtitle.name || '',
      MarginL: Number(subtitle.marginL) || 0,
      MarginR: Number(subtitle.marginR) || 0,
      MarginV: Number(subtitle.marginV) || 0,
      Effect: subtitle.effect || '',
      Text: subtitle.text || '',
      ReadOrder: 1,
      Layer: Number(subtitle.layer) || 0,
      _index: subtitleIndex
    }
  }

  async selectCaptions (trackNumber) {
    if (trackNumber != null) {
      this.current = Number(trackNumber)
      this.onHeader()
      if (this.headers) {
        this.renderer?.setTrack(this.current !== -1 ? this.headers[this.current].header.slice(0, -1) : defaultHeader)
        if (this.tracks[this.current]) {
          if (this.renderer) {
            await this._waitRendererReady()
            for (const subtitle of this.tracks[this.current]) {
              try {
                this.renderer.createEvent(subtitle)
              } catch (e) {
                console.error('createEvent failed in selectCaptions:', e)
              }
            }
          }
        }
      }
    }
  }

  destroy () {
    client.off('tracks', this.handleTracks)
    client.off('subtitle', this.handleSubtitle)
    client.off('file', this.handleFile)
    client.off('files', this.handleClipboardFiles)
    client.off('text', this.handleClipboardText)
    client.off('subtitleFile', this.handleSubtitleFile)
    this.stream?.destroy()
    this.parser?.destroy()
    this.renderer?.destroy()
    this.files = null
    this.video = null
    this.selected = null
    this.tracks = null
    this.headers = null
    this.onHeader()
  }
}
