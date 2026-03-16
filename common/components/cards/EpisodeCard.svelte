<script context='module'>
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import AudioLabel from '@/components/AudioLabel.svelte'
  import EpisodePreviewCard from '@/components/cards/EpisodePreviewCard.svelte'
  import { Play, RefreshCwOff } from 'lucide-svelte'
  import { onDestroy, onMount } from 'svelte'
  import { writable } from 'simple-store-svelte'
  import { playActive } from '@/components/TorrentButton.svelte'
  import { createListener, since, isValidNumber } from '@/modules/util.js'
  const { reactive, init } = createListener(['torrent-button', 'cont-button', 'episode-safe-area'])
  init(true)
</script>

<script>
  import { statusColorMap } from '@/modules/anime/anime.js'
  import { episodesList } from '@/modules/episodes.js'
  import { hoverClick } from '@/modules/click.js'
  import { liveAnimeEpisodeProgress } from '@/modules/anime/animeprogress.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { checkForZero } from '@/components/MediaHandler.svelte'
  import { modal } from '@/modules/navigation.js'

  export let data
  export let section = false

  let preview = false
  let ignoreFocus = false
  let zeroEpisode = false
  let prompt = writable(false)
  let clicked = writable(false)
  let container
  let previewCard
  let focusTimeout
  let blurTimeout
  let sinceInterval
  let media
  
  $: if (data.media && !media) media = mediaCache.value[data.media.id]
  mediaCache.subscribe(v => { if (v && JSON.stringify(v[media?.id]) !== JSON.stringify(media)) media = v[media?.id] })

  $: checkForZero(media).then(z => zeroEpisode = z)
  $: episodeRange = episodesList.handleArray(data?.episode, data?.parseObject?.file_name)
  $: lastEpisode = (data?.episodeRange || data?.parseObject?.episodeRange)?.last || episodeRange?.last || (isValidNumber(data?.episode) && (data?.episode + (zeroEpisode ? 1 : 0))) || (media?.episodes === 1 && media?.episodes)
  $: episodeThumbnail = ((data.similarity || (!media?.mediaListEntry?.status || !(['CURRENT', 'REPEATING', 'PAUSED', 'PLANNING'].includes(media.mediaListEntry.status) && media.mediaListEntry.progress < lastEpisode))) && data.episodeData?.image) || media?.bannerImage || media?.coverImage.extraLarge || ' '
  
  $: watched = media?.mediaListEntry?.status === 'COMPLETED'
  $: completed = !watched && media?.mediaListEntry?.progress >= lastEpisode
  $: progress = liveAnimeEpisodeProgress(media?.id, data?.episode, completed)
  $: timeSince = data?.date && since(data?.date)

  const getEpisodeNumber = () => isValidNumber(data.episode) ? data.episode : (media?.episodes === 1 && media?.episodes)
  const isBacklogEpisode = (ep) => !$prompt && !data.similarity && isValidNumber(ep) && !Array.isArray(ep) && (ep - 1) >= 1 && media?.mediaListEntry?.status !== 'COMPLETED' && (media?.mediaListEntry?.progress || -1) < (ep - 1)

  function viewMedia() { modal.open(modal.ANIME_DETAILS, media) }

  function setClickState() {
    const ep = getEpisodeNumber()
    if (isBacklogEpisode(ep)) return prompt.set(true)
    isValidNumber(ep) ? (media ? playActive(data.hash, { media, episode: ep }, data.link, !data.link) : data.onclick()) : viewMedia()
    clicked.set(true)
    setTimeout(() => clicked.set(false))
  }

  function setHoverState(state, tapped) {
    if (container?.contains(document.activeElement) && !previewCard?.contains(document.activeElement)) ignoreFocus = true
    if (isBacklogEpisode(getEpisodeNumber())) prompt.set(!!tapped)
    if (!$prompt || !$clicked) {
      preview = state
      setTimeout(() => { if (!preview) prompt.set(false) })
    }
  }

  function handleFocus() {
    if (ignoreFocus || preview) return
    clearTimeouts()
    focusTimeout = setTimeout(() => {
      if (settings.value.cardPreview) {
        preview = true
        ignoreFocus = true
        document.addEventListener('pointerup', handleOutsideClick)
      }
    }, 800)
  }

  function handleBlur() {
    clearTimeouts()
    blurTimeout = setTimeout(() => {
      const active = document.activeElement
      if (container && !container.contains(active) && (!previewCard || !previewCard.contains(active))) {
        preview = false
        ignoreFocus = false
        setTimeout(() => { if (!preview) prompt.set(false) })
        document.removeEventListener('pointerup', handleOutsideClick)
      } else if (container && !container.contains(active)) {
        ignoreFocus = false
      }
    })
  }

  function handleOutsideClick(e) {
    if (container && previewCard && !container.contains(e.target) && !previewCard.contains(e.target)) {
      preview = false
      setTimeout(() => { if (!preview) prompt.set(false) })
      document.removeEventListener('pointerup', handleOutsideClick)
    }
  }

  function clearTimeouts() { clearTimeout(focusTimeout); clearTimeout(blurTimeout) }

  onMount(() => {
    container.addEventListener('focusout', handleBlur)
    sinceInterval = setInterval(() => timeSince = data?.date && since(data?.date), 60000)
  })

  onDestroy(() => {
    document.removeEventListener('pointerup', handleOutsideClick)
    container?.removeEventListener('focusout', handleBlur)
    clearTimeouts()
    clearInterval(sinceInterval)
  })

  $: if (preview) clearTimeout(focusTimeout)
  $: if (!preview) document.removeEventListener('pointerup', handleOutsideClick)
