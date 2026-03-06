<script>
  import { onMount, onDestroy } from 'svelte'
  import { airingAt, getAiringInfo } from '@/modules/anime/anime.js'
  import { click } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { mediaCache } from '@/modules/cache.js'
  import { modal } from '@/modules/navigation.js'
  import { getAccentColor } from '@/modules/color.js'
  import { settings } from '@/modules/settings.js'

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

  const SOURCE_LABELS = {
    MANGA: 'Manga', LIGHT_NOVEL: 'Light Novel', ORIGINAL: 'Original',
    VISUAL_NOVEL: 'Visual Novel', VIDEO_GAME: 'Video Game', OTHER: 'Other',
    NOVEL: 'Novel', DOUJINSHI: 'Doujinshi', ANIME: 'Anime', WEB_MANGA: 'Web Manga'
  }

  $: sourceInfo = media?.source ? (SOURCE_LABELS[media.source] ?? null) : null

  let mouseX = 0
  let mouseY = 0
  function onMouseMove(e) { mouseX = e.clientX; mouseY = e.clientY }
</script>

{#if data?.__dayHeader}
  <div class='day-header-label'>{data.day}</div>
{:else}
<div class='schedule-card-ct'
  class:view-big={$settings.scheduleView === 'big'}
  class:view-small={$settings.scheduleView === 'small'}
  class:view-text={$settings.scheduleView === 'text'}
  on:mousemove={onMouseMove}
  use:click={viewMedia}>
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
      <div class='mobile-title'>{anilistClient.title(media)}</div> 
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
  <div class='text-hover-art' style='left:{mouseX + 24}px; top:{mouseY - 220}px'>
    <SmartImage class='text-hover-img' images={[media?.coverImage?.extraLarge, media?.coverImage?.medium, './404_cover.png']}/>
  </div>
</div>
{/if}

<style>
  .schedule-card-ct {
    display: flex;
    justify-content: flex-start;
    padding: 0.7rem 0.5rem;
    position: relative;
  }

  .schedule-card-ct:hover {
    z-index: 30;
  }

  .schedule-card {
    display: flex;
    flex-direction: row;
    width: 52rem;
    height: 36rem;
    border-radius: 0.8rem;
    overflow: hidden;
    background: hsl(var(--dark-color-light-hsl));
    border: 1px solid var(--border-color-sp);
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
    flex: 0 0 26.5rem;
    width: 26.5rem;
    background: hsl(var(--dark-color-dim-hsl));
  }

  .cover-link {
    display: block;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .cover-link :global(.cover-img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform 0.3s ease;
  }

  .schedule-card:hover .cover-link :global(.cover-img) {
    transform: scale(1.04);
  }

  .cover-meta {
    flex-shrink: 0;
    padding: 0.8rem 1rem 0.9rem;
    background: hsl(var(--dark-color-very-dim-hsl));
    border-top: 1px solid var(--border-color-sp);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .cover-title {
    font-size: 1.65rem;
    font-weight: 800;
    color: #ffffff;
    display: -webkit-box;
    line-height: 1.3;
    letter-spacing: -0.01em;
  }

  .cover-studio {
    font-size: 0.95rem;
    font-weight: 500;
    color: var(--accent-color);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .content-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.4rem 1.1rem 1.2rem;
    gap: 0rem;
    min-width: 0;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 0rem;
  }

  .airing-block {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .episode-label {
    font-size: 0.9rem;
    font-weight: 500;
    color: rgba(190, 190, 210, 0.35);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .countdown {
    font-size: 2.4rem;
    font-weight: 900;
    color: var(--accent-color);
    line-height: 1.4;
    letter-spacing: -0.03em;
  }

  .stats-col {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.45rem;
    padding-top: 0.15rem;
    flex-shrink: 0;
  }

  .stat-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .stat-icon {
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    opacity: 0.9;
  }

  .stat-icon--score { color: #2edf82; }
  .stat-icon--rank  { color: #ff3d64; }

  .stat-val {
    font-size: 1.35rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.92);
    letter-spacing: -0.01em;
  }
  .mobile-title {
  display: none;
}
  .subtitle {
    font-size: 0.85rem;
    font-weight: 400;
    color: rgba(190, 190, 210, 0.25);
    margin-top: 1.6rem;
    letter-spacing: 0.01em;
  }

  .description-wrap {
    flex: 1;
    overflow: hidden;
    max-height: 10rem;
    margin-top: 0.25rem;
    mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
    -webkit-mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
  }

  .description {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 300;
    line-height: 1.75;
    color: rgba(205, 205, 220, 0.45);
  }

  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: auto;
    padding-top: 0.7rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06)
  ;
  }

  .genre {
    background: var(--media-color);
    color: rgba(255, 255, 255, 0.9);
    padding: 0.28rem 0.8rem;
    border-radius: 10rem;
    font-size: 0.9rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.82;
  }

  /* day header */
  .day-header-label {
    width: 100%;
    padding: 1.6rem 1.2rem 0.5rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: rgba(190,190,210,0.45);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  /* ── view-big ── */
  :global(.view-big) .schedule-card { width: 64rem; height: 42rem; }
  :global(.view-big) .img-col { flex: 0 0 32rem; width: 32rem; }

  /* ── view-small ── */
  :global(.view-small).schedule-card-ct { padding: 0.5rem 0.6rem; }
  :global(.view-small) .schedule-card { width: 100%; height: auto; flex-direction: row; align-items: center; border-radius: 0.7rem; gap: 0; }
  :global(.view-small) .img-col { flex: 0 0 80px; width: 80px; height: 110px; flex-direction: row; border-radius: 6px 0 0 6px; }
  :global(.view-small) .cover-link { flex: 1; height: 100%; }
  :global(.view-small) .cover-meta { display: none; }
  :global(.view-small) .content-col { padding: 12px 14px; gap: 4px; justify-content: center; }
  :global(.view-small) .top-row { flex-direction: column; gap: 0; margin-bottom: 0; }
  :global(.view-small) .airing-block { flex-direction: row; align-items: baseline; gap: 6px; }
  :global(.view-small) .episode-label { font-size: 14px; color: rgba(190,190,210,0.55); letter-spacing: 0; text-transform: none; }
  :global(.view-small) .countdown { font-size: 14px; font-weight: 400; color: rgba(190,190,210,0.55); line-height: 1.3; letter-spacing: 0; }
  :global(.view-small) .mobile-title { display: block; font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px; line-height: 1.2; }
  :global(.view-small) .stats-col, :global(.view-small) .subtitle, :global(.view-small) .description-wrap, :global(.view-small) .genres { display: none; }

  /* ── view-text ── */
  :global(.view-text).schedule-card-ct { padding: 0.25rem 0.4rem; position: relative; }
  :global(.view-text) .schedule-card { width: 100%; height: auto; flex-direction: row; align-items: center; border-radius: 0.6rem; gap: 0; }
  :global(.view-text) .img-col { display: none; }
  :global(.view-text) .content-col { flex-direction: row; align-items: center; padding: 8px 12px; gap: 10px; justify-content: flex-start; }
  :global(.view-text) .mobile-title { display: block; flex: 1; min-width: 0; font-size: 13.5px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 0; line-height: 1.2; }
  :global(.view-text) .top-row { flex-direction: row; align-items: center; gap: 6px; margin-bottom: 0; flex-shrink: 0; }
  :global(.view-text) .airing-block { flex-direction: row; align-items: baseline; gap: 4px; }
  :global(.view-text) .episode-label { font-size: 11px; color: rgba(190,190,210,0.38); letter-spacing: 0; text-transform: none; }
  :global(.view-text) .countdown { font-size: 12px; font-weight: 600; color: var(--accent-color); line-height: 1.2; letter-spacing: 0; }
  :global(.view-text) .stats-col, :global(.view-text) .subtitle, :global(.view-text) .description-wrap, :global(.view-text) .genres { display: none; }

  /* ── text mode hover art ── */
  .text-hover-art { display: none; }
  :global(.view-text) .text-hover-art {
    display: block;
    position: fixed;
    width: 200px;
    height: 285px;
    border-radius: 0.7rem;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.75);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s ease, transform 0.15s ease;
    transform: scale(0.92);
    z-index: 9999;
  }
  :global(.view-text) .text-hover-art :global(.text-hover-img) { width: 100%; height: 100%; object-fit: cover; display: block; }
  :global(.view-text).schedule-card-ct:hover .text-hover-art { opacity: 1; transform: scale(1); }

  @media (max-width: 700px) {
  .schedule-card-ct {
    padding: 0.5rem 0.6rem;
  }

  .schedule-card {
    width: 100%;
    height: auto;
    flex-direction: row;
    align-items: center;
    border-radius: 0.7rem;
    gap: 0;
  }

  .img-col {
    flex: 0 0 80px;
    width: 80px;
    height: 110px;
    flex-direction: row;
    border-radius: 6px 0 0 6px;
  }

  .cover-link {
    flex: 1;
    height: 100%;
  }

  .cover-meta {
    display: none;
  }

  .content-col {
    padding: 12px 14px;
    gap: 4px;
    justify-content: center;
  }

  .top-row {
    flex-direction: column;
    gap: 0;
    margin-bottom: 0;
  }

  .airing-block {
    flex-direction: row;
    align-items: baseline;
    gap: 6px;
  }

  .episode-label {
    font-size: 14px;
    color: rgba(190, 190, 210, 0.55);
    letter-spacing: 0;
    text-transform: none;
  }

  .countdown {
    font-size: 14px;
    font-weight: 400;
    color: rgba(190, 190, 210, 0.55);
    line-height: 1.3;
    letter-spacing: 0;
  }

  .cover-title {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 4px;
    line-height: 1.2;
  }
  .mobile-title {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
  line-height: 1.2;
}
  .stats-col,
  .subtitle,
  .description-wrap,
  .genres {
    display: none;
  }
  
}
</style>