<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { cache, cacheReady, caches } from '@/modules/cache.js'

  const SCHEDULE_CACHE_KEY = 'schedule_page_ids'
  const SCHEDULE_TTL = 60 * 60 * 1000 

  const STATUS_MAP = {
    CURRENT:   { label: 'WATCHING', color: '#ff003c' }, 
    PLANNING:  { label: 'PLANNING', color: '#00f2ff' },
    COMPLETED: { label: 'COMPLETED', color: '#ffffff' },
    PAUSED:    { label: 'PAUSED', color: '#f59e5e' },
    DROPPED:   { label: 'DROPPED', color: '#444444' },
    REPEATING: { label: 'REWATCHING', color: '#5ef5d4' }
  }

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  function getBehindCount(media, airingNode) {
    const progress = media?.mediaListEntry?.progress ?? null
    const ep = airingNode?.episode ?? null
    return progress !== null && ep !== null ? Math.max(0, ep - 1 - progress) : 0
  }

  async function fetchScheduleData() {
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

  function groupMediaByDay(media) {
    const nowTs = Math.floor(Date.now() / 1000)
    const todayIdx = new Date().getDay()
    const grouped = new Map(DAYS.map(d => [d, []]))
    const seen = new Set()
    for (const m of media) {
      if (!m || seen.has(m.id)) continue
      const nodes = m?.airingSchedule?.nodes ?? []
      const node = nodes.find(n => Math.abs(n.airingAt - nowTs) < 86400 * 3) || nextAiring(nodes)
      if (!node?.airingAt) continue
      seen.add(m.id)
      grouped.get(DAYS[new Date(node.airingAt * 1000).getDay()]).push({ media: m, airingAt: node.airingAt, episode: node.episode })
    }
    return [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)].map(day => ({
      day,
      items: (grouped.get(day) || []).sort((a, b) => a.airingAt - b.airingAt)
    }))
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'

  let scheduleGroups = [], currentTime = new Date(), hoveredMedia = null, hoverX = 0, hoverY = 0, use12Hour = false
  let statusFilter = 'ALL'

  const formatTime = (ts, force12) => new Date(ts * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12: force12 ?? use12Hour })
  const isAiringSoon = (ts, current) => { const d = ts - Math.floor(current.getTime()/1000); return d > 0 && d < 3600 }
  const getCountdown = (ts, current) => {
    const diff = ts - Math.floor(current.getTime() / 1000)
    if (diff <= 0) return 'AIRING NOW'
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  onMount(() => {
    const interval = setInterval(() => { currentTime = new Date() }, 1000)
    fetchScheduleData().then(r => { scheduleGroups = groupMediaByDay(r?.data?.Page?.media || []) })
    return () => clearInterval(interval)
  })

  function updateHoverPosition(e, media) { hoveredMedia = media; hoverX = e.clientX; hoverY = e.clientY }
  const toggleClockFormat = () => { use12Hour = !use12Hour }

  $: filteredGroups = scheduleGroups.map(g => ({
    ...g,
    items: statusFilter === 'ALL' ? g.items : g.items.filter(i => i.media?.mediaListEntry?.status === statusFilter)
  }))
  $: todayItems = filteredGroups[0] || null
  $: upcomingDays = filteredGroups.slice(1).filter(g => g.items.length > 0)
</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700;900&display=swap');
  :root { --accent: #ff003c; --bg: #030303; --panel: #0a0a0a; }
  :global(body) { margin: 0; overflow: hidden; background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; }

  .layout { display: grid; grid-template-columns: 550px 1fr; height: 100vh; overflow: hidden; }
  
  .sidebar { background: linear-gradient(to right, #000, var(--panel)); border-right: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; height: 100vh; }
  .sidebar-header { padding: 4rem 3rem 2.5rem; position: relative; }
  .clock { font-family: 'Bebas Neue'; font-size: 7.2rem; color: #333; position: absolute; top: 2rem; right: 3rem; cursor: pointer; transition: color 0.2s; user-select: none; }
  .clock:hover { color: var(--accent); }
  .sidebar-header h1 { font-family: 'Bebas Neue'; font-size: 8rem; line-height: 0.75; margin: 0; color: #fff; letter-spacing: -2px; }
  .date-meta { font-family: 'Bebas Neue'; font-size: 1.2rem; color: #555; margin-top: 10px; letter-spacing: 2px; }
  .list-container { flex: 1; overflow-y: auto; padding: 0 3rem 4rem; scrollbar-width: none; }

  .media-card { position: relative; height: 350px; margin-bottom: 3rem; cursor: pointer; border: 1px solid #222; transition: 0.3s; background: #000; }
  .media-card:hover { border-color: var(--accent); transform: scale(1.02); }
  .media-card img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.5); transition: 0.3s; }
  .media-card:hover img { filter: brightness(0.8); }

  .status-label { position: absolute; top: 0; left: 0; background: var(--status-color); color: #000; padding: 8px 16px; font-weight: 900; font-size: 1rem; z-index: 5; text-transform: uppercase; }
  .unwatched-tag { position: absolute; top: 1.5rem; right: -5px; background: var(--accent); color: #fff; padding: 0.6rem 1.2rem; font-family: 'Bebas Neue'; font-size: 1.6rem; z-index: 6; box-shadow: 4px 4px 0 #000; }

  .card-details { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0,0,0,0.9) 0%, transparent 60%); padding: 2.5rem; display: flex; flex-direction: column; justify-content: flex-end; border-left: 8px solid var(--status-color); }
  .media-title { font-family: 'Bebas Neue'; font-size: 3.5rem; line-height: 0.9; margin: 0; text-transform: uppercase; }
  .media-info { font-size: 1.1rem; font-weight: 700; color: #aaa; margin-top: 12px; display: flex; align-items: center; gap: 15px; }
  .media-info b { color: #fff; }

  .main-schedule { padding: 4rem; background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.02) 1px, transparent 0); background-size: 40px 40px; overflow-y: auto; }
  .day-group { margin-bottom: 4rem; }
  .day-header { font-family: 'Bebas Neue'; font-size: 3rem; color: #444; margin-bottom: 1rem; border-bottom: 2px solid #111; display: flex; justify-content: space-between; align-items: baseline; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }

  .list-item { 
    background: #000; border: 1px solid #111; border-left: 4px solid var(--status-color); 
    height: 90px; cursor: pointer; transition: 0.3s; 
    position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; padding: 0 1.2rem;
  }
  .list-item:hover { background: #111; border-color: var(--status-color); transform: translateX(5px); }

  .item-thumb { 
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; 
    opacity: 0.2; filter: grayscale(1); transition: 0.4s; z-index: 1; 
  }
  .list-item:hover .item-thumb { opacity: 0.4; filter: grayscale(0); }

  .item-info { position: relative; z-index: 2; }
  .item-title { font-weight: 900; font-size: 0.95rem; line-height: 1.1; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; margin-bottom: 2px; text-transform: uppercase; }
  .item-meta { display: flex; align-items: baseline; gap: 10px; font-family: 'Bebas Neue'; }
  .item-time { font-size: 1.6rem; }
  .item-ep { font-size: 1.1rem; opacity: 0.6; }
  .unwatched-alert { color: var(--accent); font-size: 1.1rem; }

  .indicator-dot { position: absolute; top: 0; right: 0; background: var(--accent); color: #fff; font-family: 'Bebas Neue'; font-size: 0.7rem; padding: 1px 6px; z-index: 3; }

  .preview-popover { position: fixed; z-index: 1000; pointer-events: none; width: 420px; border: 1px solid #333; background: #000; padding: 5px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); }
  
  .filter-controls { display: flex; gap: 12px; margin-top: 1rem; }
  .filter-tab { 
    background: transparent; border: 1px solid #222; color: #444; 
    padding: 6px 16px; font-family: 'Bebas Neue'; font-size: 1.1rem; 
    cursor: pointer; transition: 0.2s; 
  }
  .filter-tab:hover { color: #fff; border-color: #444; }
  .filter-tab.active { background: #fff; color: #000; border-color: #fff; }
  
  @keyframes pulse { 50% { opacity: 0.4; } }
</style>

<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="clock" on:click={toggleClockFormat} role="button" tabindex="0">
        {currentTime.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: use12Hour })}
      </div>
      <h1>SCHEDULE</h1>
      <div class="date-meta">
        {currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} // 
        {todayItems?.items.length || 0} ENTRIES TODAY
      </div>
    </div>
    
    <div class="list-container">
      {#if todayItems}
        {#each todayItems.items as {media, airingAt, episode}}
          {@const config = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'OTHER', color: '#444' }}
          {@const unwatched = getBehindCount(media, {episode})}
          {@const soon = isAiringSoon(airingAt, currentTime)}
          <div class="media-card" style="--status-color: {config.color}" 
               use:click={() => modal.open(modal.ANIME_DETAILS, media)}
               on:mousemove={(e) => updateHoverPosition(e, media)}
               on:mouseleave={() => hoveredMedia = null}
               role="button" tabindex="0">
            <div class="status-label">{config.label}</div>
            {#if unwatched > 0}<div class="unwatched-tag">{unwatched} EP BEHIND</div>{/if}
            <img src={media.bannerImage || media.coverImage?.extraLarge} alt=""/>
            <div class="card-details">
              <h2 class="media-title">{anilistClient.title(media)}</h2>
              <div class="media-info">
                <span>EPISODE <b>{episode}</b></span>
                <span>STATUS <b>{media.status}</b></span>
                <span>TIME <b>{formatTime(airingAt)}</b></span>
              </div>
              {#if soon}
                <div style="color:var(--accent); font-weight:900; font-size:1.1rem; margin-top:12px; animation:pulse 1s infinite;">
                  AIRING IN {getCountdown(airingAt, currentTime)}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </aside>

  <main class="main-schedule">
    <div class="header-section" style="margin-bottom: 3rem;">
      <h2 style="font-family: 'Bebas Neue'; font-size: 5rem; margin: 0;">WEEKLY VIEW</h2>
      <div class="filter-controls">
        <button class="filter-tab" class:active={statusFilter === 'ALL'} on:click={() => statusFilter = 'ALL'}>SHOW ALL</button>
        {#each Object.entries(STATUS_MAP) as [key, val]}
          <button class="filter-tab" class:active={statusFilter === key} on:click={() => statusFilter = key}>{val.label}</button>
        {/each}
      </div>
    </div>

    {#each upcomingDays as group}
      <section class="day-group">
        <div class="day-header">
          <span>{group.day}</span>
          <span style="font-size: 1.2rem; opacity: 0.5;">{group.items.length} ENTRIES</span>
        </div>

        <div class="grid">
          {#each group.items as {media, airingAt, episode}}
            {@const config = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'OTHER', color: '#444' }}
            {@const unwatched = getBehindCount(media, {episode})}
            <div class="list-item" 
                 style="--status-color: {config.color}" 
                 use:click={() => modal.open(modal.ANIME_DETAILS, media)} 
                 on:mousemove={(e) => updateHoverPosition(e, media)} 
                 on:mouseleave={() => hoveredMedia = null}
                 role="button" tabindex="0">
              
              <img class="item-thumb" src={media.bannerImage || media.coverImage?.large} alt="" loading="lazy" />

              {#if unwatched > 0}
                <div class="indicator-dot">BEHIND</div>
              {/if}

              <div class="item-info">
                <div class="item-title">{anilistClient.title(media)}</div>
                <div class="item-meta">
                  <span class="item-time">{formatTime(airingAt)}</span>
                  <span class="item-ep">EP {episode}</span>
                  {#if unwatched > 0}
                    <span class="unwatched-alert">-{unwatched}</span>
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </main>
</div>

{#if hoveredMedia}
  <div class="preview-popover" style="left: {hoverX + 20}px; top: {hoverY}px; transform: translateY(-50%);">
    <img src={hoveredMedia.coverImage.extraLarge} style="width: 100%; display: block;" alt=""/>
  </div>
{/if}