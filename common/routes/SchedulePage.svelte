<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { cache, cacheReady, caches } from '@/modules/cache.js'

  const SCHEDULE_CACHE_KEY = 'schedule_page_ids'
  const SCHEDULE_TTL = 60 * 60 * 1000 

  const STATUS_MAP = {
    CURRENT:   { label: 'ACTIVE TARGET', color: '#ff003c' }, 
    PLANNING:  { label: 'INTEL GATHERING', color: '#00f2ff' },
    COMPLETED: { label: 'MISSION COMPLETE', color: '#ffffff' },
    PAUSED:    { label: 'OPERATIONS STALLED', color: '#f59e5e' },
    DROPPED:   { label: 'TARGET ABANDONED', color: '#444444' },
    REPEATING: { label: 'RE-ENGAGING', color: '#5ef5d4' }
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
    return cache.cacheEntry(caches.QUERIES, SCHEDULE_CACHE_KEY, {}, anilistClient.searchAllIDS({ id: ids, page: 1, perPage: 50 }), Date.now() + SCHEDULE_TTL)
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
      day, items: (grouped.get(day) || []).sort((a, b) => a.airingAt - b.airingAt)
    }))
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'

  let groups = [], now = new Date(), hoveredMedia = null, hoverX = 0, hoverY = 0
  let weekEl, activeDay = null, searchQuery = ""

  const fmtTime = ts => new Date(ts * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false })
  const isUpNext = (ts, current) => { const d = ts - Math.floor(current.getTime()/1000); return d > 0 && d < 3600 }
  const fmtCountdown = (ts, current) => {
    const diff = ts - Math.floor(current.getTime() / 1000)
    if (diff <= 0) return 'NOW'
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}H ${m}M` : `${m}M`
  }

  onMount(() => {
    const t = setInterval(() => { now = new Date() }, 1000)
    fetchAllScheduleEntries().then(r => { 
      groups = buildGroups(r?.data?.Page?.media || [])
      activeDay = groups[0]?.day
    })
    return () => clearInterval(t)
  })

  function handleMouseMove(e, media) { hoveredMedia = media; hoverX = e.clientX; hoverY = e.clientY }
  
  function scrollToDay(day) {
    activeDay = day
    const target = weekEl?.querySelector(`[data-day="${day}"]`)
    if (target) weekEl.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' })
  }

  $: filteredGroups = groups.map(g => ({
    ...g,
    items: g.items.filter(i => anilistClient.title(i.media).toLowerCase().includes(searchQuery.toLowerCase()))
  })).filter(g => g.items.length > 0)

  $: todayGroup = filteredGroups.find(g => g.day === DAYS[now.getDay()]) || null
</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;900&display=swap');
  :root { --danger: #ff003c; --bg: #030303; --panel: #0a0a0a; }
  :global(body) { margin: 0; overflow: hidden; background: var(--bg); color: #fff; font-family: 'Inter', sans-serif; }

  .shell { display: grid; grid-template-columns: 550px 1fr; height: 100vh; }
  
  /* LEFT PANE */
  .wanted-hero { background: linear-gradient(to right, #000, var(--panel)); border-right: 1px solid rgba(255,0,60,0.3); display: flex; flex-direction: column; overflow: hidden; }
  .hero-header { padding: 4rem 3rem 2rem; position: relative; flex-shrink: 0; }
  .live-clock { font-family: 'Bebas Neue'; font-size: 1.5rem; color: #444; position: absolute; top: 2rem; right: 3rem; }
  .hero-header h1 { font-family: 'Bebas Neue'; font-size: 8rem; line-height: 0.75; margin: 0; color: var(--danger); text-shadow: 4px 4px 0px #000; }
  
  .bounty-scroll { flex: 1; overflow-y: auto; padding: 0 3rem 4rem; scrollbar-width: none; }
  .target-card { position: relative; height: 320px; margin-bottom: 2rem; cursor: pointer; border: 1px solid #222; transition: 0.3s; }
  .target-card:hover { border-color: var(--danger); transform: translateX(10px); }
  .target-card img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) brightness(0.6); }

  .status-cue { position: absolute; top: 0; left: 0; background: var(--status-color); color: #000; padding: 4px 12px; font-weight: 900; font-size: 0.7rem; z-index: 5; }
  .behind-tag { position: absolute; top: 1.5rem; right: -5px; background: var(--danger); color: #fff; padding: 0.5rem 1rem; font-family: 'Bebas Neue'; font-size: 1.2rem; z-index: 6; box-shadow: 5px 5px 0 #000; }

  /* RIGHT PANE */
  .tactical-grid { display: flex; flex-direction: column; height: 100vh; position: relative; }
  .grid-header { padding: 4rem 4rem 0; flex-shrink: 0; }
  
  .search-input { background: transparent; border: 1px solid #222; color: #fff; padding: 10px 15px; width: 300px; font-family: 'Inter'; font-size: 0.8rem; margin-top: 1rem; outline: none; transition: 0.3s; }
  .search-input:focus { border-color: var(--danger); box-shadow: 0 0 10px rgba(255,0,60,0.2); }

  .day-tabs { display: flex; gap: 1rem; margin-top: 2rem; border-bottom: 1px solid #111; padding-bottom: 1rem; flex-wrap: wrap; }
  .tab { background: none; border: none; color: #444; font-family: 'Bebas Neue'; font-size: 1.2rem; cursor: pointer; transition: 0.2s; position: relative; padding: 0; }
  .tab-active { color: var(--danger); }
  .tab-active::after { content: ''; position: absolute; bottom: -1rem; left: 0; right: 0; height: 2px; background: var(--danger); }

  .grid-scroll { flex: 1; overflow-y: auto; padding: 0 4rem 4rem; scroll-behavior: smooth; position: relative; }
  .day-row { display: grid; grid-template-columns: 150px 1fr; gap: 2rem; padding-top: 4rem; }
  .day-label { font-family: 'Bebas Neue'; font-size: 2.5rem; color: #222; }
  
  .entry-item { background: rgba(255,255,255,0.02); border: 1px solid #111; border-left: 3px solid var(--status-color); padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; cursor: pointer; }
  .entry-item:hover { background: var(--status-color); color: #000; }

  .hud-preview { position: fixed; z-index: 1000; pointer-events: none; width: 300px; border: 2px solid var(--danger); background: #000; padding: 5px; }
</style>

<div class="shell">
  <aside class="wanted-hero">
    <div class="hero-header">
      <div class="live-clock">{now.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })}</div>
      <div style="font-size:0.8rem; font-weight:900; letter-spacing:0.5em; color:#444; text-transform:uppercase;">Night Raid Intelligence</div>
      <h1>WANTED</h1>
    </div>
    <div class="bounty-scroll">
      {#if todayGroup}
        {#each todayGroup.items as {media, airingAt, episode}}
          {@const status = STATUS_MAP[media?.mediaListEntry?.status] || { label: 'UNKNOWN', color: '#444' }}
          {@const behind = getBehind(media, {episode})}
          <div class="target-card" style="--status-color: {status.color}" use:click={() => modal.open(modal.ANIME_DETAILS, media)} on:mousemove={(e) => handleMouseMove(e, media)} on:mouseleave={() => hoveredMedia = null}>
            <div class="status-cue">{status.label}</div>
            {#if behind > 0}<div class="behind-tag">MISSING: {behind} EP</div>{/if}
            <img src={media.bannerImage || media.coverImage.extraLarge} alt=""/>
            <div style="position:absolute; inset:0; background:linear-gradient(0deg, #000 5%, transparent 60%); padding:2rem; display:flex; flex-direction:column; justify-content:flex-end;">
              <h2 style="font-family:'Bebas Neue'; font-size:2.5rem; line-height:1; margin:0;">{anilistClient.title(media)}</h2>
              {#if isUpNext(airingAt, now)}<div style="color:var(--danger); font-weight:900; font-size:0.7rem; margin-top:5px; text-transform:uppercase;">Approaching: {fmtCountdown(airingAt, now)}</div>{/if}
            </div>
          </div>
        {/each}
      {:else}
        <div style="padding:2rem; opacity:0.3; text-transform:uppercase; font-size:0.7rem; letter-spacing:2px;">No active targets found</div>
      {/if}
    </div>
  </aside>

  <main class="tactical-grid">
    <header class="grid-header">
      <h2 style="font-family:'Bebas Neue'; font-size:4rem; margin:0;">MISSION SCHEDULE</h2>
      <input type="text" class="search-input" placeholder="SEARCH OPERATIONAL IDS..." bind:value={searchQuery}/>
      <nav class="day-tabs">
        {#each filteredGroups as g}
          <button class="tab" class:tab-active={activeDay===g.day} on:click={()=>scrollToDay(g.day)}>
            {g.day.slice(0,3)} <span style="font-size:0.7rem; opacity:0.5;">[{g.items.length}]</span>
          </button>
        {/each}
      </nav>
    </header>

    <div class="grid-scroll" bind:this={weekEl}>
      {#each filteredGroups as group}
        <section class="day-row" data-day={group.day}>
          <div class="day-label">{group.day}</div>
          <div>
            {#each group.items as {media, airingAt, episode}}
              {@const status = STATUS_MAP[media?.mediaListEntry?.status] || { color:'#444' }}
              {@const behind = getBehind(media, {episode})}
              <div class="entry-item" style="--status-color: {status.color}" use:click={() => modal.open(modal.ANIME_DETAILS, media)} on:mousemove={(e) => handleMouseMove(e, media)} on:mouseleave={() => hoveredMedia = null}>
                <span style="font-weight:700; text-transform:uppercase;">
                  {anilistClient.title(media)}
                  {#if behind > 0}<span style="background:#fff; color:#000; padding:0 4px; margin-left:10px;">-{behind}</span>{/if}
                </span>
                <span style="font-family:'Bebas Neue'; font-size:1.5rem; opacity:0.3;">{fmtTime(airingAt)}</span>
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </main>
</div>

{#if hoveredMedia}
  <div class="hud-preview" style="left: {hoverX + 20}px; top: {hoverY}px; transform: translateY(-50%);">
    <img src={hoveredMedia.coverImage.extraLarge} style="width:100%; display:block;" alt=""/>
  </div>
{/if}