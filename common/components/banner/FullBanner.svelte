<script>
  import { formatMap, playMedia } from '@/modules/anime/anime.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { click, drag } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import AudioLabel from '@/components/AudioLabel.svelte'
  import Scoring from '@/components/Scoring.svelte'
  import { VERSION } from '@/modules/bridge.js'
  import Helper from '@/modules/helper.js'
  import { Play, Heart } from 'lucide-svelte'
  import { modal } from '@/modules/navigation.js'

  export let mediaList

  let currentStatic = mediaList[0]
  $: current = mediaList[0]
  mediaCache.subscribe(value => { if (current?.id && value && value[current?.id]?.id && (JSON.stringify(value[current?.id]) !== JSON.stringify(current))) { current = value[current?.id]; currentStatic = current } })

  function toggleFavourite() { current.isFavourite = anilistClient.favourite({ id: current.id }) }
  function currentIndex() { return mediaList.findIndex(media => media?.id === currentStatic?.id) }

  /**
   * Build a deduplicated pool of banner image URLs for a given media item.
   * Priority order:
   *   1. AniList bannerImage (the canonical wide crop)
   *   2. YouTube trailer thumbnails (maxres → hq) — already varied per show
   *   3. Kitsu cover/poster images fetched in Banner.svelte (stored on kitsuBanners)
   *   4. AniList extraLarge cover (last resort / adult fallback)
   *
   * We then pick one at random from the pool so each carousel slot looks
   * different even when the same show rotates back in.
   */
  function buildImagePool(media) {
    const isAdultFallback = !media.bannerImage && !media.trailer?.id && settings.value.adult === 'hentai' && settings.value.hentaiBanner

    const pool = [
      media.bannerImage,
      ...(media.trailer?.id
        ? [
            `https://i.ytimg.com/vi/${media.trailer.id}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${media.trailer.id}/hqdefault.jpg`
          ]
        : []),
      ...(media.kitsuBanners ?? []),
      isAdultFallback ? media.coverImage?.extraLarge : null,
      './404_banner.png'
    ].filter(Boolean)

    // Deduplicate while preserving order
    return [...new Set(pool)]
  }

  /**
   * Pick a random image from the pool each time a new slide becomes active.
   * Avoids picking the same index twice in a row when possible.
   */
  let lastPickedUrl = null
  function pickBannerImage(media) {
    const pool = buildImagePool(media)
    if (pool.length <= 1) return pool
    const candidates = pool.filter(u => u !== lastPickedUrl && u !== './404_banner.png')
    const chosen = candidates.length
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : pool[Math.floor(Math.random() * pool.length)]
    lastPickedUrl = chosen
    // Return as a single-element array so SmartImage still gets its fallback list
    const rest = pool.filter(u => u !== chosen)
    return [chosen, ...rest]
  }

  // Recompute the image list whenever the active slide changes
  $: bannerImages = pickBannerImage(currentStatic)

  let timeout = schedule(currentIndex() + 1)
  function schedule(index) {
    return setTimeout(() => {
      current = mediaCache.value[mediaList[index % mediaList.length]?.id] || mediaList[index % mediaList.length]
      currentStatic = current
      timeout = schedule(index + 1)
    }, 15000)
  }

  function setCurrent(media) {
    if (current?.id === media?.id) return
    clearTimeout(timeout)
    current = mediaCache.value[media?.id] || media
    currentStatic = current
    timeout = schedule(currentIndex() + 1)
  }

  function swipeMedia(deltaX) {
    if (deltaX < 0) setCurrent(mediaList[(currentIndex() + 1) % mediaList.length])
    else setCurrent(mediaList[(currentIndex() - 1 + mediaList.length) % mediaList.length])
  }

  $: isRotated = !(currentStatic.bannerImage || currentStatic.trailer?.id) && settings.value.adult === 'hentai' && settings.value.hentaiBanner
</script>

