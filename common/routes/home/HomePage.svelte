<script context='module'>
  import SectionsManager, { sections } from '@/modules/sections.js'
  import { anilistClient, currentSeason, currentYear } from '@/modules/anilist.js'
  import { settings } from '@/modules/settings.js'
  import { uniqueStore } from '@/modules/util.js'
  import Helper from '@/modules/helper.js'
  import WPC from '@/modules/wpc.js'
  import { mediaCache } from '@/modules/cache.js'
  import { getMediaMaxEp } from '@/modules/anime/anime.js'
  import { writable } from 'simple-store-svelte'
  import { fade } from 'svelte/transition'
  import { playActive } from '@/components/TorrentButton.svelte'
  import { modal } from '@/modules/navigation.js'
  import { ELECTRON } from '@/modules/bridge.js'
  import { VolumeX, Volume2 } from 'lucide-svelte'

  // ─── Constants ──────────────────────────────────────────────────────────────

  export const CYCLE_SECTIONS = ['Continue Watching', 'Watching List', 'Planning List', 'Completed List']
  const BANNER_REFRESH_MS = 300_000

  // ─── Section manager ────────────────────────────────────────────────────────

  const manager = new SectionsManager()

  let mappedSections = {}
  mapSections()

  WPC.listen('remap-sections', () => {
    manager.clear()
    mappedSections = {}
    mapSections()
  })

  function mapSections() {
    for (const section of sections.value) mappedSections[section.title] = section
    for (const [title] of settings.value.homeSections) manager.add(mappedSections[title])
  }

  // ─── Exported stores ────────────────────────────────────────────────────────

  export const currentSectionIndex = writable(0)
  export const selectedIndex = writable(0)
  export const resolvedCatalog = writable([])

  // ─── Banner data ─────────────────────────────────────────────────────────────

  const isHentaiBanner = () => settings.value.adult === 'hentai' && settings.value.hentaiBanner

  function buildSearchParams() {
    return {
      method: 'Search',
      sort: 'TRENDING_DESC',
      perPage: 50,
      onList: false,
      status_not: 'NOT_YET_RELEASED',
      ...(isHentaiBanner() ? { genre: ['Hentai'] } : { season: currentSeason, year: currentYear }),
    }
  }

  async function fetchBannerTitles() {
    return anilistClient.search(buildSearchParams())
  }

  async function refreshBannerTitles() {
    const data = await fetchBannerTitles()
    bannerData.set(Promise.resolve(data))
  }

  export const bannerData = writable(fetchBannerTitles())
  setInterval(refreshBannerTitles, BANNER_REFRESH_MS)

  // ─── Section data resolution ─────────────────────────────────────────────────

  async function resolveItem(item, cache) {
    const resolved = typeof item.data?.then === 'function' ? await item.data : item.data
    const media = resolved?.media || resolved
    if (!media) return null
    const cachedMedia = cache[media.id] || {}
    return {
      ...item,
      ...media,
      ...cachedMedia,
      id: media.id || item.id,
      mediaListEntry: resolved?.media ? resolved : media.mediaListEntry,
    }
  }

  async function resolveData(data) {
    const raw = await data
    if (!raw) return []
    const cache = mediaCache?.value || {}
    const results = await Promise.all(raw.map(item => resolveItem(item, cache)))
    return results.filter(Boolean)
  }

  export async function loadSectionData(index) {
    const name = CYCLE_SECTIONS[index]
    const section = manager.sections.find(s => s.title === name && !s.hide)
    if (!section) return resolvedCatalog.set([])
    if (!section.preview.value) section.preview.value = section.load(1, 50, section.variables)
    resolvedCatalog.set(await resolveData(section.preview.value))
  }

  // ─── User list subscription ──────────────────────────────────────────────────

  function refreshSections(list, sectionTitles) {
    uniqueStore(list).subscribe(async _value => {
      const val = await _value
      if (!val) return
      for (const section of manager.sections) {
        if (sectionTitles.includes(section.title) && !section.hide) {
          section.preview.value = section.load(1, 50, section.variables)
          currentSectionIndex.update(n => n)
        }
      }
    })
  }

  if (Helper.getUser()) refreshSections(Helper.getClient().userLists, CYCLE_SECTIONS)

  // ─── Clock ───────────────────────────────────────────────────────────────────

  export const clock = writable('')
  setInterval(() => {
    const d = new Date()
    clock.set(
      d.getHours().toString().padStart(2, '0') + ':' +
      d.getMinutes().toString().padStart(2, '0')
    )
  }, 1000)
