<script>
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import { Music } from 'lucide-svelte'
  import { writable } from 'simple-store-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { click } from '@/modules/click.js'
  import { X, Play, ChevronLeft, ChevronRight } from 'lucide-svelte'
  import { getAnimeThemes, getBestVideo, formatThemeLabel } from '@/modules/animethemes.js'
  import { modal } from '@/modules/navigation.js'

  export let staticMedia
  let loading = true
  let themes = null
  let selectedTheme = null
  let selectedVideo = null
  let currentVideoIndex = 0
  let player = null

  function close () {
    modal.close(modal.ANIME_THEMES)
    if (player) player.pause()
  }

  function reset () {
    themes = null
    selectedTheme = null
    selectedVideo = null
    currentVideoIndex = 0
    loading = true
  }

  async function loadThemes () {
    if (!staticMedia?.id) return
    loading = true
    themes = await getAnimeThemes(staticMedia.id)
    if (themes?.length) {
      selectedTheme = themes[0]
      if (selectedTheme?.entries?.length) {
        const best = getBestVideo(selectedTheme.entries.flatMap(e => e.videos))
        selectedVideo = best || selectedTheme.entries[0]?.videos?.[0]
        currentVideoIndex = selectedTheme.entries.flatMap(e => e.videos).indexOf(selectedVideo)
      }
    }
    loading = false
  }

  function selectTheme (theme) {
    selectedTheme = theme
    if (theme?.entries?.length) {
      const best = getBestVideo(theme.entries.flatMap(e => e.videos))
      selectedVideo = best || theme.entries[0]?.videos?.[0]
      currentVideoIndex = theme.entries.flatMap(e => e.videos).indexOf(selectedVideo)
    } else {
      selectedVideo = null
    }
  }

  function selectVideo (video, index) {
    selectedVideo = video
    currentVideoIndex = index
  }

  function nextVideo () {
    if (!selectedTheme) return
    const allVideos = selectedTheme.entries.flatMap(e => e.videos)
    if (currentVideoIndex < allVideos.length - 1) {
      currentVideoIndex++
      selectedVideo = allVideos[currentVideoIndex]
    }
  }

  function prevVideo () {
    if (!selectedTheme) return
    const allVideos = selectedTheme.entries.flatMap(e => e.videos)
    if (currentVideoIndex > 0) {
      currentVideoIndex--
      selectedVideo = allVideos[currentVideoIndex]
    }
  }

  function handleKeydown (e) {
    if (e.key === 'ArrowRight') nextVideo()
    else if (e.key === 'ArrowLeft') prevVideo()
  }

  $: if ($modal[modal.ANIME_THEMES] && !themes) loadThemes()
  $: if (!$modal[modal.ANIME_THEMES]) reset()
</script>

<svelte:window on:keydown={$modal[modal.ANIME_THEMES] ? handleKeydown : null} />

<button 
  class='btn TechnicalSquareButton d-flex align-items-center justify-content-center shadow-none border-0 mr-10' 
  data-toggle='tooltip' 
  data-placement='top' 
  data-target-breakpoint='md' 
  data-title='Anime Themes'
  use:click={() => modal.toggle(modal.ANIME_THEMES)}
  disabled={!staticMedia?.id}
>
  <Music size='1.2rem' />
</button>

<SoftModal 
  class='pointer-events-none w-full scrollbar-none align-items-center mb-30' 
  css='top-0 left-0 position-fixed' 
  bind:showModal={$modal[modal.ANIME_THEMES]} 
  shouldRender={true} 
  {close} 
  id={modal.ANIME_THEMES}
