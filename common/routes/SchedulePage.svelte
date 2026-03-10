<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  async function fetchAllScheduleEntries () {
    const results = { data: { Page: { media: [] } } }
    const airingLists = await animeSchedule.subAiringLists.value
    const ids = airingLists.map(e => e?.id).filter(Boolean)
    const res = await anilistClient.searchAllIDS({ id: ids, page: 1, perPage: 50 })
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media = res.data.Page.media
      .filter((m, i, self) => nextAiring(m?.airingSchedule?.nodes)?.airingAt && self.findIndex(x => x?.id === m?.id) === i)
      .sort((a, b) => nextAiring(a.airingSchedule?.nodes)?.airingAt - nextAiring(b.airingSchedule?.nodes)?.airingAt)
    return results
  }

  function buildGroups (media) {
    const todayIdx = new Date().getDay()
    const grouped = {}
    for (const m of media) {
      const node = nextAiring(m?.airingSchedule?.nodes)
      if (!node?.airingAt) continue
      const day = DAYS[new Date(node.airingAt * 1000).getDay()]
      ;(grouped[day] ??= []).push({ media: m, airingAt: node.airingAt })
    }
    return [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)]
      .filter(d => grouped[d])
      .map(day => ({ day, items: grouped[day] }))
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'

  const TODAY = DAYS[new Date().getDay()]
  const fmtTime = ts => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  const fmtCountdown = (ts, now) => {
    const diff = ts - Math.floor(now.getTime() / 1000)
    if (diff <= 0) return 'Now'
    const h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60
    return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
  }
  const isUpNext = (ts, now) => { const d = ts - Math.floor(now.getTime()/1000); return d > 0 && d < 3600 }

  let groups = [], now = new Date()
  let hoveredMedia = null, hoverX = 0, hoverY = 0
  let weekEl
  let activeDay = null

  onMount(() => {
    const t = setInterval(() => { now = new Date() }, 1000)
    fetchAllScheduleEntries()
      .then(r => {
        groups = buildGroups(r.data.Page.media)
        activeDay = groups[0]?.day ?? null
      })
      .catch(() => { groups = [] })
    return () => clearInterval(t)
  })

  function handleMouseMove(e, media) {
    hoveredMedia = media
    hoverX = e.clientX
    hoverY = e.clientY
  }

  function scrollToDay(day) {
    activeDay = day
    const el = weekEl?.querySelector(`[data-day="${day}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }

  $: todayGroup  = groups.find(g => g.day === TODAY) ?? null
  $: otherGroups = groups.filter(g => g.day !== TODAY)
</script>

<svelte:body on:mousemove={e => { if (hoveredMedia) { hoverX = e.clientX; hoverY = e.clientY } }} />

<div class='root'>
  {#if !groups.length}
    <div class='splash'><span class='dot'></span>Loading schedule…</div>
  {:else}

    <!-- LEFT: TODAY -->
    <aside class='pane-today'>
      <div class='pane-header'>
        <div class='eyebrow'>On Air</div>
        <div class='pane-title'>Today</div>
        <div class='clock'>{now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</div>
        <div class='date-label'>{now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
      </div>

      <div class='today-scroll'>
        {#if todayGroup}
          {#each todayGroup.items as {media, airingAt}}
            {@const up = isUpNext(airingAt, now)}
            {@const past = airingAt < Math.floor(now.getTime()/1000)}
            <div class='t-row' class:t-up={up} class:t-past={past}
              use:click={()=>modal.open(modal.ANIME_DETAILS,media)}
              on:mousemove={e=>handleMouseMove(e,media)}
              on:mouseleave={()=>hoveredMedia=null}>
              <span class='t-time'>{fmtTime(airingAt)}</span>
              <span class='t-name'>{anilistClient.title(media)}</span>
              {#if up}<span class='t-badge'>{fmtCountdown(airingAt,now)}</span>{/if}
            </div>
          {/each}
        {:else}
          <div class='empty'>No airings today</div>
        {/if}
      </div>
    </aside>

    <!-- RIGHT: THIS WEEK -->
    <div class='pane-week'>

      <!-- sticky header + day tabs -->
      <div class='week-header'>
        <div class='week-title-row'>
          <div class='eyebrow'>Schedule</div>
          <div class='pane-title'>This Week</div>
        </div>
        <nav class='day-tabs'>
          {#each otherGroups as g}
            <button class='tab' class:tab-active={activeDay===g.day} on:click={()=>scrollToDay(g.day)}>
              {g.day.slice(0,3).toUpperCase()}
              <span class='tab-count'>{g.items.length}</span>
            </button>
          {/each}
        </nav>
      </div>

      <!-- Horizontal snap scroll — one row of fixed-width day columns -->
      <div class='week-cols' bind:this={weekEl}>
        {#each otherGroups as group}
          <div class='day-col' data-day={group.day}>
            <div class='day-heading'>
              <span class='day-abbr'>{group.day.slice(0,3).toUpperCase()}</span>
              <span class='day-full'>{group.day}</span>
            </div>
            <div class='day-entries'>
              {#each group.items as {media, airingAt}}
                <div class='w-row'
                  use:click={()=>modal.open(modal.ANIME_DETAILS,media)}
                  on:mousemove={e=>handleMouseMove(e,media)}
                  on:mouseleave={()=>hoveredMedia=null}>
                  <span class='w-time'>{fmtTime(airingAt)}</span>
                  <span class='w-name'>{anilistClient.title(media)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>

    </div>
  {/if}
</div>

<!-- Preview portal outside root to avoid clipping -->
{#if hoveredMedia?.coverImage?.extraLarge}
  <div class='preview' style='--px:{hoverX}px;--py:{hoverY}px'>
    <img src={hoveredMedia.coverImage.extraLarge} alt=''/>
    <div class='preview-name'>{anilistClient.title(hoveredMedia)}</div>
  </div>
{/if}

<style>
  

  :global(body) { margin: 0; background: #0d0d10; }

  .root {
    --bg:      #0d0d10;
    --bg2:     #131317;
    --line:    rgba(255,255,255,0.07);
    --fg:      #ededea;
    --dim:     rgba(237,237,234,0.38);
    --faint:   rgba(237,237,234,0.06);
    --acc:     #d4f55e;
    --acc-dim: rgba(212,245,94,0.1);
    --col-w:   500px;
    font-family: 'IBM Plex Mono', monospace;
    display: flex;
    height: 100vh;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
  }

  /* ── LEFT pane ─────────────────────────── */
  .pane-today {
    width: 450px;
    flex-shrink: 0;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pane-header {
    padding: 3rem 2.25rem 2rem;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }

  .eyebrow {
    font-size: 0.9rem;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--acc);
    margin-bottom: 0.6rem;
  }

  .pane-title {
    font-family: 'Syne', sans-serif;
    font-size: 3.6rem;
    font-weight: 800;
    line-height: 1;
    color: var(--fg);
    letter-spacing: -0.03em;
  }

  .clock {
    font-size: 1.2rem;
    color: var(--dim);
    margin-top: 1.2rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.06em;
  }

  .date-label {
    font-size: 1rem;
    color: rgba(237,237,234,0.22);
    margin-top: 0.3rem;
  }

  /* Today list */
  .today-scroll {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
  }

  .t-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.8rem 2.25rem;
    border-left: 3px solid transparent;
    cursor: pointer;
    transition: background 0.1s, border-color 0.1s;
  }
  .t-row:hover { background: var(--faint); border-left-color: var(--acc); }
  .t-up        { background: var(--acc-dim); border-left-color: var(--acc) !important; }
  .t-past      { opacity: 0.3; }

  .t-time {
    font-size: 1.1rem;
    color: var(--acc);
    flex-shrink: 0;
    width: 4rem;
    font-variant-numeric: tabular-nums;
  }

  .t-name {
    font-size: 1.4rem;
    font-weight: 300;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg);
  }

  .t-badge {
    font-size: 0.9rem;
    font-weight: 500;
    background: var(--acc);
    color: var(--bg);
    padding: 0.2em 0.8em;
    border-radius: 3px;
    flex-shrink: 0;
    letter-spacing: 0.04em;
  }

  /* ── RIGHT pane ─────────────────────────── */
  .pane-week {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .week-header {
    flex-shrink: 0;
    padding: 3rem 3rem 0;
    border-bottom: 1px solid var(--line);
    background: var(--bg);
  }

  .week-title-row { margin-bottom: 1.7rem; }

  /* Tab strip */
  .day-tabs {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .day-tabs::-webkit-scrollbar { display: none; }

  .tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.8rem 1.5rem;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--dim);
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1.1rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  .tab:hover  { color: var(--fg); }
  .tab-active { color: var(--acc); border-bottom-color: var(--acc); }

  .tab-count {
    font-size: 0.9rem;
    background: var(--faint);
    border-radius: 99px;
    padding: 0.2em 0.7em;
    color: var(--dim);
  }
  .tab-active .tab-count { background: var(--acc-dim); color: var(--acc); }

  /* ── Week columns — always one row, horizontal scroll ── */
  .week-cols {
    flex: 1;
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
  }

  .day-col {
    width: var(--col-w);
    min-width: var(--col-w);
    flex-shrink: 0;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    scroll-snap-align: start;
  }

  .day-heading {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
    padding: 1.9rem 2.25rem 1.4rem;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }

  .day-abbr {
    font-family: 'Syne', sans-serif;
    font-size: 2.4rem;
    font-weight: 800;
    color: var(--fg);
    letter-spacing: -0.02em;
  }

  .day-full {
    font-size: 1rem;
    color: var(--dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .day-entries {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--line) transparent;
  }

  .w-row {
    display: flex;
    align-items: baseline;
    gap: 1.1rem;
    padding: 0.8rem 2.25rem;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
    transition: background 0.1s, padding-left 0.1s;
  }
  .w-row:last-child { border-bottom: none; }
  .w-row:hover { background: var(--faint); padding-left: 2.8rem; }

  .w-time {
    font-size: 1.1rem;
    color: var(--acc);
    flex-shrink: 0;
    width: 4rem;
    font-variant-numeric: tabular-nums;
  }

  .w-name {
    font-size: 1.4rem;
    font-weight: 300;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Hover preview ─────────────────────── */
  .preview {
    position: fixed;
    top: var(--py);
    left: var(--px);
    transform: translate(28px, -55%);
    pointer-events: none;
    z-index: 9999;
    animation: pop 0.13s ease forwards;
  }
  .preview img {
    display: block;
    width: 300px;
    height: 400px;
    object-fit: cover;
    border-radius: 8px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.85), 0 0 0 1px var(--line);
  }
  .preview-name {
    font-size: 1rem;
    color: var(--dim);
    padding: 0.6rem 0.2rem 0;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.03em;
  }
  @keyframes pop {
    from { opacity: 0; transform: translate(28px,-52%) scale(0.94); }
    to   { opacity: 1; transform: translate(28px,-55%) scale(1); }
  }

  /* ── Misc ──────────────────────────────── */
  .splash {
    display: flex; align-items: center; justify-content: center;
    gap: 1.1rem; height: 100vh;
    font-size: 1.1rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--dim);
  }
  .dot {
    width: 10px; height: 10px; border-radius: 50%; background: var(--acc);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { opacity:1; transform:scale(1); }
    50%      { opacity:0.2; transform:scale(0.6); }
  }
  .empty { font-size: 1.1rem; color: rgba(237,237,234,0.18); padding: 1.9rem 2.25rem; }
</style>