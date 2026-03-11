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
  import { CalendarDays, Tv, ThumbsUp, ThumbsDown } from 'lucide-svelte'

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

<div bind:this={container} class='d-flex p-md-20 p-15 position-relative small-card-ct {$reactive ? `` : `not-reactive`}' use:hoverClick={[viewMedia, setHoverState, viewMedia]} on:focus={handleFocus}>
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
    <div class='text-white font-weight-very-bold font-size-16 title overflow-hidden' class:mb-10={type || type === 0}>
      {#if media.mediaListEntry?.status}
        <div style:--statusColor={statusColorMap[media.mediaListEntry.status]} class='list-status-circle d-inline-flex overflow-hidden mr-5' title={media.mediaListEntry.status} />
      {/if}
      {anilistClient.title(media)}
    </div>
    <div class='d-flex flex-row mt-auto font-weight-medium justify-content-between w-full text-muted'>
      <div class='d-flex align-items-center pr-5'>
        <CalendarDays class='pr-5' size='2.6rem' />
        {#await ((media.seasonYear || (media.status === 'NOT_YET_RELEASED')) && media) || getKitsuMappings(media.id) then details}
          {@const attributes = details?.included?.[0]?.attributes}
          <span class='line-height-1'>{details.seasonYear || ((media.status === 'NOT_YET_RELEASED') && 'TBA') || (attributes?.startDate && new Date(attributes?.startDate).getFullYear()) || (attributes?.createdAt && new Date(attributes?.createdAt).getFullYear()) || (media.status === 'RELEASING' && currentYear) || 'N/A'}</span>
        {/await}
      </div>
      <div class='d-flex align-items-center text-nowrap text-right'>
        <span class='line-height-1'>{formatMap[media.format]}</span>
        <Tv class='pl-5' size='2.6rem' />
      </div>
    </div>
  </div>
</div>

<style>
  

  .small-card-ct {
    font-family: var(--font-mono);
    border-radius: 6px;
    transition: background 0.1s;
  }
  .small-card-ct:hover {
    z-index: 30;
    background: rgba(237,237,234,0.04);
  }

  /* Airing glow — accent-tinted */
  .airing::before {
    content: '';
    position: absolute;
    inset: -1.3rem;
    border-radius: .4rem;
    pointer-events: none;
    animation: airing-pulse 3.5s infinite;
    will-change: box-shadow, opacity;
  }

  /* SmallCard badge position override */
  .d-inline-block .airing-badge {
    top: -1rem;
    right: -1rem;
  }

  /* Cover image subtle rounding */
  :global(.cover-ratio) {
    border-radius: 4px !important;
  }

  /* Anime title */
  .title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    line-height: 1.25;
    font-family: var(--font-display) !important;
    font-size: 1.35rem !important;
    font-weight: 800 !important;
    letter-spacing: -0.02em !important;
    color: var(--card-fg) !important;
    margin-top: 0.7rem;
  }

  /* Context type (likes/dislikes) */
  .context-type {
    font-family: var(--font-mono);
    font-size: 1rem;
    color: var(--card-dim);
    padding-top: 0.5rem;
  }

  /* Airing countdown line above card */
  .text-success { color: var(--card-accent) !important; }
  .text-light   { color: var(--card-dim) !important; }

  /* Bottom meta row (year, format) */
  .font-weight-medium {
    font-family: var(--font-mono) !important;
    font-weight: 500 !important;
    font-size: 1rem !important;
    color: var(--card-dim) !important;
    letter-spacing: 0.04em;
  }

  .item {
    width: 100%;
    aspect-ratio: 152/296;
  }

</style>