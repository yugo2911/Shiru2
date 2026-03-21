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
  import { episodesList } from '@/modules/episodes.js'
  import { ELECTRON } from '@/modules/bridge.js'
  import { VolumeX, Volume2, Target, Zap } from 'lucide-svelte'

  const bannerData = writable(getTitles())
  setInterval(() => getTitles(true), 300000)

  async function getTitles(refresh) {
    const res = anilistClient.search({ 
      method: 'Search', 
      ...(settings.value.adult === 'hentai' && settings.value.hentaiBanner ? { genre: ['Hentai'] } : {}), 
      sort: 'TRENDING_DESC', perPage: 50, onList: false, 
      ...(settings.value.adult !== 'hentai' || !settings.value.hentaiBanner ? { season: currentSeason } : {}), 
      year: currentYear, status_not: 'NOT_YET_RELEASED' 
    })
    if (refresh) {
      const renderData = await res
      bannerData.set(Promise.resolve(renderData))
    }
    else return res
  }

  let mappedSections = {}
  const manager = new SectionsManager()
  mapSections()
  
  WPC.listen('remap-sections', () => {
    manager.clear(); mappedSections = {}; mapSections()
  })

  function mapSections() {
    for (const section of sections.value) mappedSections[section.title] = section
    for (const sectionTitle of settings.value.homeSections) manager.add(mappedSections[sectionTitle[0]])
  }

  const resolveData = async (data) => {
    const raw = await data
    if (!raw) return []
    const cache = mediaCache?.value || {}
    const results = await Promise.all(
      raw.map(async item => {
        const resolved = item.data && typeof item.data.then === 'function' ? await item.data : item.data
        const media = resolved?.media || resolved
        if (!media) return null
        const cachedMedia = cache[media.id] || {}
        return { 
          ...item, 
          ...media,
          ...cachedMedia,
          id: media.id || item.id,
          mediaListEntry: resolved?.media ? resolved : media.mediaListEntry 
        }
      })
    )
    return results.filter(Boolean)
  }

  export const CYCLE_SECTIONS = ['Continue Watching', 'Watching List', 'Planning List', 'Completed List']
  export const currentSectionIndex = writable(0)
  export const selectedIndex = writable(0)
  export const resolvedCatalog = writable([])

  if (Helper.getUser()) {
    refreshSections(Helper.getClient().userLists, CYCLE_SECTIONS)
  }

  function refreshSections(list, sectionTitles) {
    uniqueStore(list).subscribe(async (_value) => {
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

  export async function loadSectionData(index) {
    const name = CYCLE_SECTIONS[index]
    const section = manager.sections.find(s => s.title === name && !s.hide)
    if (!section) return resolvedCatalog.set([])
    
    if (!section.preview.value) {
      section.preview.value = section.load(1, 50, section.variables)
    }

    const items = await resolveData(section.preview.value)
    resolvedCatalog.set(items)
  }

  let clock = writable('')
  setInterval(() => {
    const d = new Date()
    clock.set(d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'))
  }, 1000)
</script>

<script>
  import { page } from '@/modules/navigation.js'
  import { onMount } from 'svelte'
  import { dragScroll } from '@/modules/click.js'

  $: sectionName = CYCLE_SECTIONS[$currentSectionIndex]
  $: animeList = $resolvedCatalog
  $: selectedAnime = animeList[$selectedIndex] || null
  $: banner = selectedAnime?.bannerImage || selectedAnime?.coverImage?.extraLarge || ''
  $: bannerColor = selectedAnime?.coverImage?.color || ''
  $: title = selectedAnime?.title?.userPreferred || selectedAnime?.title?.romaji || ''
  $: titleWords = title.split(' ')
  $: titleFirst = titleWords.slice(0, Math.ceil(titleWords.length / 2)).join(' ')
  $: titleRest = titleWords.slice(Math.ceil(titleWords.length / 2)).join(' ')
  $: description = selectedAnime?.description?.replace(/<[^>]*>/g, '').slice(0, 160) + '...' || ''
  $: studio = selectedAnime?.studios?.nodes?.[0]?.name || ''
  $: year = selectedAnime?.seasonYear || ''
  $: score = selectedAnime?.averageScore || 0
  $: maxEp = getMediaMaxEp(selectedAnime) || '??'
  $: progress = selectedAnime?.mediaListEntry?.progress || 0
  $: isFavourite = selectedAnime?.isFavourite || false
  $: trailerId = selectedAnime?.trailer?.id || selectedAnime?.trailer?.youtube_id || ''

  let muted = true
  let trailerHide = true
  const toggleMute = () => muted = !muted

  let shelfContainer

  // Scroll the active card into view whenever selectedIndex changes
  $: if (shelfContainer && $selectedIndex !== undefined) {
    const cards = shelfContainer.querySelectorAll('.card-unit')
    const activeCard = cards[$selectedIndex]
    if (activeCard) {
      activeCard.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
  }
  const toggleFavourite = () => {
    if (!selectedAnime) return
    selectedAnime.isFavourite = anilistClient.favourite({ id: selectedAnime.id })
    isFavourite = selectedAnime.isFavourite
  }
  
  $: if ($currentSectionIndex !== undefined) {
    loadSectionData($currentSectionIndex)
    selectedIndex.set(0)
  }

  function handleWatch() {
    if (!selectedAnime) return
    playActive(selectedAnime.hash, { media: selectedAnime, episode: selectedAnime.episode }, selectedAnime.link, !selectedAnime.link)
  }

  function handleDetails() {
    if (!selectedAnime) return
    modal.open(modal.ANIME_DETAILS, selectedAnime)
  }

  let navigating = false
  async function navigateRight() {
    if (navigating) return
    navigating = true
    try {
      const idx = selectedIndex.value ?? 0
      const count = resolvedCatalog.value?.length ?? 0
      if (idx < count - 1) {
        selectedIndex.set(idx + 1)
      } else {
        await loadSectionData($currentSectionIndex)
        const newCount = resolvedCatalog.value?.length ?? 0
        if (newCount > count) selectedIndex.set(idx + 1)
      }
    } finally {
      navigating = false
    }
  }

  function handleKeydown(e) {
    const count = resolvedCatalog.value?.length ?? 0
    if (!count) return

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault()
        e.stopPropagation()
        navigateRight()
        break
      case 'ArrowLeft':
        e.preventDefault()
        e.stopPropagation()
        selectedIndex.update(n => Math.max(n - 1, 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        e.stopPropagation()
        currentSectionIndex.update(n => (n - 1 + CYCLE_SECTIONS.length) % CYCLE_SECTIONS.length)
        break
      case 'ArrowDown':
        e.preventDefault()
        e.stopPropagation()
        currentSectionIndex.update(n => (n + 1) % CYCLE_SECTIONS.length)
        break
      case 'Enter':
        e.preventDefault()
        handleWatch()
        break
      case 'Backspace':
      case 'Escape':
        e.preventDefault()
        handleDetails()
        break
    }
  }

  onMount(() => {
    setTimeout(() => loadSectionData($currentSectionIndex), 400)
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  })
</script>

<div class="home-theater">
  {#key banner}
    <div in:fade={{duration: 400}} class="theater-bg" style="background-image: url({banner}); background-color: {bannerColor}40"></div>
  {/key}
  
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
              on:load={() => setTimeout(() => trailerHide = false, 500)}
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
      {#key selectedAnime.id}
        <div class="meta-block" in:fade={{ duration: 300 }}>
          <div class="badge-row">
            <span class="studio-tag">ELIMINATION FILE</span>
          </div>
          <h1 class="hero-title">
            {titleFirst}<br/>
            <span class="accent">{titleRest}</span>
          </h1>
          
          <div class="action-row">
            <button class="icon-btn" on:click={toggleMute}>
              {#if muted}<VolumeX size="1.3rem"/>{:else}<Volume2 size="1.3rem"/>{/if}
            </button>
          </div>

          <div class="data-grid">
            <div class="data-row"><Target size="12" class="mr-2"/> TARGETS <span class="data-value">{maxEp}</span></div>
            <div class="data-row"><Zap size="12" class="mr-2"/> SYNC <span class="data-value">{score}%</span></div>
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
        <div class="spinner"></div>
        <p>FETCHING {sectionName?.toUpperCase()}...</p>
      </div>
    {/if}
  </main>

  <section class="horizontal-shelf">
    <div class="scroll-wrapper" bind:this={shelfContainer} use:dragScroll>
      {#each animeList as anime, i (anime.id)}
        <button class="card-unit" class:is-active={i === $selectedIndex} on:click={() => selectedIndex.set(i)}>
          <img src={anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium || ''} alt="" loading="lazy" />
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  :global(body) { background: #050505; overflow: hidden; }
  .home-theater { position: fixed; inset: 0; color: #fff; font-family: 'Noto Sans JP', sans-serif; }
  .theater-bg { position: absolute; inset: 0; background-size: auto 100%; background-position: 15% center; background-repeat: no-repeat; opacity: 0.25; z-index: -1; }
  
  .media-aside {
    position: absolute;
    right: 0;
    top: 0;
    width: 60%;
    height: 100%;
    clip-path: polygon(25% 0, 100% 0, 100% 100%, 0% 100%);
    z-index: 1;
    background: #000;
    overflow: hidden;
  }
  .bg-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(100%) opacity(0.4);
  }
  .curse-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, #050505 15%, rgba(5, 5, 5, 0.5) 40%, transparent 100%);
    z-index: 3;
  }
  .trailer-viewport {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    height: 100%;
    min-width: 177.77vh;
    min-height: 100%;
    z-index: 2;
  }
  .trailer-viewport iframe {
    width: 100%;
    height: 100%;
    border: 0;
  }
  .trailer-viewport.transparent { opacity: 0; transition: opacity 1.5s; }
  
  .vignette { position: absolute; inset: 0; background: linear-gradient(to top, #050505 15%, transparent 100%), linear-gradient(to right, #050505 10%, transparent 60%); z-index: 0; }
  .header { position: relative; z-index: 100; display: flex; justify-content: space-between; padding: 2.5rem 4%; align-items: center; }
  .brand { font-family: 'JetBrains Mono'; font-weight: 800; font-size: 1.5rem; background: none; border: none; color: #fff; cursor: pointer; }
  .nav-cluster { display: flex; align-items: center; gap: 3rem; }
  .nav-links { display: flex; gap: 2.5rem; align-items: center; }
  .nav-item { background: none; border: none; color: #fff; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.2em; opacity: 0.4; cursor: pointer; }
  .nav-item.active { opacity: 1; }
  .section-toggle { opacity: 1; padding-left: 1.5rem; border-left: 1px solid rgba(255,255,255,0.15); color: #fff; }
  .clock { font-family: 'JetBrains Mono'; font-size: 0.8rem; font-weight: 800; opacity: 0.5; }
  .content-gate { position: relative; z-index: 10; padding: 0 5%; margin-top: 5vh; min-height: 480px; width: 45%; }
  .hero-title { font-size: clamp(2.5rem, 6vw, 4.5rem); font-weight: 900; line-height: 0.85; letter-spacing: -3px; margin: 1.5rem 0 2rem; text-transform: uppercase; filter: drop-shadow(0 0 10px rgba(0,0,0,0.5)); }
  .hero-title .accent { color: #bc0000; }
  
  .action-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 2rem; }
  .icon-btn { background: transparent; border: none; cursor: pointer; color: #fff; opacity: 0.3; padding: 0; }
  .icon-btn:hover { opacity: 1; }
  
  .data-grid { display: flex; gap: 2rem; margin-bottom: 2rem; }
  .data-row { border-bottom: 1px solid rgba(255,255,255,0.05); padding: 12px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #666; }
  .data-value { color: #bc0000; float: right; font-weight: 800; }
  
  .stat-grid { display: flex; gap: 4rem; margin-bottom: 2rem; }
  .stat { display: flex; flex-direction: column; }
  .stat .label { font-size: 0.6rem; font-weight: 900; opacity: 0.3; letter-spacing: 0.2em; margin-bottom: 0.4rem; }
  .stat .value { font-family: 'JetBrains Mono'; font-size: 1.4rem; font-weight: 800; }
  .synopsis { font-size: 0.9rem; line-height: 1.6; opacity: 0.4; max-width: 450px; margin-bottom: 2.5rem; }
  .cta-row { display: flex; gap: 1rem; }
  .btn-play { background: #fff; color: #000; border: none; padding: 1rem 3rem; font-weight: 900; font-size: 0.7rem; letter-spacing: 0.1em; cursor: pointer; }
  .btn-ghost { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 1rem 2rem; font-weight: 900; font-size: 0.7rem; cursor: pointer; }
  .horizontal-shelf { position: absolute; bottom: 3rem; left: 0; width: 100%; padding: 0 5%; z-index: 20; }
  .scroll-wrapper { display: flex; gap: 1rem; overflow-x: auto; scrollbar-width: none; }
  .card-unit { flex: 0 0 140px; height: 200px; border: none; cursor: pointer; padding: 0; background: #111; position: relative; transition: transform 0.2s ease-out; }
  .card-unit img { width: 100%; height: 100%; object-fit: cover; opacity: 0.3; transition: opacity 0.2s; }
  .card-unit.is-active { transform: translateY(-10px); }
  .card-unit.is-active img { opacity: 1; }
  .loading-wrap { display: flex; flex-direction: column; gap: 1.5rem; padding-top: 6rem; opacity: 0.4; }
  .spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .badge-row { display: flex; gap: 1rem; font-size: 0.7rem; font-weight: 900; opacity: 0.5; }
</style>