</script>

<script>
  import { page } from '@/modules/navigation.js'
  import { onMount, tick } from 'svelte'
  import { dragScroll } from '@/modules/click.js'

  // ─── Derived display values ──────────────────────────────────────────────────

  $: sectionName    = CYCLE_SECTIONS[$currentSectionIndex]
  $: animeList      = $resolvedCatalog
  $: selectedAnime  = animeList[$selectedIndex] || null

  $: banner      = selectedAnime?.bannerImage || selectedAnime?.coverImage?.extraLarge || ''
  $: bannerColor = selectedAnime?.coverImage?.color || '#bc0000'
  $: trailerId   = selectedAnime?.trailer?.id || selectedAnime?.trailer?.youtube_id || ''

  $: title      = selectedAnime?.title?.userPreferred || selectedAnime?.title?.romaji || ''
  $: titleWords = title.split(' ')
  $: titleFirst = titleWords.slice(0, Math.ceil(titleWords.length / 2)).join(' ')
  $: titleRest  = titleWords.slice(Math.ceil(titleWords.length / 2)).join(' ')

  $: description = selectedAnime?.description
    ? selectedAnime.description.replace(/<[^>]*>/g, '').slice(0, 160) + '...'
    : ''
  $: studio   = selectedAnime?.studios?.nodes?.[0]?.name || ''
  $: year     = selectedAnime?.seasonYear || ''
  $: progress = selectedAnime?.mediaListEntry?.progress || 0

  // ─── Trailer mute ────────────────────────────────────────────────────────────

  let muted = true
  let trailerHide = true
  const toggleMute = () => { muted = !muted }

  // ─── Shelf scroll-to-active ──────────────────────────────────────────────────

  let shelfContainer

  async function scrollToActive() {
    await tick()
    if (!shelfContainer) return
    const activeCard = shelfContainer.querySelector('.is-active')
    if (!activeCard) return
    const containerCenter = shelfContainer.offsetWidth / 2
    const cardCenter = activeCard.offsetLeft + activeCard.offsetWidth / 2
    shelfContainer.scrollTo({ left: cardCenter - containerCenter, behavior: 'smooth' })
  }

  $: if ($selectedIndex !== undefined) scrollToActive()

  // ─── Section cycling ─────────────────────────────────────────────────────────

  $: if ($currentSectionIndex !== undefined) {
    loadSectionData($currentSectionIndex).then(() => selectedIndex.set(0))
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function handleWatch() {
    if (!selectedAnime) return
    playActive(selectedAnime.hash, { media: selectedAnime, episode: selectedAnime.episode }, selectedAnime.link, !selectedAnime.link)
  }

  function handleDetails() {
    if (!selectedAnime) return
    modal.open(modal.ANIME_DETAILS, selectedAnime)
  }

  // ─── Keyboard handler ────────────────────────────────────────────────────────

  function handleKeydown(e) {
    if (!$resolvedCatalog?.length) return
    switch (e.key) {
      case 'ArrowRight':  e.preventDefault(); selectedIndex.update(n => Math.min(n + 1, $resolvedCatalog.length - 1)); break
      case 'ArrowLeft':   e.preventDefault(); selectedIndex.update(n => Math.max(n - 1, 0)); break
      case 'ArrowUp':     e.preventDefault(); currentSectionIndex.update(n => (n - 1 + CYCLE_SECTIONS.length) % CYCLE_SECTIONS.length); break
      case 'ArrowDown':   e.preventDefault(); currentSectionIndex.update(n => (n + 1) % CYCLE_SECTIONS.length); break
      case 'Enter':       e.preventDefault(); handleWatch(); break
      case 'Backspace':
      case 'Escape':      e.preventDefault(); handleDetails(); break
    }
  }

  onMount(() => {
    loadSectionData($currentSectionIndex)
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  })
</script>

<div class="home-theater" style="--accent-dynamic: {bannerColor};">

  {#if banner}
    <div in:fade={{duration: 250}} class="theater-bg" style="background-image: url({banner}); background-color: {bannerColor}40"></div>
  {/if}

  {#if selectedAnime}
    <div class="media-aside">
      <div class="curse-overlay"></div>
      <img class="bg-image" src={selectedAnime.bannerImage || selectedAnime.coverImage?.extraLarge || ''} alt="" />
      {#if trailerId}
        {#await ELECTRON.getYouTube() then youtubeServer}
          <div class="trailer-viewport" class:transparent={trailerHide}>
            <iframe
              title={title}
              loading="lazy"
              src={`${youtubeServer}/embed/${trailerId}?autoplay=1&controls=0&mute=${muted ? 1 : 0}&loop=1&playlist=${trailerId}`}
              on:load={() => { trailerHide = false }}
            ></iframe>
          </div>
        {/await}
      {/if}
    </div>
  {/if}

  <div class="vignette"></div>

  <header class="header">
    <div class="nav-cluster">
      <button class="brand" on:click={() => page.navigateTo(page.HOME)}>A/N</button>
      <nav class="nav-links">
        <button class="nav-item active">HOME</button>
        <button class="nav-item" on:click={() => page.navigateTo(page.SEARCH)}>LIBRARY</button>
        <button class="nav-item section-toggle" on:click={() => currentSectionIndex.update(n => (n + 1) % CYCLE_SECTIONS.length)}>
          {sectionName?.toUpperCase()}
        </button>
      </nav>
    </div>
    <div class="clock">{$clock}</div>
  </header>

  <main class="content-gate">
    {#if selectedAnime}
      <div class="meta-block" in:fade={{ duration: 200 }}>
        <h1 class="hero-title">{titleFirst}<br/><span class="accent">{titleRest}</span></h1>

        <div class="action-row">
          <button class="icon-btn" on:click={toggleMute}>
            {#if muted}<VolumeX size="1.3rem"/>{:else}<Volume2 size="1.3rem"/>{/if}
          </button>
        </div>

        <div class="stat-grid">
          <div class="stat">
            <span class="label">PROGRESS</span>
            <span class="value">{progress}<small>/{selectedAnime.episodes || '?'}</small></span>
          </div>
          {#if studio}<div class="stat"><span class="label">STUDIO</span><span class="value">{studio}</span></div>{/if}
          {#if year}<div class="stat"><span class="label">YEAR</span><span class="value">{year}</span></div>{/if}
        </div>

        <p class="synopsis">{description}</p>

        <div class="cta-row">
          <button class="btn-play" on:click={handleWatch}>WATCH NOW</button>
          <button class="btn-ghost" on:click={handleDetails}>DETAILS</button>
        </div>
      </div>
    {:else}
      <div class="loading-wrap">
        <div class="spinner" style="border-top-color: var(--accent-dynamic);"></div>
        <p>FETCHING {sectionName?.toUpperCase()}...</p>
      </div>
    {/if}
  </main>

  <section class="horizontal-shelf">
    <div class="scroll-wrapper" bind:this={shelfContainer} use:dragScroll>
      {#each animeList as anime, i (anime.id)}
        <button
          class="card-unit"
          class:is-active={i === $selectedIndex}
          on:click={() => selectedIndex.set(i)}
          style="--card-color: {anime.coverImage?.color || '#ffffff'}"
        >
          <img
            src={anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}
            alt=""
            loading="lazy"
          />
        </button>
      {/each}
    </div>
  </section>

</div>

<style>
  :global(body) { background: #050505; overflow: hidden; margin: 0; }
  /* Remove the blue focus ring on click/touch; keep it for keyboard navigation */
  :global(*:focus:not(:focus-visible)) { outline: none; }
  :global(*:focus-visible) { outline: 2px solid var(--accent-dynamic, #bc0000); outline-offset: 2px; }

  .home-theater { position: fixed; inset: 0; color: #fff; font-family: 'Noto Sans JP', sans-serif; }

  /* ── Background ── */
  .theater-bg { position: absolute; inset: 0; background-size: auto 80%; background-position: 15% top; background-repeat: no-repeat; opacity: 0.25; z-index: -1; pointer-events: none; }
  .vignette   { position: absolute; inset: 0; background: linear-gradient(to top, #050505 15%, transparent 100%), linear-gradient(to right, #050505 10%, transparent 60%); z-index: 0; }

  /* ── Media aside / trailer ── */
  .media-aside      { position: absolute; right: 0; top: 0; width: 60%; height: 100%; clip-path: polygon(25% 0, 100% 0, 100% 100%, 0% 100%); z-index: 1; background: #000; overflow: hidden; }
  .bg-image         { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(100%) opacity(0.4); }
  .curse-overlay    { position: absolute; inset: 0; background: linear-gradient(90deg, #050505 15%, rgba(5, 5, 5, 0.5) 40%, transparent 100%); z-index: 3; }
  .trailer-viewport { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; min-width: 177.77vh; min-height: 100%; z-index: 2; }
  .trailer-viewport iframe { width: 100%; height: 100%; border: 0; }
  .trailer-viewport.transparent { opacity: 0; transition: opacity 0.5s; }

  /* ── Header ── */
  .header      { position: relative; z-index: 100; display: flex; justify-content: space-between; padding: 2.5rem 4%; align-items: center; }
  .brand       { font-family: 'JetBrains Mono'; font-weight: 800; font-size: 1.5rem; background: none; border: none; color: #fff; cursor: pointer; }
  .nav-cluster { display: flex; align-items: center; gap: 3rem; }
  .nav-links   { display: flex; gap: 2.5rem; align-items: center; }
  .nav-item    { background: none; border: none; color: #fff; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.2em; opacity: 0.4; cursor: pointer; }
  .nav-item.active  { opacity: 1; color: var(--accent-dynamic); }
  .section-toggle   { opacity: 1; padding-left: 1.5rem; border-left: 1px solid rgba(255,255,255,0.15); color: #fff; }
  .clock       { font-family: 'JetBrains Mono'; font-size: 0.8rem; font-weight: 800; opacity: 0.5; }

  /* ── Content / meta ── */
  .content-gate { position: relative; z-index: 10; padding: 0 5%; margin-top: 5vh; min-height: 480px; width: 45%; }
  .hero-title   { font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 900; line-height: 0.85; letter-spacing: -3px; margin: 0 0 2rem; text-transform: uppercase; }
  .hero-title .accent { color: var(--accent-dynamic); }
  .action-row  { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; }
  .icon-btn    { background: transparent; border: none; cursor: pointer; color: #fff; opacity: 0.3; padding: 0; }
  .icon-btn:hover { opacity: 1; color: var(--accent-dynamic); }
  .stat-grid   { display: flex; gap: 4rem; margin-bottom: 2rem; }
  .stat        { display: flex; flex-direction: column; }
  .stat .label { font-size: 0.6rem; font-weight: 900; opacity: 0.3; letter-spacing: 0.2em; margin-bottom: 0.4rem; }
  .stat .value { font-family: 'JetBrains Mono'; font-size: 1.4rem; font-weight: 800; }
  .synopsis    { font-size: 0.9rem; line-height: 1.6; opacity: 0.4; max-width: 450px; margin-bottom: 2.5rem; }
  .cta-row     { display: flex; gap: 1rem; }
  .btn-play    { background: var(--accent-dynamic); color: #000; border: none; padding: 1rem 3rem; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.1em; cursor: pointer; }
  .btn-ghost   { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 1rem 2rem; font-weight: 900; font-size: 0.7rem; cursor: pointer; }
  .btn-ghost:hover { border-color: var(--accent-dynamic); }

  /* ── Loading ── */
  .loading-wrap { display: flex; flex-direction: column; gap: 1.5rem; padding-top: 6rem; opacity: 0.4; }
  .spinner      { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.1); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Horizontal shelf ── */
  .horizontal-shelf { position: absolute; bottom: 3rem; left: 0; width: 100%; padding: 0 5%; z-index: 20; overflow: hidden; }
  .scroll-wrapper   { display: flex; gap: 1.5rem; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 20px 0; }
  .scroll-wrapper::-webkit-scrollbar { display: none; }
  .card-unit        { flex: 0 0 190px; height: 270px; border: 3px solid transparent; cursor: pointer; padding: 0; background: #111; border-radius: 6px; overflow: hidden; transition: border-color 0.2s, transform 0.2s; outline: none; }
  .card-unit img    { width: 100%; height: 100%; object-fit: cover; opacity: 0.3; }
  .card-unit.is-active     { border-color: var(--card-color); box-shadow: 0 15px 40px rgba(0,0,0,0.9); z-index: 5; }
  .card-unit.is-active img { opacity: 1; }
</style>