>
  <div class='pointer-events-auto d-flex align-items-center rounded-top-5 w-full wm-calc bg-dark h-40'>
    <span class='title ml-20 font-weight-very-bold text-muted select-all mr-20 font-scale-18'>{anilistClient.title(staticMedia)} - Themes</span>
    <button type='button' class='btn btn-square bg-transparent shadow-none border-0 d-flex align-items-center justify-content-center ml-auto mr-5' use:click={close}><X size='1.7rem' strokeWidth='3'/></button>
  </div>
  <div class='pointer-events-auto position-relative w-full wm-calc overflow-hidden rounded-bottom-5 bg-dark'>
    {#if $modal[modal.ANIME_THEMES]}
      {#if loading}
        <div class='d-flex align-items-center justify-content-center' style='height: 20rem;'>
          <span class='text-muted'>Loading themes...</span>
        </div>
      {:else if !themes?.length}
        <div class='d-flex align-items-center justify-content-center' style='height: 20rem;'>
          <span class='text-muted'>No themes available</span>
        </div>
      {:else}
        <div class='row m-0'>
          <div class='col-12 col-lg-8 p-0'>
            <div class='video-container position-relative' style='background: #000;'>
              {#if selectedVideo?.link}
                <video
                  bind:this={player}
                  class='w-full'
                  style='max-height: 70vh; display: block;'
                  controls
                  autoplay
                  src={selectedVideo.link}
                >
                  <track kind='captions' />
                </video>
              {:else}
                <div class='d-flex align-items-center justify-content-center' style='height: 20rem;'>
                  <span class='text-muted'>No video available</span>
                </div>
              {/if}
              {#if selectedTheme?.entries?.length > 1}
                <button class='nav-btn nav-prev position-absolute top-0 h-full d-flex align-items-center' use:click={prevVideo} disabled={currentVideoIndex === 0}>
                  <ChevronLeft size='2rem' />
                </button>
                <button class='nav-btn nav-next position-absolute top-0 h-full d-flex align-items-center' use:click={nextVideo} disabled={currentVideoIndex >= selectedTheme.entries.flatMap(e => e.videos).length - 1}>
                  <ChevronRight size='2rem' />
                </button>
              {/if}
            </div>
            {#if selectedVideo}
              <div class='video-info p-10 bg-dark-light'>
                <div class='d-flex flex-wrap gap-5'>
                  {#if selectedVideo.resolution}<span class='badge'>{selectedVideo.resolution}p</span>{/if}
                  {#if selectedVideo.subbed}<span class='badge'>Subbed</span>{/if}
                  {#if selectedVideo.lyrics}<span class='badge'>Lyrics</span>{/if}
                  {#if selectedVideo.nc}<span class='badge'>NC</span>{/if}
                  {#if selectedVideo.uncen}<span class='badge'>Uncen</span>{/if}
                </div>
              </div>
            {/if}
          </div>
          <div class='col-12 col-lg-4 theme-list bg-dark p-10'>
            <div class='d-flex flex-column gap-10 overflow-auto' style='max-height: 70vh;'>
              {#each themes as theme}
                <button 
                  class='theme-item p-10 rounded {selectedTheme === theme ? 'active' : ''}' 
                  use:click={() => selectTheme(theme)}
                >
                  <div class='d-flex align-items-center gap-10'>
                    <Play size='1.2rem' />
                    <span class='font-weight-bold'>{formatThemeLabel(theme)}</span>
                  </div>
                  {#if theme.song}
                    <div class='text-muted font-size-12 mt-5'>
                      {theme.song.title || 'Unknown'}
                      {#if theme.song.artists?.length}
                        - {theme.song.artists.map(a => a.name).join(', ')}
                      {/if}
                    </div>
                  {/if}
                  {#if theme.entries?.length}
                    <div class='video-options mt-10 d-flex flex-wrap gap-5'>
                      {#each theme.entries.flatMap(e => e.videos) as video, i}
                        <button 
                          class='video-option btn btn-sm {selectedVideo === video ? 'btn-primary' : 'btn-secondary'}' 
                          use:click|stopPropagation={() => selectVideo(video, i)}
                        >
                          {video.resolution}p{#if video.subbed}*{/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</SoftModal>

<style>
  .rounded-top-5 {
    border-radius: .5rem .5rem 0 0;
  }
  .rounded-bottom-5 {
    border-radius: 0 0 .5rem .5rem;
  }
  .wm-calc {
    max-width: min(max(70vw, 100rem), calc(75vh * (16 / 9)));
  }
  .title {
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .theme-list {
    border-radius: 0 0 .5rem .5rem;
  }
  .theme-item {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    color: rgba(237,237,234,0.8);
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
  }
  .theme-item:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }
  .theme-item.active {
    background: rgba(212,245,94,0.15);
    border-color: var(--card-accent);
  }
  .nav-btn {
    background: rgba(0,0,0,0.5);
    border: none;
    color: white;
    cursor: pointer;
    padding: 1rem;
    transition: background 0.15s;
  }
  .nav-btn:hover:not(:disabled) {
    background: rgba(0,0,0,0.8);
  }
  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .nav-prev {
    left: 0;
    border-radius: 0 .5rem .5rem 0;
  }
  .nav-next {
    right: 0;
    border-radius: .5rem 0 0 .5rem;
  }
  .video-info .badge {
    background: rgba(255,255,255,0.1);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgba(237,237,234,0.7);
  }
  .video-option {
    font-size: 0.75rem;
    padding: 2px 8px;
  }
  .gap-5 {
    gap: 0.5rem;
  }
  .gap-10 {
    gap: 1rem;
  }
</style>
