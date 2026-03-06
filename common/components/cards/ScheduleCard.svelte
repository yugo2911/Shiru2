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

  $: mediaColor = media?.coverImage?.color || 'hsl(0, 0%, 15%)'
  $: textColor = getTextColor(mediaColor)
  $: overlayTextColor = getOverlayTextColor(mediaColor)

  function getTextColor(color) {
    if (!color) return 'hsl(0, 0%, 100%)'
    const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
    if (hslMatch) {
      const l = parseInt(hslMatch[3])
      return l > 60 ? 'hsl(0, 0%, 97%)' : 'hsl(0, 0%, 97%)'
    }
    return 'hsl(0, 0%, 97%)'
  }

  function getOverlayTextColor(color) {
    if (!color) return 'hsl(0, 0%, 100%)'
    const hslMatch = color.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
    if (hslMatch) {
      return `hsl(${hslMatch[1]}, 80%, 70%)`
    }
    return 'hsl(0, 0%, 100%)'
  }

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
    if (sequel?.node?.title?.userPreferred) {
      return `Sequel to ${sequel.node.title.userPreferred}`
    }
    return null
  })()
</script>

<div class='d-flex px-md-20 py-10 position-relative justify-content-center schedule-card-ct' use:click={viewMedia}>
  <div class='card load-in m-0 p-0 pointer schedule-card' style='--media-color: {mediaColor}; --media-color-text: {textColor}; --media-overlay-text-color: {overlayTextColor}'>
    <div class='row h-full g-0'>
      <div class='col-auto img-col d-inline-block position-relative'>
        <a href='https://anilist.co/anime/{media?.id}' target='_blank' rel='noopener noreferrer' class='cover'>
          <SmartImage class='cover-img w-full h-full' images={[media?.coverImage?.extraLarge, media?.coverImage?.medium, './404_cover.png']}/>
          <div class='overlay'>
            <span class='title'>{anilistClient.title(media)}</span>
            {#if media?.studios?.nodes?.[0]}
              <div class='studio'>{media.studios.nodes[0].name}</div>
            {/if}
          </div>
        </a>
      </div>
      <div class='col data-col'>
        <div class='scroller'>
          <div class='body'>
            <div class='header'>
              <div class='episode-section'>
                {#if episodeInfo}
                  <div class='episode'>{episodeInfo.episode}</div>
                  <div class='countdown'>{episodeInfo.time}</div>
                {:else}
                  <div class='episode'>Upcoming</div>
                  <div class='countdown'>TBA</div>
                {/if}
              </div>
              {#if sequelInfo}
                <div class='source'>{sequelInfo}</div>
              {/if}
              <div class='icon-stats'>
                {#if rating}
                  <div class='icon-stat'>
                    <svg version='1.1' viewBox='0 0 512 512' class='svg-icon svg-fill'>
                      <path fill='currentColor' d='M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm0 448c-110.3 0-200-89.7-200-200S137.7 56 248 56s200 89.7 200 200-89.7 200-200 200zm-80-216c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm160 0c17.7 0 32-14.3 32-32s-14.3-32-32-32-32 14.3-32 32 14.3 32 32 32zm4 72.6c-20.8 25-51.5 39.4-84 39.4s-63.2-14.3-84-39.4c-8.5-10.2-23.7-11.5-33.8-3.1-10.2 8.5-11.5 23.6-3.1 33.8 30 36 74.1 56.6 120.9 56.6s90.9-20.6 120.9-56.6c8.5-10.2 7.1-25.3-3.1-33.8-10.1-8.4-25.3-7.1-33.8 3.1z'/>
                    </svg>
                    <span class='stat'>{rating}%</span>
                  </div>
                {/if}
                {#if ranking}
                  <div class='icon-stat'>
                    <svg version='1.1' viewBox='0 0 18 18' class='svg-icon'>
                      <path stroke='currentColor' fill='none' d='M15.63 3.458a4.125 4.125 0 0 0-5.835 0L9 4.253l-.795-.795A4.126 4.126 0 1 0 2.37 9.293l.795.795L9 15.922l5.835-5.835.795-.795a4.125 4.125 0 0 0 0-5.835v0z' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
                    </svg>
                    <span class='stat'>{ranking}</span>
                  </div>
                {/if}
              </div>
            </div>
            {#if media?.description}
              <div class='description-wrap'>
                <span class='description'>{media.description.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}</span>
              </div>
            {/if}
          </div>
        </div>
        {#if media?.genres?.length}
          <div class='footer'>
            <div class='genres'>
              {#each media.genres.slice(0, 3) as genre}
                <span class='genre'>{genre}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .schedule-card-ct:hover {
    z-index: 30;
  }

  .schedule-card {
    width: 64rem !important;
    height: 26.4rem !important;
    border-radius: 0.5rem;
    overflow: hidden;
    transition: transform 0.2s ease;
    background: var(--media-color);
  }

  .schedule-card:hover {
    transform: scale(1.02);
  }

  .img-col {
    flex: 0 0 18rem;
    width: 18rem;
    height: 26.4rem;
    overflow: hidden;
  }

  .cover {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
  }

  .cover .cover-img {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 1rem;
    z-index: 1;
  }

  .cover .title {
    color: var(--media-overlay-text-color);
    font-size: 1.4rem;
    font-weight: 600;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-decoration: none;
    transition: color 0.2s ease;
  }

  .cover:hover .title {
    color: var(--media-color-text);
  }

  .cover .studio {
    color: var(--media-color);
    font-size: 1.1rem;
    margin-top: 0.4rem;
    text-decoration: none;
  }

  .data-col {
    display: flex;
    flex-direction: column;
    background: transparent;
    min-width: 0;
    color: var(--media-color-text);
  }

  .scroller {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .episode-section {
    display: flex;
    flex-direction: column;
  }

  .episode {
    font-size: 1.3rem;
    opacity: 0.8;
  }

  .countdown {
    font-size: 2.1rem;
    font-weight: 600;
  }

  .source {
    font-size: 1.2rem;
    opacity: 0.7;
    width: 100%;
    margin-top: 0.4rem;
  }

  .icon-stats {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .icon-stat {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .icon-stat .svg-icon {
    width: 1.5rem;
    height: 1.5rem;
  }

  .icon-stat .svg-fill {
    fill: currentColor;
  }

  .icon-stat .stat {
    font-size: 1.3rem;
    font-weight: 600;
  }

  .description-wrap {
    max-height: 8rem;
    overflow-y: auto;
  }

  .description {
    font-size: 1.3rem;
    line-height: 1.5;
    opacity: 0.9;
  }

  .footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid rgba(255,255,255,0.1);
  }

  .genres {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .genre {
    background: rgba(255,255,255,0.15);
    padding: 0.4rem 0.9rem;
    border-radius: 0.4rem;
    font-size: 1.1rem;
    font-weight: 500;
  }
</style>
