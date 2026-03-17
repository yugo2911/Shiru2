<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
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

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

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

  function buildGroups(media) {
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

  let groups = [], now = new Date(), hoveredMedia = null, hoverX = 0, hoverY = 0, is12h = false
  let filterStatus = 'ALL'

  const fmtTime = (ts, force12) => new Date(ts * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12: force12 ?? is12h })
  const isUpNext = (ts, current) => { const d = ts - Math.floor(current.getTime()/1000); return d > 0 && d < 3600 }
  const fmtCountdown = (ts, current) => {
    const diff = ts - Math.floor(current.getTime() / 1000)
    if (diff <= 0) return 'NOW'
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}H ${m}M` : `${m}M`
  }

  onMount(() => {
    const t = setInterval(() => { now = new Date() }, 1000)
    fetchAllScheduleEntries().then(r => { groups = buildGroups(r?.data?.Page?.media || []) })
    return () => clearInterval(t)
  })

  function handleMouseMove(e, media) { hoveredMedia = media; hoverX = e.clientX; hoverY = e.clientY }
  const toggleClock = () => { is12h = !is12h }

  $: filteredGroups = groups.map(g => ({
    ...g,
    items: filterStatus === 'ALL' ? g.items : g.items.filter(i => i.media?.mediaListEntry?.status === filterStatus)
  }))
  $: todayGroup = filteredGroups[0] || null
  $: navGroups = filteredGroups.slice(1).filter(g => g.items.length > 0)
</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;700;900&display=swap');
  :root { --danger: #ff003c; --bg: #030303; --panel: #0a0a0a; }
  :global(body) { margin: 0; overflow: hidden; background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; }

  .shell { display: grid; grid-template-columns: 550px 1fr; height: 100vh; overflow: hidden; }
  
  .side-panel { background: linear-gradient(to right, #000, var(--panel)); border-right: 1px solid rgba(255,0,60,0.3); display: flex; flex-direction: column; height: 100vh; }
  .panel-header { padding: 4rem 3rem 2.5rem; position: relative; }
  .live-clock { font-family: 'Bebas Neue'; font-size: 7.2rem; color: #666; position: absolute; top: 2rem; right: 3rem; cursor: pointer; transition: color 0.2s; user-select: none; }
  .live-clock:hover { color: var(--danger); }
  .panel-header h1 { font-family: 'Bebas Neue'; font-size: 8rem; line-height: 0.75; margin: 0; color: var(--danger); text-shadow: 4px 4px 0px #000; letter-spacing: -2px; }
  .today-meta { font-family: 'Bebas Neue'; font-size: 1.2rem; color: #444; margin-top: 10px; letter-spacing: 2px; }
  .schedule-scroll { flex: 1; overflow-y: auto; padding: 0 3rem 4rem; scrollbar-width: none; }

  .media-card { position: relative; height: 350px; margin-bottom: 3rem; cursor: pointer; border: 1px solid #222; transition: 0.3s; background: #000; }
  .media-card:hover { border-color: var(--danger); transform: scale(1.02) translateX(10px); }
  .media-card img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) brightness(0.6); transition: 0.3s; }
  .media-card:hover img { filter: grayscale(0) brightness(0.8); }

  .status-tag { position: absolute; top: 0; left: 0; background: var(--status-color); color: #000; padding: 8px 16px; font-weight: 900; font-size: 1rem; letter-spacing: 1.5px; z-index: 5; text-transform: uppercase; }
  .behind-tag { position: absolute; top: 1.5rem; right: -5px; background: var(--danger); color: #fff; padding: 0.6rem 1.2rem; font-family: 'Bebas Neue'; font-size: 1.6rem; z-index: 6; box-shadow: 6px 6px 0 #000; }

  .card-overlay { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0,0,0,0.98) 0%, transparent 70%); padding: 2.5rem; display: flex; flex-direction: column; justify-content: flex-end; border-left: 8px solid var(--status-color); }
  .card-name { font-family: 'Bebas Neue'; font-size: 3.5rem; line-height: 0.9; margin: 0; text-transform: uppercase; }
  .card-details { font-size: 1.1rem; font-weight: 700; color: #aaa; margin-top: 12px; letter-spacing: 1px; display: flex; align-items: center; gap: 15px; }
  .card-details b { color: #fff; }

  .main-grid { padding: 4rem; background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0); background-size: 40px 40px; overflow-y: auto; }
  .day-section { margin-bottom: 4rem; }
  .day-title { font-family: 'Bebas Neue'; font-size: 3rem; color: #222; margin-bottom: 1rem; border-bottom: 2px solid #111; display: flex; justify-content: space-between; align-items: baseline; }
  .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }

  .entry-item { 
    background: #000; border: 1px solid #111; border-left: 4px solid var(--status-color); 
    height: 90px; cursor: pointer; transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
    position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: center; padding: 0 1.2rem;
  }
  .entry-item:hover { background: var(--status-color); border-color: var(--status-color); transform: translateX(5px); }

  .entry-cover { 
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; 
    opacity: 0.3; filter: grayscale(1) brightness(0.4); transition: opacity 0.4s, filter 0.4s; z-index: 1; 
  }
  .entry-item:hover .entry-cover { opacity: 0.6; filter: grayscale(0.2) brightness(0.6); transform: scale(1.05); }

  .entry-content { position: relative; z-index: 2; text-shadow: 0 2px 8px rgba(0,0,0,1); transition: color 0.2s; }
  .entry-item:hover .entry-content { color: #000; text-shadow: none; }

  .entry-title { font-weight: 900; font-size: 0.95rem; line-height: 1.1; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; margin-bottom: 2px; text-transform: uppercase; }
  .entry-meta { display: flex; align-items: baseline; gap: 10px; font-family: 'Bebas Neue'; }
  .entry-time { font-size: 1.6rem; }
  .entry-ep { font-size: 1.1rem; opacity: 0.6; }
  .behind-count { color: var(--danger); font-size: 1.1rem; }
  .entry-item:hover .behind-count { color: #000; font-weight: bold; }

  .missed-indicator { position: absolute; top: 0; right: 0; background: var(--danger); color: #fff; font-family: 'Bebas Neue'; font-size: 0.7rem; padding: 1px 6px; z-index: 3; }

  .preview-popup { position: fixed; z-index: 1000; pointer-events: none; width: 420px; border: 2px solid var(--danger); background: #000; padding: 5px; box-shadow: 0 0 40px rgba(0,0,0,0.9); }
  
  .filter-bar { display: flex; gap: 15px; margin-top: 1rem; }
  .filter-btn { 
    background: transparent; border: 1px solid #333; color: #666; 
    padding: 4px 12px; font-family: 'Bebas Neue'; font-size: 1.1rem; 
    cursor: pointer; transition: 0.2s; 
  }
  .filter-btn:hover { border-color: #fff; color: #fff; }
  .filter-btn.active { background: #fff; color: #000; border-color: #fff; }
  
  @keyframes blink { 50% { opacity: 0.2; } }
</style>

<div class="shell">
  <aside class="side-panel">
    <div class="panel-header">
      <div class="live-clock" on:click={toggleClock} role="button" tabindex="0">
        {now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: is12h })}
      </div>
      <h1>TODAY</h1>
      <div class="today-meta">
        {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} // 
        {todayGroup?.items.length || 0} SHOWS
      </div>
    </div>
    
    <div class="schedule-scroll">
      {#if todayGroup}
        {#each todayGroup.items as {media, airingAt, episode}}
          {@const status = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'UNKNOWN', color: '#444' }}
          {@const behind = getBehind(media, {episode})}
          {@const up = isUpNext(airingAt, now)}
          <div class="media-card" style="--status-color: {status.color}" 
               use:click={() => modal.open(modal.ANIME_DETAILS, media)}
               on:mousemove={(e) => handleMouseMove(e, media)}
               on:mouseleave={() => hoveredMedia = null}
               role="button" tabindex="0">
            <div class="status-tag">{status.label}</div>
            {#if behind > 0}<div class="behind-tag">BEHIND: {behind} EP</div>{/if}
            <img src={media.bannerImage || media.coverImage?.extraLarge || media.coverImage?.large} alt=""/>
            <div class="card-overlay">
              <h2 class="card-name">{anilistClient.title(media)}</h2>
              <div class="card-details">
                <span>EPISODE: <b>{episode}</b></span>
                <span>STATUS: <b>{media.status}</b></span>
                <span>TIME: <b>{fmtTime(airingAt)}</b></span>
              </div>
              {#if up}
                <div style="color:var(--danger); font-weight:900; font-size:1.1rem; margin-top:12px; animation:blink 0.8s infinite; letter-spacing: 2px;">
                  ▶ AIRS IN: {fmtCountdown(airingAt, now)}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </aside>

  <main class="main-grid">
    <div class="grid-header" style="margin-bottom: 3rem;">
      <h2 style="font-family: 'Bebas Neue'; font-size: 5rem; margin: 0; letter-spacing: 2px;">WEEKLY SCHEDULE</h2>
      <div class="filter-bar">
        <button class="filter-btn" class:active={filterStatus === 'ALL'} on:click={() => filterStatus = 'ALL'}>ALL SHOWS</button>
        {#each Object.entries(STATUS_MAP) as [key, val]}
          <button class="filter-btn" class:active={filterStatus === key} on:click={() => filterStatus = key}>{val.label}</button>
        {/each}
      </div>
    </div>

    {#each navGroups as group}
      <section class="day-section">
        <div class="day-title">
          <span>{group.day}</span>
          <span style="font-size: 1.2rem; opacity: 0.3;">{group.items.length} SHOWS</span>
        </div>

        <div class="grid-container">
          {#each group.items as {media, airingAt, episode}}
            {@const status = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'UNKNOWN', color: '#444' }}
            {@const behind = getBehind(media, {episode})}
            <div class="entry-item" 
                 style="--status-color: {status.color}" 
                 use:click={() => modal.open(modal.ANIME_DETAILS, media)} 
                 on:mousemove={(e) => handleMouseMove(e, media)} 
                 on:mouseleave={() => hoveredMedia = null}
                 role="button" tabindex="0">
              
              <img class="entry-cover" 
                   src={media.bannerImage || media.coverImage?.large || media.coverImage?.extraLarge} 
                   alt="" 
                   loading="lazy" />

              {#if behind > 0}
                <div class="missed-indicator">BEHIND</div>
              {/if}

              <div class="entry-content">
                <div class="entry-title">{anilistClient.title(media)}</div>
                <div class="entry-meta">
                  <span class="entry-time">{fmtTime(airingAt)}</span>
                  <span class="entry-ep">EP {episode}</span>
                  {#if behind > 0}
                    <span class="behind-count">BEHIND: {behind}</span>
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
  <div class="preview-popup" style="left: {hoverX + 20}px; top: {hoverY}px; transform: translateY(-50%);">
    <img src={hoveredMedia.coverImage.extraLarge} style="width: 100%; display: block;" alt=""/>
  </div>
{/if}