</script>

<div 
  bind:this={container} 
  class='d-flex p-20 pb-10 position-relative episode-card' 
  class:mb-150={section} 
  class:not-reactive={!$reactive} 
  use:hoverClick={[setClickState, setHoverState, viewMedia]} 
  on:focus={handleFocus}
>
  {#if preview}
    <EpisodePreviewCard {data} {zeroEpisode} bind:prompt={$prompt} bind:element={previewCard} />
  {/if}

  <div class='item load-in d-flex flex-column h-full pointer content-visibility-auto' class:opacity-half={completed}>
    <div class='image h-200 w-full position-relative overflow-hidden d-flex justify-content-between align-items-end text-white'>
      <SmartImage 
        class='cover-img cover-color w-full h-full position-absolute {!(data.episodeData?.image || media?.bannerImage) && media?.genres?.includes(`Hentai`) ? `cover-rotated cr-380` : ``}' 
        color={media?.coverImage?.color || 'var(--tertiary-color)'} 
        images={[episodeThumbnail, './404_episode.png']}
      />
      
      {#if data.failed}
        <div class='pl-10 pt-10 z-10 position-absolute top-0 left-0 text-danger icon-shadow' title='Failed to resolve media'>
          <RefreshCwOff size='3rem' />
        </div>
      {/if}

      <Play class='mb-5 ml-5 pl-10 pb-10 z-10' fill='currentColor' size='3rem' />
      
      <div class='pr-15 pb-10 font-size-16 font-weight-medium z-10'>
        {#if media?.duration}
          {@const range = data.episodeRange || data.parseObject?.episodeRange || episodeRange}
          {media.duration * (range && isValidNumber(range.first) && isValidNumber(range.last) ? (Math.abs(range.last - range.first) + 1) : 1)}m
        {/if}
      </div>

      {#if completed || $progress > 0}
        <div class='progress container-fluid position-absolute z-10' style='height: 2px; min-height: 2px;'>
          <div class='progress-bar' style='width: {completed ? 100 : $progress}%' />
        </div>
      {/if}
    </div>

    <div class='row pt-15'>
      <div class='col pr-10'>
        <div class='text-white font-weight-very-bold font-size-16 title overflow-hidden'>
          {#if media?.mediaListEntry?.status}
            <div style:--statusColor={statusColorMap[media.mediaListEntry.status]} class='list-status-circle d-inline-flex overflow-hidden mr-5' title={media.mediaListEntry.status} />
          {/if}
          {anilistClient.title(media) || data.parseObject?.anime_title}
        </div>
        <div class='text-muted font-size-12 title overflow-hidden'>
          {#if data.episodeData?.title?.en || data.episodeData?.title?.['x-jat'] || data.episodeData?.title?.ja || data.episodeData?.title?.jp}
            {data.episodeData?.title?.en || data.episodeData?.title?.['x-jat'] || data.episodeData?.title?.ja || data.episodeData?.title?.jp}
          {:else if data.episode}
            {@const ep = (data.episodeRange || data.parseObject?.episodeRange)?.first || episodeRange?.first || data.episode}
            {#await episodesList.getKitsuEpisodes(media?.id) then mappings}
              {@const kitsu = ep != null && mappings?.data?.find(e => e?.attributes?.number === (isValidNumber(ep) ? Number(ep) : ep))?.attributes}
              {kitsu?.titles?.en_us || kitsu?.titles?.en_jp || ''}
            {/await}
          {/if}
        </div>
      </div>

      <div class='col-auto d-flex flex-column align-items-end text-right mt-3'>
        <div class='text-white font-weight-bold'>
          {#if data.episodeRange || data.parseObject?.episodeRange || episodeRange}
            {@const r = data.episodeRange || data.parseObject?.episodeRange || episodeRange}
            Episodes {r.first} ~ {r.last}
          {:else if data.episode != null && !Array.isArray(data.episode)}
            Episode {isValidNumber(data.episode) ? Number(data.episode) : data.episode?.replace(/\D/g, '')}
          {:else if media?.format === 'MOVIE'}
            Movie
          {:else if data.parseObject?.anime_title?.match(/S(\d{2})/)}
            Season {parseInt(data.parseObject.anime_title.match(/S(\d{2})/)[1], 10)}
          {:else if (!data.similarity)}
            Batch
          {/if}
        </div>
        <div class='d-flex align-items-center'>
          <div class='text-nowrap font-size-12 title text-muted d-flex align-items-center'>
            <AudioLabel {media} {data} banner={true} episode={true} />
          </div>
          {#if data.date || data.similarity}
            {#if settings.value.cardAudio}<div class='text-muted font-size-12 title mx-5 overflow-hidden'>•</div>{/if}
            <div class='text-muted font-size-12 title overflow-hidden'>
              {data.date ? timeSince : `Confidence: ${Math.round(data.similarity * 100)}%`}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>
