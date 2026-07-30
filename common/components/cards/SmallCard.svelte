<script>
  import { onMount, onDestroy } from 'svelte'
  import PreviewCard from '@/components/cards/PreviewCard.svelte'
  import { airingAt, getAiringInfo, getKitsuMappings, formatMap, statusColorMap } from '@/modules/anime/anime.js'
  import { createListener } from '@/modules/util.js'
  import { hoverClick } from '@/modules/click.js'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import AudioLabel from '@/components/AudioLabel.svelte'
  import { anilistClient, currentYear } from '@/modules/anilist.js'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { modal } from '@/modules/navigation.js'
  import { ThumbsUp, ThumbsDown } from 'lucide-svelte'

  /** @type {import('@/modules/al.d.ts').Media} */
  export let data
  export let type = null
  export let variables = null
  let _variables = variables

  let media
  $: if (data && !media) media = mediaCache.value[data?.id]
  mediaCache.subscribe((value) => { if (value && (JSON.stringify(value[media?.id]) !== JSON.stringify(media))) media = value[media?.id] })
  function viewMedia() {
    if (_variables?.fileEdit) _variables.fileEdit(media)
    else modal.open(modal.ANIME_DETAILS, media)
  }

  let preview = false
  let ignoreFocus = false
  function setHoverState(state) {
    const focused = document.activeElement
    if (container && focused?.offsetParent != null && (container.contains(focused)) && (!previewCard || !previewCard.contains(focused))) ignoreFocus = true
    if (settings.value.cardPreview) preview = state
    else if (state) viewMedia()
  }

  let container
  let previewCard
  let focusTimeout
  let blurTimeout
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
    focusTimeout.unref?.()
  }
  function handleBlur() {
    clearTimeouts()
    blurTimeout = setTimeout(() => {
      const focused = document.activeElement
      const lostFocus = container && focused?.offsetParent != null && !container.contains(focused)
      const lostPreviewFocus = previewCard && !previewCard.contains(focused)
      if (lostFocus && lostPreviewFocus) {
        preview = false
        ignoreFocus = false
        document.removeEventListener('pointerup', handleOutsideClick)
      } else if (lostFocus || (previewCard && previewCard.contains(focused))) ignoreFocus = false
    })
    blurTimeout.unref?.()
  }
  function handleOutsideClick(event) {
    if (container && previewCard && !container.contains(event.target) && !previewCard.contains(event.target)) {
      preview = false
      ignoreFocus = false
      document.removeEventListener('pointerup', handleOutsideClick)
    }
  }
  function clearTimeouts() {
    clearTimeout(focusTimeout)
    clearTimeout(blurTimeout)
  }

  let airingInterval
  let _airingAt = null
  $: airingInfo = getAiringInfo(_airingAt)
  onMount(() => {
    container.addEventListener('focusout', handleBlur)
    _airingAt = media && _variables?.scheduleList && airingAt(media, _variables)
    if (_airingAt) {
      airingInterval = setInterval(() => airingInfo = getAiringInfo(_airingAt), 60_000)
      airingInterval.unref?.()
    }
  })
  onDestroy(() => {
    document.removeEventListener('pointerup', handleOutsideClick)
    container?.removeEventListener?.('focusout', handleBlur)
    clearTimeouts()
    clearTimeout(airingInterval)
  })

  const { reactive, init } = createListener(['btn', 'scoring', 'mute', 'preview-safe-area'])
  $: init(preview)
  $: if (preview) clearTimeout(focusTimeout)
</script>

