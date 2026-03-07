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
  import { onMount } from 'svelte'
  import { settings } from '@/modules/settings.js'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'
  import ScheduleCard from '@/components/cards/ScheduleCard.svelte'

  const AUTO_BREAKPOINTS = { wide: 1400, mid: 900 }

  let textGroups = [], textVars = null
  const TODAY        = DAYS[new Date().getDay()]
  const TODAY_IDX    = DAYS.indexOf(TODAY)
  const ORDERED_DAYS = [...DAYS.slice(TODAY_IDX), ...DAYS.slice(0, TODAY_IDX)]
  let selectedDay    = TODAY
  let screenWidth    = typeof window !== 'undefined' ? window.innerWidth : 1280

  let now = new Date()

  onMount(() => {
    screenWidth = window.innerWidth
    const onResize = () => { screenWidth = window.innerWidth }
    window.addEventListener('resize', onResize)
    const timeInterval = setInterval(() => { now = new Date() }, 1000)
    return () => {
      window.removeEventListener('resize', onResize)
      clearInterval(timeInterval)
    }
  })

  function getDayDates() {
    const now = new Date()
    return DAYS.reduce((acc, day, i) => {
      const diff = ((i - now.getDay()) + 7) % 7
      const d = new Date(now)
      d.setDate(now.getDate() + diff)
      acc[day] = d.getDate()
      return acc
    }, {})
  }
  const DAY_DATES = getDayDates()

  function trackMouse(node) {
    const onMove = e => node.style.setProperty('--mx', e.clientX + 'px') || node.style.setProperty('--my', e.clientY + 'px')
    node.addEventListener('mousemove', onMove)
    return { destroy: () => node.removeEventListener('mousemove', onMove) }
  }

  function fmtTime(ts) {
    if (!ts) return ''
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function scrollToDay(day) {
    selectedDay = day
    const el = document.getElementById(`day-col-${day}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  $: activeDays  = new Set(textGroups.map(g => g.day))
  $: autoView    = screenWidth >= AUTO_BREAKPOINTS.wide ? 'list'
                 : screenWidth >= AUTO_BREAKPOINTS.mid  ? 'compact'
                 : 'agenda'

  $: todayGroup  = textGroups.find(g => g.day === TODAY) ?? null
  $: otherGroups = textGroups.filter(g => g.day !== TODAY)

  $search.load = (_, __, variables) => {
    textVars = variables
    const raw = fetchAllScheduleEntries(variables)
    raw.then(r => {
      textGroups = (r?.data?.Page?.media ?? []).reduce((acc, item) => {
        if (item.__dayHeader) {
          acc.push({ day: item.day, items: [] })
        } else {
          const node = nextAiring(item?.airingSchedule?.nodes, variables)
          acc.at(-1)?.items.push({ media: item, airingAt: node?.airingAt ?? null })
        }
        return acc
      }, [])
    }).catch(() => { textGroups = [] })
    return SectionsManager.wrapResponse(raw, 150)
  }

  const VIEWS      = ['auto', 'grid', 'compact', 'list', 'agenda', 'guide']
  const VIEW_LABELS = { auto: 'Auto', grid: 'Grid', compact: 'Compact', list: 'List', agenda: 'Agenda', guide: 'Guide' }

  const toggleView = () => {
    const idx = VIEWS.indexOf($settings.scheduleView || 'auto')
    $settings.scheduleView = VIEWS[(idx + 1) % VIEWS.length]
  }

  $: currentView  = $settings.scheduleView || 'auto'
  $: nextView     = VIEWS[(VIEWS.indexOf(currentView) + 1) % VIEWS.length]
  $: resolvedView = currentView === 'auto' ? autoView : currentView
  $: isTextMode   = resolvedView === 'list' || resolvedView === 'agenda' || resolvedView === 'guide' || resolvedView === 'compact'
  $: gridCols     = $settings.schedCols || 'auto'

  $: cardW      = $settings.cardW      ?? 38
  $: cardH      = $settings.cardH      ?? 32
  $: cardImg    = $settings.cardImg    ?? 17
  $: compactImg = $settings.compactImg ?? 80
  $: compactH   = $settings.compactH   ?? 110

  function saveCardSetting(key, val) { $settings[key] = val }

  $: cardVars = `--card-w:${cardW}rem; --card-h:${cardH}rem; --card-img:${cardImg}rem; --compact-img:${compactImg}px; --compact-card-h:${compactH}px`
</script>

<div class="view-menu-wrap">
  <button class="view-switch-fab" on:click={toggleView}>
    <span class="fab-current">{VIEW_LABELS[currentView]}{currentView === 'auto' ? ` · ${VIEW_LABELS[resolvedView]}` : ''}</span>
    <span class="fab-arrow">→ {VIEW_LABELS[nextView]}</span>
  </button>
  
  <div class="view-options">
    {#if isTextMode}
      <div class="option-group">
        <span>Columns</span>
        <div class="row">
          <button class:active={gridCols === 'auto'} on:click={() => $settings.schedCols = 'auto'}>Auto</button>
          <button class:active={gridCols === 1} on:click={() => $settings.schedCols = 1}>1</button>
          <button class:active={gridCols === 2} on:click={() => $settings.schedCols = 2}>2</button>
          <button class:active={gridCols === 3} on:click={() => $settings.schedCols = 3}>3</button>
        </div>
      </div>
    {/if}
    {#if resolvedView === 'grid'}
      <div class="option-group">
        <span>Card Width <em>{cardW}rem</em></span>
        <input type="range" min="20" max="60" step="1" value={cardW} on:input={e => saveCardSetting('cardW', +e.target.value)} />
      </div>
      <div class="option-group">
        <span>Card Height <em>{cardH}rem</em></span>
        <input type="range" min="16" max="55" step="1" value={cardH} on:input={e => saveCardSetting('cardH', +e.target.value)} />
      </div>
      <div class="option-group">
        <span>Image Width <em>{cardImg}rem</em></span>
        <input type="range" min="8" max="35" step="1" value={cardImg} on:input={e => saveCardSetting('cardImg', +e.target.value)} />
      </div>
    {/if}
    {#if resolvedView === 'compact'}
      <div class="option-group">
        <span>Thumb Width <em>{compactImg}px</em></span>
        <input type="range" min="40" max="200" step="4" value={compactImg} on:input={e => saveCardSetting('compactImg', +e.target.value)} />
      </div>
      <div class="option-group">
        <span>Row Height <em>{compactH}px</em></span>
        <input type="range" min="50" max="200" step="4" value={compactH} on:input={e => saveCardSetting('compactH', +e.target.value)} />
      </div>
    {/if}
    <div class="option-group">
      <span>Cards</span>
      <div class="row vertical">
        <button class:active={$settings.compactCards} on:click={() => $settings.compactCards = !$settings.compactCards}>
          {$settings.compactCards ? '✓ Compact' : 'Compact Mode'}
        </button>
        <button class:active={$settings.hideStats} on:click={() => $settings.hideStats = !$settings.hideStats}>
          {$settings.hideStats ? '✓ Stats Hidden' : 'Hide Stats'}
        </button>
      </div>
    </div>
  </div>
</div>

<div class='schedule-root'
     class:hide-stats={$settings.hideStats}
     class:compact-cards={$settings.compactCards}
     class:view-is-text={isTextMode}
     style={cardVars}>

  <div class:hidden-search={isTextMode} class:grid-scroll-wrap={!isTextMode}>
    <SearchPage key={key} search={search}/>
  </div>

  <div class='day-carousel'>
    {#each ORDERED_DAYS as day, i}
      {@const isToday = day === TODAY}
      {@const isSelected = day === selectedDay}
      {@const hasContent = activeDays.has(day)}
      {@const distance = Math.min(i, ORDERED_DAYS.length - i)}
      <button
        class='day-pill'
        class:is-today={isToday}
        class:is-selected={isSelected}
        class:no-content={!hasContent}
        style="--dist:{distance}"
        on:click={() => scrollToDay(day)}
        disabled={!hasContent && isTextMode}>
        <span class='day-date'>{DAY_DATES[day]}</span>
        <span class='day-short'>{day.slice(0, 3)}</span>
        {#if isToday}<span class='today-dot'></span>{/if}
      </button>
    {/each}
  </div>

  {#if isTextMode}
    <div class='text-scroll-wrap'>
    {#if resolvedView === 'guide'}
      {#if textGroups.length}
        <div class='guide-wrap'>
          <div class='guide-now' id='day-col-{TODAY}'>
            <div class='guide-now-header'>
              <span class='guide-now-title'>Airtime today</span>
              <span class='guide-now-date'>{now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) + ', ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12:false })}</span>
            </div>
            {#if todayGroup}
              <div class='guide-list'>
                {#each todayGroup.items as { media, airingAt }}
                  {@const coverImg = media?.coverImage?.extraLarge || media?.coverImage?.medium}
                  <div class='guide-row' use:trackMouse use:click={() => modal.open(modal.ANIME_DETAILS, media)}>
                    <span class='guide-name'>{anilistClient.title(media)}</span>
                    <span class='guide-time'>{fmtTime(airingAt)}</span>
                    {#if coverImg}<img class='guide-hover-art' src={coverImg} alt='' />{/if}
                  </div>
                {/each}
              </div>
            {:else}
              <div class='guide-empty'>No airings today</div>
            {/if}
          </div>
          <div class='guide-week'>
            <div class='guide-week-header'>Weekly Schedule</div>
            {#each otherGroups as group}
              <div class='guide-day-section' id='day-col-{group.day}'>
                <div class='guide-day-name'>{group.day}</div>
                <div class='guide-list'>
                  {#each group.items as { media, airingAt }}
                    {@const coverImg = media?.coverImage?.extraLarge || media?.coverImage?.medium}
                    <div class='guide-row' use:trackMouse use:click={() => modal.open(modal.ANIME_DETAILS, media)}>
                      <span class='guide-name'>{anilistClient.title(media)}</span>
                      <span class='guide-time'>{fmtTime(airingAt)}</span>
                      {#if coverImg}<img class='guide-hover-art' src={coverImg} alt='' />{/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class='text-loading'>Loading schedule…</div>
      {/if}
    {:else}
      <div class='text-grid-wrap' 
             style="--cols: {gridCols === 'auto' ? 'repeat(auto-fill, minmax(350px, 1fr))' : `repeat(${gridCols}, 1fr)`}">
        {#if textGroups.length}
          <div class='text-grid' class:single-col={resolvedView === 'agenda'}>
            {#each textGroups as group}
              <div class='text-col' id='day-col-{group.day}'>
                <div class='text-day-header'>{group.day}</div>
                <div class="items-container">
                  {#each group.items as { media }}
                    <ScheduleCard data={media} variables={textVars} {resolvedView} />
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
    </div>
  {/if}

</div>

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

  .view-options input[type="range"] {
    width: 100%;
    accent-color: #2edf82;
    cursor: pointer;
    margin: 2px 0;
  }

  .option-group em {
    font-style: normal;
    color: #2edf82;
    font-size: 9px;
    font-weight: 700;
    margin-left: 4px;
  }

  .day-carousel {
    position: sticky;
    top: 0;
    z-index: 100;
    display: flex;
    justify-content: center;
    align-items: stretch;
    gap: 2px;
    padding: 6px 12px 0;
    background: hsl(var(--dark-color-hsl, 220 13% 9%));
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .day-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    background: none;
    border: none;
    border-radius: 8px 8px 0 0;
    padding: 8px 18px 10px;
    cursor: pointer;
    transition: opacity 0.18s ease, background 0.18s ease;
    opacity: calc(1 - clamp(0, var(--dist) * 0.13, 0.65));
    position: relative;
    flex: 1;
    max-width: 90px;
  }

  .day-pill::after {
    content: '';
    position: absolute;
    bottom: 0; left: 10%; right: 10%;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: transparent;
    transition: background 0.18s ease;
  }

  .day-pill.is-selected::after { background: #2edf82; }

  .day-pill:hover:not(:disabled) {
    opacity: 1 !important;
    background: rgba(255,255,255,0.04);
  }

  .day-pill.is-selected { opacity: 1 !important; background: rgba(46,223,130,0.05); }
  .day-pill.no-content { opacity: 0.18 !important; cursor: default; }

  .day-date {
    font-size: 15px;
    font-weight: 300;
    color: rgba(255,255,255,0.55);
    line-height: 1;
    letter-spacing: -0.01em;
    transition: color 0.18s ease;
  }

  .day-pill.is-today .day-date {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: #2edf82;
    color: #000;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 700;
  }

  .day-pill.is-selected:not(.is-today) .day-date { color: #2edf82; font-weight: 500; }

  .day-short {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255,255,255,0.35);
    line-height: 1;
    transition: color 0.18s ease;
  }

  .day-pill.is-today .day-short { color: rgba(255,255,255,0.55); }
  .day-pill.is-selected .day-short { color: rgba(255,255,255,0.7); }

  .today-dot { display: none; }

  /* GRID SYSTEM */
  /* Hide SearchPage output in list/agenda modes — we render our own grid */
  .hidden-search { display: none !important; }

  .text-scroll-wrap {
    overflow-y: auto;
    height: calc(100vh - 50px);
  }

  .grid-scroll-wrap {
    overflow-y: auto;
    height: calc(100vh - 50px);
  }

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

  .text-col { display: flex; flex-direction: column; min-width: 0; width: 100%; scroll-margin-top: 70px; }
  .items-container { display: flex; flex-direction: column; gap: 0.8rem; width: 100%; }

  .text-day-header {
    padding: 1rem 0;
    font-size: 1.1rem;
    font-weight: 900;
    color: #2edf82;
    text-transform: uppercase;
    border-bottom: 1px solid #222;
    margin-bottom: 1rem;
  }

  /* GLOBAL CARD OVERRIDES — apply in ALL view modes */
  :global(.schedule-root.hide-stats) :global(.stats-col) { display: none !important; }

  :global(.schedule-root.compact-cards) :global(.schedule-card) { height: 75px !important; }
  :global(.schedule-root.compact-cards) :global(.img-col) { flex: 0 0 55px !important; }
  :global(.schedule-root.compact-cards) :global(.description-wrap),
  :global(.schedule-root.compact-cards) :global(.genres),
  :global(.schedule-root.compact-cards) :global(.subtitle) { display: none !important; }
  :global(.schedule-root.compact-cards) :global(.content-col) { padding: 0.2rem 0.8rem !important; justify-content: center !important; }

  @media (max-width: 800px) {
    .text-grid { grid-template-columns: 1fr !important; }
  }

  /* GUIDE VIEW */
  .guide-wrap {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 0;
    min-height: 80vh;
    padding: 2rem;
  }

  @media (max-width: 900px) {
    .guide-wrap { grid-template-columns: 1fr; }
    .guide-now { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); padding-bottom: 2rem; margin-bottom: 2rem; }
  }

  .guide-now {
    scroll-margin-top: 70px;
    border-right: 1px solid rgba(255,255,255,0.07);
    padding-right: 2rem;
    margin-right: 2rem;
  }

  .guide-now-header, .guide-week-header { margin-bottom: 1.5rem; }

  .guide-now-title, .guide-week-header {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
  }

  .guide-now-date {
    display: block;
    font-size: 0.8rem;
    color: rgba(255,255,255,0.3);
    margin-top: 0.3rem;
    font-weight: 400;
  }

  .guide-list { display: flex; flex-direction: column; }

  .guide-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0.55rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    cursor: pointer;
    gap: 1rem;
    transition: background 0.12s ease;
    border-radius: 4px;
    padding-left: 4px;
    padding-right: 4px;
  }

  .guide-row:hover { background: rgba(255,255,255,0.04); }
  .guide-row:last-child { border-bottom: none; }

  .guide-hover-art {
    position: fixed;
    width: 180px;
    height: 255px;
    object-fit: cover;
    border-radius: 0.6rem;
    box-shadow: 0 8px 32px rgba(0,0,0,0.75);
    pointer-events: none;
    z-index: 9999;
    opacity: 0;
    transform: scale(0.92) translate(16px, -50%);
    transition: opacity 0.15s ease, transform 0.15s ease;
    top: var(--my, -9999px);
    left: var(--mx, -9999px);
  }
  .guide-row:hover .guide-hover-art {
    opacity: 1;
    transform: scale(1) translate(16px, -50%);
  }

  .guide-name {
    font-size: 0.9rem;
    font-weight: 400;
    color: rgba(255,255,255,0.75);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .guide-time {
    font-size: 0.85rem;
    font-weight: 500;
    color: rgba(255,255,255,0.35);
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  .guide-week { }

  .guide-day-section {
    margin-bottom: 2rem;
    scroll-margin-top: 70px;
  }

  .guide-day-name {
    font-size: 1.3rem;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
    margin-bottom: 0.75rem;
    letter-spacing: -0.02em;
  }

  .guide-empty {
    color: rgba(255,255,255,0.2);
    font-size: 0.85rem;
    padding: 1rem 0;
  }
</style>