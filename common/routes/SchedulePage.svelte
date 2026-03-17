<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'

  const STATUS_MAP = {
    CURRENT:   { label: 'TARGET ACQUIRED', color: '#ff003c' }, 
    PLANNING:  { label: 'INTEL GATHERING', color: '#00f2ff' },
    COMPLETED: { label: 'ELIMINATED', color: '#ffffff' },
    PAUSED:    { label: 'STALLED', color: '#f59e5e' }
  }

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  async function fetchAllScheduleEntries() {
    const airingLists = await animeSchedule.subAiringLists.value
    const ids = airingLists.map(e => e?.id).filter(Boolean)
    return ids.length ? anilistClient.searchAllIDS({ id: ids, page: 1, perPage: 50 }) : { data: { Page: { media: [] } } }
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

  let groups = [], now = new Date(), hoveredMedia = null
  let hoverX = 0, hoverY = 0

  $: TODAY_NAME = DAYS[now.getDay()]
  $: todayGroup = groups[0] || null
  $: navGroups = groups.slice(1).filter(g => g.items.length > 0)

  onMount(() => {
    const t = setInterval(() => { now = new Date() }, 1000)
    fetchAllScheduleEntries().then(r => {
      groups = buildGroups(r?.data?.Page?.media || [])
    })
    return () => clearInterval(t)
  })

  const fmt = ts => new Date(ts * 1000).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12:false })
  
  function handleHover(e, media) {
    hoveredMedia = media; hoverX = e.clientX; hoverY = e.clientY
  }
</script>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;900&display=swap');

  :root {
    --danger: #ff003c;
    --bg: #030303;
    --panel: #0a0a0a;
  }

  /* RESET & SCROLLBARS */
  :global(body) { margin: 0; padding: 0; overflow: hidden; background: var(--bg); }
  
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--danger); }

  .shell {
    display: grid;
    grid-template-columns: 550px 1fr;
    height: 100vh;
    width: 100vw;
    background: var(--bg);
    color: #fff;
    font-family: 'Inter', sans-serif;
    overflow: hidden; /* Main container must not scroll */
  }

  .wanted-hero {
    background: linear-gradient(to right, #000, var(--panel));
    border-right: 1px solid rgba(255,0,60,0.3);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .hero-header {
    padding: 4rem 3rem 2rem;
    flex-shrink: 0;
  }

  .hero-header h1 {
    font-family: 'Bebas Neue';
    font-size: 8rem;
    line-height: 0.75;
    margin: 0;
    color: var(--danger);
    text-shadow: 4px 4px 0px rgba(0,0,0,1);
    letter-spacing: -2px;
  }

  .tagline {
    font-size: 0.8rem;
    font-weight: 900;
    letter-spacing: 0.5em;
    color: #444;
    margin-top: 1rem;
    text-transform: uppercase;
  }

  .bounty-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0 3rem 4rem;
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
  }

  .target-card {
    position: relative;
    width: 100%;
    height: 320px;
    margin-bottom: 2rem;
    cursor: pointer;
    overflow: hidden;
    border: 1px solid #222;
    transition: 0.3s cubic-bezier(0.2, 1, 0.3, 1);
  }

  .target-card:hover {
    border-color: var(--danger);
    transform: scale(1.02) translateX(10px);
  }

  .target-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: grayscale(1) brightness(0.6);
    transition: 0.5s;
  }

  .target-card:hover img { filter: grayscale(0) brightness(0.8); }

  .card-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(0deg, rgba(0,0,0,0.9) 10%, transparent 60%);
    padding: 2rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }

  .card-status {
    font-family: 'Bebas Neue';
    font-size: 1.2rem;
    color: var(--danger);
    letter-spacing: 2px;
  }

  .card-name {
    font-family: 'Bebas Neue';
    font-size: 2.5rem;
    line-height: 1;
    margin: 0.5rem 0;
    text-transform: uppercase;
  }

  .tactical-grid {
    padding: 4rem;
    background-image: radial-gradient(circle at 2px 2px, rgba(255,255,255,0.03) 1px, transparent 0);
    background-size: 40px 40px;
    overflow-y: auto;
    height: 100vh;
    scroll-behavior: smooth;
  }

  .grid-header { margin-bottom: 4rem; }
  .grid-header h2 { font-family: 'Bebas Neue'; font-size: 4rem; margin: 0; }

  .day-row {
    display: grid;
    grid-template-columns: 150px 1fr;
    gap: 2rem;
    margin-bottom: 4rem;
    align-items: flex-start;
  }

  .day-name {
    font-family: 'Bebas Neue';
    font-size: 2.5rem;
    color: #222;
    text-transform: uppercase;
    position: sticky;
    top: 0;
  }

  .entry-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .entry-item {
    background: rgba(255,255,255,0.02);
    border: 1px solid #111;
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: 0.2s;
  }

  .entry-item:hover {
    background: var(--danger);
    color: #000;
    border-color: var(--danger);
  }

  .e-title { font-weight: 700; font-size: 0.9rem; text-transform: uppercase; }
  .e-time { font-family: 'Bebas Neue'; font-size: 1.5rem; }

  .hud-preview {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    width: 400px;
    border: 2px solid var(--danger);
    background: #000;
    padding: 5px;
    box-shadow: 0 0 50px rgba(255,0,60,0.4);
  }
</style>

<div class="shell">
  <aside class="wanted-hero">
    <div class="hero-header">
      <div class="tagline">Night Raid Intelligence</div>
      <h1>WANTED</h1>
    </div>

    <div class="bounty-scroll">
      {#if todayGroup}
        {#each todayGroup.items as {media, episode}}
          {@const status = STATUS_MAP[media?.mediaListEntry?.status]}
          <div class="target-card" 
               use:click={() => modal.open(modal.ANIME_DETAILS, media)}
               on:mouseenter={(e) => handleHover(e, media)}
               on:mouseleave={() => hoveredMedia = null}>
            <img src={media.bannerImage || media.coverImage.extraLarge} alt=""/>
            <div class="card-overlay">
              <span class="card-status">{status?.label || 'TARGET DETECTED'}</span>
              <h2 class="card-name">{anilistClient.title(media)}</h2>
              <div style="font-size: 0.75rem; font-weight: 900; opacity: 0.6;">
                INTERCEPT: EPISODE {episode}
              </div>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </aside>

  <main class="tactical-grid">
    <div class="grid-header">
      <h2>Mission Schedule</h2>
      <div class="tagline">Operational Windows</div>
    </div>

    {#each navGroups as group}
      <div class="day-row">
        <div class="day-name">{group.day}</div>
        <div class="entry-list">
          {#each group.items as {media, airingAt}}
            <div class="entry-item" 
                 use:click={() => modal.open(modal.ANIME_DETAILS, media)}
                 on:mouseenter={(e) => handleHover(e, media)}
                 on:mouseleave={() => hoveredMedia = null}>
              <span class="e-title">{anilistClient.title(media)}</span>
              <span class="e-time">{fmt(airingAt)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </main>
</div>

{#if hoveredMedia}
  <div class="hud-preview" style="left: {hoverX + 20}px; top: {hoverY}px; transform: translateY(-50%);">
    <img src={hoveredMedia.coverImage.extraLarge} style="width: 100%; display: block;" alt=""/>
    <div style="padding: 1rem; border-top: 1px solid var(--danger);">
      <div style="font-family: 'Bebas Neue'; font-size: 1.5rem;">INTEL RECOVERY</div>
      <div style="font-size: 0.7rem; opacity: 0.7;">CLICK TO EXECUTE MISSION</div>
    </div>
  </div>
{/if}