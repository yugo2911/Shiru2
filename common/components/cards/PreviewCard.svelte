<script>
  import { formatMap, getMediaMaxEp, playMedia } from '@/modules/anime/anime.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import { fadeIn as _fadeIn, fadeOut as _fadeOut } from '@/modules/util.js'

  function fadeIn(node, params) {
    const t = _fadeIn(node, params)
    const origCss = t.css
    t.css = (t, u) => origCss(t, u).replace('transform:', 'transform: translateX(-50%) ')
    return t
  }
  function fadeOut(node, params) {
    const t = _fadeOut(node, params)
    const origCss = t.css
    t.css = (t, u) => origCss(t, u).replace('transform:', 'transform: translateX(-50%) ')
    return t
  }
  import { click } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import Scoring from '@/components/Scoring.svelte'
  import { Play, VolumeX, Volume2 } from 'lucide-svelte'
  import { ELECTRON } from '@/modules/bridge.js'

  export let media
  export let element
  export let _variables

  $: maxEp = getMediaMaxEp(media)
  let hide = true
  let muted = true

  const play = () => media.status !== 'NOT_YET_RELEASED' && playMedia(media)
  const toggleMute = () => (muted = !muted)
</script>

<style>
  .preview-card {
    background: var(--card-bg);
    border: 1px solid var(--card-line);
    border-left: 3px solid var(--card-accent);
    color: var(--card-fg);
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
  }

  .media-aside {
    width: 60%;
    height: 100%;
    position: absolute;
    right: 0;
    top: 0;
    z-index: 1;
    background: var(--card-bg);
    overflow: hidden;
  }

  .preview-overlay {
    background: linear-gradient(90deg, var(--card-bg) 15%, color-mix(in srgb, var(--card-bg) 60%, transparent) 40%, transparent 100%);
    z-index: 3;
    pointer-events: none;
  }

  .trailer-viewport {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    min-width: 177.77vh;
    min-height: 100%;
  }

  .trailer-viewport iframe {
    width: 100%;
    height: 100%;
    border: 0;
    pointer-events: none;
  }

  .preview-title {
    font-size: 2.2rem;
    font-weight: 900;
    line-height: 1;
    text-transform: uppercase;
    color: var(--card-fg);
    letter-spacing: -0.02em;
  }

  .preview-play-btn {
    width: 52px;
    height: 52px;
    border-radius: 50px;
    background: var(--card-accent);
    color: var(--card-bg);
    border: none;
    transition: all 0.15s;
  }

  .preview-play-btn:hover {
    transform: scale(1.1);
  }

  .preview-icon-btn {
    background: transparent;
    border: 1px solid var(--card-line);
    color: var(--card-fg);
    border-radius: 50px;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: all 0.15s;
  }

  .preview-icon-btn:hover {
    border-color: var(--card-accent);
    color: var(--card-accent);
  }

  .preview-stat {
    display: flex;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--card-line);
    font-size: 0.7rem;
    letter-spacing: 0.05em;
    color: var(--card-dim);
  }

  .preview-stat-value {
    margin-left: auto;
    font-weight: 700;
    color: var(--card-accent);
  }
</style>

<div 
  class='position-absolute w-450 h-full preview-card top-0 bottom-0 m-auto z-30 fade-change overflow-hidden' 
  in:fadeIn out:fadeOut 
  bind:this={element}
  style={media.coverImage?.color ? `--card-accent: ${media.coverImage.color}` : ''}
>
  <div class='media-aside'>
    <div class='position-absolute w-full h-full preview-overlay'></div>
    <SmartImage class='img-cover w-full h-full grayscale opacity-30' images={[media.bannerImage, media.coverImage?.extraLarge]}/>
    
    {#await (media.trailer?.id && media) || episodesList.getMedia(media.idMal) then trailer}
      {#if trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}
        {#await ELECTRON.getYouTube() then youtubeServer}
          <div class="trailer-viewport" style='transition: opacity 1.5s' class:transparent={hide}>
            <iframe
              title={media.title.userPreferred}
              loading='lazy'
              src={`${youtubeServer}/embed/${trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}?autoplay=1&controls=0&mute=${muted ? 1 : 0}&loop=1&playlist=${trailer?.trailer?.id || trailer?.data?.trailer?.youtube_id}`}
              on:load={() => setTimeout(() => (hide = false), 500)}
            />
          </div>
        {/await}
      {/if}
    {/await}
  </div>

  <div class='position-relative z-10 p-30 w-55 h-full d-flex flex-column'>
    <div class='font-size-10 letter-spacing-2 text-uppercase font-weight-bold mb-15' style="color: var(--card-accent);">PREVIEW</div>
    
    <h1 class='preview-title mb-25'>
      {anilistClient.title(media)}
    </h1>

    <div class='d-flex align-items-center gap-3 mb-30'>
      <button class='preview-play-btn d-flex align-items-center justify-content-center' use:click={play}>
        <Play fill='currentColor' size='1.5rem' class="ml-3"/>
      </button>
      
      <div class='d-flex flex-column gap-2'>
        <button class='preview-icon-btn' use:click={toggleMute}>
          {#if muted} <VolumeX size='1rem'/> {:else} <Volume2 size='1rem'/> {/if}
        </button>
      </div>
    </div>

    <div class='mt-auto'>
      <div class='preview-stat'>
        EPISODES
        <span class='preview-stat-value'>{maxEp || '??'}</span>
      </div>
      <div class='preview-stat' style="border-bottom: none;">
        SCORE
        <span class='preview-stat-value'>{media.averageScore || '0'}%</span>
      </div>
    </div>

    <div class='mt-20'>
      <Scoring {media} previewAnime={true}/>
    </div>
  </div>
</div>