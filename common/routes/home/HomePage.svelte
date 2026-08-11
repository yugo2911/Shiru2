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
  import { Play, ChevronLeft, ChevronRight, VolumeX, Volume2 } from 'lucide-svelte'

  export const filterMode = writable('section')
  export const refreshTrigger = writable(0)

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
      mediaListEntry: cachedMedia.mediaListEntry || (resolved?.media ? resolved.mediaListEntry : media.mediaListEntry),
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
        }
      }
      refreshTrigger.update(n => n + 1)
    })
    return unsubscribe
  }

  // ─── Episode Air Time ───────────────────────────────────────────────────────

  function getAirTime(anime) {
    const next = anime.nextAiringEpisode
    if (!next?.timeUntilAiring || next.timeUntilAiring <= 0) return null
    const diff = next.timeUntilAiring * 1000
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (days > 0) return `EP${next.episode} IN ${days}d ${hours}h`
    if (hours > 0) return `EP${next.episode} IN ${hours}h ${mins}m`
    return `EP${next.episode} IN ${mins}m`
  }

  function getRecentEp(anime) {
    const next = anime.nextAiringEpisode
    if (!next) return null
    if (next.timeUntilAiring <= 0 && next.timeUntilAiring >= -24 * 60 * 60) {
      if (next.episode > (anime.mediaListEntry?.progress || 0)) {
        return `NEW EP${next.episode}!!`
      }
    }
    return null
  }

  function getUpcoming(anime) {
    const next = anime.nextAiringEpisode
    if (!next || next.timeUntilAiring <= 0) return null
    if (next.timeUntilAiring > 24 * 60 * 60) return null
    return 'UPCOMING'
  }

  function getBehind(anime) {
    const next = anime.nextAiringEpisode
    const progress = anime.mediaListEntry?.progress ?? null
    if (!next || progress === null) return null
    const behind = Math.max(0, next.episode - 1 - progress)
    return behind > 0 ? behind : null
  }

  // ─── SFX ────────────────────────────────────────────────────────────────────────

  const sfx = {
    nav: new Audio('./audio/カーソル移動9.mp3'),
    section: new Audio('./audio/決定ボタンを押す22.mp3'),
    play: new Audio('./audio/決定ボタンを押す33.mp3'),
    menu: new Audio('./audio/カーソル移動6.mp3'),
    details: new Audio('./audio/カーソル移動12.mp3'),
  }

  function playSfx(sound) {
    sound.currentTime = 0
    sound.play().catch(() => {})
  }
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
  $: bannerColor = selectedAnime?.coverImage?.color || '#ff9f1c'
  $: trailerId   = selectedAnime?.trailer?.id || selectedAnime?.trailer?.youtube_id || ''

  $: title      = selectedAnime?.title?.userPreferred || selectedAnime?.title?.romaji || ''

  $: description = selectedAnime?.description
    ? selectedAnime.description.replace(/<[^>]*>/g, '').slice(0, 160) + '...'
    : ''
  $: studioNode = selectedAnime?.studios?.nodes?.[0] || null
  $: studio     = studioNode?.name || ''
  $: year       = selectedAnime?.seasonYear || ''
  $: genres     = selectedAnime?.genres?.slice(0, 3) || []
  $: progress   = selectedAnime?.mediaListEntry?.progress || 0
  $: watchBtnText = selectedAnime?.mediaListEntry?.status === 'COMPLETED' 
    ? 'Rewatch Now' 
    : selectedAnime?.mediaListEntry?.progress 
      ? 'Continue Now' 
      : 'Watch Now'

  // ─── Prefetch helper ─────────────────────────────────────────────────────────

  function maybePrefetch(anime) {
    if (!settings.value.rssAutoSelect || !anime?.id) return
    const episode = (anime.mediaListEntry?.progress ?? 0) + 1
    prefetchTorrent({ media: anime, episode })
  }

  // ─── Trailer ─────────────────────────────────────────────────────────────────

  let muted = settings.value.autoMuteTrailers
  let trailerLoaded = false
  const toggleMute = () => { muted = !muted }
  $: if (trailerId) trailerLoaded = false

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

  $: if ($refreshTrigger && $currentSectionIndex !== undefined) {
    loadSectionData($currentSectionIndex)
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
    playSfx(sfx.play)
    playActive(target.hash, { media: target, episode: target.episode }, target.link, !target.link)
  }

  function handleDetails() {
    if (!selectedAnime) return
    modal.open(modal.ANIME_DETAILS, selectedAnime)
  }

  function handleStudioClick() {
    if (!studioNode) return
    playSfx(sfx.nav)
    if (studioFilterId === studioNode.id) {
      studioFilterId = null
      studioFilterName = null
    } else {
      studioFilterId = studioNode.id
      studioFilterName = studioNode.name
    }
    selectedIndex.set(0)
  }

  // ─── Carousel step (shared by arrow buttons + keyboard) ───────────────────────

  function stepCard(delta) {
    if (!animeList?.length) return
    playSfx(sfx.nav)
    selectedIndex.update(n => Math.min(Math.max(n + delta, 0), animeList.length - 1))
  }

  // ─── Keyboard handler ────────────────────────────────────────────────────────

  function handleKeydown(e) {
    if (modal.length) return
    if (!animeList?.length) return
    switch (e.key) {
      case 'ArrowRight':  e.preventDefault(); e.stopPropagation(); stepCard(1); break
      case 'ArrowLeft':   e.preventDefault(); e.stopPropagation(); stepCard(-1); break
      case 'x':           e.preventDefault(); e.stopPropagation(); stepCard(1); break
      case 'z':           e.preventDefault(); e.stopPropagation(); stepCard(-1); break
      case 'ArrowUp':     e.preventDefault(); e.stopPropagation(); playSfx(sfx.section); currentSectionIndex.update(n => (n - 1 + $cycleList.length) % $cycleList.length); break
      case 'ArrowDown':   e.preventDefault(); e.stopPropagation(); playSfx(sfx.section); currentSectionIndex.update(n => (n + 1) % $cycleList.length); break
      case 'r':           e.preventDefault(); playSfx(sfx.section); currentSectionIndex.update(n => (n + 1) % $cycleList.length); break
      case 'm':           e.preventDefault(); toggleMute(); break
      case 's':           e.preventDefault(); modal.open(modal.SEARCH); break
      case 'Enter':       e.preventDefault(); handleWatch(); break
      case 'Backspace':   e.preventDefault(); handleDetails(); break
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

  {#if banner && !(trailerId && trailerLoaded)}
    {#key banner}
      <div in:fade={{duration: 120}} class="theater-bg" style="background-image: url({banner}); background-color: {bannerColor}40"></div>
    {/key}
  {/if}

  {#if selectedAnime && trailerId}
    {#await ELECTRON.getYouTube() then youtubeServer}
      <div class="trailer-viewport">
        <iframe
          title={title}
          loading="lazy"
          src={`${youtubeServer}/embed/${trailerId}?autoplay=1&controls=0&mute=${muted ? 1 : 0}&loop=1&playlist=${trailerId}`}
          on:load={() => { trailerLoaded = true }}
        ></iframe>
        {#if !trailerLoaded}
          <div class="trailer-cover" out:fade={{ duration: 400 }}></div>
        {/if}
      </div>
    {/await}
  {/if}

  <div class="vignette"></div>
  <div class="radial-glow"></div>

  <header class="header">
    <div class="nav-cluster">
      <nav class="nav-links">
        <button class="nav-item" class:active={$filterMode === 'section'} on:click={() => { playSfx(sfx.menu); filterMode.set('section'); pinnedAnime = null; selectedIndex.set(savedSectionIndex) }}>HOME</button>
        <button class="nav-item" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.SEARCH) }}>LIBRARY</button>
        <button class="nav-item" class:active={$filterMode === 'relations'} on:click={() => { playSfx(sfx.menu); enterMode('relations') }}>RELATIONS</button>
        <button class="nav-item" class:active={$filterMode === 'recommendations'} on:click={() => { playSfx(sfx.menu); enterMode('recommendations') }}>RECS</button>
        <button class="nav-item section-toggle" on:click={() => { playSfx(sfx.section); currentSectionIndex.update(n => (n + 1) % $cycleList.length) }}>
          {sectionName?.toUpperCase()}
        </button>
      </nav>
      {#if trailerId}
        <button class="icon-btn header-mute" on:click={toggleMute}>
          {#if muted}<VolumeX size="1.1rem"/>{:else}<Volume2 size="1.1rem"/>{/if}
        </button>
      {/if}
    </div>
  </header>

  <main class="content-gate">
    {#if selectedAnime}
      {#key selectedAnime.id}
        <div class="meta-block" in:fade={{ duration: 120 }}>
          <div class="hero-icon" style="background: var(--accent-dynamic);">
            <Play size="1.4rem" fill="#fff" color="#fff" />
          </div>

          <h1 class="hero-title">{title}</h1>

          <p class="hero-subtitle">
            {#if studio}{studio}{/if}{#if studio && year} &middot; {/if}{#if year}{year}{/if}
          </p>

          {#if progress > 0}
            <div class="stat-pill">
              <span>PROGRESS {progress}<small>/{selectedAnime.episodes || '?'}</small></span>
            </div>
          {/if}

          <div class="cta-row">
            <button
              class="btn-play"
              on:click={handleWatch}
              on:mouseenter={() => maybePrefetch(selectedAnime)}
            >{watchBtnText}</button>
          </div>

          <p class="synopsis">{description}</p>
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
    <button class="shelf-arrow shelf-arrow-left" on:click={() => stepCard(-1)} disabled={$selectedIndex <= 0} aria-label="Previous">
      <ChevronLeft size="1.6rem" />
    </button>

    <div class="scroll-wrapper" bind:this={shelfContainer} use:dragScroll>
      {#each animeList as anime, i (anime.id)}
        {@const progress = anime.mediaListEntry?.progress ?? 0}
        {@const total = anime.episodes || anime.nextAiringEpisode?.episode - 1 || null}
        {@const color = anime.coverImage?.color || '#ffffff'}
        {@const isParent = pinnedAnime && i === 0 && ($filterMode === 'relations' || $filterMode === 'recommendations')}
        {@const airTime = getAirTime(anime)}
        {@const recentEp = getRecentEp(anime)}
        {@const upcoming = getUpcoming(anime)}
        {@const behind = getBehind(anime)}
        <button
          class="card-unit"
          class:is-active={i === $selectedIndex}
          class:card-pinned={isParent}
          on:click={() => { playSfx(sfx.nav); selectedIndex.set(i) }}
          on:mouseenter={() => maybePrefetch(anime)}
          style="--card-color: {color}"
        >
          <img
            src={anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''}
            alt=""
            loading="lazy"
          />
          {#if upcoming || recentEp || behind}
            <div class="card-badges" style="--badge-color: {color}">
              {#if behind}<span class="badge badge-behind">BEHIND {behind}</span>{/if}
              {#if upcoming}<span class="badge badge-upcoming">{upcoming}</span>{/if}
              {#if recentEp}<span class="badge badge-new">{recentEp}</span>{/if}
            </div>
          {/if}
          <div class="card-info">
            {#if isParent}<p class="card-label">{$filterMode === 'relations' ? 'RELATIONS FOR' : 'RECS FOR'}</p>{/if}
            <p class="card-title">{anime.title?.userPreferred || anime.title?.romaji || ''}</p>
            {#if airTime}
              <p class="card-air" style="color: {color}">{airTime}</p>
            {/if}
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

    <button class="shelf-arrow shelf-arrow-right" on:click={() => stepCard(1)} disabled={$selectedIndex >= animeList.length - 1} aria-label="Next">
      <ChevronRight size="1.6rem" />
    </button>
  </section>

  {#if selectedAnime}
    <div class="shelf-caption">
      <button class="caption-title" style="color: var(--accent-dynamic);" on:click={() => { playSfx(sfx.details); handleDetails() }}>{title}</button>
      {#if studio}
        <p class="caption-byline">
          By: <button class="caption-studio" class:studio-active={studioFilterId === studioNode?.id} on:click={handleStudioClick}>{studio}</button>
        </p>
      {/if}
      {#if genres.length}
        <p class="caption-genres">
          {#each genres as genre, i}
            <span class="caption-genre-link">{genre}</span>{#if i < genres.length - 1}<span class="caption-sep"> &middot; </span>{/if}
          {/each}
        </p>
      {/if}
    </div>
  {/if}

</div>

<style>
  :global(body) { background: #14141a; overflow: hidden; margin: 0; color: #fff; font-family: system-ui, sans-serif; }
  :global(*:focus:not(:focus-visible)) { outline: none; }
  :global(*:focus-visible) { outline: 4px solid #00c3e3; outline-offset: 2px; border-radius: 8px; }

  .home-theater { position: fixed; inset: 0; color: #fff; font-family: system-ui, sans-serif; display: flex; flex-direction: column; }

  /* ── Background ── */
  .theater-bg { position: absolute; inset: 0; background-size: cover; background-position: center top; background-repeat: no-repeat; opacity: 0.14; z-index: -2; pointer-events: none; filter: blur(2px); }
  .radial-glow { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 0%, var(--accent-dynamic) 0%, transparent 55%); opacity: 0.16; z-index: -1; pointer-events: none; }
  .vignette { position: absolute; inset: 0; background: linear-gradient(to bottom, #14141a 0%, transparent 30%, transparent 60%, #14141a 100%); z-index: 0; pointer-events: none; }

  /* ── Trailer (kept subtle, sits behind everything now) ── */
  .trailer-viewport { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 177.77vh; min-width: 100%; height: 56.25vw; min-height: 100%; z-index: -3; }
  .trailer-viewport iframe { width: 100%; height: 100%; border: 0; pointer-events: none; }
  .trailer-cover { position: absolute; inset: 0; background: #14141a; z-index: 1; }

  /* ── Header ── */
  .header { position: relative; z-index: 100; display: flex; justify-content: center; padding: 1.5rem 4% 0; align-items: center; }
  .nav-cluster { display: flex; align-items: center; gap: 1rem; }
  .nav-links { display: flex; gap: 2rem; align-items: center; background: rgba(255,255,255,0.06); padding: 10px 24px; border-radius: 50px; backdrop-filter: blur(6px); }
  .nav-item { background: none; border: none; color: #fff; font-weight: 800; font-size: 0.75rem; letter-spacing: 0.1em; opacity: 0.5; cursor: pointer; text-transform: uppercase; }
  .nav-item.active { opacity: 1; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); }
  .section-toggle { opacity: 1; padding-left: 1.5rem; border-left: 2px solid rgba(255,255,255,0.2); color: #fff; }

  /* ── Content / centered hero ── */
  .content-gate { position: relative; z-index: 10; padding: 1.5rem 5% 0; width: 100%; box-sizing: border-box; display: flex; justify-content: center; flex: 0 0 auto; }
  .meta-block { display: flex; flex-direction: column; align-items: center; text-align: center; max-width: 620px; }

  .hero-icon { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 1.2rem; box-shadow: 0 6px 20px rgba(0,0,0,0.4); }

  .hero-title { font-size: clamp(2rem, 4.2vw, 3rem); font-weight: 900; line-height: 1; letter-spacing: -1px; margin: 0 0 0.6rem; }
  .hero-subtitle { font-size: 1.05rem; opacity: 0.7; font-weight: 600; margin: 0 0 1.4rem; text-transform: uppercase; letter-spacing: 0.05em; }

  .stat-pill { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); border-radius: 50px; padding: 0.4rem 1.2rem; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 1.4rem; }

  .cta-row { display: flex; justify-content: center; margin-bottom: 1.2rem; }
  .btn-play { background: var(--accent-dynamic) !important; color: #14141a; border: 3px solid transparent; border-radius: 50px; padding: 0.95rem 2.6rem; font-weight: 900; font-size: 1rem; letter-spacing: 0.05em; cursor: pointer; transition: transform 0.1s, border 0.1s; }
  .btn-play:hover { transform: scale(1.05); border-color: #fff; }

  .synopsis { font-size: 0.95rem; line-height: 1.5; opacity: 0.6; max-width: 520px; margin: 0; }

  .icon-btn { background: #fff; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; color: #14141a; opacity: 0.9; padding: 0; transition: transform 0.1s; }
  .icon-btn:hover { transform: scale(1.1); color: #e60012; }
  /* ── Loading ── */
  .loading-wrap { display: flex; flex-direction: column; gap: 1.2rem; padding-top: 3rem; opacity: 0.8; align-items: center; }
  .spinner { width: 30px; height: 30px; border: 4px solid rgba(255,255,255,0.2); border-top-color: var(--accent-dynamic); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Horizontal shelf (carousel with arrows) ── */
  .horizontal-shelf {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    width: 100%;
    padding: 1.5rem 0 0.5rem;
    flex: 1 1 auto;
    min-height: 0;
  }
  .shelf-arrow {
    flex: 0 0 auto;
    width: 44px; height: 44px;
    border-radius: 50%;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.1);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    margin: 0 1.2rem;
    transition: background 0.15s, transform 0.1s;
  }
  .shelf-arrow:hover:not(:disabled) { background: var(--accent-dynamic); color: #14141a; transform: scale(1.08); }
  .shelf-arrow:disabled { opacity: 0.25; cursor: default; }

  .scroll-wrapper {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    overflow-x: auto;
    overflow-y: visible;
    scrollbar-width: none;
    padding: 100px 5% 30px;
    scroll-padding: 5%;
    flex: 1 1 auto;
  }
  .scroll-wrapper::-webkit-scrollbar { display: none; }

  .card-unit {
    flex: 0 0 220px;
    height: 300px;
    border: 4px solid transparent;
    cursor: pointer;
    padding: 0;
    background: #232329;
    border-radius: 14px;
    overflow: hidden;
    transition: border-color 0.15s, transform 0.15s, opacity 0.15s;
    outline: none;
    position: relative;
    box-sizing: border-box;
    opacity: 0.55;
    transform: scale(1);
    transform-origin: center bottom;
  }
  .card-unit img { width: 100%; height: 100%; object-fit: cover; opacity: 0.6; transition: opacity 0.2s; display: block; }

  .card-unit.is-active {
    border-color: var(--card-color) !important;
    transform: scale(1.18) translateY(-14px);
    z-index: 5;
    box-shadow: 0 14px 24px rgba(0,0,0,0.7), 0 0 12px var(--card-color);
    opacity: 1;
  }
  .card-unit.is-active img { opacity: 1; }
  .card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 3rem 1rem 1rem; background: linear-gradient(to top, rgba(0,0,0,0.95) 30%, transparent); pointer-events: none; opacity: 0; transition: opacity 0.15s; }
  .card-unit.is-active .card-info { opacity: 1; }
  .card-title { font-size: 1.05rem; font-weight: 900; line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 0.4rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #fff; text-transform: uppercase; }
  .card-progress { height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; margin: 0.6rem 0; overflow: hidden; }
  .card-progress-bar { height: 100%; border-radius: 10px; background: var(--card-color) !important; opacity: 0.8; }
  .card-ep { font-size: 0.8rem; font-weight: 900; color: var(--card-color); margin: 0; letter-spacing: 0.05em; text-transform: uppercase; }
  .card-air { font-size: 0.75rem; font-weight: 900; margin: 0.6rem 0 0; letter-spacing: 0.05em; text-transform: uppercase; }

  .card-badges { position: absolute; top: 10px; right: 10px; display: flex; flex-direction: column; gap: 6px; z-index: 10; }
  .badge { font-size: 0.65rem; font-weight: 900; padding: 4px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 2px 8px rgba(0,0,0,0.5); }
  .badge-upcoming { background: var(--badge-color); color: #000; }
  .badge-new { background: var(--badge-color); color: #fff; }
  .badge-behind { background: var(--badge-color); color: #000; }

  /* ── Pinned parent card ── */
  .card-pinned:not(.is-active) { opacity: 0.4; }
  .card-label { font-size: 0.6rem; font-weight: 900; letter-spacing: 0.18em; color: var(--card-color); margin: 0 0 0.3rem; text-transform: uppercase; opacity: 0.9; }

  /* ── Caption under carousel ── */
  .shelf-caption { position: relative; z-index: 20; text-align: center; padding: 0 5% 2rem; flex: 0 0 auto; }
  .caption-title { display: block; margin: 0 auto 0.3rem; font-weight: 800; font-size: 1.05rem; background: none; border: none; cursor: pointer; padding: 0; }
  .caption-byline { margin: 0 0 0.3rem; font-size: 0.9rem; opacity: 0.85; }
  .caption-studio { background: none; border: none; color: #fff; font-weight: 700; cursor: pointer; padding: 0; text-decoration: underline; text-underline-offset: 2px; }
  .caption-studio.studio-active { color: var(--accent-dynamic); }
  .caption-genres { margin: 0; font-size: 0.85rem; opacity: 0.6; }
  .caption-genre-link { }
  .caption-sep { opacity: 0.5; }
</style>