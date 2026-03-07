<script context='module'>
  import SectionsManager from '@/modules/sections.js'
  import SearchPage from '@/routes/search/SearchPage.svelte'
  import { writable } from 'simple-store-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { cache, caches } from '@/modules/cache.js'
  import Helper from '@/modules/helper.js'

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const key = writable({})
  const search = writable(cache.getEntry(caches.HISTORY, 'lastSchedule') || { scheduleList: true, format: ['TV'], format_not: [], genre: [], genre_not: [], tag: [], tag_not: [], status: [], status_not: [] })
  search.subscribe(value => {
    const searched = { ...value }
    delete searched.load
    delete searched.preview
    cache.setEntry(caches.HISTORY, 'lastSchedule', searched)
  })

  async function fetchAllScheduleEntries (variables) {
    const results = { data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }
    const airingLists = await (variables.hideSubs ? animeSchedule.dubAiringLists.value : animeSchedule.subAiringLists.value)
    let ids = airingLists.map(entry => {
        const media = variables.hideSubs ? entry.media?.media : entry
        return media?.id ? { id: media.id, idMal: media.idMal ?? null } : null
    }).filter(item => item != null)

    if ((variables.hideMyAnime || variables.showMyAnime) && Helper.isAuthorized()) {
      const userIds = await Helper.userLists(variables).then(res => {
        if (!res?.data && res?.errors) throw res.errors[0]
        if (Helper.isAniAuth()) return Array.from(new Set(res.data.MediaListCollection.lists.filter(({ status }) => (variables.hideMyAnime ? variables.hideStatus : variables.showStatus).includes(status)).flatMap(list => list.entries.map(({ media }) => media.id))))
        else return res.data.MediaList.filter(({ node }) => (variables.hideMyAnime ? variables.hideStatus : variables.showStatus).includes(Helper.statusMap(node.my_list_status.status))).map(({ node }) => node.id)
      })
      ids = ids.filter(({ id, idMal }) => Helper.isAniAuth() ? variables.hideMyAnime ? !userIds.includes(id) : userIds.includes(id) : variables.hideMyAnime ? !userIds.includes(idMal) : userIds.includes(idMal))
    }
    const res = await anilistClient.searchAllIDS({ id: ids.map(({ id }) => id).filter(Boolean), ...SectionsManager.sanitiseObject(variables), page: 1, perPage: 50 })
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media = results.data.Page.media.concat(res.data.Page.media)
    if (variables.hideSubs) {
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => {
        const cachedItem = airingLists.find(entry => entry.media?.media?.id === media.id)
        if (cachedItem?.delayedIndefinitely && cachedItem?.status?.toUpperCase()?.includes('FINISHED')) return false
        const numberOfEpisodes = cachedItem.subtractedEpisodeNumber ? (cachedItem.episodeNumber - cachedItem.subtractedEpisodeNumber) : 1
        let predict = false
        if (cachedItem?.media?.media?.airingSchedule?.nodes?.length) {
            const now = new Date()
            const futureEpisodes = cachedItem.media.media.airingSchedule.nodes.filter(node => new Date(node.airingAt) > now)
            predict = futureEpisodes.length === 0
            if (predict && !((numberOfEpisodes > 4) && !cachedItem.unaired)) {
                const latestEpisode = Math.max(...cachedItem.media.media.airingSchedule.nodes.map(node => node.episode))
                const latestAiringAt = Math.max(...cachedItem.media.media.airingSchedule.nodes.map(node => new Date(node.airingAt).getTime()))
                cachedItem.media.media.airingSchedule.nodes.unshift({
                    episode: latestEpisode + 1,
                    airingAt: new Date(latestAiringAt + (cachedItem.delayedIndefinitely ? 6 * 365 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, -5) + 'Z'
                })
            }
        }
        return (!(cachedItem?.media?.media?.airingSchedule?.nodes[0]?.episode > media.episodes) || !media.episodes) && (!predict || !((numberOfEpisodes > 4) && !cachedItem.unaired)) && cachedItem?.media?.media?.airingSchedule?.nodes[0]?.airingAt && self.findIndex(m => m.id === media.id) === index
      }).sort((a, b) => {
          const aEntry = airingLists.find(entry => entry.media?.media?.id === a.id)
          const bEntry = airingLists.find(entry => entry.media?.media?.id === b.id)
          const aDelayed = aEntry?.delayedIndefinitely ? 1 : 0
          const bDelayed = bEntry?.delayedIndefinitely ? 1 : 0
          if (aDelayed !== bDelayed) return aDelayed - bDelayed
          return new Date(nextAiring(aEntry?.media?.media?.airingSchedule?.nodes, variables)?.airingAt).getTime() - new Date(nextAiring(bEntry?.media?.media?.airingSchedule?.nodes, variables)?.airingAt).getTime()
      })
    } else {
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m => m?.id === media?.id) === index).sort((a, b) => nextAiring(a.airingSchedule?.nodes)?.airingAt - nextAiring(b.airingSchedule?.nodes)?.airingAt)
    }

    const todayIdx = new Date().getDay()
    const orderedDays = [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)]
    const grouped = {}
    for (const media of results.data.Page.media) {
      const node = nextAiring(media?.airingSchedule?.nodes, variables)
      if (!node?.airingAt) continue
      const day = DAYS[new Date(node.airingAt * 1000).getDay()]
      ;(grouped[day] ??= []).push(media)
    }
    const withHeaders = []
    for (const day of orderedDays) {
      if (!grouped[day]) continue
      withHeaders.push({ __dayHeader: true, day })
      withHeaders.push(...grouped[day])
    }
    results.data.Page.media = withHeaders
    return results
  }
