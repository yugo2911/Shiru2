<script>
  import { formatMap, getMediaMaxEp, playMedia } from '@/modules/anime/anime.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import { fadeIn, fadeOut } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import Scoring from '@/components/Scoring.svelte'
  import { Heart, Play, VolumeX, Volume2, Target, Zap } from 'lucide-svelte'
  import { ELECTRON } from '@/modules/bridge.js'

  export let media
  export let element
  export let _variables

  $: maxEp = getMediaMaxEp(media)
  let hide = true
  let muted = true

  const play = () => media.status !== 'NOT_YET_RELEASED' && playMedia(media)
  const toggleMute = () => (muted = !muted)
  const toggleFavourite = () => (media.isFavourite = anilistClient.favourite({ id: media.id }))
</script>

<style>
  .curse-card {
    background: #050505;
    border-left: 4px solid #bc0000;
    font-family: 'Inter', sans-serif;
    color: #fff;
    box-shadow: -15px 0 40px rgba(188, 0, 0, 0.2);
  }

  /* The "Cover" Container */
  .media-aside {
    width: 60%;
    height: 100%;
    position: absolute;
    right: 0;
    top: 0;
    clip-path: polygon(25% 0, 100% 0, 100% 100%, 0% 100%);
    z-index: 1;
    background: #000;
    overflow: hidden;
  }

  /* Force iframe to act like object-fit: cover */
  .trailer-viewport {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    min-width: 177.77vh; /* Maintains 16:9 aspect ratio coverage */
    min-height: 100%;
  }

  .trailer-viewport iframe {
    width: 100%;
    height: 100%;
    border: 0;
    pointer-events: none;
  }

  .curse-overlay {
    background: linear-gradient(90deg, #050505 15%, rgba(5, 5, 5, 0.5) 40%, transparent 100%);
    z-index: 3;
    pointer-events: none;
  }

  .title-vertical {
    font-size: 3rem;
    font-weight: 900;
    line-height: 0.85;
    text-transform: uppercase;
    color: #fff;
    letter-spacing: -3px;
    filter: drop-shadow(0 0 10px rgba(0,0,0,0.5));
  }

  .action-orb {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #bc0000;
    color: #fff;
    border: none;
    transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1);
  }

  .action-orb:hover {
    background: #fff;
    color: #000;
    transform: scale(1.15) rotate(5deg);
  }

  .data-row {
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding: 12px 0;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: #666;
  }

  .data-value {
    color: #bc0000;
    float: right;
    font-weight: 800;
  }
</style>

<div 
  class='position-absolute w-450 h-full curse-card absolute-container top-0 bottom-0 m-auto z-30 fade-change overflow-hidden' 
  in:fadeIn out:fadeOut 
  bind:this={element}
>
  <div class='media-aside'>
    <div class='position-absolute w-full h-full curse-overlay'></div>
    <SmartImage class='img-cover w-full h-full grayscale opacity-40' images={[media.bannerImage, media.coverImage?.extraLarge]}/>
    
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

  <div class='position-relative z-10 p-35 w-55 h-full d-flex flex-column'>
    <div class='font-scale-10 letter-spacing-2 text-danger font-weight-bold mb-10'>[ ELIMINATION FILE ]</div>
    
    <h1 class='title-vertical mb-30'>
      {anilistClient.title(media).split(' ')[0]}<br/>
      <span style="color: #bc0000;">{anilistClient.title(media).split(' ').slice(1).join(' ')}</span>
    </h1>

    <div class='d-flex align-items-center gap-4 mb-40'>
      <button class='action-orb d-flex align-items-center justify-content-center' use:click={play}>
        <Play fill='currentColor' size='1.8rem' class="ml-5"/>
      </button>
      
      <div class='d-flex flex-column gap-2'>
        <button class='bg-transparent border-0 p-0 text-white' use:click={toggleFavourite}>
          <Heart fill={media.isFavourite ? '#bc0000' : 'none'} color={media.isFavourite ? '#bc0000' : 'white'} size='1.3rem'/>
        </button>
        <button class='bg-transparent border-0 p-0 text-white opacity-30' use:click={toggleMute}>
          {#if muted} <VolumeX size='1.3rem'/> {:else} <Volume2 size='1.3rem'/> {/if}
        </button>
      </div>
    </div>

    <div class='mt-auto'>
      <div class='data-row'><Target size="12" class="mr-2"/> TARGETS <span class='data-value'>{maxEp || '??'}</span></div>
      <div class='data-row'><Zap size="12" class="mr-2"/> SYNC <span class='data-value'>{media.averageScore || '0'}%</span></div>
    </div>

    <div class='mt-20 d-flex justify-content-between align-items-center'>
      <Scoring {media} previewAnime={true}/>
      <span class="font-scale-8 opacity-20">REV_INTEL_SYSTEMS</span>
    </div>
  </div>
</div>