{#key currentStatic}
  <div class='position-absolute h-full w-full overflow-hidden z--1'>
    <SmartImage
      class={`img-cover position-absolute h-full w-full ${isRotated ? 'banner-rotated' : ''}`}
      images={bannerImages}
    />
  </div>
{/key}

<div class='gradient-bottom z--1 h-full position-absolute top-0 w-full' />
<div class='gradient-left z--1 h-full position-absolute top-0 w-800' />
<img src='./icon_filled.png' class='position-absolute z--1 m-10 p-0 {SUPPORTS.isAndroid || VERSION.platform === `darwin` ? `right-0 mr-20 ${!SUPPORTS.isAndroid ? `d-md-none d-sm-h-block` : ``}` : `left-0 ml-20 d-md-none d-sm-h-block`}' style='width:4rem;height:4rem' alt='ico' />

<div class='pl-20 pb-20 justify-content-end d-flex flex-column h-full banner mw-full grab' use:drag={swipeMedia}>
  <div class='text-white font-weight-bold font-scale-40'>
    <span class='default-cursor title overflow-hidden d-inline-block pr-5'>{anilistClient.title(currentStatic)}</span>
  </div>

  <div class='details text-white text-capitalize pt-10 pb-10 d-flex w-600 mw-full default-cursor'>
    {#if currentStatic.format}<span class='text-nowrap d-flex align-items-center'>{formatMap[currentStatic.format]}</span>{/if}
    {#if currentStatic.episodes && currentStatic.episodes !== 1}
      <span class='text-nowrap d-flex align-items-center'>{current.mediaListEntry?.status === 'CURRENT' && current.mediaListEntry?.progress ? `${current.mediaListEntry.progress} / ${currentStatic.episodes} Episodes` : `${currentStatic.episodes} Episodes`}</span>
    {:else if currentStatic.duration}<span class='text-nowrap d-flex align-items-center'>{currentStatic.duration} Minutes</span>{/if}
    {#if settings.value.cardAudio}<span class='text-nowrap d-flex align-items-center'><AudioLabel bind:media={currentStatic} banner={true} /></span>{/if}
    {#if currentStatic.isAdult}<span class='text-nowrap d-flex align-items-center'>Rated 18+</span>{/if}
    {#if currentStatic.season || currentStatic.seasonYear}<span class='text-nowrap d-flex align-items-center'>{[currentStatic.season?.toLowerCase(), currentStatic.seasonYear].filter(s => s).join(' ')}</span>{/if}
  </div>

  <div class='h-100'>
    <div class='text-muted line-4 overflow-hidden w-600 mw-full default-cursor'>
      {currentStatic.description?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() || ''}
    </div>
  </div>

  <div class='details text-white text-capitalize pt-15 pb-10 d-flex w-600 mw-full default-cursor'>
    {#each currentStatic.genres as genre}<span class='text-nowrap d-flex align-items-center'>{genre}</span>{/each}
  </div>

  <div class='d-flex flex-row pb-10 w-600 mw-full default-cursor'>
    <button class='btn bg-dark-light px-20 shadow-none border-0 d-flex align-items-center justify-content-center' title='Watch' use:click={() => playMedia(currentStatic)}>
      <Play class='mr-10' size='1.7rem' /><span>{current.mediaListEntry?.progress ? current.mediaListEntry?.status === 'COMPLETED' ? 'Rewatch Now' : 'Continue Now' : 'Watch Now'}</span>
    </button>
    <button class='btn bg-dark-light ml-10 px-20 shadow-none border-0 d-flex align-items-center justify-content-center' title='View Details' use:click={() => modal.open(modal.ANIME_DETAILS, current)}>
      <span>View Details</span>
    </button>
    {#if Helper.isAuthorized()}<Scoring media={current} />{/if}
    {#if Helper.isAniAuth()}
      <button class='btn bg-dark-light btn-square ml-10 d-flex align-items-center justify-content-center shadow-none border-0' data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title={current.isFavourite ? 'Unfavourite' : 'Favourite'} use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
        <div class='favourite d-flex align-items-center justify-content-center'>
          <Heart color={current.isFavourite ? 'var(--tertiary-color)' : 'currentColor'} fill={current.isFavourite ? 'var(--tertiary-color)' : 'transparent'} size='1.7rem' />
        </div>
      </button>
    {/if}
  </div>

  <div class='d-flex'>
    {#each mediaList as media}
      {@const active = (currentStatic?.id === media?.id)}
      {@const disabled = active || null}
      <div class='pt-10 pb-10 badge-wrapper' aria-hidden='true' {disabled} class:pointer={!active} class:default-cursor={active} use:click={() => setCurrent(media)}>
        <div class='rounded bg-dark-light mr-10 progress-badge overflow-hidden progressive' {disabled} class:active style='height:3px;' style:width={active ? '5rem' : '2.7rem'}>
          <div class='progress-content h-full' class:bg-white={active} />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .gradient-bottom { background:var(--banner-gradient-bottom); }
  .gradient-left { background:var(--banner-gradient-left); }
  .banner { animation:fadeIn 0.8s ease forwards; will-change:opacity; font-family:'IBM Plex Mono',monospace; }
  img { animation:fadeIn 0.8s ease forwards; will-change:opacity; }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .title { display:inline-block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; font-family:'Syne',sans-serif; font-size:clamp(2.2rem,4vw,4rem); font-weight:800; letter-spacing:-0.03em; color:#ededea; text-shadow:0 2px 20px rgba(0,0,0,0.9),0 1px 4px rgba(0,0,0,1); }
  .details { font-family:'IBM Plex Mono',monospace; font-size:1.1rem; font-weight:400; color:rgba(237,237,234,0.55); letter-spacing:0.04em; gap:0; flex-wrap:wrap; }
  .details span + span::before { content:'•'; padding:0 0.6rem; font-size:0.55rem; align-self:center; white-space:normal; color:rgba(237,237,234,0.28); }
  .text-muted { color:rgba(237,237,234,0.40) !important; font-family:'IBM Plex Mono',monospace; font-size:1.15rem; font-weight:300; line-height:1.65; }
  .line-4 { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
  .btn:first-of-type { font-family:'IBM Plex Mono',monospace; font-size:1.1rem; font-weight:500; letter-spacing:0.08em; background:#d4f55e !important; color:#0d0d10 !important; border:none !important; border-radius:3px !important; box-shadow:none !important; transition:opacity 0.12s; }
  .btn:first-of-type:hover { opacity:0.85; }
  .btn { font-family:'IBM Plex Mono',monospace; font-size:1.1rem; font-weight:400; letter-spacing:0.06em; background:rgba(13,13,16,0.65) !important; color:#ededea !important; border:1px solid rgba(255,255,255,0.10) !important; border-radius:3px !important; box-shadow:none !important; backdrop-filter:blur(8px); transition:background 0.12s,border-color 0.12s; }
  .btn:hover { background:rgba(237,237,234,0.10) !important; border-color:rgba(255,255,255,0.22) !important; }
  .btn-square { border-radius:3px !important; aspect-ratio:1; }
  .badge-wrapper { padding-top:10px; padding-bottom:10px; }
  .progress-badge { background:rgba(237,237,234,0.18) !important; border-radius:2px !important; transition:width 0.8s ease; height:3px !important; }
  .progress-badge.active { background:rgba(212,245,94,0.25) !important; }
  .progress-badge.active .progress-content { animation:fill 15s linear; will-change:width; background:#d4f55e !important; }
  .progress-badge:not(.active) .progress-content { background:rgba(237,237,234,0.45) !important; width:100%; }
  @keyframes fill { from { width:0; } to { width:100%; } }
  .default-cursor { cursor:default; }
</style>