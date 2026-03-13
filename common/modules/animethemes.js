const BASE_URL = 'https://api.animethemes.moe'

let themesCache = new Map()

export async function getAnimeThemes(anilistId) {
  if (!anilistId) return null

  if (themesCache.has(anilistId)) {
    return themesCache.get(anilistId)
  }

  try {
    const params = new URLSearchParams({
      'filter[has]': 'resources',
      'filter[site]': 'AniList',
      'filter[external_id]': anilistId,
      'include': 'animethemes.song.artists,animethemes.animethemeentries.videos'
    })

    const res = await fetch(`${BASE_URL}/anime?${params}`)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const json = await res.json()
    const anime = json?.anime?.[0]

    if (!anime?.animethemes) return null

    const themes = anime.animethemes.map(theme => ({
      id: theme.id,
      type: theme.type,
      sequence: theme.sequence,
      slug: theme.slug,
      anime: { name: anime.name, season: anime.season, year: anime.year },
      song: theme.song,
      entries: theme.animethemeentries?.map(entry => ({
        id: entry.id,
        videos: entry.videos?.map(video => ({
          id: video.id,
          basename: video.basename,
          filename: video.filename,
          path: video.path,
          mimetype: video.mimetype,
          resolution: video.resolution,
          nc: video.nc,
          subbed: video.subbed,
          lyrics: video.lyrics,
          uncen: video.uncen,
          source: video.source,
          overlap: video.overlap,
          tags: video.tags,
          link: video.link
        })) || []
      })) || []
    }))

    themesCache.set(anilistId, themes)
    return themes
  } catch (e) {
    console.error('Failed to fetch anime themes:', e)
    return null
  }
}

export function getVideoUrl(video) {
  if (!video?.link) return null
  return video.link
}

export function filterVideos(videos, options = {}) {
  const { resolution, subbed, lyrics, nc, uncen } = options

  return videos.filter(video => {
    if (resolution && video.resolution !== resolution) return false
    if (subbed !== undefined && video.subbed !== subbed) return false
    if (lyrics !== undefined && video.lyrics !== lyrics) return false
    if (nc !== undefined && video.nc !== nc) return false
    if (uncen !== undefined && video.uncen !== uncen) return false
    return true
  })
}

export function getBestVideo(videos) {
  if (!videos?.length) return null

  const sorted = [...videos].sort((a, b) => {
    if (a.subbed !== b.subbed) return a.subbed ? -1 : 1
    if (a.lyrics !== b.lyrics) return a.lyrics ? -1 : 1
    if (a.nc !== b.nc) return a.nc ? 1 : -1
    if (a.uncen !== b.uncen) return a.uncen ? -1 : 1
    return (b.resolution || 0) - (a.resolution || 0)
  })

  return sorted[0]
}

export function formatThemeLabel(theme) {
  const type = theme.type === 'OP' ? 'OP' : theme.type === 'ED' ? 'ED' : theme.type
  return `${type}${theme.sequence || ''}`
}

export function clearThemesCache() {
  themesCache.clear()
}