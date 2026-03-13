<script>
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import { TvMinimalPlay } from 'lucide-svelte'
  import { writable } from 'simple-store-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { click } from '@/modules/click.js'
  import { X } from 'lucide-svelte'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import { episodesList } from '@/modules/episodes.js'
  import { ELECTRON } from '@/modules/bridge.js'
  import { modal } from '@/modules/navigation.js'

  export let staticMedia
  const hide = writable(true)
  let loading = true
  let mediaId = staticMedia?.id
  $: if (staticMedia?.id !== mediaId) reset()

  function close () {
    modal.close(modal.TRAILER)
  }

  function show () {
    hide.set(false)
    return ''
  }
  function reset () {
    hide.set(true)
    loading = true
    mediaId = staticMedia?.id
  }
</script>
<button class='btn bg-dark-light btn-lg btn-square d-none align-items-center justify-content-center shadow-none border-0 mr-10' class:d-flex={!$hide} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='Watch Trailer' use:click={() => modal.toggle(modal.TRAILER)}>
  <TvMinimalPlay size='1.7rem' />
</button>
<SoftModal class='pointer-events-none w-full scrollbar-none align-items-center mb-30' css={`top-0 left-0 position-fixed`} bind:showModal={$modal[modal.TRAILER]} shouldRender={true} {close} id={modal.TRAILER}>
  <div class='pointer-events-auto player-shell wm-calc'>
    <div class='player-header'>
      <span class='player-badge'>TRAILER</span>
      <span class='player-title'>{anilistClient.title(staticMedia)}</span>
      <button type='button' class='player-close' use:click={close}><X size='1.6rem' strokeWidth='2.5'/></button>
    </div>
    <div class='player-body'>
      {#key staticMedia?.id}
        {#await (staticMedia.trailer?.id && staticMedia) || episodesList.getMedia(staticMedia.idMal) then trailerUrl}
          {@const trailerId = trailerUrl?.trailer?.id || trailerUrl?.data?.trailer?.youtube_id}
          {#if trailerId}
            {show()}
            {#if $modal[modal.TRAILER]}
              {#await ELECTRON.getYouTube() then youtubeServer}
                <SmartImage class='player-thumb' images={[...(trailerId ? [`https://i.ytimg.com/vi/${trailerId}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${trailerId}/hqdefault.jpg`] : []), staticMedia.bannerImage, staticMedia.coverImage?.extraLarge]} hidden={!loading}/>
                <iframe
                  class='player-iframe'
                  class:d-none={loading}
                  title={staticMedia.title.userPreferred}
                  allow='autoplay'
                  allowfullscreen
                  on:load={() => { loading = false }}
                  src={`${youtubeServer}/embed/${trailerId}?autoplay=1&vq=medium&cc_lang_pref=ja`}/>
              {/await}
            {/if}
          {/if}
        {/await}
      {/key}
    </div>
  </div>
</SoftModal>

<style>
  .wm-calc {
    width: 100%;
    max-width: min(max(70vw, 100rem), calc(75vh * (16 / 9)));
  }
  .player-shell {
    border-radius: 0.6rem;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08);
    background: #0d0d10;
  }
  .player-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0 0.75rem 0 1.4rem;
    height: 4.2rem;
    background: linear-gradient(90deg, rgba(212,245,94,0.06) 0%, transparent 60%);
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
  }
  .player-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    color: #d4f55e;
    background: rgba(212,245,94,0.1);
    border: 1px solid rgba(212,245,94,0.28);
    border-radius: 3px;
    padding: 0.18rem 0.5rem;
    flex-shrink: 0;
  }
  .player-title {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1.05rem;
    font-weight: 500;
    color: rgba(237,237,234,0.65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .player-close {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: rgba(237,237,234,0.35);
    cursor: pointer;
    padding: 0.55rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s, background 0.12s;
  }
  .player-close:hover { color: #ededea; background: rgba(237,237,234,0.08); }
  .player-body {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #000;
    overflow: hidden;
  }
  .player-body :global(.player-thumb) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .player-iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  }
</style>