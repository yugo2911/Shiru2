<script>
  import { onMount, onDestroy } from 'svelte'
  import { airingAt, getAiringInfo } from '@/modules/anime/anime.js'
  import { click } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { mediaCache } from '@/modules/cache.js'
  import { modal } from '@/modules/navigation.js'

  export let data
  export let variables = null
  let _variables = variables

  let media = data
  $: if (data && !media) media = data
  $: if (data) media = data
  mediaCache.subscribe((value) => { if (value && (JSON.stringify(value[media?.id]) !== JSON.stringify(media))) media = value[media?.id] })

  function viewMedia() {
    if (_variables?.fileEdit) _variables.fileEdit(media)
    else modal.open(modal.ANIME_DETAILS, media)
  }

  let airingInterval
  let _airingAt = null
  $: airingInfo = getAiringInfo(_airingAt)
  onMount(() => {
    _airingAt = media && _variables?.scheduleList && airingAt(media, _variables)
    if (_variables?.scheduleList) airingInterval = setInterval(() => airingInfo = getAiringInfo(_airingAt), 60_000)
  })
  onDestroy(() => clearTimeout(airingInterval))

  $: mediaColor = media?.coverImage?.color || '#333344'

  function hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    let h, s, l = (max + min) / 2
    if (max === min) {
      h = s = 0
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
  }

  function getAccentColor(color) {
    if (!color) return 'hsl(210, 80%, 65%)'
    const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
    if (hslMatch) return `hsl(${hslMatch[1]}, 80%, 68%)`
    if (color.startsWith('#') && color.length >= 7) {
      const [h] = hexToHsl(color)
      return `hsl(${h}, 80%, 68%)`
    }
    return 'hsl(210, 80%, 65%)'
  }

  $: accentColor = getAccentColor(mediaColor)

  $: episodeInfo = (() => {
    if (!airingInfo || !_airingAt?.time || typeof _airingAt.time === 'string') return null
    const ep = airingInfo.episode || 'Ep 1'
    const time = airingInfo.time || ''
    return { episode: ep, time }
  })()

  $: ranking = media?.popularity ? '#' + media.popularity : null
  $: rating = media?.averageScore ? Math.round(media.averageScore / 10) * 10 : null

  $: sequelInfo = (() => {
    const relations = media?.relations?.edges || []
    const sequel = relations.find(e => e.relationType === 'SEQUEL')
    if (sequel?.node?.title?.userPreferred) return `Sequel to ${sequel.node.title.userPreferred}`
    return null
  })()

  $: sourceInfo = (() => {
    const source = media?.source
    if (!source) return null
    const map = {
      MANGA: 'Manga', LIGHT_NOVEL: 'Light Novel', ORIGINAL: 'Original',
      VISUAL_NOVEL: 'Visual Novel', VIDEO_GAME: 'Video Game', OTHER: 'Other',
      NOVEL: 'Novel', DOUJINSHI: 'Doujinshi', ANIME: 'Anime', WEB_MANGA: 'Web Manga'
    }
    return map[source] || null
  })()
</script>

