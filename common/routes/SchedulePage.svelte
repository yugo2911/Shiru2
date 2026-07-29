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
  :root { --card-accent: var(--card-fg); }
  :global(body) {
    margin: 0; overflow: hidden;
    background: var(--card-bg);
    color: var(--card-fg);
    font-family: system-ui, sans-serif;
  }
  :global(*:focus:not(:focus-visible)) { outline: none; }
  :global(*:focus-visible) { outline: 4px solid var(--card-fg); outline-offset: 2px; border-radius: 8px; }

  .shell { display: grid; grid-template-columns: 550px 1fr; height: 100vh; overflow: hidden; }

  .side-panel {
    background: var(--card-bg2);
    border-right: 1px solid var(--card-line);
    display: flex; flex-direction: column; height: 100vh;
  }
  .panel-header { padding: 4rem 3rem 2.5rem; position: relative; }
  .live-clock {
    font-weight: 900; font-size: 4rem; color: var(--card-dim);
    position: absolute; top: 2rem; right: 3rem;
    cursor: pointer; transition: color 0.2s; user-select: none;
    letter-spacing: -0.02em;
  }
  .live-clock:hover { color: var(--card-fg); }
  .panel-header h1 {
    font-weight: 900; font-size: 5rem; line-height: 0.75; margin: 0;
    color: var(--card-fg); letter-spacing: -0.02em; text-transform: uppercase;
  }
  .today-meta {
    font-weight: 700; font-size: 0.85rem; color: var(--card-dim);
    margin-top: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  }
  .schedule-scroll { flex: 1; overflow-y: auto; padding: 0 3rem 4rem; scrollbar-width: none; }

  .media-card {
    position: relative; height: 350px; margin-bottom: 3rem; cursor: pointer;
    border: 1px solid var(--card-line); border-radius: 0; overflow: hidden;
    background: var(--card-bg2); transition: all 0.15s;
  }
  .media-card:hover { border-color: var(--card-fg); transform: scale(1.02); }
  .media-card img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) brightness(0.6); transition: all 0.3s; }
  .media-card:hover img { filter: grayscale(0) brightness(0.8); }

  .status-tag {
    position: absolute; top: 12px; left: 12px;
    background: var(--status-color); color: var(--card-bg);
    padding: 4px 14px; font-weight: 900; font-size: 0.7rem;
    letter-spacing: 0.1em; z-index: 5; border-radius: 50px; text-transform: uppercase;
  }
  .behind-tag {
    position: absolute; top: 12px; right: 12px;
    background: var(--card-fg); color: var(--card-bg);
    padding: 4px 14px; font-weight: 900; font-size: 0.75rem;
    letter-spacing: 0.05em; z-index: 6; border-radius: 50px;
  }

  .card-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to top, var(--card-bg) 0%, transparent 70%);
    padding: 2.5rem; display: flex; flex-direction: column; justify-content: flex-end;
    border-left: 4px solid var(--status-color);
  }
  .card-name {
    font-weight: 900; font-size: clamp(1.5rem, 2.5vw, 2.5rem);
    line-height: 1.05; margin: 0; text-transform: uppercase; letter-spacing: -0.02em;
  }
  .card-details {
    font-size: 0.85rem; font-weight: 700; color: var(--card-dim);
    margin-top: 12px; letter-spacing: 0.05em;
    display: flex; align-items: center; gap: 15px;
  }
  .card-details b { color: var(--card-fg); }

  .main-grid { padding: 4rem; background: var(--card-bg); overflow-y: auto; }
  .grid-header { margin-bottom: 3rem; }
  .grid-header h2 {
    font-weight: 900; font-size: 2.5rem; margin: 0;
    letter-spacing: -0.02em; color: var(--card-fg); text-transform: uppercase;
  }

  .day-section { margin-bottom: 4rem; }
  .day-title {
    font-weight: 900; font-size: 1.5rem; color: var(--card-fg);
    margin-bottom: 1rem; padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--card-line);
    display: flex; justify-content: space-between; align-items: baseline;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .day-title span:last-child {
    font-size: 0.75rem; color: var(--card-dim);
    font-weight: 700; letter-spacing: 0.1em;
  }
  .grid-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }

  .entry-item {
    background: var(--card-bg2); border: 1px solid var(--card-line);
    border-left: 4px solid var(--status-color); border-radius: 0;
    height: 90px; cursor: pointer; transition: all 0.15s;
    position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: center; padding: 0 1.2rem;
  }
  .entry-item:hover {
    background: var(--card-bg); border-color: var(--card-fg);
    border-left-color: var(--card-fg); transform: scale(1.02);
  }

  .entry-cover {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    opacity: 0.3; filter: grayscale(1) brightness(0.4);
    transition: opacity 0.4s, filter 0.4s; z-index: 1;
  }
  .entry-item:hover .entry-cover { opacity: 0.6; filter: grayscale(0.2) brightness(0.6); transform: scale(1.05); }

  .entry-content { position: relative; z-index: 2; text-shadow: 0 2px 8px rgba(0,0,0,1); }
  .entry-title {
    font-weight: 900; font-size: 0.95rem; line-height: 1.1;
    white-space: nowrap; text-overflow: ellipsis; overflow: hidden;
    margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.02em;
  }
  .entry-meta { display: flex; align-items: baseline; gap: 10px; font-weight: 700; }
  .entry-time { font-size: 1.6rem; font-weight: 900; color: var(--card-fg); }
  .entry-ep { font-size: 0.85rem; opacity: 0.6; font-weight: 700; color: var(--card-dim); }
  .behind-count { color: var(--card-fg); font-size: 0.85rem; font-weight: 700; letter-spacing: 0.05em; }

  .missed-indicator {
    position: absolute; top: 0; right: 0;
    background: var(--card-fg); color: var(--card-bg);
    font-weight: 700; font-size: 0.65rem; padding: 2px 8px; z-index: 3;
    letter-spacing: 0.1em; text-transform: uppercase;
  }

  .preview-popup {
    position: fixed; z-index: 1000; pointer-events: none; width: 420px;
    border: 1px solid var(--card-line); background: var(--card-bg2);
    border-radius: 0; overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  }

  .filter-bar { display: flex; gap: 8px; margin-top: 1rem; }
  .filter-btn {
    background: var(--card-bg2); border: 1px solid var(--card-line);
    color: var(--card-dim); padding: 6px 16px;
    font-weight: 700; font-size: 0.7rem; letter-spacing: 0.1em;
    cursor: pointer; transition: all 0.15s; border-radius: 50px; text-transform: uppercase;
  }
  .filter-btn:hover { border-color: var(--card-fg); color: var(--card-fg); }
  .filter-btn.active { background: var(--card-fg); color: var(--card-bg); border-color: var(--card-fg); }

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
           <div class="media-card" style="--status-color: {status.color}; --card-accent: {media.coverImage?.color || status.color}" 
               use:click={() => modal.open(modal.ANIME_DETAILS, media)}
               on:mousemove={(e) => handleMouseMove(e, media)}
               on:mouseleave={() => hoveredMedia = null}
               role="button" tabindex="0">
            <div class="status-tag">{status.label}</div>
            {#if behind > 0}<div class="behind-tag">BEHIND: {behind} EP</div>{/if}
            <img src={media.coverImage?.extraLarge || media.coverImage?.large} alt=""/>
            <div class="card-overlay">
              <h2 class="card-name">{anilistClient.title(media)}</h2>
              <div class="card-details">
                <span>EPISODE: <b>{episode}</b></span>
                <span>STATUS: <b>{media.status}</b></span>
                <span>TIME: <b>{fmtTime(airingAt)}</b></span>
              </div>
              {#if up}
                <div style="color:var(--card-fg); font-weight:900; font-size:1.1rem; margin-top:12px; animation:blink 0.8s infinite; letter-spacing: 2px;">
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
    <div class="grid-header">
      <h2>WEEKLY SCHEDULE</h2>
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
          <span>{group.items.length} SHOWS</span>
        </div>

        <div class="grid-container">
          {#each group.items as {media, airingAt, episode}}
            {@const status = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'UNKNOWN', color: '#444' }}
            {@const behind = getBehind(media, {episode})}
             <div class="entry-item" 
                 style="--status-color: {status.color}; --card-accent: {media.coverImage?.color || status.color}" 
                 use:click={() => modal.open(modal.ANIME_DETAILS, media)} 
                 on:mousemove={(e) => handleMouseMove(e, media)} 
                 on:mouseleave={() => hoveredMedia = null}
                 role="button" tabindex="0">
              
              <img class="entry-cover" 
                   src={media.coverImage?.large || media.coverImage?.extraLarge} 
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