<script context='module'>
  import SectionsManager, { sections } from '@/modules/sections.js'
  import { anilistClient, currentSeason, currentYear } from '@/modules/anilist.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { settings } from '@/modules/settings.js'
  import { uniqueStore } from '@/modules/util.js'
  import equal from 'fast-deep-equal/es6'
  import { RSSManager } from '@/modules/rss.js'
  import Helper from '@/modules/helper.js'
  import WPC from '@/modules/wpc.js'
  import { writable } from 'simple-store-svelte'
  import Debug from 'debug'
  const debug = Debug('ui:home')

  const bannerData = writable(getTitles())
  setInterval(() => getTitles(true), 5 * 60 * 1000)

  async function getTitles(refresh) {
    const res = anilistClient.search({ method: 'Search', ...(settings.value.adult === 'hentai' && settings.value.hentaiBanner ? { genre: ['Hentai'] } : {}), sort: 'TRENDING_DESC', perPage: 50, onList: false, ...(settings.value.adult !== 'hentai' || !settings.value.hentaiBanner ? { season: currentSeason } : {}), year: currentYear, status_not: 'NOT_YET_RELEASED' })
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
    manager.clear()
    mappedSections = {}
    mapSections()
  })

  function mapSections() {
    for (const section of sections.value) mappedSections[section.title] = section
    for (const sectionTitle of settings.value.homeSections) manager.add(mappedSections[sectionTitle[0]])
  }

  const continueWatching = 'Continue Watching'
  const resolveData = async (data) => Promise.all(
    data.map(async item => {
      const resolved = item.data && typeof item.data.then === 'function' ? await item.data : item.data
      const media = resolved?.media || resolved
      return { ...item, data: (media ? { id: media.id, idMal: media.idMal, title: media.title, bannerImage: media.bannerImage, isAdult: media.isAdult, duration: media.duration, episodes: media.episodes, format: media.format } : resolved) }
    })
  )
  if (Helper.getUser()) {
    refreshSections(Helper.getClient().userLists, ['Dubbed Releases', 'Subbed Releases', 'Hentai Releases'], true)
    refreshSections(Helper.getClient().userLists, [continueWatching, 'Sequels You Missed', 'Stories You Missed', 'Planning List', 'Completed List', 'Paused List', 'Dropped List', 'Watching List', 'Rewatching List'])
  }
  if (Helper.isMalAuth()) refreshSections(animeSchedule.subAiredLists, continueWatching)
  refreshSections(animeSchedule.dubAiredLists, continueWatching)
  function refreshSections(list, sections, schedule = false) {
    uniqueStore(list).subscribe(async (_value) => {
      const value = await _value
      if (!value) return
      for (const section of manager.sections) {
        if (sections.includes(section.title) && !section.hide && (!schedule || section.isSchedule)) {
          const loaded = section.load(1, 50, section.variables)
          if (!section.preview.value || !equal(await resolveData(loaded), await resolveData(section.preview.value))) section.preview.value = loaded
        }
      }
    })
  }

  WPC.listen('feedChanged', ({ updateFeeds, manifest }) => {
    for (const section of manager.sections) {
      try {
        if (section.isSchedule && updateFeeds.includes(section.title)) {
          animeSchedule.feedChanged(section.title.includes('Subbed') ? 'Sub' : section.title.includes('Dubbed') ? 'Dub' : 'Hentai', false, true, manifest).then((changed) => {
            if (changed) section.preview.value = section.load(1, 50, section.variables)
          })
        }
      } catch (error) {
        debug(`Failed to update ${section.title} feed:`, error)
      }
    }
  })

  window.addEventListener('fileEdit', async () => {
    for (const section of manager.sections) {
      if (section.isRSS && !section.isSchedule) {
        const url = settings.value.rssFeedsNew.find(([feedTitle]) => feedTitle === section.title)?.[1]
        if (url) {
          const loaded = RSSManager.getMediaForRSS(1, 12, url, false, true)
          if (!section.preview.value || !equal(await resolveData(loaded), await resolveData(section.preview.value))) section.preview.value = loaded
        }
      }
    }
  })

  const isPreviousRSS = (i) => {
    let index = i - 1
    while (index >= 0) {
      if (!manager.sections[index]?.hide) return manager.sections[index]?.isRSS ?? false
      else if ((index - 1 >= 0) && manager.sections[index - 1]?.isRSS) return true
      index--
    }
    return false
  }

  export const CYCLE_SECTIONS = ['Continue', 'Planning', 'Completed']
  export const currentSectionIndex = writable(0)
  export const selectedIndex = writable(0)
  export const resolvedCatalog = writable([])

  export function cycleSection() {
    currentSectionIndex.update(i => (i + 1) % CYCLE_SECTIONS.length)
  }

  export function selectAnime(index) {
    selectedIndex.set(index)
  }

  function loadSectionData(index) {
    const sectionName = CYCLE_SECTIONS[index]
    const targetSection = manager.sections.find(s => s.title === sectionName && !s.hide)
    
    if (!targetSection?.preview?.value) {
      resolvedCatalog.set([])
      return
    }

    Promise.all(targetSection.preview.value.map(async (item) => {
      const resolved = item.data && typeof item.data.then === 'function' ? await item.data : item.data
      if (resolved?.media) {
        return { ...item, resolved }
      }
      return { ...item, resolved }
    })).then(items => {
      resolvedCatalog.set(items.filter(item => item.resolved).map(item => {
        const media = item.resolved.media || item.resolved
        return {
          ...media,
          progress: media.mediaListEntry?.progress || 0,
          status: media.mediaListEntry?.status || item.resolved.status,
          listEntry: media.mediaListEntry
        }
      }))
    })
  }

  let clock = ''
  function updateClock() {
    const d = new Date()
    clock = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0')
  }
  updateClock()
  setInterval(updateClock, 1000)
