<script context='module'>
  const DEFAULT_LENGTH  = 15
  const OVERFLOW_LENGTH = 1
  const LOADABLE_LENGTH = 50

  const fakecards = Array.from({ length: LOADABLE_LENGTH }, () => ({ data: new Promise(() => {}) }))
</script>

<script>
  import Card from '@/components/cards/Card.svelte'
  import ErrorCard from '@/components/cards/ErrorCard.svelte'
  import { page } from '@/modules/navigation.js'
  import { search } from '@/modules/sections.js'
  import { click, dragScroll } from '@/modules/click.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { onDestroy, afterUpdate } from 'svelte'
  import { ChevronLeft, ChevronRight } from 'lucide-svelte'

  export let lastEpisode = false
  export let opts

  // ─── State ────────────────────────────────────────────────────────────────

  const preview = opts.preview
  let visibleLength = 0
  let previewLength = DEFAULT_LENGTH
  let activeScroll = false
  let scrollContainer
  let observer = null
  let resizeTimeout

  // ─── Deferred load via IntersectionObserver ───────────────────────────────

  function deferredLoad(element) {
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!opts.preview.value) opts.preview.value = opts.load(1, LOADABLE_LENGTH, { ...opts.variables })
        io.unobserve(element)
      }
    }, { threshold: 0 })
    io.observe(element)
    return { destroy() { io.unobserve(element) } }
  }

  // ─── Navigation to search ─────────────────────────────────────────────────

  function navigateToSearch() {
    $search = { ...opts.variables, load: opts.load, title: opts.title, clearNext: true }
    page.navigateTo(page.SEARCH)
  }

  // ─── Scroll helpers ───────────────────────────────────────────────────────

  function lockScroll(duration = 1000) {
    activeScroll = true
    setTimeout(() => { activeScroll = false }, duration)
  }

  function scrollCarousel(direction) {
    if (activeScroll) return

    const { scrollLeft, scrollWidth, clientWidth, offsetWidth } = scrollContainer
    const atEnd   = scrollLeft + 2 >= scrollWidth - clientWidth
    const atStart = scrollLeft <= 0

    if (direction === 'right' && atEnd) {
      lockScroll()
      scrollContainer.scrollTo({ left: 0, behavior: 'smooth' })
    } else if (direction === 'left' && atStart) {
      visibleLength = LOADABLE_LENGTH
      setTimeout(() => {
        lockScroll()
        scrollContainer.scrollTo({ left: scrollWidth - clientWidth, behavior: 'smooth' })
      })
    } else {
      visibleLength = Math.min((visibleLength || previewLength) + previewLength, LOADABLE_LENGTH)
      setTimeout(() => {
        lockScroll(500)
        scrollContainer.scrollBy({ left: direction === 'right' ? offsetWidth : -offsetWidth, behavior: 'smooth' })
      })
    }
  }

  // ─── Scroll event: load more near the end ─────────────────────────────────

  function handleScroll() {
    if (!scrollContainer) return
    const { scrollWidth, clientWidth, scrollLeft } = scrollContainer
    const distanceFromEnd = scrollWidth - clientWidth - scrollLeft
    if (distanceFromEnd < 100) {
      visibleLength = Math.min((visibleLength || previewLength) + OVERFLOW_LENGTH, LOADABLE_LENGTH)
    }
  }

  // ─── Dynamic preview length from card widths ──────────────────────────────

  function recalcPreviewLength() {
    clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(() => {
      if (!scrollContainer) return
      const card = scrollContainer.querySelector('.small-card-ct, .full-card-ct, .episode-card')
      if (card) {
        previewLength = (Math.floor(scrollContainer.offsetWidth / card.offsetWidth) || DEFAULT_LENGTH) + OVERFLOW_LENGTH
      }
    }, 15)
  }

  // ─── Container observation ────────────────────────────────────────────────

  $: if (scrollContainer && !observer) {
    observer = new ResizeObserver(recalcPreviewLength)
    observer.observe(scrollContainer)
    window.addEventListener('resize', recalcPreviewLength)
    scrollContainer.addEventListener('scroll', handleScroll)
  }

  afterUpdate(recalcPreviewLength)

  onDestroy(() => {
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', recalcPreviewLength)
    scrollContainer?.removeEventListener('scroll', handleScroll)
  })
</script>

<span class='d-flex px-20 align-items-end text-decoration-none' class:mv-10={lastEpisode} use:deferredLoad>
  <div class='font-scale-24 font-weight-semi-bold glow text-muted pointer' aria-hidden='true' use:click={navigateToSearch}>
    {opts.title}
  </div>
  {#if !SUPPORTS.isAndroid}
    <div class='ml-auto pr-5 pl-5 font-size-12 glow text-muted pointer btn d-flex align-items-center justify-content-center' aria-hidden='true' use:click={() => scrollCarousel('left')}>
      <ChevronLeft strokeWidth='3' size='2rem' />
    </div>
    <div class='pr-5 pl-5 ml-10 font-size-12 glow text-muted pointer btn d-flex align-items-center justify-content-center' aria-hidden='true' use:click={() => scrollCarousel('right')}>
      <ChevronRight strokeWidth='3' size='2rem' />
    </div>
  {/if}
</span>

<div class='position-relative' class:isRSS={opts.isRSS}>
  <div class='pb-10 w-full d-flex flex-row justify-content-start gallery' use:dragScroll bind:this={scrollContainer}>
    {#each ($preview || fakecards).slice(0, visibleLength || previewLength) as card}
      <Card {card} variables={{ ...opts.variables, section: true }} />
    {/each}
    {#if $preview?.length}
      <ErrorCard promise={$preview[0].data} />
    {/if}
  </div>
</div>

<style>
  .btn {
    border-radius: 2rem;
  }

  /* ── First/last card tooltip offsets ── */
  .gallery :global(.small-card-ct:first-child) :global(.absolute-container) {
    left: -45% !important;
  }
  .gallery :global(.small-card-ct:last-child):not(:only-child) :global(.absolute-container) {
    right: -45% !important;
  }

  @media (max-width: 768px) {
    .gallery :global(.small-card-ct:first-child) :global(.absolute-container) {
      left: -35% !important;
    }
    .gallery :global(.small-card-ct:last-child:not(:only-child)) :global(.absolute-container) {
      right: -35% !important;
    }
  }

  /* ── Hover glow ── */
  @media (hover: hover) and (pointer: fine) {
    .glow:hover {
      color: var(--dm-link-text-color-hover) !important;
    }
  }

  /* ── Gallery ── */
  .gallery {
    overflow-x: scroll;
    flex-shrink: 0;
    min-height: 25rem;
    cursor: grab;
  }
  .gallery::-webkit-scrollbar {
    display: none;
  }
  .gallery:after {
    content: '';
    position: absolute;
    right: 0;
    height: 100%;
    width: 8rem;
    z-index: 30;
    background: var(--section-end-gradient);
    pointer-events: none;
  }
  .position-relative.isRSS .gallery::after {
    height: calc(100% - 15rem) !important;
    z-index: 1;
  }

  /* ── Card size ── */
  .gallery :global(.item.small-card) {
    width: 19rem !important;
  }

  /* ── last-episode overlap ── */
  .mv-10 {
    margin-top: -15rem !important;
    z-index: 0 !important;
  }
</style>