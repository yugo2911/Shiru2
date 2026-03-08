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
    const s = { ...value }
    delete s.load; delete s.preview
    cache.setEntry(caches.HISTORY, 'lastSchedule', s)
  })

  async function fetchAllScheduleEntries (variables) {
    const results = { data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }
    const airingLists = await (variables.hideSubs ? animeSchedule.dubAiringLists.value : animeSchedule.subAiringLists.value)
    let ids = airingLists.map(entry => {
      const media = variables.hideSubs ? entry.media?.media : entry
      return media?.id ? { id: media.id, idMal: media.idMal ?? null } : null
    }).filter(Boolean)

    if ((variables.hideMyAnime || variables.showMyAnime) && Helper.isAuthorized()) {
      const userIds = await Helper.userLists(variables).then(res => {
        if (!res?.data && res?.errors) throw res.errors[0]
        if (Helper.isAniAuth()) return Array.from(new Set(res.data.MediaListCollection.lists.filter(({ status }) => (variables.hideMyAnime ? variables.hideStatus : variables.showStatus).includes(status)).flatMap(list => list.entries.map(({ media }) => media.id))))
        return res.data.MediaList.filter(({ node }) => (variables.hideMyAnime ? variables.hideStatus : variables.showStatus).includes(Helper.statusMap(node.my_list_status.status))).map(({ node }) => node.id)
      })
      ids = ids.filter(({ id, idMal }) => Helper.isAniAuth() ? variables.hideMyAnime ? !userIds.includes(id) : userIds.includes(id) : variables.hideMyAnime ? !userIds.includes(idMal) : userIds.includes(idMal))
    }

    const res = await anilistClient.searchAllIDS({ id: ids.map(({ id }) => id).filter(Boolean), ...SectionsManager.sanitiseObject(variables), page: 1, perPage: 50 })
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media = results.data.Page.media.concat(res.data.Page.media)

    if (variables.hideSubs) {
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => {
        const c = airingLists.find(entry => entry.media?.media?.id === media.id)
        if (c?.delayedIndefinitely && c?.status?.toUpperCase()?.includes('FINISHED')) return false
        const numEp = c.subtractedEpisodeNumber ? (c.episodeNumber - c.subtractedEpisodeNumber) : 1
        let predict = false
        if (c?.media?.media?.airingSchedule?.nodes?.length) {
          const now = new Date()
          predict = c.media.media.airingSchedule.nodes.filter(n => new Date(n.airingAt) > now).length === 0
          if (predict && !((numEp > 4) && !c.unaired)) {
            const latestEp = Math.max(...c.media.media.airingSchedule.nodes.map(n => n.episode))
            const latestAt = Math.max(...c.media.media.airingSchedule.nodes.map(n => new Date(n.airingAt).getTime()))
            c.media.media.airingSchedule.nodes.unshift({ episode: latestEp + 1, airingAt: new Date(latestAt + (c.delayedIndefinitely ? 6*365*24*60*60*1000 : 7*24*60*60*1000)).toISOString().slice(0, -5) + 'Z' })
          }
        }
        return (!(c?.media?.media?.airingSchedule?.nodes[0]?.episode > media.episodes) || !media.episodes) && (!predict || !((numEp > 4) && !c.unaired)) && c?.media?.media?.airingSchedule?.nodes[0]?.airingAt && self.findIndex(m => m.id === media.id) === index
      }).sort((a, b) => {
        const aE = airingLists.find(e => e.media?.media?.id === a.id), bE = airingLists.find(e => e.media?.media?.id === b.id)
        const aD = aE?.delayedIndefinitely ? 1 : 0, bD = bE?.delayedIndefinitely ? 1 : 0
        if (aD !== bD) return aD - bD
        return new Date(nextAiring(aE?.media?.media?.airingSchedule?.nodes, variables)?.airingAt).getTime() - new Date(nextAiring(bE?.media?.media?.airingSchedule?.nodes, variables)?.airingAt).getTime()
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
      ;(grouped[DAYS[new Date(node.airingAt * 1000).getDay()]] ??= []).push(media)
    }
    const withHeaders = []
    for (const day of orderedDays) {
      if (!grouped[day]) continue
      withHeaders.push({ __dayHeader: true, day }, ...grouped[day])
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

  const MOBILE_LG = 900, MOBILE_SM = 600
  const VIEWS = ['auto', 'grid', 'compact', 'list', 'agenda', 'guide']
  const VIEW_LABELS = { auto: 'Auto', grid: 'Grid', compact: 'Compact', list: 'List', agenda: 'Agenda', guide: 'Guide' }

  const TODAY = DAYS[new Date().getDay()]
  const ORDERED_DAYS = [...DAYS.slice(DAYS.indexOf(TODAY)), ...DAYS.slice(0, DAYS.indexOf(TODAY))]
  const DAY_DATES = DAYS.reduce((acc, day, i) => {
    const d = new Date(); d.setDate(d.getDate() + ((i - d.getDay() + 7) % 7))
    acc[day] = d.getDate(); return acc
  }, {})

  // per-view setting key helper
  const VK = (k, v) => `sched_${k}_${v}`

  let textGroups = [], textVars = null, now = new Date(), selectedDay = TODAY
  let screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1280

  onMount(() => {
    screenWidth = window.innerWidth
    const onResize = () => { screenWidth = window.innerWidth }
    window.addEventListener('resize', onResize)
    const t = setInterval(() => { now = new Date() }, 1000)
    return () => { window.removeEventListener('resize', onResize); clearInterval(t) }
  })

  function trackMouse(node) {
    const fn = e => { node.style.setProperty('--mx', e.clientX + 'px'); node.style.setProperty('--my', e.clientY + 'px') }
    node.addEventListener('mousemove', fn)
    return { destroy: () => node.removeEventListener('mousemove', fn) }
  }

  const fmtTime = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  const scrollToDay = day => { selectedDay = day; document.getElementById(`day-col-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const toggleView = () => { $settings.scheduleView = VIEWS[(VIEWS.indexOf($settings.scheduleView || 'auto') + 1) % VIEWS.length] }
  const set = (k, v) => { $settings[k] = v }

  $search.load = (_, __, variables) => {
    textVars = variables
    const raw = fetchAllScheduleEntries(variables)
    raw.then(r => {
      textGroups = (r?.data?.Page?.media ?? []).reduce((acc, item) => {
        if (item.__dayHeader) acc.push({ day: item.day, items: [] })
        else acc.at(-1)?.items.push({ media: item, airingAt: nextAiring(item?.airingSchedule?.nodes, variables)?.airingAt ?? null })
        return acc
      }, [])
    }).catch(() => { textGroups = [] })
    return SectionsManager.wrapResponse(raw, 150)
  }

  $: autoView     = screenWidth >= 1400 ? 'list' : screenWidth >= MOBILE_LG ? 'compact' : 'agenda'
  $: currentView  = $settings.scheduleView || 'auto'
  $: nextView     = VIEWS[(VIEWS.indexOf(currentView) + 1) % VIEWS.length]
  $: resolvedView = (() => {
    const c = currentView === 'auto' ? autoView : currentView
    if (screenWidth < MOBILE_SM && (c === 'grid' || c === 'compact')) return 'agenda'
    if (screenWidth < MOBILE_LG && c === 'grid') return 'compact'
    return c
  })()
  $: isTextMode  = resolvedView === 'list' || resolvedView === 'agenda' || resolvedView === 'guide' || resolvedView === 'compact'
  $: activeDays  = new Set(textGroups.map(g => g.day))
  $: todayGroup  = textGroups.find(g => g.day === TODAY) ?? null
  $: otherGroups = textGroups.filter(g => g.day !== TODAY)

  // all layout settings are independent per resolved view
  $: gridCols   = $settings[VK('cols', resolvedView)] ?? 'auto'
  $: gridRows   = $settings[VK('gridrows', resolvedView)] ?? 0
  $: schedRows  = $settings[VK('rows', resolvedView)] ?? 0
  $: fontSize   = $settings[VK('font', resolvedView)] ?? 100
  $: cardW      = $settings.cardW      ?? 38
  $: cardH      = $settings.cardH      ?? 32
  $: cardImg    = $settings.cardImg    ?? 17
  $: compactImg = $settings.compactImg ?? 80
  $: compactH   = $settings.compactH   ?? 110

  $: cardVars   = `--card-w:${cardW}rem;--card-h:${cardH}rem;--card-img:${cardImg}rem;--compact-img:${compactImg}px;--compact-card-h:${compactH}px;--sched-font:${fontSize}%`
  $: itemsStyle = schedRows ? `display:grid;grid-template-rows:repeat(${schedRows},auto);grid-auto-flow:column;gap:0.8rem;align-items:start` : ''
  $: gridStyle  = gridRows  ? `grid-auto-flow:column;grid-template-rows:repeat(${gridRows},1fr);grid-template-columns:unset` : `grid-template-columns:${gridCols === 'auto' ? 'repeat(auto-fill,minmax(350px,1fr))' : `repeat(${gridCols},1fr)`}`
</script>

<div class="vmw">
  <button class="fab" on:click={toggleView}>
    <span class="fab-cur">{VIEW_LABELS[currentView]}{currentView === 'auto' ? ` · ${VIEW_LABELS[resolvedView]}` : ''}</span>
    <span class="fab-nxt">→ {VIEW_LABELS[nextView]}</span>
  </button>
  <div class="vopts">
    {#if isTextMode}
      <div class="og">
        <span>Columns</span>
        <div class="row">
          {#each ['auto', 1, 2, 3] as c}
            <button class:active={gridCols === c} on:click={() => $settings[VK('cols', resolvedView)] = c}>{c}</button>
          {/each}
        </div>
      </div>
      <div class="og">
        <span>Grid Rows</span>
        <div class="row">
          {#each ['auto', 1, 2, 3, 4] as r}
            <button class:active={gridRows === (r === 'auto' ? 0 : r)} on:click={() => $settings[VK('gridrows', resolvedView)] = r === 'auto' ? 0 : r}>{r}</button>
          {/each}
        </div>
      </div>
      <div class="og">
        <span>Rows per col</span>
        <div class="row">
          {#each ['auto', 1, 2, 3, 4] as r}
            <button class:active={schedRows === (r === 'auto' ? 0 : r)} on:click={() => $settings[VK('rows', resolvedView)] = r === 'auto' ? 0 : r}>{r}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#if resolvedView === 'grid'}
      <div class="og"><span>Card Width <em>{cardW}rem</em></span><input type="range" min="20" max="60" step="1" value={cardW} on:input={e => set('cardW', +e.target.value)} /></div>
      <div class="og"><span>Card Height <em>{cardH}rem</em></span><input type="range" min="16" max="55" step="1" value={cardH} on:input={e => set('cardH', +e.target.value)} /></div>
      <div class="og"><span>Image Width <em>{cardImg}rem</em></span><input type="range" min="8" max="35" step="1" value={cardImg} on:input={e => set('cardImg', +e.target.value)} /></div>
    {/if}
    {#if resolvedView === 'compact'}
      <div class="og"><span>Thumb Width <em>{compactImg}px</em></span><input type="range" min="40" max="200" step="4" value={compactImg} on:input={e => set('compactImg', +e.target.value)} /></div>
      <div class="og"><span>Row Height <em>{compactH}px</em></span><input type="range" min="50" max="200" step="4" value={compactH} on:input={e => set('compactH', +e.target.value)} /></div>
    {/if}
    <div class="og"><span>Font Size <em>{fontSize}%</em></span><input type="range" min="60" max="160" step="5" value={fontSize} on:input={e => $settings[VK('font', resolvedView)] = +e.target.value} /></div>
    <div class="og">
      <span>Cards</span>
      <div class="row col">
        <button class:active={$settings.compactCards} on:click={() => $settings.compactCards = !$settings.compactCards}>{$settings.compactCards ? '✓ Compact' : 'Compact Mode'}</button>
        <button class:active={$settings.hideStats} on:click={() => $settings.hideStats = !$settings.hideStats}>{$settings.hideStats ? '✓ Stats Hidden' : 'Hide Stats'}</button>
      </div>
    </div>
  </div>
</div>

<div class='schedule-root' class:hide-stats={$settings.hideStats} class:compact-cards={$settings.compactCards} style="{cardVars};font-size:var(--sched-font,100%)">
  <div class:hidden-search={isTextMode} class:grid-scroll-wrap={!isTextMode}>
    <SearchPage key={key} search={search}/>
  </div>

  <div class='day-carousel'>
    {#each ORDERED_DAYS as day, i}
      {@const distance = Math.min(i, ORDERED_DAYS.length - i)}
      <button class='day-pill' class:is-today={day === TODAY} class:is-selected={day === selectedDay} class:no-content={!activeDays.has(day)}
        style="--dist:{distance}" on:click={() => scrollToDay(day)} disabled={!activeDays.has(day) && isTextMode}>
        <span class='day-date'>{DAY_DATES[day]}</span>
        <span class='day-short'>{day.slice(0, 3)}</span>
        {#if day === TODAY}<span class='today-dot'></span>{/if}
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
                <span class='guide-now-date'>{now.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) + ', ' + now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })}</span>
              </div>
              {#if todayGroup}
                <div class='guide-list'>
                  {#each todayGroup.items as { media, airingAt }}
                    {@const img = media?.coverImage?.extraLarge || media?.coverImage?.medium}
                    <div class='guide-row' use:trackMouse use:click={() => modal.open(modal.ANIME_DETAILS, media)}>
                      <span class='guide-name'>{anilistClient.title(media)}</span>
                      <span class='guide-time'>{fmtTime(airingAt)}</span>
                      {#if img}<img class='guide-hover-art' src={img} alt='' />{/if}
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
                      {@const img = media?.coverImage?.extraLarge || media?.coverImage?.medium}
                      <div class='guide-row' use:trackMouse use:click={() => modal.open(modal.ANIME_DETAILS, media)}>
                        <span class='guide-name'>{anilistClient.title(media)}</span>
                        <span class='guide-time'>{fmtTime(airingAt)}</span>
                        {#if img}<img class='guide-hover-art' src={img} alt='' />{/if}
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
        <div class='text-grid-wrap' style="--cols:{gridCols === 'auto' ? 'repeat(auto-fill,minmax(350px,1fr))' : `repeat(${gridCols},1fr)`}">
          {#if textGroups.length}
            <div class='text-grid' class:single-col={resolvedView === 'agenda'} style={gridStyle}>
              {#each textGroups as group}
                <div class='text-col' id='day-col-{group.day}'>
                  <div class='text-day-header'>{group.day}</div>
                  <div class="items-container" style={itemsStyle}>
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
  /* FAB MENU */
  .vmw { position:fixed; bottom:60px; left:60px; z-index:9999; display:flex; flex-direction:column-reverse; align-items:flex-start; }
  .fab { position:relative; z-index:10; padding:12px 20px; font-size:13px; font-weight:bold; text-transform:uppercase; background:var(--accent-color); color:#000; border:none; border-radius:50px; cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.3); display:flex; flex-direction:column; align-items:center; gap:2px; min-width:110px; }
  .fab-cur { font-size:15px; font-weight:900; letter-spacing:0.05em; line-height:1; }
  .fab-nxt { font-size:10px; font-weight:600; opacity:0.6; letter-spacing:0.04em; }
  .vopts { display:none; flex-direction:column; gap:12px; background:#111; border:1px solid #333; border-radius:12px; padding:12px; margin-bottom:12px; min-width:220px; box-shadow:0 10px 40px rgba(0,0,0,0.8); position:relative; }
  .vopts::after { content:''; position:absolute; top:100%; left:0; width:100%; height:25px; }
  .vmw:hover .vopts { display:flex; }
  .og { display:flex; flex-direction:column; gap:6px; }
  .og span { font-size:9px; text-transform:uppercase; color:#555; font-weight:800; letter-spacing:1px; }
  .og em { font-style:normal; color:var(--accent-color); font-size:9px; font-weight:700; margin-left:4px; }
  .row { display:flex; gap:4px; }
  .row.col { flex-direction:column; }
  .vopts button { background:#1a1a1a; border:1px solid transparent; color:#888; padding:8px; border-radius:6px; cursor:pointer; font-size:11px; flex:1; text-align:center; }
  .vopts button.active { border-color:var(--accent-color); color:var(--accent-color); background:color-mix(in srgb,var(--accent-color),transparent 95%); }
  .vopts input[type="range"] { width:100%; accent-color:var(--accent-color); cursor:pointer; margin:2px 0; }

  /* DAY CAROUSEL */
  .day-carousel { position:sticky; top:0; z-index:100; display:flex; justify-content:center; align-items:stretch; gap:2px; padding:6px 12px 0; background:hsl(var(--dark-color-hsl,220 13% 9%)); border-bottom:1px solid rgba(255,255,255,0.06); }
  .day-pill { display:flex; flex-direction:column; align-items:center; gap:3px; background:none; border:none; border-radius:8px 8px 0 0; padding:8px 18px 10px; cursor:pointer; transition:opacity 0.18s,background 0.18s; opacity:calc(1 - clamp(0,var(--dist)*0.13,0.65)); position:relative; flex:1; max-width:90px; }
  .day-pill::after { content:''; position:absolute; bottom:0; left:10%; right:10%; height:2px; border-radius:2px 2px 0 0; background:transparent; transition:background 0.18s; }
  .day-pill.is-selected::after { background:var(--accent-color); }
  .day-pill:hover:not(:disabled) { opacity:1 !important; background:rgba(255,255,255,0.04); }
  .day-pill.is-selected { opacity:1 !important; background:color-mix(in srgb,var(--accent-color),transparent 95%); }
  .day-pill.no-content { opacity:0.18 !important; cursor:default; }
  .day-date { font-size:15px; font-weight:300; color:rgba(255,255,255,0.55); line-height:1; letter-spacing:-0.01em; transition:color 0.18s; }
  .day-pill.is-today .day-date { display:flex; align-items:center; justify-content:center; width:26px; height:26px; background:var(--accent-color); color:#000; border-radius:50%; font-size:13px; font-weight:700; }
  .day-pill.is-selected:not(.is-today) .day-date { color:var(--accent-color); font-weight:500; }
  .day-short { font-size:10px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:rgba(255,255,255,0.35); line-height:1; transition:color 0.18s; }
  .day-pill.is-today .day-short { color:rgba(255,255,255,0.55); }
  .day-pill.is-selected .day-short { color:rgba(255,255,255,0.7); }
  .today-dot { display:none; }

  /* LAYOUT */
  .hidden-search { display:none !important; }
  .text-scroll-wrap, .grid-scroll-wrap { overflow-y:auto; height:calc(100vh - 50px); }
  .text-loading { padding:3em; text-align:center; color:rgba(190,190,210,0.3); font-size:0.95em; letter-spacing:0.05em; }
  .text-grid { display:grid; grid-template-columns:var(--cols); gap:1.5rem; padding:1rem; align-items:start; }
  .text-grid.single-col { grid-template-columns:1fr; max-width:780px; margin:0 auto; }
  .text-col { display:flex; flex-direction:column; min-width:0; width:100%; scroll-margin-top:70px; }
  .items-container { display:flex; flex-direction:column; gap:0.8rem; width:100%; }
  .text-day-header { padding:1em 0; font-size:1.1em; font-weight:900; color:var(--accent-color); text-transform:uppercase; border-bottom:1px solid #222; margin-bottom:1em; }

  :global(.schedule-root.hide-stats) :global(.stats-col) { display:none !important; }
  :global(.schedule-root.compact-cards) :global(.schedule-card) { height:75px !important; }
  :global(.schedule-root.compact-cards) :global(.img-col) { flex:0 0 55px !important; }
  :global(.schedule-root.compact-cards) :global(.description-wrap),
  :global(.schedule-root.compact-cards) :global(.genres),
  :global(.schedule-root.compact-cards) :global(.subtitle) { display:none !important; }
  :global(.schedule-root.compact-cards) :global(.content-col) { padding:0.2rem 0.8rem !important; justify-content:center !important; }
  @media (max-width:800px) { .text-grid { grid-template-columns:1fr !important; } }

  /* GUIDE */
  .guide-wrap { display:grid; grid-template-columns:320px 1fr; min-height:80vh; padding:2rem; max-width:800px; margin:0 auto; }
  .guide-now { scroll-margin-top:70px; border-right:1px solid rgba(255,255,255,0.07); padding-right:2rem; margin-right:2rem; }
  .guide-now-header, .guide-week-header { margin-bottom:1.5rem; }
  .guide-now-title, .guide-week-header { display:block; font-size:2.5em; font-weight:700; color:#fff; letter-spacing:-0.02em; }
  .guide-now-date { display:block; font-size:1.2em; color:rgba(255,255,255,0.3); margin-top:0.3em; font-weight:400; }
  .guide-list { display:flex; flex-direction:column; }
  .guide-row { display:flex; justify-content:space-between; align-items:baseline; padding:0.55em 0.25em; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; gap:1em; transition:background 0.12s; border-radius:4px; }
  .guide-row:hover { background:rgba(255,255,255,0.04); }
  .guide-row:last-child { border-bottom:none; }
  .guide-hover-art { position:fixed; width:11.25em; height:15.9em; object-fit:cover; border-radius:0.6em; box-shadow:0 8px 32px rgba(0,0,0,0.75); pointer-events:none; z-index:9999; opacity:0; transform:scale(0.92) translate(16px,-50%); transition:opacity 0.15s,transform 0.15s; top:var(--my,-9999px); left:var(--mx,-9999px); }
  .guide-row:hover .guide-hover-art { opacity:1; transform:scale(1) translate(16px,-50%); }
  .guide-name { font-size:1.3em; font-weight:400; color:rgba(255,255,255,0.75); flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .guide-time { font-size:1.2em; font-weight:500; color:rgba(255,255,255,0.35); flex-shrink:0; font-variant-numeric:tabular-nums; letter-spacing:0.02em; }
  .guide-day-section { margin-bottom:2em; scroll-margin-top:70px; }
  .guide-day-name { font-size:1.8em; font-weight:700; color:rgba(255,255,255,0.85); margin-bottom:0.75em; letter-spacing:-0.02em; }
  .guide-empty { color:rgba(255,255,255,0.2); font-size:0.85em; padding:1em 0; }
  @media (max-width:900px) {
    .guide-wrap { grid-template-columns:1fr; }
    .guide-now { border-right:none; border-bottom:1px solid rgba(255,255,255,0.07); padding-bottom:2rem; margin-bottom:2rem; padding-right:0; margin-right:0; }
  }
</style>