</script>

<script>
  import { page } from '@/modules/navigation.js'
  import { onMount } from 'svelte'

  $: sectionName = CYCLE_SECTIONS[$currentSectionIndex]
  $: animeList = $resolvedCatalog
  $: selectedAnime = animeList[$selectedIndex] || null
  $: banner = selectedAnime?.bannerImage || ''
  $: cover = selectedAnime?.coverImage?.large || selectedAnime?.coverImage?.medium || ''
  $: title = selectedAnime?.title?.userPreferred || selectedAnime?.title?.romaji || selectedAnime?.title?.english || ''
  $: description = selectedAnime?.description?.replace(/<[^>]*>/g, '').slice(0, 200) || ''
  $: studio = selectedAnime?.studios?.nodes?.[0]?.name || ''
  $: year = selectedAnime?.seasonYear || ''
  $: score = selectedAnime?.averageScore ? (selectedAnime.averageScore / 10).toFixed(1) : ''
  $: episodes = selectedAnime?.episodes || 0
  $: progress = selectedAnime?.progress || 0

  $: if ($currentSectionIndex !== undefined) {
    loadSectionData($currentSectionIndex)
    selectedIndex.set(0)
  }

  function navigateTo(name) {
    if (name === 'HOME') page.navigateTo(page.HOME)
    else if (name === 'LIBRARY') page.navigateTo(page.SEARCH)
    else if (name === 'DISCOVER') page.navigateTo(page.SEARCH)
  }
</script>

<svelte:head>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
</svelte:head>

