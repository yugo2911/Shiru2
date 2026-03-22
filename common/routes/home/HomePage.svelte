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

  export const cycleList = writable([])
  const BANNER_REFRESH_MS = 300_000

  // ─── Section manager ────────────────────────────────────────────────────────

  const manager = new SectionsManager()

  let mappedSections = {}

  function buildCycleList() {
    const titles = settings.value.homeSections.map(([title]) => title)
    cycleList.set(titles)
    return titles
  }

  sections.subscribe(value => {
    if (value?.length) {
      mappedSections = {}
      for (const section of value) mappedSections[section.title] = section
      manager.clear()
      for (const title of buildCycleList()) {
        if (mappedSections[title]) manager.add(mappedSections[title])
      }
    }
  })

  WPC.listen('remap-sections', () => {
    manager.clear()
    mappedSections = {}
    if (sections.value?.length) {
      for (const section of sections.value) mappedSections[section.title] = section
      for (const title of buildCycleList()) {
        if (mappedSections[title]) manager.add(mappedSections[title])
      }
    }
  })

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
    const name = cycleList.value[index]
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

  if (Helper.getUser()) refreshSections(Helper.getClient().userLists, cycleList.value)

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

  $: sectionName    = $cycleList[$currentSectionIndex]
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
    if ($modal[modal.SEARCH]) return
    if (!$resolvedCatalog?.length) return
    switch (e.key) {
      case 'ArrowRight':  e.preventDefault(); selectedIndex.update(n => Math.min(n + 1, $resolvedCatalog.length - 1)); break
      case 'ArrowLeft':   e.preventDefault(); selectedIndex.update(n => Math.max(n - 1, 0)); break
      case 'ArrowUp':     e.preventDefault(); currentSectionIndex.update(n => (n - 1 + $cycleList.length) % $cycleList.length); break
      case 'ArrowDown':   e.preventDefault(); currentSectionIndex.update(n => (n + 1) % $cycleList.length); break
      case 'm':           e.preventDefault(); toggleMute(); break
      case 's':           e.preventDefault(); modal.open(modal.SEARCH); break
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
    {#key banner}
      <div in:fade={{duration: 120}} class="theater-bg" style="background-image: url({banner}); background-color: {bannerColor}40"></div>
    {/key}
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
        <button class="nav-item section-toggle" on:click={() => currentSectionIndex.update(n => (n + 1) % $cycleList.length)}>
          {sectionName?.toUpperCase()}
        </button>
      </nav>
    </div>
    <div class="clock">{$clock}</div>
  </header>

  <main class="content-gate">
    {#if selectedAnime}
      {#key selectedAnime.id}
        <div class="meta-block" in:fade={{ duration: 120 }}>
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
      {/key}
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
        {@const progress = anime.mediaListEntry?.progress ?? 0}
        {@const total = anime.episodes || anime.nextAiringEpisode?.episode - 1 || null}
        {@const color = anime.coverImage?.color || '#ffffff'}
        <button
          class="card-unit"
          class:is-active={i === $selectedIndex}
          on:click={() => selectedIndex.set(i)}
          style="--card-color: {color}"
        >
          <img
            src={anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}
            alt=""
            loading="lazy"
          />
          <div class="card-info">
            <p class="card-title">{anime.title?.userPreferred || anime.title?.romaji || ''}</p>
            {#if progress > 0}
              <div class="card-progress">
                <div class="card-progress-bar" style="width: {total ? (progress / total) * 100 : 0}%; background: {color};"></div>
              </div>
              <p class="card-ep">{progress}{total ? `/${total}` : ''} ep</p>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </section>

</div>

<style>
  :global(body) { background: #2b2b2b; overflow: hidden; margin: 0; color: #fff; font-family: system-ui, sans-serif; }
  :global(*:focus:not(:focus-visible)) { outline: none; }
  :global(*:focus-visible) { outline: 4px solid #00c3e3; outline-offset: 2px; border-radius: 8px; }

  .home-theater { position: fixed; inset: 0; color: #fff; font-family: system-ui, sans-serif; }

  /* ── Background ── */
  .theater-bg { position: absolute; inset: 0; background-size: auto 80%; background-position: 15% top; background-repeat: no-repeat; opacity: 0.1; z-index: -1; pointer-events: none; }
  .vignette { position: absolute; inset: 0; background: linear-gradient(to top, #2b2b2b 15%, transparent 100%), linear-gradient(to right, #2b2b2b 10%, transparent 60%); z-index: 0; }

  /* ── Media aside / trailer ── */
  .media-aside { position: absolute; right: 0; top: 0; width: 60%; height: 100%; clip-path: polygon(15% 0, 100% 0, 100% 100%, 0% 100%); z-index: 1; background: #2b2b2b; overflow: hidden; }
  .bg-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: grayscale(20%) opacity(0.5); }
  .curse-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, #2b2b2b 15%, rgba(43,43,43,0.5) 40%, transparent 100%); z-index: 3; }
  .trailer-viewport { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; min-width: 177.77vh; min-height: 100%; z-index: 2; }
  .trailer-viewport iframe { width: 100%; height: 100%; border: 0; }
  .trailer-viewport.transparent { opacity: 0; transition: opacity 0.5s; }

  /* ── Header ── */
  .header { position: relative; z-index: 100; display: flex; justify-content: space-between; padding: 2rem 4%; align-items: center; border-bottom: 2px solid rgba(255,255,255,0.05); }
  .brand { font-weight: 900; font-size: 1.5rem; background: #e60012; border-radius: 50px; padding: 6px 20px; border: none; color: #fff; cursor: pointer; }
  .nav-cluster { display: flex; align-items: center; gap: 3rem; }
  .nav-links { display: flex; gap: 2rem; align-items: center; background: rgba(0,0,0,0.3); padding: 10px 24px; border-radius: 50px; }
  .nav-item { background: none; border: none; color: #fff; font-weight: 800; font-size: 0.75rem; letter-spacing: 0.1em; opacity: 0.5; cursor: pointer; text-transform: uppercase; }
  .nav-item.active { opacity: 1; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); }
  .section-toggle { opacity: 1; padding-left: 1.5rem; border-left: 2px solid rgba(255,255,255,0.2); color: #fff; }
  
  .clock { font-size: 1.1rem; font-weight: 700; opacity: 0.8; }

  /* ── Content / meta ── */
  .content-gate { position: relative; z-index: 10; padding: 0 5%; margin-top: 5vh; min-height: 400px; width: 55%; }
  .hero-title { font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 900; line-height: 0.95; letter-spacing: -2px; margin: 0 0 1.5rem; text-transform: uppercase; }
  .hero-title .accent { color: var(--accent-dynamic) !important; }
  .action-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem; }
  .icon-btn { background: #fff; border-radius: 50%; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: #2b2b2b; opacity: 0.9; padding: 0; transition: transform 0.1s; }
  .icon-btn:hover { transform: scale(1.1); color: #e60012; }
  .stat-grid { display: flex; gap: 3rem; margin-bottom: 1.8rem; background: rgba(0,0,0,0.4); padding: 1.2rem 2rem; border-radius: 12px; width: fit-content; border: 1px solid rgba(255,255,255,0.05); }
  .stat { display: flex; flex-direction: column; }
  .stat .label { font-size: 0.7rem; font-weight: 800; opacity: 0.6; letter-spacing: 0.12em; margin-bottom: 0.3rem; text-transform: uppercase; }
  .stat .value { font-size: 1.4rem; font-weight: 800; }
  
  .synopsis { 
    font-size: 1.15rem; line-height: 1.6; opacity: 0.95; max-width: 650px; margin-bottom: 2.5rem; 
    background: rgba(0, 0, 0, 0.4); 
    padding: 1.5rem 2rem; border-radius: 16px; 
  }

  .cta-row { display: flex; gap: 1.5rem; }
  .btn-play { background: var(--accent-dynamic) !important; color: #fff; border: 3px solid transparent; border-radius: 50px; padding: 1.1rem 3rem; font-weight: 900; font-size: 1rem; letter-spacing: 0.05em; cursor: pointer; transition: transform 0.1s, border 0.1s; }
  .btn-play:hover { transform: scale(1.05); border-color: #fff; }
  .btn-ghost { background: rgba(255,255,255,0.1); color: #fff; border: 3px solid transparent; border-radius: 50px; padding: 1.1rem 3rem; font-weight: 900; font-size: 1rem; cursor: pointer; transition: background 0.1s; }
  .btn-ghost:hover { background: rgba(255,255,255,0.2); border-color: #00c3e3; }

  /* ── Loading ── */
  .loading-wrap { display: flex; flex-direction: column; gap: 1.5rem; padding-top: 6rem; opacity: 0.8; align-items: flex-start; }
  .spinner { width: 30px; height: 30px; border: 4px solid rgba(255,255,255,0.2); border-top-color: var(--accent-dynamic); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Horizontal shelf ── */
  .horizontal-shelf { position: absolute; bottom: 0; left: 0; width: 100%; padding: 0 5% 2rem; z-index: 20; overflow: hidden; }
  .scroll-wrapper { display: flex; gap: 2rem; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 40px 0; }
  .scroll-wrapper::-webkit-scrollbar { display: none; }
  .card-unit { flex: 0 0 280px; height: 380px; border: 5px solid transparent; cursor: pointer; padding: 0; background: #3c3c3c; border-radius: 16px; overflow: hidden; transition: border-color 0.15s, transform 0.15s; outline: none; position: relative; }
  .card-unit img { width: 100%; height: 100%; object-fit: cover; opacity: 0.5; transition: opacity 0.2s; display: block; }
  .card-unit.is-active { border-color: var(--card-color) !important; transform: scale(1.08) translateY(-10px); z-index: 5; box-shadow: 0 20px 40px rgba(0,0,0,0.8); }
  .card-unit.is-active img { opacity: 1; }
  .card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 4rem 1.2rem 1.2rem; background: linear-gradient(to top, rgba(0,0,0,0.98) 30%, transparent); pointer-events: none; }
  .card-title { font-size: 1.3rem; font-weight: 900; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 0.5rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #fff; text-transform: uppercase; }
  .card-progress { height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; margin: 0.8rem 0; overflow: hidden; }
  .card-progress-bar { height: 100%; border-radius: 10px; background: var(--card-color) !important; opacity: 0.8; }
  .card-ep { font-size: 0.9rem; font-weight: 900; color: var(--card-color); margin: 0; letter-spacing: 0.05em; text-transform: uppercase; }
</style>