<div class='schedule-card-ct' use:click={viewMedia}>
  <div class='schedule-card pointer load-in' style='--media-color: {mediaColor}; --accent-color: {accentColor}'>

    <div class='img-col'>
      <a href='https://anilist.co/anime/{media?.id}' target='_blank' rel='noopener noreferrer' class='cover-link'>
        <SmartImage class='cover-img' images={[media?.coverImage?.extraLarge, media?.coverImage?.medium, './404_cover.png']}/>
      </a>
      <div class='cover-meta'>
        <span class='cover-title'>{anilistClient.title(media)}</span>
        {#if media?.studios?.nodes?.[0]}
          <span class='cover-studio'>{media.studios.nodes[0].name}</span>
        {/if}
      </div>
    </div>

    <div class='content-col'>
      <div class='top-row'>
        <div class='airing-block'>
          {#if episodeInfo}
            <div class='episode-label'>{episodeInfo.episode}</div>
            <div class='countdown'>{episodeInfo.time}</div>
          {:else}
            <div class='episode-label'>Upcoming</div>
            <div class='countdown'>TBA</div>
          {/if}
        </div>
        <div class='stats-col'>
          {#if rating}
            <div class='stat-row'>
              <svg viewBox='0 0 512 512' class='stat-icon stat-icon--score'>
                <path fill='currentColor' d='M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z'/>
              </svg>
              <span class='stat-val'>{rating}%</span>
            </div>
          {/if}
          {#if ranking}
            <div class='stat-row'>
              <svg viewBox='0 0 18 18' class='stat-icon stat-icon--rank'>
                <path stroke='currentColor' fill='none' d='M15.63 3.458a4.125 4.125 0 0 0-5.835 0L9 4.253l-.795-.795A4.126 4.126 0 1 0 2.37 9.293l.795.795L9 15.922l5.835-5.835.795-.795a4.125 4.125 0 0 0 0-5.835v0z' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
              </svg>
              <span class='stat-val'>{ranking}</span>
            </div>
          {/if}
        </div>
      </div>

      {#if sequelInfo}
        <div class='subtitle'>{sequelInfo}</div>
      {:else if sourceInfo}
        <div class='subtitle'>Source • {sourceInfo}</div>
      {/if}

      {#if media?.description}
        <div class='description-wrap'>
          <p class='description'>{media.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}</p>
        </div>
      {/if}

      {#if media?.genres?.length}
        <div class='genres'>
          {#each media.genres.slice(0, 3) as genre}
            <span class='genre'>{genre}</span>
          {/each}
        </div>
      {/if}
    </div>

  </div>
</div>

<style>
  .schedule-card-ct {
    display: flex;
    justify-content: center;
    padding: 0.6rem 1.6rem;
    position: relative;
  }

  .schedule-card-ct:hover {
    z-index: 30;
  }

  .schedule-card {
    display: flex;
    flex-direction: row;
    width: 64rem;
    min-height: 22rem;
    border-radius: 0.8rem;
    overflow: hidden;
    background: #1a1a24;
    border: 1px solid rgba(255, 255, 255, 0.07);
    box-shadow: 0 2px 16px rgba(0, 0, 0, 0.4);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }

  .schedule-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  }

  .img-col {
    display: flex;
    flex-direction: column;
    flex: 0 0 16rem;
    width: 16rem;
    background: #111118;
  }

  .cover-link {
    display: block;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  :global(.cover-img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }

  .schedule-card:hover :global(.cover-img) {
    transform: scale(1.04);
  }

  .cover-meta {
    flex-shrink: 0;
    padding: 0.75rem 1rem 0.85rem;
    background: #0f0f16;
    border-top: 1px solid rgba(255,255,255,0.06);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .cover-title {
    font-size: 1.2rem;
    font-weight: 700;
    color: #ffffff;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.3;
  }

  .cover-studio {
    font-size: 1.05rem;
    font-weight: 500;
    color: var(--accent-color);
  }

  .content-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.4rem 1.6rem 1.2rem;
    gap: 0.8rem;
    min-width: 0;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .airing-block {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .episode-label {
    font-size: 1.1rem;
    font-weight: 500;
    color: rgba(190, 190, 210, 0.55);
  }

  .countdown {
    font-size: 2.2rem;
    font-weight: 700;
    color: #ffffff;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .stats-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
    padding-top: 0.15rem;
    flex-shrink: 0;
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .stat-icon {
    width: 1.5rem;
    height: 1.5rem;
    flex-shrink: 0;
  }

  .stat-icon--score { color: #4cba80; }
  .stat-icon--rank  { color: #e05a7a; }

  .stat-val {
    font-size: 1.3rem;
    font-weight: 700;
    color: #ffffff;
  }

  .subtitle {
    font-size: 1.2rem;
    font-weight: 500;
    color: rgba(190, 190, 210, 0.58);
    margin-top: -0.2rem;
  }

  .description-wrap {
    flex: 1;
    overflow: hidden;
    max-height: 8.5rem;
    mask-image: linear-gradient(to bottom, black 55%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 55%, transparent 100%);
  }

  .description {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.65;
    color: rgba(205, 205, 220, 0.75);
  }

  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: auto;
  }

  .genre {
    background: var(--media-color);
    color: #ffffff;
    padding: 0.35rem 1.1rem;
    border-radius: 10rem;
    font-size: 1.05rem;
    font-weight: 600;
  }
</style>