<div class="home-theater">
  <div class="theater-bg" style="background-image: url({banner})"></div>
  <div class="vignette"></div>

  <header class="header">
    <nav class="nav-links">
      <button class="nav-logo" on:click={() => navigateTo('HOME')}>
        <img src="https://anilist.co/img/icons/android-chrome-512x512.png" alt="Logo" />
      </button>
      <button class="nav-item active" on:click={() => navigateTo('HOME')}>HOME</button>
      <button class="nav-item" on:click={() => navigateTo('LIBRARY')}>LIBRARY</button>
      <button class="nav-item" on:click={() => navigateTo('DISCOVER')}>DISCOVER</button>
      <button class="section-cycler" on:click={cycleSection}>
        <span class="section-label">{sectionName}</span>
      </button>
    </nav>
    <div class="clock">{clock}</div>
  </header>

  <div class="details-engine" class:show={selectedAnime}>
    {#if selectedAnime}
      <div class="glass-pill">
        <span class="accent">{studio}</span>
        {#if studio && year}
          <span class="separator">//</span>
        {/if}
        <span>{year}</span>
      </div>

      <h1 class="editorial-title">{title}</h1>

      <div class="meta-row">
        {#if score}
          <span class="score">★ {score}</span>
          <div class="divider"></div>
        {/if}
        {#if episodes}
          <span class="episodes">{progress}/{episodes} eps</span>
          <div class="divider"></div>
        {/if}
      </div>

      {#if description}
        <p class="description">{description}</p>
      {/if}

      <div class="action-buttons">
        {#if sectionName === 'Continue Watching' && progress > 0}
          <button class="btn-primary">RESUME</button>
        {/if}
        <button class="btn-secondary">LIST SETTINGS</button>
      </div>
    {/if}
  </div>

  <div class="shelf-container">
    {#each animeList as anime, i}
      <button
        class="media-card"
        class:active={i === $selectedIndex}
        on:click={() => selectAnime(i)}
      >
        <img 
          src={anime.coverImage?.large || anime.coverImage?.medium || ''} 
          alt={anime.title?.userPreferred || ''}
          loading="lazy"
        />
      </button>
    {/each}
    {#if animeList.length === 0}
      <div class="empty-shelf">
        {#if !Helper.getClient()?.userID}
          <p>Sign in to view your list</p>
        {:else}
          <p>No items in {sectionName}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(body) {
    overflow: hidden;
  }

  .home-theater {
    position: fixed;
    inset: 0;
    background: var(--dark-color);
    overflow: hidden;
  }

  .theater-bg {
    position: fixed;
    inset: 0;
    z-index: -1;
    background-size: cover;
    background-position: center;
    filter: brightness(0.3) blur(40px);
    transform: scale(1.1);
    transition: background-image 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .vignette {
    position: fixed;
    inset: 0;
    z-index: 0;
    background: radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.4) 50%, var(--dark-color) 100%);
    pointer-events: none;
  }

  .header {
    position: relative;
    z-index: 20;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2.5rem 5%;
    opacity: 0.4;
    transition: opacity 0.3s;
  }

  .header:hover {
    opacity: 1;
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 2rem;
  }

  .nav-logo {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .nav-logo img {
    width: 2rem;
    height: 2rem;
  }

  .nav-item {
    font-family: 'Noto Sans JP', sans-serif;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    color: var(--white-color);
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity 0.2s;
    padding: 0;
  }

  .nav-item:hover,
  .nav-item.active {
    opacity: 1;
  }

  .clock {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: -0.05em;
    color: var(--white-color);
  }

  .section-cycler {
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: 'Noto Sans JP', sans-serif;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    color: rgba(255,255,255,0.5);
    transition: color 0.2s;
    padding: 0;
  }

  .section-cycler:hover {
    color: var(--white-color);
  }

  .section-label {
    color: var(--white-color);
  }

  .details-engine {
    position: absolute;
    top: 15%;
    left: 5%;
    z-index: 10;
    opacity: 0;
    transform: translateX(-30px);
    transition: opacity 0.6s 0.2s ease-out, transform 0.6s 0.2s ease-out;
    pointer-events: none;
  }

  .details-engine.show {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  .glass-pill {
    display: inline-block;
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
    padding: 0.5rem 1.5rem;
    border-radius: 2px;
    border: 1px solid rgba(255,255,255,0.1);
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: rgba(255,255,255,0.6);
    margin-bottom: 1.5rem;
  }

  .glass-pill .accent {
    color: var(--current-color);
  }

  .glass-pill .separator {
    margin: 0 0.5rem;
    opacity: 0.5;
  }

  .editorial-title {
    font-family: 'Noto Sans JP', sans-serif;
    font-weight: 900;
    font-size: clamp(2.5rem, 8vw, 5rem);
    letter-spacing: -0.04em;
    line-height: 0.9;
    color: var(--white-color);
    margin-bottom: 1.5rem;
    max-width: 80%;
  }

  .meta-row {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .score {
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 1.25rem;
    font-weight: 400;
    color: var(--white-color);
  }

  .episodes {
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 0.875rem;
    color: rgba(255,255,255,0.6);
  }

  .divider {
    width: 1px;
    height: 1.5rem;
    background: rgba(255,255,255,0.2);
  }

  .description {
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.6;
    color: rgba(255,255,255,0.6);
    max-width: 28rem;
    margin-bottom: 1.5rem;
  }

  .action-buttons {
    display: flex;
    gap: 1rem;
  }

  .btn-primary {
    background: var(--white-color);
    color: var(--dark-color);
    padding: 1rem 3rem;
    font-family: 'Noto Sans JP', sans-serif;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    border: none;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 20px rgba(255,255,255,0.2);
  }

  .btn-secondary {
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
    padding: 1rem 2rem;
    font-family: 'Noto Sans JP', sans-serif;
    font-weight: 700;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    color: var(--white-color);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.2);
  }

  .shelf-container {
    position: absolute;
    bottom: 5%;
    left: 0;
    right: 0;
    display: flex;
    gap: 1rem;
    padding: 0 5%;
    overflow-x: auto;
    scrollbar-width: none;
    z-index: 10;
  }

  .shelf-container::-webkit-scrollbar {
    display: none;
  }

  .media-card {
    flex-shrink: 0;
    width: 11rem;
    height: 16rem;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
    cursor: pointer;
    border: 2px solid transparent;
    background: transparent;
    padding: 0;
    transition: all 0.4s cubic-bezier(0.2, 1, 0.3, 1);
  }

  .media-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0.5;
    transition: all 0.4s;
  }

  .media-card:hover {
    transform: translateY(-10px);
  }

  .media-card:hover img {
    opacity: 0.7;
  }

  .media-card.active {
    width: 13.5rem;
    border-color: var(--white-color);
    transform: translateY(-20px);
    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
  }

  .media-card.active img {
    opacity: 1;
    transform: scale(1.05);
  }

  .empty-shelf {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 16rem;
    color: rgba(255,255,255,0.4);
    font-family: 'Noto Sans JP', sans-serif;
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .header {
      padding: 1.5rem 4%;
    }

    .nav-links {
      gap: 1rem;
    }

    .nav-item {
      display: none;
    }

    .nav-item:first-of-type,
    .nav-item:nth-of-type(2) {
      display: block;
    }

    .details-engine {
      top: 20%;
      left: 4%;
      right: 4%;
    }

    .editorial-title {
      font-size: 2rem;
    }

    .media-card {
      width: 9rem;
      height: 13rem;
    }

    .media-card.active {
      width: 11rem;
    }
  }
</style>
