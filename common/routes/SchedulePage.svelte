<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { cache, cacheReady, caches } from '@/modules/cache.js'

  const SCHEDULE_CACHE_KEY = 'schedule_page_ids'
  const SCHEDULE_TTL = 60 * 60 * 1000 

  const STATUS_MAP = {
    CURRENT:   { label: 'WATCHING', color: '#ff003c' }, 
    PLANNING:  { label: 'PLAN TO WATCH', color: '#00f2ff' },
    COMPLETED: { label: 'COMPLETED', color: '#ffffff' },
    PAUSED:    { label: 'ON HOLD', color: '#f59e5e' },
    DROPPED:   { label: 'DROPPED', color: '#444444' },
    REPEATING: { label: 'REWATCHING', color: '#5ef5d4' }
  }

  function getBehind(media, airingNode) {
    const progress = media?.mediaListEntry?.progress ?? null
    const ep = airingNode?.episode ?? null
    return progress !== null && ep !== null ? Math.max(0, ep - 1 - progress) : 0
  }

  async function fetchAllScheduleEntries() {
    await cacheReady()
    const cached = cache.cachedEntry(caches.QUERIES, SCHEDULE_CACHE_KEY)
    if (cached) return cached
    const airingLists = await animeSchedule.subAiringLists.value
    const ids = airingLists.map(e => e?.id).filter(Boolean)
    return cache.cacheEntry(
      caches.QUERIES,
      SCHEDULE_CACHE_KEY,
      {},
      anilistClient.searchAllIDS({ id: ids, page: 1, perPage: 50 }),
      Date.now() + SCHEDULE_TTL
    )
  }

  function startOfToday() {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  }

  function buildDays(media) {
    const startOfTodayDate = startOfToday()
    const startTodayTs = Math.floor(startOfTodayDate.getTime() / 1000)
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(startOfTodayDate.getTime() + i * 86400000),
      index: i,
      items: []
    }))
    const seen = new Set()
    for (const m of media) {
      if (!m || seen.has(m.id)) continue
      const nodes = m?.airingSchedule?.nodes ?? []
      const node = nodes
        ?.filter(n => n?.airingAt >= startTodayTs && n?.airingAt < startTodayTs + 7 * 86400)
        ?.sort((a, b) => a.airingAt - b.airingAt)[0]
      if (!node) continue
      seen.add(m.id)
      const airDate = new Date(node.airingAt * 1000)
      const dayIndex = Math.round((new Date(airDate.getFullYear(), airDate.getMonth(), airDate.getDate()) - startOfTodayDate) / 86400000)
      if (dayIndex >= 0 && dayIndex < days.length) {
        days[dayIndex].items.push({ media: m, airingAt: node.airingAt, episode: node.episode })
      }
    }
    for (const day of days) day.items.sort((a, b) => a.airingAt - b.airingAt)
    return days
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'

  let days = [], selectedIndex = 0, now = new Date(), hoveredMedia = null, hoverX = 0, hoverY = 0, is12h = false
  let filterStatus = 'ALL'
  let scheduleMedia = [], lastBuildDay = '', lastBuiltMedia

  const fmtTime = (ts, force12) => new Date(ts * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12: force12 ?? is12h })
  const fmtWeekdayShort = (date) => date.toLocaleDateString([], { weekday: 'short' }).toUpperCase()
  const fmtMonthShort = (date) => date.toLocaleDateString([], { month: 'short' }).toUpperCase()
  const fmtHeaderDate = (date) => date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
  const isUpNext = (ts, current) => { const d = ts - Math.floor(current.getTime()/1000); return d > 0 && d < 3600 }
  const fmtCountdown = (ts, current) => {
    const diff = ts - Math.floor(current.getTime() / 1000)
    if (diff <= 0) return 'NOW'
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}H ${m}M` : `${m}M`
  }

  function rebuildDays() {
    const todayKey = new Date().toDateString()
    const dayChanged = todayKey !== lastBuildDay
    const changed = dayChanged || lastBuiltMedia !== scheduleMedia
    if (!changed && days.length) return
    lastBuildDay = todayKey
    lastBuiltMedia = scheduleMedia
    days = buildDays(scheduleMedia)
    if (dayChanged && selectedIndex !== 0) selectedIndex = 0
  }

  onMount(() => {
    rebuildDays()
    const t = setInterval(() => {
      now = new Date()
      rebuildDays()
    }, 1000)
    fetchAllScheduleEntries().then(r => {
      scheduleMedia = r?.data?.Page?.media || []
      rebuildDays()
    })
    return () => clearInterval(t)
  })

  function handleMouseMove(e, media) { hoveredMedia = media; hoverX = e.clientX; hoverY = e.clientY }
  const toggleClock = () => { is12h = !is12h }

  $: filteredDays = days.map(d => ({
    ...d,
    items: filterStatus === 'ALL' ? d.items : d.items.filter(i => i.media?.mediaListEntry?.status === filterStatus)
  }))
  $: selectedDay = filteredDays[selectedIndex] || null
</script>

<style>
  :root { --card-accent: var(--card-fg); }
  :global(body) {
    margin: 0; overflow: hidden;
    background: var(--card-bg);
    color: var(--card-fg);
    font-family: system-ui, sans-serif;
  }
  :global(*:focus:not(:focus-visible)) { outline: none; }
  :global(*:focus-visible) { outline: 4px solid var(--card-fg); outline-offset: 2px; border-radius: 8px; }

  .page {
    display: flex; flex-direction: column;
    height: 100vh; overflow: hidden;
    background: var(--card-bg); color: var(--card-fg);
  }

  .page-header {
    flex: none; z-index: 5;
    padding: 2.5rem 3rem 1.5rem;
    background: var(--card-bg);
    border-bottom: 1px solid var(--card-line);
  }

  .header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 2rem; }
  .page-header h1 {
    font-weight: 900; font-size: clamp(2rem, 4vw, 3.5rem);
    line-height: 1; margin: 0; letter-spacing: -0.02em;
    color: var(--card-fg); text-transform: uppercase;
  }
  .header-meta {
    font-weight: 700; font-size: 0.85rem; color: var(--card-dim);
    margin-top: 12px; letter-spacing: 0.1em; text-transform: uppercase;
  }
  .live-clock {
    font-weight: 900; font-size: 1.6rem; color: var(--card-dim);
    cursor: pointer; transition: color 0.2s; user-select: none;
    letter-spacing: -0.02em; white-space: nowrap;
  }
  .live-clock:hover { color: var(--card-fg); }

  .day-strip {
    display: grid; grid-template-columns: repeat(7, 1fr);
    gap: 10px; margin-top: 2rem;
  }
  .day-btn {
    position: relative;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 12px 8px; cursor: pointer;
    background: var(--card-bg2); border: 1px solid var(--card-line);
    color: var(--card-dim); transition: all 0.15s;
    text-transform: uppercase; border-radius: 0;
  }
  .day-btn:hover { border-color: var(--card-fg); color: var(--card-fg); transform: translateY(-2px); }
  .day-btn.active { background: var(--card-fg); color: var(--card-bg); border-color: var(--card-fg); }
  .day-btn.today:not(.active) { border-color: var(--card-accent); color: var(--card-accent); }
  .day-weekday { font-size: 0.7rem; font-weight: 800; letter-spacing: 0.12em; }
  .day-number { font-size: 1.6rem; font-weight: 900; line-height: 1; }
  .day-month { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.1em; opacity: 0.7; }
  .day-count {
    position: absolute; top: 6px; right: 8px;
    font-size: 0.6rem; font-weight: 900; letter-spacing: 0.05em;
    background: var(--card-accent); color: var(--card-bg);
    padding: 1px 6px; border-radius: 50px;
  }

  .filter-bar { display: flex; gap: 8px; margin-top: 1.5rem; flex-wrap: wrap; }
  .filter-btn {
    background: var(--card-bg2); border: 1px solid var(--card-line);
    color: var(--card-dim); padding: 6px 16px;
    font-weight: 700; font-size: 0.7rem; letter-spacing: 0.1em;
    cursor: pointer; transition: all 0.15s; border-radius: 50px; text-transform: uppercase;
  }
  .filter-btn:hover { border-color: var(--card-fg); color: var(--card-fg); }
  .filter-btn.active { background: var(--card-fg); color: var(--card-bg); border-color: var(--card-fg); }

  .day-content { flex: 1; overflow-y: auto; padding: 3rem; scrollbar-width: none; }
  .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }

  .entry-item {
    position: relative; overflow: hidden;
    display: flex; align-items: stretch;
    height: 150px; cursor: pointer;
    background: var(--card-bg2); border: 1px solid var(--card-line);
    border-left: 4px solid var(--status-color); border-radius: 0;
    transition: all 0.15s;
  }
  .entry-item:hover {
    background: var(--card-bg); border-color: var(--card-accent);
    border-left-color: var(--card-accent); transform: scale(1.02);
  }

  .entry-main {
    flex: 1; min-width: 0;
    padding: 1.1rem 1.2rem;
    display: flex; flex-direction: column; justify-content: center;
  }
  .entry-status {
    display: inline-block; width: fit-content;
    background: var(--status-color); color: var(--card-bg);
    font-weight: 900; font-size: 0.62rem; letter-spacing: 0.1em;
    padding: 3px 10px; margin-bottom: 10px; border-radius: 50px;
    text-transform: uppercase;
  }
  .entry-title {
    font-weight: 900; font-size: 1.2rem; line-height: 1.2;
    color: var(--card-fg); text-transform: uppercase; letter-spacing: 0.01em;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .entry-meta { display: flex; align-items: baseline; gap: 12px; margin-top: 12px; font-weight: 800; flex-wrap: wrap; }
  .entry-time { font-size: 1.5rem; font-weight: 900; color: var(--card-fg); }
  .entry-ep { font-size: 0.8rem; color: var(--card-dim); letter-spacing: 0.05em; }
  .entry-up { color: var(--card-accent); font-size: 0.8rem; letter-spacing: 0.05em; animation: blink 0.8s infinite; }
  .behind-count { color: var(--card-accent); font-size: 0.8rem; letter-spacing: 0.05em; }

  .entry-poster { position: relative; flex: none; width: 104px; }
  .entry-poster::after {
    content: ''; position: absolute; inset: 0; z-index: 2;
    border-left: 1px solid var(--card-line);
  }
  .entry-poster img {
    width: 100%; height: 100%; object-fit: cover; display: block;
    filter: saturate(0.9) brightness(0.95); transition: filter 0.3s;
  }
  .entry-item:hover .entry-poster img { filter: saturate(1.15) brightness(1.05); }

  .missed-indicator {
    position: absolute; top: 8px; right: 8px; z-index: 3;
    background: var(--card-accent); color: var(--card-bg);
    font-weight: 900; font-size: 0.6rem; padding: 2px 8px;
    letter-spacing: 0.08em; text-transform: uppercase;
  }

  .empty-state {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    min-height: 40vh; gap: 14px; text-align: center;
    border: 1px dashed var(--card-line);
    color: var(--card-dim);
  }
  .empty-symbol { font-size: 3rem; font-weight: 900; line-height: 1; opacity: 0.4; }
  .empty-text { font-weight: 800; font-size: 0.9rem; letter-spacing: 0.2em; text-transform: uppercase; }

  .preview-popup {
    position: fixed; z-index: 1000; pointer-events: none; width: 420px;
    border: 1px solid var(--card-line); background: var(--card-bg2);
    border-radius: 0; overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }

  @keyframes blink { 50% { opacity: 0.2; } }
</style>

<div class="page">
  <header class="page-header">
    <div class="header-top">
      <div>
        <h1>{selectedDay ? fmtHeaderDate(selectedDay.date) : 'SCHEDULE'}</h1>
        <div class="header-meta">
          {selectedDay?.items.length || 0} SHOWS
        </div>
      </div>
      <div class="live-clock" on:click={toggleClock} role="button" tabindex="0">
        {now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: is12h })}
      </div>
    </div>

    <div class="day-strip" role="tablist" aria-label="Select day">
      {#each days as day, i}
        {@const isToday = i === 0}
        <button class="day-btn"
            class:active={i === selectedIndex}
            class:today={isToday}
            role="tab" tabindex="0"
            on:click={() => selectedIndex = i}>
          <span class="day-month">{day.date.getMonth() !== days[0]?.date.getMonth() || day.date.getFullYear() !== days[0]?.date.getFullYear() ? fmtMonthShort(day.date) : ''}</span>
          <span class="day-weekday">{isToday ? 'TODAY' : fmtWeekdayShort(day.date)}</span>
          <span class="day-number">{day.date.getDate()}</span>
          {#if day.items.length > 0}
            <span class="day-count">{day.items.length}</span>
          {/if}
        </button>
      {/each}
    </div>

    <div class="filter-bar">
      <button class="filter-btn" class:active={filterStatus === 'ALL'} on:click={() => filterStatus = 'ALL'}>ALL SHOWS</button>
      {#each Object.entries(STATUS_MAP) as [key, val]}
        <button class="filter-btn" class:active={filterStatus === key} on:click={() => filterStatus = key}>{val.label}</button>
      {/each}
    </div>
  </header>

  <main class="day-content">
    {#if selectedDay && selectedDay.items.length > 0}
      <div class="grid-container">
        {#each selectedDay.items as {media, airingAt, episode}}
          {@const status = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'UNKNOWN', color: '#444' }}
          {@const behind = getBehind(media, {episode})}
          {@const up = isUpNext(airingAt, now)}
          <div class="entry-item"
              style="--status-color: {status.color}; --card-accent: {media.coverImage?.color || status.color}"
              use:click={() => modal.open(modal.ANIME_DETAILS, media)}
              on:mousemove={(e) => handleMouseMove(e, media)}
              on:mouseleave={() => hoveredMedia = null}
              role="button" tabindex="0">

            <div class="entry-main">
              <div class="entry-status">{status.label}</div>
              <div class="entry-title">{anilistClient.title(media)}</div>
              <div class="entry-meta">
                <span class="entry-time">{fmtTime(airingAt)}</span>
                <span class="entry-ep">EP {episode}</span>
                {#if up}
                  <span class="entry-up">AIRING IN {fmtCountdown(airingAt, now)}</span>
                {/if}
                {#if behind > 0}
                  <span class="behind-count">BEHIND: {behind}</span>
                {/if}
              </div>
            </div>

            <div class="entry-poster">
              <img src={media.coverImage?.large || media.coverImage?.extraLarge} alt="" loading="lazy" />
              {#if behind > 0}
                <div class="missed-indicator">BEHIND</div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty-state">
        <div class="empty-symbol">&empty;</div>
        <div class="empty-text">No shows scheduled</div>
      </div>
    {/if}
  </main>
</div>

{#if hoveredMedia}
  <div class="preview-popup" style="left: {hoverX + 20}px; top: {hoverY}px; transform: translateY(-50%);">
    <img src={hoveredMedia.coverImage.extraLarge} style="width: 100%; display: block;" alt=""/>
  </div>
{/if}
