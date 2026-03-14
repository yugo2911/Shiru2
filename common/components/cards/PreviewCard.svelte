<script>
  import { formatMap, getKitsuMappings, getMediaMaxEp, playMedia } from '@/modules/anime/anime.js'
  import { anilistClient, seasons } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import { fadeIn, fadeOut } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import Scoring from '@/components/Scoring.svelte'
  import Helper from '@/modules/helper.js'
  import { Heart, Play, VolumeX, Volume2, ThumbsUp, ThumbsDown } from 'lucide-svelte'
  import { ELECTRON } from '@/modules/bridge.js'

  /** @type {import('@/modules/al.d.ts').Media} */
  export let media
  export let element
  export let _variables
  export let type = null

  $: maxEp = getMediaMaxEp(media)

  let hide = true

  /** @param {import('@/modules/al.d.ts').Media} media */
  function getPlayButtonText (media) {
    if (media.mediaListEntry) {
      const { status, progress } = media.mediaListEntry
      if (progress) {
        if (status === 'COMPLETED') {
          return 'Rewatch Now'
        } else {
          return 'Continue Now'
        }
      }
    }
    return 'Watch Now'
  }
  const playButtonText = getPlayButtonText(media)
  function toggleFavourite() {
    media.isFavourite = anilistClient.favourite({ id: media.id })
  }
  function play() {
    if (media.status === 'NOT_YET_RELEASED') return
    playMedia(media)
  }
  let muted = true
  function toggleMute() {
    muted = !muted
  }
</script>

