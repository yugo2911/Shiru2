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
  import { prefetchTorrent } from '@/modals/torrent/components/TorrentResults.svelte'
  import { modal } from '@/modules/navigation.js'
  import { ELECTRON } from '@/modules/bridge.js'
  import { VolumeX, Volume2 } from 'lucide-svelte'

  export const filterMode = writable('section')

  // ─── Constants ──────────────────────────────────────────────────────────────

  export const cycleList = writable([])

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
      mediaListEntry: resolved?.media ? resolved.mediaListEntry : media.mediaListEntry,
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
    const unsubscribe = uniqueStore(list).subscribe(async _value => {
      const val = await _value
      if (!val) return
      for (const section of manager.sections) {
        if (sectionTitles.includes(section.title) && !section.hide) {
          section.preview.value = section.load(1, 50, section.variables)
          currentSectionIndex.update(n => n)
        }
      }
    })
    return unsubscribe
  }

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
  import { onMount, onDestroy, tick } from 'svelte'
  import { dragScroll } from '@/modules/click.js'

  // ─── Derived display values ──────────────────────────────────────────────────

  $: sectionName = $cycleList[$currentSectionIndex]

  let studioFilterId = null
  let studioFilterName = null

  let relationsData = []
  let recommendationsData = []
  let relationsLoadedFor = null
  let recommendationsLoadedFor = null

  let pinnedAnime = null
  let savedSectionIndex = 0

  $: catalogAnime = studioFilterId
    ? $resolvedCatalog?.filter(a => a.studios?.nodes?.some(n => n.id === studioFilterId))
    : $resolvedCatalog

  $: animeList = ($filterMode === 'relations' || $filterMode === 'recommendations')
    ? [pinnedAnime, ...($filterMode === 'relations' ? relationsData : recommendationsData)].filter(Boolean)
    : catalogAnime || []

  $: if ($filterMode === 'relations' && pinnedAnime?.id && relationsLoadedFor !== pinnedAnime.id) {
    loadRelations(pinnedAnime.id)
  }
  $: if ($filterMode === 'recommendations' && pinnedAnime?.id && recommendationsLoadedFor !== pinnedAnime.id) {
    loadRecommendations(pinnedAnime.id)
  }

  async function loadRelations(id) {
    try {
      relationsData = []
      relationsLoadedFor = id
      const res = await anilistClient.searchAllIDS({ page: 1, perPage: 50, id: [id] })
      const fullMedia = res?.data?.Page?.media?.[0]
      if (!fullMedia?.relations?.edges) {
        relationsData = []
        return
      }
      const relationIds = fullMedia.relations.edges
        .filter(({ node, relationType }) =>
          relationType !== 'CHARACTER' &&
          node.type === 'ANIME' &&
          node.format !== 'MUSIC' &&
          !(settings.value.adult === 'none' && node.isAdult) &&
          !(settings.value.adult !== 'hentai' && node.genres?.includes('Hentai'))
        )
        .map(({ node }) => node.id)
        .filter(Boolean)
      if (relationIds.length === 0) {
        relationsData = []
        return
      }
      const res2 = await anilistClient.searchAllIDS({ page: 1, perPage: 50, id: relationIds })
      relationsData = res2?.data?.Page?.media?.filter(m => m) || []
    } catch (e) {
      relationsData = []
    }
  }

  async function loadRecommendations(id) {
    try {
      recommendationsData = []
      recommendationsLoadedFor = id
      const res = await anilistClient.recommendations({ id })
      const recs = res?.data?.Media?.recommendations?.edges
        ?.filter(({ node }) => node.mediaRecommendation)
        ?.filter(({ node }) =>
          !(settings.value.adult === 'none' && node.mediaRecommendation.isAdult) &&
          !(settings.value.adult !== 'hentai' && node.mediaRecommendation.genres?.includes('Hentai'))
        )
        ?.sort((a, b) => b.node.rating - a.node.rating)
        ?.map(({ node }) => node.mediaRecommendation) || []

      if (recs.length === 0) {
        recommendationsData = []
        return
      }
      const ids = recs.map(r => r.id)
      const res2 = await anilistClient.searchAllIDS({ page: 1, perPage: 50, id: ids })
      recommendationsData = res2?.data?.Page?.media?.filter(m => m) || []
    } catch (e) {
      recommendationsData = []
    }
  }

  $: selectedAnime = animeList?.[$selectedIndex] || null

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
  $: studioNode = selectedAnime?.studios?.nodes?.[0] || null
  $: studio     = studioNode?.name || ''
  $: year       = selectedAnime?.seasonYear || ''
  $: progress   = selectedAnime?.mediaListEntry?.progress || 0

  // ─── Prefetch helper ─────────────────────────────────────────────────────────

  function maybePrefetch(anime) {
    if (!settings.value.rssAutoSelect || !anime?.id) return
    const episode = (anime.mediaListEntry?.progress ?? 0) + 1
    prefetchTorrent({ media: anime, episode })
  }

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
    filterMode.set('section')
    pinnedAnime = null
    loadSectionData($currentSectionIndex).then(() => selectedIndex.set(0))
  }

  // ─── Mode switching ──────────────────────────────────────────────────────────

  function enterMode(mode) {
    if ($filterMode === mode) {
      filterMode.set('section')
      pinnedAnime = null
      selectedIndex.set(savedSectionIndex)
      return
    }
    const current = catalogAnime?.[$selectedIndex] || null
    if (!current) return
    savedSectionIndex = $selectedIndex
    pinnedAnime = current
    relationsData = []
    recommendationsData = []
    filterMode.set(mode)
    selectedIndex.set(0)
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  function handleWatch() {
    const target = selectedAnime || pinnedAnime
    if (!target) return
    playActive(target.hash, { media: target, episode: target.episode }, target.link, !target.link)
  }

  function handleDetails() {
    if (!selectedAnime) return
    modal.open(modal.ANIME_DETAILS, selectedAnime)
  }

  function handleStudioClick() {
    if (!studioNode) return
    if (studioFilterId === studioNode.id) {
      studioFilterId = null
      studioFilterName = null
    } else {
      studioFilterId = studioNode.id
      studioFilterName = studioNode.name
    }
    selectedIndex.set(0)
  }

  // ─── Keyboard handler ────────────────────────────────────────────────────────

  function handleKeydown(e) {
    if ($modal[modal.SEARCH]) return
    if (!animeList?.length) return
    switch (e.key) {
      case 'ArrowRight':  e.preventDefault(); selectedIndex.update(n => Math.min(n + 1, animeList.length - 1)); break
      case 'ArrowLeft':   e.preventDefault(); selectedIndex.update(n => Math.max(n - 1, 0)); break
      case 'ArrowUp':     e.preventDefault(); currentSectionIndex.update(n => (n - 1 + $cycleList.length) % $cycleList.length); break
      case 'ArrowDown':   e.preventDefault(); currentSectionIndex.update(n => (n + 1) % $cycleList.length); break
      case 'r':           e.preventDefault(); currentSectionIndex.update(n => (n + 1) % $cycleList.length); break
      case 'm':           e.preventDefault(); toggleMute(); break
      case 's':           e.preventDefault(); modal.open(modal.SEARCH); break
      case 'Enter':       e.preventDefault(); handleWatch(); break
      case 'Backspace':
      case 'Escape':      e.preventDefault(); handleDetails(); break
    }
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  let cleanupRefreshSections

  onMount(() => {
    loadSectionData($currentSectionIndex)
    window.addEventListener('keydown', handleKeydown)
    if (Helper.getUser()) {
      cleanupRefreshSections = refreshSections(Helper.getClient().userLists, cycleList.value)
    }
    return () => window.removeEventListener('keydown', handleKeydown)
  })

  onDestroy(() => {
    cleanupRefreshSections?.()
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
      <button class="brand" on:click={() => { page.navigateTo(page.HOME); filterMode.set('section'); pinnedAnime = null }}>A/N</button>
      <nav class="nav-links">
        <button class="nav-item" class:active={$filterMode === 'section'} on:click={() => { filterMode.set('section'); pinnedAnime = null; selectedIndex.set(savedSectionIndex) }}>HOME</button>
        <button class="nav-item" on:click={() => page.navigateTo(page.SEARCH)}>LIBRARY</button>
        <button class="nav-item" class:active={$filterMode === 'relations'} on:click={() => enterMode('relations')}>RELATIONS</button>
        <button class="nav-item" class:active={$filterMode === 'recommendations'} on:click={() => enterMode('recommendations')}>RECS</button>
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
          {#if studio}
            <div class="stat">
              <span class="label">STUDIO</span>
              <button
                class="value studio-btn"
                class:studio-active={studioFilterId === studioNode?.id}
                on:click={handleStudioClick}
              >{studio}</button>
            </div>
          {/if}
          {#if year}<div class="stat"><span class="label">YEAR</span><span class="value">{year}</span></div>{/if}
        </div>

        <p class="synopsis">{description}</p>

        <div class="cta-row">
          <button
            class="btn-play"
            on:click={handleWatch}
            on:mouseenter={() => maybePrefetch(selectedAnime)}
          >WATCH NOW</button>
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
        {@const isParent = pinnedAnime && i === 0 && ($filterMode === 'relations' || $filterMode === 'recommendations')}
        <button
          class="card-unit"
          class:is-active={i === $selectedIndex}
          class:card-pinned={isParent}
          on:click={() => selectedIndex.set(i)}
          on:mouseenter={() => maybePrefetch(anime)}
          style="--card-color: {color}"
        >
          <img
            src={anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}
            alt=""
            loading="lazy"
          />
          <div class="card-info">
            {#if isParent}<p class="card-label">{$filterMode === 'relations' ? 'RELATIONS FOR' : 'RECS FOR'}</p>{/if}
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
  :global(body) { 
    background: #050505; 
    overflow: hidden; 
    margin: 0; 
    color: #fff; 
    font-family: "Hiragino Mincho ProN", "MS Mincho", serif; 
    background-image: radial-gradient(circle at center, rgba(255,255,255,0.05) 0%, transparent 70%);
  }
  :global(*:focus:not(:focus-visible)) { outline: none; }
  :global(*:focus-visible) { outline: 2px solid #fff; outline-offset: 4px; }

  .home-theater { position: fixed; inset: 0; color: #fff; }

  /* ── Background & Particles ── */
  .theater-bg { 
    position: absolute; 
    inset: 0; 
    background-size: cover; 
    background-position: center; 
    opacity: 0.15; 
    z-index: -1; 
    filter: blur(4px) contrast(1.2);
    pointer-events: none; 
  }
  .vignette { 
    position: absolute; 
    inset: 0; 
    background: 
      radial-gradient(circle at 30% 50%, transparent 0%, #050505 85%),
      linear-gradient(to top, #050505 10%, transparent 50%); 
    z-index: 0; 
  }

  /* ── Magic Hexagram / Sacred Geometry Overlay ── */
  .theater-bg::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" opacity="0.1"><path d="M50 5 L95 80 L5 80 Z" fill="none" stroke="white" stroke-width="0.5"/><path d="M50 95 L5 20 L95 20 Z" fill="none" stroke="white" stroke-width="0.5"/></svg>');
    background-repeat: no-repeat;
    background-position: center;
    background-size: 60vh;
    animation: rotateSlow 60s linear infinite;
  }

  @keyframes rotateSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

  /* ── Media aside / trailer ── */
  .media-aside { 
    position: absolute; 
    right: 0; 
    top: 0; 
    width: 65%; 
    height: 100%; 
    clip-path: polygon(25% 0, 100% 0, 100% 100%, 0% 100%); 
    z-index: 1; 
    background: #000; 
    overflow: hidden; 
    border-left: 1px solid rgba(255,255,255,0.1);
  }
  .bg-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: brightness(0.6) sepia(0.2); }
  .curse-overlay { position: absolute; inset: 0; background: linear-gradient(90deg, #050505 0%, transparent 40%); z-index: 3; }
  .trailer-viewport { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 100%; height: 100%; min-width: 177.77vh; min-height: 100%; z-index: 2; }
  .trailer-viewport iframe { width: 100%; height: 100%; border: 0; }
  .trailer-viewport.transparent { opacity: 0; transition: opacity 1s cubic-bezier(0.4, 0, 0.2, 1); }

  /* ── Header ── */
  .header { 
    position: relative; 
    z-index: 100; 
    display: flex; 
    justify-content: space-between; 
    padding: 1.5rem 4%; 
    align-items: center; 
    background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
  }
  .brand { 
    font-family: serif;
    font-weight: 400; 
    font-size: 1.2rem; 
    background: none;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 0; 
    padding: 8px 24px; 
    color: #fff; 
    cursor: pointer; 
    letter-spacing: 0.3em;
    text-transform: uppercase;
    transition: all 0.3s;
  }
  .brand:hover { background: #fff; color: #000; box-shadow: 0 0 15px rgba(255,255,255,0.5); }
  .nav-cluster { display: flex; align-items: center; gap: 2rem; }
  .nav-links { display: flex; gap: 2.5rem; align-items: center; padding: 10px 0; }
  .nav-item { 
    background: none; 
    border: none; 
    color: #fff; 
    font-weight: 400; 
    font-size: 0.7rem; 
    letter-spacing: 0.2em; 
    opacity: 0.4; 
    cursor: pointer; 
    text-transform: uppercase;
    transition: opacity 0.3s, transform 0.3s;
  }
  .nav-item.active { 
    opacity: 1; 
    transform: translateY(-2px);
    text-shadow: 0 0 8px rgba(255,255,255,0.8); 
  }
  .section-toggle { opacity: 1; padding-left: 1.5rem; border-left: 1px solid rgba(255,255,255,0.2); }

  .clock { font-family: monospace; font-size: 0.9rem; letter-spacing: 0.1em; opacity: 0.6; }

  /* ── Content / Meta ── */
  .content-gate { position: relative; z-index: 10; padding: 0 5%; margin-top: 8vh; width: 45%; }
  .hero-title { 
    font-family: serif;
    font-size: clamp(3rem, 5vw, 5rem); 
    font-weight: 400; 
    line-height: 1.1; 
    letter-spacing: 0.05em; 
    margin: 0 0 2rem; 
    text-transform: uppercase; 
  }
  .hero-title .accent { 
    color: #fff !important; 
    text-shadow: 0 0 20px var(--accent-dynamic), 0 0 40px var(--accent-dynamic);
  }
  .action-row { display: flex; align-items: center; gap: 2rem; margin-bottom: 2rem; }
  .icon-btn { 
    background: transparent; 
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 50%; 
    width: 50px; 
    height: 50px; 
    display: flex; 
    align-items: center; 
    justify-content: center; 
    cursor: pointer; 
    color: #fff; 
    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); 
  }
  .icon-btn:hover { background: #fff; color: #000; transform: scale(1.1) rotate(10deg); }
  
  .stat-grid { 
    display: flex; 
    gap: 4rem; 
    margin-bottom: 2.5rem; 
    border-left: 2px solid var(--accent-dynamic);
    padding: 0.5rem 2rem;
  }
  .stat .label { font-size: 0.6rem; font-weight: 400; opacity: 0.5; letter-spacing: 0.2em; margin-bottom: 0.5rem; }
  .stat .value { font-family: serif; font-size: 1.6rem; font-weight: 400; }

  .studio-btn {
    background: none; border: none; color: inherit;
    font-size: 1rem; font-weight: 400;
    cursor: pointer; padding: 0; letter-spacing: 0.1em;
    transition: all 0.3s;
  }
  .studio-btn:hover { color: var(--accent-dynamic); padding-left: 10px; }
  .studio-active { color: var(--accent-dynamic) !important; font-style: italic; }

  .synopsis {
    font-size: 1rem; 
    line-height: 1.8; 
    opacity: 0.8; 
    max-width: 500px; 
    margin-bottom: 3rem;
    position: relative;
  }

  .cta-row { display: flex; gap: 2rem; }
  .btn-play { 
    background: #fff !important; 
    color: #000; 
    border: none;
    padding: 1.2rem 4rem; 
    font-weight: 600; 
    font-size: 0.8rem; 
    letter-spacing: 0.3em; 
    cursor: pointer; 
    text-transform: uppercase;
    transition: all 0.4s; 
    box-shadow: 0 10px 30px rgba(255,255,255,0.1);
  }
  .btn-play:hover { background: var(--accent-dynamic) !important; color: #fff; transform: translateY(-5px); box-shadow: 0 15px 40px var(--accent-dynamic); }
  .btn-ghost { 
    background: transparent; 
    color: #fff; 
    border: 1px solid rgba(255,255,255,0.3);
    padding: 1.2rem 3rem; 
    font-size: 0.8rem; 
    letter-spacing: 0.2em;
    cursor: pointer; 
    text-transform: uppercase;
    transition: all 0.3s; 
  }
  .btn-ghost:hover { background: rgba(255,255,255,0.05); border-color: #fff; }

  /* ── Loading ── */
  .loading-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 60vh; width: 100%; }
  .spinner { 
    width: 60px; 
    height: 60px; 
    border: 1px solid rgba(255,255,255,0.1); 
    border-top: 1px solid var(--accent-dynamic); 
    border-radius: 50%; 
    animation: spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite; 
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Horizontal shelf ── */
  .horizontal-shelf { position: absolute; bottom: 0; left: 0; width: 100%; padding: 0 0 3rem 5%; z-index: 20; }
  .scroll-wrapper { display: flex; gap: 1.5rem; overflow-x: auto; padding: 20px 0; mask-image: linear-gradient(to right, black 80%, transparent); }
  .card-unit { 
    flex: 0 0 240px; 
    height: 340px; 
    cursor: pointer; 
    background: #111; 
    border-radius: 0; 
    overflow: hidden; 
    transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1); 
    position: relative; 
    border: 1px solid rgba(255,255,255,0.05);
  }
  .card-unit img { width: 100%; height: 100%; object-fit: cover; opacity: 0.4; transition: all 0.6s cubic-bezier(0.23, 1, 0.32, 1); }
  .card-unit.is-active { 
    transform: scale(1.05) translateY(-20px); 
    border-color: var(--card-color);
    box-shadow: 0 30px 60px rgba(0,0,0,0.9);
    z-index: 5;
  }
  .card-unit.is-active img { opacity: 1; transform: scale(1.1); }
  
  .card-info { 
    position: absolute; 
    bottom: 0; 
    left: 0; 
    right: 0; 
    padding: 2rem 1rem 1rem; 
    background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); 
  }
  .card-title { 
    font-family: serif;
    font-size: 1.1rem; 
    font-weight: 400; 
    letter-spacing: 0.05em; 
    margin: 0; 
    color: #fff; 
    text-transform: uppercase; 
  }
  .card-progress { height: 1px; background: rgba(255, 255, 255, 0.1); margin: 1rem 0; overflow: hidden; }
  .card-progress-bar { height: 100%; background: var(--card-color) !important; box-shadow: 0 0 10px var(--card-color); }
  .card-ep { font-family: monospace; font-size: 0.7rem; color: var(--card-color); letter-spacing: 0.2em; text-transform: uppercase; }

  /* ── Pinned parent card ── */
  .card-pinned:not(.is-active) { opacity: 0.4; filter: grayscale(1); }
  .card-label { font-size: 0.5rem; letter-spacing: 0.4em; color: var(--card-color); margin-bottom: 0.5rem; text-transform: uppercase; opacity: 0.8; }

</style>