</script>

<script>
  import { settings } from '@/modules/settings.js'
  import ScheduleCard from '@/components/cards/ScheduleCard.svelte'

  let textGroups = [], textVars = null

  $search.load = (_, __, variables) => {
    textVars = variables
    const raw = fetchAllScheduleEntries(variables)
    raw.then(r => {
      textGroups = (r?.data?.Page?.media ?? []).reduce((acc, item) => {
        if (item.__dayHeader) acc.push({ day: item.day, items: [] })
        else acc.at(-1)?.items.push(item)
        return acc
      }, [])
    })
    return SectionsManager.wrapResponse(raw, 150)
  }

  const views = ['grid', 'compact', 'list', 'agenda']
  const VIEW_LABELS = { grid: 'Grid', compact: 'Compact', list: 'List', agenda: 'Agenda' }
  const toggleView = () => {
    const idx = views.indexOf($settings.scheduleView || 'grid')
    $settings.scheduleView = views[(idx + 1) % views.length]
  }

  $: currentView = $settings.scheduleView || 'grid'
  $: nextView = views[(views.indexOf(currentView) + 1) % views.length]
  $: isTextMode = currentView === 'list' || currentView === 'agenda'
  $: gridCols = $settings.schedCols || 'auto'
</script>

<div class="view-menu-wrap">
  <button class="view-switch-fab" on:click={toggleView}>
    <span class="fab-current">{VIEW_LABELS[currentView]}</span>
    <span class="fab-arrow">→ {VIEW_LABELS[nextView]}</span>
  </button>
  
  <div class="view-options">
    <div class="option-group">
      <span>Layout Mode</span>
      <div class="row">
        <button class:active={gridCols === 'auto'} on:click={() => $settings.schedCols = 'auto'}>Auto</button>
        <button class:active={gridCols === 1} on:click={() => $settings.schedCols = 1}>1 Col</button>
        <button class:active={gridCols === 2} on:click={() => $settings.schedCols = 2}>2 Col</button>
      </div>
    </div>

    <div class="option-group">
      <span>Visual Tweaks</span>
      <div class="row vertical">
        <button class:active={$settings.compactCards} on:click={() => $settings.compactCards = !$settings.compactCards}>
          {$settings.compactCards ? 'Normal Size' : 'Compact Mode'}
        </button>
        <button class:active={$settings.hideStats} on:click={() => $settings.hideStats = !$settings.hideStats}>
          {$settings.hideStats ? 'Show Stats' : 'Hide Stats'}
        </button>
      </div>
    </div>
  </div>
</div>