<div class='position-absolute w-350 h-full absolute-container top-0 bottom-0 m-auto bg-dark-light z-30 rounded pointer fade-change overflow-hidden clip-0-rounded' in:fadeIn out:fadeOut bind:this={element} on:scroll={(e) => e.target.scrollTop = 0}>
  <div class='banner position-relative bg-black'>
    <div class='ratio-16-9 w-full h-full clip-0'>
      <SmartImage class='img-cover w-full h-full' images={[media.bannerImage, ...(media.trailer?.id ? [`https://i.ytimg.com/vi/${media.trailer.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${media.trailer.id}/hqdefault.jpg`] : []), media.coverImage?.extraLarge ]}/>
      {#await (media.trailer?.id && media) || episodesList.getMedia(media.idMal) then trailer}
        {#if trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id }
          {#await ELECTRON.getYouTube() then youtubeServer}
            <div style='transition: opacity .3s' class:transparent={hide}>
              <SmartImage class='position-absolute top-0 left-0 w-full h-full img-cover blur-6' images={[`https://i.ytimg.com/vi/${media.trailer.id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${media.trailer.id}/hqdefault.jpg`]}/>
              <button type='button' class='position-absolute z-10 top-0 right-0 m-15 btn-square bg-transparent shadow-none border-0 rounded pointer mute' style='filter: drop-shadow(0 0 .4rem hsla(var(--black-color-hsl), 1))' use:click={toggleMute}>
                {#if muted}
                  <VolumeX size='2.2rem' fill='currentColor'/>
                {:else}
                  <Volume2 size='2.2rem' fill='currentColor'/>
                {/if}
              </button>
              <iframe
                  class='w-full border-0 position-absolute left-0 pv-trailer pointer-events-none'
                  tabindex='-1'
                  title={media.title.userPreferred}
                  loading='lazy'
                  allow='autoplay; web-share'
                  allowfullscreen
                  on:load={() => { setTimeout(() => hide = false, 300).unref?.() }}
                  referrerpolicy='strict-origin-when-cross-origin'
                  src={`${youtubeServer}/embed/${trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}?autoplay=1&controls=0&mute=${muted ? 1 : 0}&disablekb=1&loop=1&vq=medium&playlist=${trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}&cc_lang_pref=ja`}
              />
            </div>
          {/await}
        {/if}
      {/await}
    </div>
  </div>
  <div class='w-full px-20'>
    <div class='font-scale-20 font-weight-bold text-truncate d-inline-block w-full text-white' title={anilistClient.title(media)}>
      {anilistClient.title(media)}
    </div>
    {#if !_variables?.fileEdit}
      <div class='d-flex flex-row position-relative'>
        <button type='button' tabindex='-1' class='position-absolute preview-safe-area top-0 left-0 h-50 bg-transparent border-0 shadow-none not-reactive' use:click={() => {}}/>
        <button class='btn btn-secondary flex-grow-1 text-dark font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center z-1' use:click={play} disabled={media.status === 'NOT_YET_RELEASED'}>
          <Play class='pr-10 z-10' fill='currentColor' size='2.2rem'/>
          {playButtonText}
        </button>
        {#if Helper.isAuthorized()}
          <Scoring {media} previewAnime={true}/>
        {/if}
        {#if Helper.isAniAuth()}
          <button class='btn btn-square ml-10 d-flex align-items-center justify-content-center shadow-none border-0 z-1' data-toggle='tooltip' data-placement='top-right' data-target-breakpoint='md' data-title={media.isFavourite ? 'Unfavourite' : 'Favourite'} use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
            <div class='favourite d-flex align-items-center justify-content-center'>
              <Heart color={media.isFavourite ? 'var(--tertiary-color)' : 'currentColor'} fill={media.isFavourite ? 'var(--tertiary-color)' : 'transparent'} size='1.7rem'/>
            </div>
          </button>
        {/if}
      </div>
    {/if}
    <div class='text-truncate pb-10'>
      <div class='details text-white text-capitalize pt-10 d-flex flex-wrap'>
        {#if type || type === 0}
          <span class='d-flex badge pl-5 pr-5 d-flex align-items-center justify-content-center font-scale-14'>
            {#if Number.isInteger(type) && type >= 0}
              <ThumbsUp fill='currentColor' class='m-0 p-0 pr-5 {type === 0 ? "text-muted" : "text-success"}' size='1.9rem'/>
            {:else if Number.isInteger(type) && type < 0}
              <ThumbsDown fill='currentColor' class='text-danger m-0 p-0 pr-5' size='1.9rem'/>
            {/if}
            <span> {(Number.isInteger(type) ? Math.abs(type).toLocaleString() + (type >= 0 ? ' like' : ' dislike') + ((type !== 1 && type !== -1) ? 's' : '') : type)}</span>
          </span>
        {/if}
        <span class='badge pl-5 pr-5 font-scale-14'>
          {#if media.format}
            {formatMap[media.format]}
          {/if}
        </span>
        {#if maxEp > 1 || (maxEp !== 1 && ['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media.mediaListEntry?.status) && media.mediaListEntry?.progress)}
          <span class='badge pl-5 pr-5 font-scale-14'>
            {['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media.mediaListEntry?.status) && media.mediaListEntry?.progress ? media.mediaListEntry.progress + ' / ' : ''}{maxEp && maxEp !== 0 && !(media.mediaListEntry?.progress > maxEp) ? maxEp : '?'}
            Episodes
          </span>
        {:else if media.duration}
          <span class='badge pl-5 pr-5 font-scale-14'>
            {media.duration + ' Minutes'}
          </span>
        {/if}
        {#if media.isAdult}
        <span class='badge pl-5 pr-5 font-scale-14'>
            Rated 18+
          </span>
        {/if}
        {#await ((media.season || media.seasonYear || (media.status === 'NOT_YET_RELEASED')) && media) || getKitsuMappings(media.id) then details}
          {@const attributes = details?.included?.[0]?.attributes}
          {@const seasonYear = details.seasonYear || (attributes?.startDate && new Date(attributes?.startDate).getFullYear()) || (attributes?.createdAt && new Date(attributes?.createdAt).getFullYear())}
          {@const season = (details.season || seasonYear && seasons[Math.floor((((attributes?.startDate && new Date(attributes?.startDate).getMonth()) || (attributes?.createdAt && new Date(attributes?.createdAt).getMonth())) / 12) * 4) % 4])?.toLowerCase()}
          {#if season || seasonYear || (media.status === 'NOT_YET_RELEASED')}
            <span class='badge pl-5 pr-5 font-scale-14'>
              {(season || seasonYear) ? [season, seasonYear].filter(s => s).join(' ') : 'In Production'}
            </span>
            {#if !season && !seasonYear && (media.status === 'NOT_YET_RELEASED')}
            <span class='badge pl-5 pr-5 font-scale-14'>
              Not Released
            </span>
            {/if}
          {/if}
        {/await}
        {#if media.averageScore}
          <span class='badge pl-5 pr-5 font-scale-14'>{media.averageScore + '%'} Rating</span>
          {#if media.stats?.scoreDistribution && (!type && type !== 0)}
            <span class='badge pl-5 pr-5 font-scale-14'>{anilistClient.reviews(media)} Reviews</span>
          {/if}
        {/if}
      </div>
    </div>
    {#if media.description}
      <div class='w-full h-full text-muted description overflow-hidden font-scale-14'>
        {media.description?.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()}
      </div>
    {/if}
  </div>
</div>

<style>
  

  /* Popup preview panel */
  .absolute-container {
    font-family: var(--font-mono);
    background: #131317 !important;
    border: 1px solid var(--card-line) !important;
    box-shadow: 0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px var(--card-line) !important;
    border-radius: 8px !important;
    will-change: transform, opacity, bottom;
    left: -100%;
    right: -100%;
  }

  /* Anime title */
  .font-scale-20 {
    font-family: var(--font-display) !important;
    font-size: 1.7rem !important;
    font-weight: 800 !important;
    letter-spacing: -0.02em !important;
    color: var(--card-fg) !important;
  }

  /* Watch / Continue button */
  .btn-secondary {
    font-family: var(--font-mono) !important;
    background: var(--card-accent) !important;
    color: var(--card-bg) !important;
    border: none !important;
    border-radius: 3px !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    font-size: 1.15rem !important;
    transition: opacity 0.12s;
  }
  .btn-secondary:hover:not(:disabled) { opacity: 0.85; }
  .btn-secondary:disabled { opacity: 0.3; cursor: not-allowed; }

  /* Square buttons (favourite, score) */
  .btn-square {
    border: 1px solid var(--card-line) !important;
    border-radius: 3px !important;
    background: rgba(237,237,234,0.04) !important;
    color: var(--card-dim) !important;
    transition: background 0.1s, color 0.1s;
  }
  .btn-square:hover { background: rgba(237,237,234,0.08) !important; color: var(--card-fg) !important; }

  /* Metadata badges */
  .details {
    font-family: var(--font-mono);
    gap: 0.3rem;
  }
  .details > span:not(:last-child) {
    margin-right: .2rem;
    margin-bottom: .1rem;
  }
  .details::after {
    content: '';
    position: absolute;
    pointer-events: none;
    left: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    background: var(--preview-card-end-gradient);
  }
  .badge {
    background: var(--card-faint) !important;
    color: var(--card-dim) !important;
    border-radius: 3px !important;
    font-size: 0.95rem !important;
    letter-spacing: 0.04em;
    font-family: var(--font-mono) !important;
  }
  .font-scale-14 {
    font-size: 1rem !important;
    font-family: var(--font-mono) !important;
  }

  /* Description text */
  .description {
    color: var(--card-dim);
    font-size: 1.1rem;
    line-height: 1.65;
  }

  /* Banner gradient overlay */
  .banner::after {
    content: '';
    position: absolute;
    pointer-events: none;
    left: 0;
    top: 0;
    width: 100%;
    height: 100.5%;
    background: var(--preview-card-trailer-gradient);
  }

  /* Mute button */
  .mute { color: #ededea; }

  .preview-safe-area {
    margin-top: -1rem !important;
    margin-left: -1rem !important;
    width: calc(100% + 2rem) !important;
  }

  .text-white { color: #ededea !important; }
  .text-muted { color: rgba(237,237,234,0.38) !important; }
  .text-success { color: #d4f55e !important; }
  .text-danger  { color: #ff6b6b !important; }
</style>