<div bind:this={container} class='d-flex p-0 position-relative small-card-ct {$reactive ? `` : `not-reactive`}' use:hoverClick={[viewMedia, setHoverState, viewMedia]} on:focus={handleFocus}>
  {#if preview}
    <PreviewCard {media} {type} {_variables} bind:element={previewCard}/>
  {/if}
  <div class='item load-in small-card d-flex flex-column pointer {airingInfo?.episode.match(/out for/i) ? `airing` : ``}'>
    {#if airingInfo}
      <div class='w-full text-center pb-10'>
        {airingInfo.episode}&nbsp;
        <span class='font-weight-bold {airingInfo.episode.match(/out for/i) ? `text-success` : `text-light`}'>
            {airingInfo.time}
        </span>
      </div>
    {/if}
    <div class='d-inline-block position-relative'>
      <span class='airing-badge rounded-10 font-weight-semi-bold text-light bg-success' class:d-none={!airingInfo?.episode?.match(/out for/i)}>AIRING</span>
      <SmartImage class='cover-img cover-color cover-ratio w-full rounded' color={media.coverImage.color || 'var(--tertiary-color)'} images={[media.coverImage.extraLarge, media.coverImage?.medium, './404_cover.png']}/>
      {#if !_variables?.scheduleList}
        <AudioLabel {media} />
      {/if}
    </div>
    {#if type || type === 0}
      <div class='context-type d-flex align-items-center'>
        {#if Number.isInteger(type) && type >= 0}
          <ThumbsUp fill='currentColor' class='pr-5 pb-5 {type === 0 ? `text-muted` : `text-success`}' size='2rem' />
        {:else if Number.isInteger(type) && type < 0}
          <ThumbsDown fill='currentColor' class='text-danger pr-5 pb-5' size='2rem' />
        {/if}
        {(Number.isInteger(type) ? Math.abs(type).toLocaleString() + (type >= 0 ? ' like' : ' dislike') + ((type !== 1 && type !== -1) ? 's' : '') : type)}
      </div>
    {/if}
    
    <!-- Title Section with Status Dot -->
    <div class='d-flex align-items-center title-container'>
      {#if media.mediaListEntry?.status}
        <div style:--statusColor={statusColorMap[media.mediaListEntry.status]} class='list-status-dot flex-shrink-0' title={media.mediaListEntry.status} />
      {/if}
      <div class='text-white font-weight-very-bold font-size-16 title text-truncate' class:mb-10={type || type === 0}>
        {anilistClient.title(media)}
      </div>
    </div>

    <!-- Bottom Metadata Row (Format, Year, etc.) -->
    <div class='d-flex flex-row mt-auto font-weight-medium align-items-center gap-1 w-full text-muted metadata-row'>
      <div class='badge-pill'>
        <span class='line-height-1'>{formatMap[media.format]}</span>
      </div>
      <div class='badge-pill'>
        {#await ((media.seasonYear || (media.status === 'NOT_YET_RELEASED')) && media) || getKitsuMappings(media.id) then details}
          {@const attributes = details?.included?.[0]?.attributes}
          <span class='line-height-1'>{details.seasonYear || ((media.status === 'NOT_YET_RELEASED') && 'TBA') || (attributes?.startDate && new Date(attributes?.startDate).getFullYear()) || (attributes?.createdAt && new Date(attributes?.createdAt).getFullYear()) || (media.status === 'RELEASING' && currentYear) || 'N/A'}</span>
        {/await}
      </div>
    </div>
  </div>
</div>

<style>
  .small-card-ct { 
    transition: transform 0.2s; 
    outline: none; 
    margin: 8px; /* Added external margin to increase space between grid items[cite: 1] */
  }
  .small-card-ct:hover, .small-card-ct:focus-within { transform: translateY(-4px); z-index: 10; }
  
  .small-card { 
    width: 160px; 
    min-height: 280px; 
    background: var(--secondary-color-dark); 
    border-radius: 8px;
    padding: 6px;
  }

  .cover-img { 
    aspect-ratio: 2 / 3; 
    object-file: cover; 
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    border-radius: 6px;
  }

  .airing-badge {
    position: absolute;
    top: 4px;
    left: 4px;
    padding: 2px 6px;
    font-size: 0.9rem;
    z-index: 2;
  }

  .title-container {
    margin-top: 8px;
    gap: 6px;
    min-height: 22px;
  }

  .title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
    width: 100%;
  }

  .list-status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: var(--statusColor, #22c55e);
  }

  .metadata-row {
    margin-top: 8px;
    gap: 6px;
  }

  .badge-pill {
    background: rgba(255, 255, 255, 0.06);
    padding: 3px 8px;
    border-radius: 6px;
  }

  .context-type { 
    font-size: 1.2rem; 
    color: var(--text-muted); 
    margin: 2px 0; 
  }

  :global(.small-card-ct .cover-color) { background-color: var(--color); }
  
  .airing .cover-img { border: 2px solid var(--success-color); }
  .not-reactive { pointer-events: none; }

  .small-card-ct :global(.preview-card) {
    left: 50% !important;
    transform: translateX(-50%);
  }
</style>