<div class:hidden-search={isTextMode}>
  <SearchPage key={key} search={search}/>
</div>

{#if isTextMode}
  <div class='text-grid-wrap' 
       class:hide-stats={$settings.hideStats}
       class:compact-mode={$settings.compactCards}
       style="--cols: {gridCols === 'auto' ? 'repeat(auto-fill, minmax(350px, 1fr))' : `repeat(${gridCols}, 1fr)`}">
    {#if textGroups.length}
      <div class='text-grid' class:single-col={$settings.scheduleView === 'agenda'}>
        {#each textGroups as group}
          <div class='text-col'>
            <div class='text-day-header'>{group.day}</div>
            <div class="items-container">
              {#each group.items as item}
                <ScheduleCard data={item} variables={textVars} />
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class='text-loading'>Loading schedule…</div>
    {/if}
  </div>
{/if}

<style>
  /* MENU SYSTEM */
  .view-menu-wrap {
    position: fixed;
    bottom: 60px;
    left: 60px;
    z-index: 9999;
    display: flex;
    flex-direction: column-reverse;
    align-items: flex-start;
  }

  .view-switch-fab {
    position: relative;
    z-index: 10;
    padding: 12px 20px;
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    background: #2edf82;
    color: #000;
    border: none;
    border-radius: 50px;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 110px;
  }

  .fab-current {
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 0.05em;
    line-height: 1;
  }

  .fab-arrow {
    font-size: 10px;
    font-weight: 600;
    opacity: 0.6;
    letter-spacing: 0.04em;
  }

  .view-options {
    display: none;
    flex-direction: column;
    gap: 12px;
    background: #111;
    border: 1px solid #333;
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 12px;
    min-width: 220px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    position: relative;
  }

  /* Hover Bridge */
  .view-options::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 0;
    width: 100%;
    height: 25px;
  }

  .view-menu-wrap:hover .view-options {
    display: flex;
  }

  .option-group { display: flex; flex-direction: column; gap: 6px; }
  .option-group span { font-size: 9px; text-transform: uppercase; color: #555; font-weight: 800; letter-spacing: 1px; }
  .row { display: flex; gap: 4px; }
  .row.vertical { flex-direction: column; }
  
  .view-options button {
    background: #1a1a1a;
    border: 1px solid transparent;
    color: #888;
    padding: 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    flex: 1;
    text-align: center;
  }

  .view-options button.active {
    border-color: #2edf82;
    color: #2edf82;
    background: rgba(46, 223, 130, 0.05);
  }

  /* GRID SYSTEM */
  /* Hide SearchPage output in list/agenda modes — we render our own grid */
  .hidden-search { display: none !important; }

  .text-loading {
    padding: 3rem;
    text-align: center;
    color: rgba(190,190,210,0.3);
    font-size: 0.95rem;
    letter-spacing: 0.05em;
  }

  .text-grid {
    display: grid;
    grid-template-columns: var(--cols);
    gap: 1.5rem;
    padding: 1rem;
    align-items: start;
  }

  .text-grid.single-col {
    grid-template-columns: 1fr;
    max-width: 780px;
    margin: 0 auto;
  }

  .text-col { display: flex; flex-direction: column; min-width: 0; }
  .items-container { display: flex; flex-direction: column; gap: 0.8rem; }

  .text-day-header {
    padding: 1rem 0;
    font-size: 1.1rem;
    font-weight: 900;
    color: #2edf82;
    text-transform: uppercase;
    border-bottom: 1px solid #222;
    margin-bottom: 1rem;
  }

  /* GLOBAL CARD OVERRIDES */
  .hide-stats :global(.stats-col) { display: none !important; }

  .compact-mode :global(.schedule-card) { height: 75px !important; }
  .compact-mode :global(.img-col) { flex: 0 0 55px !important; }
  .compact-mode :global(.description-wrap), 
  .compact-mode :global(.genres),
  .compact-mode :global(.subtitle) { display: none !important; }
  .compact-mode :global(.content-col) { padding: 0.2rem 0.8rem !important; justify-content: center !important; }

  @media (max-width: 800px) {
    .text-grid { grid-template-columns: 1fr !important; }
  }
</style>