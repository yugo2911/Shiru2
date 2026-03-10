<script context='module'>
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  async function fetchAllScheduleEntries (variables) {
    const results = { data: { Page: { media: [] } } }
    const airingLists = await animeSchedule.subAiringLists.value
    const ids = airingLists.map(entry => entry?.id ? { id: entry.id } : null).filter(Boolean)
    const res = await anilistClient.searchAllIDS({ id: ids.map(({ id }) => id).filter(Boolean), page: 1, perPage: 50 })
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media = res.data.Page.media
      .filter((media, index, self) => nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m => m?.id === media?.id) === index)
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
    return [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)].filter(d => grouped[d]).map(day => ({ day, items: grouped[day] }))
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'

  const TODAY = DAYS[new Date().getDay()]
  const fmtTime = (ts) => ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''
  const fmtCountdown = (ts, now) => {
    if (!ts) return ''
    const diff = ts - Math.floor(now.getTime() / 1000)
    if (diff <= 0) return 'Now'
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60
    if (h > 0) return `${h}h ${m}m`
    if (m > 0) return `${m}m ${s}s`
    return `${s}s`
  }
  const isUpNext = (ts, now) => {
    const diff = ts - Math.floor(now.getTime() / 1000)
    return diff > 0 && diff < 3600
  }

  let groups = [], now = new Date()
  let hoveredMedia = null, hoverX = 0, hoverY = 0

  onMount(() => {
    const t = setInterval(() => { now = new Date() }, 1000)
    fetchAllScheduleEntries({ format: ['TV'] })
      .then(r => { groups = buildGroups(r.data.Page.media) }).catch(() => { groups = [] })
    return () => clearInterval(t)
  })

  function handleMouseMove(e, media) {
    hoveredMedia = media
    hoverX = e.clientX
    hoverY = e.clientY
  }

  $: todayGroup = groups.find(g => g.day === TODAY) ?? null
  $: otherGroups = groups.filter(g => g.day !== TODAY)
  $: dayAbbr = (d) => d.slice(0, 3).toUpperCase()
</script>

<!-- Global hover art preview -->
{#if hoveredMedia?.coverImage?.extraLarge}
  <div class='preview-portal' style='--px:{hoverX}px;--py:{hoverY}px'>
    <img src={hoveredMedia.coverImage.extraLarge} alt='' />
    <div class='preview-title'>{anilistClient.title(hoveredMedia)}</div>
  </div>
{/if}

<div class='root'>
  {#if !groups.length}
    <div class='splash'>
      <div class='splash-dot'></div>
      Loading broadcast schedule…
    </div>
  {:else}
    <!-- Left column: TODAY -->
    <aside class='col-today'>
      <header class='col-header'>
        <div class='col-eyebrow'>On Air</div>
        <div class='col-title'>Today</div>
        <div class='col-clock'>{now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</div>
        <div class='col-date'>{now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
      </header>

      <div class='today-list'>
        {#if todayGroup}
          {#each todayGroup.items as {media, airingAt}, i}
            {@const upcoming = isUpNext(airingAt, now)}
            {@const passed = airingAt < Math.floor(now.getTime()/1000)}
            <div
              class='today-row'
              class:row-upcoming={upcoming}
              class:row-passed={passed}
              use:click={()=>modal.open(modal.ANIME_DETAILS,media)}
              on:mousemove={e => handleMouseMove(e, media)}
              on:mouseleave={() => hoveredMedia = null}
            >
              <div class='row-num'>{String(i+1).padStart(2,'0')}</div>
              <div class='row-body'>
                <div class='row-name'>{anilistClient.title(media)}</div>
                {#if upcoming}
                  <div class='row-badge badge-live'>↑ {fmtCountdown(airingAt, now)}</div>
                {/if}
              </div>
              <div class='row-time-block'>
                <div class='row-time'>{fmtTime(airingAt)}</div>
              </div>
            </div>
          {/each}
        {:else}
          <div class='empty-state'>No airings scheduled today</div>
        {/if}
      </div>
    </aside>

    <!-- Right column: REST OF WEEK -->
    <main class='col-week'>
      <header class='col-header'>
        <div class='col-eyebrow'>Schedule</div>
        <div class='col-title'>This Week</div>
      </header>

      <div class='week-grid'>
        {#each otherGroups as group}
          <section class='day-block'>
            <div class='day-pill'>{dayAbbr(group.day)}<span class='day-full'>{group.day}</span></div>
            <div class='day-list'>
              {#each group.items as {media, airingAt}}
                <div
                  class='week-row'
                  use:click={()=>modal.open(modal.ANIME_DETAILS,media)}
                  on:mousemove={e => handleMouseMove(e, media)}
                  on:mouseleave={() => hoveredMedia = null}
                >
                  <span class='week-time'>{fmtTime(airingAt)}</span>
                  <span class='week-name'>{anilistClient.title(media)}</span>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </main>
  {/if}
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap');

  :global(body) { background: #0c0c0f; }

  .root {
    --fg: #f0eee8;
    --fg-dim: rgba(240,238,232,0.35);
    --fg-faint: rgba(240,238,232,0.1);
    --accent: #e8c547;
    --accent-dim: rgba(232,197,71,0.15);
    --divider: rgba(240,238,232,0.07);
    --row-h: 2.75rem;
    font-family: 'DM Mono', monospace;
    display: flex;
    min-height: 100vh;
    background: #0c0c0f;
    color: var(--fg);
    overflow-x: hidden;
  }

  /* ── Columns ─────────────────────────────── */
  .col-today {
    width: 400px;
    flex-shrink: 0;
    border-right: 1px solid var(--divider);
    display: flex;
    flex-direction: column;
    padding: 0;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow: hidden;
  }

  .col-week {
    flex: 1;
    overflow-y: auto;
    padding: 0 0 6rem 0;
  }

  /* ── Headers ─────────────────────────────── */
  .col-header {
    padding: 3rem 2.5rem 2rem;
    border-bottom: 1px solid var(--divider);
  }

  .col-eyebrow {
    font-family: 'DM Mono', monospace;
    font-size: 0.65rem;
    font-weight: 500;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.6rem;
  }

  .col-title {
    font-family: 'DM Serif Display', serif;
    font-size: 3.25rem;
    line-height: 1;
    color: var(--fg);
    letter-spacing: -0.02em;
  }

  .col-clock {
    font-size: 0.8rem;
    font-weight: 300;
    color: var(--fg-dim);
    margin-top: 1rem;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }

  .col-date {
    font-size: 0.72rem;
    color: rgba(240,238,232,0.2);
    letter-spacing: 0.04em;
    margin-top: 0.2rem;
  }

  /* ── Today list ──────────────────────────── */
  .today-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
    scrollbar-width: thin;
    scrollbar-color: var(--divider) transparent;
  }

  .today-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0 2rem 0 1.5rem;
    height: var(--row-h);
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: background 0.12s, border-color 0.12s;
  }

  .today-row:hover {
    background: var(--fg-faint);
    border-left-color: var(--accent);
  }

  .row-upcoming {
    background: var(--accent-dim) !important;
    border-left-color: var(--accent) !important;
  }

  .row-passed {
    opacity: 0.35;
  }

  .row-num {
    font-size: 0.6rem;
    font-weight: 500;
    color: rgba(240,238,232,0.2);
    width: 1.6rem;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .row-body {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .row-name {
    font-size: 0.8rem;
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg);
    letter-spacing: 0.01em;
  }

  .row-badge {
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.05em;
    padding: 0.15em 0.5em;
    border-radius: 2px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .badge-live {
    background: var(--accent);
    color: #0c0c0f;
  }

  .row-time-block {
    flex-shrink: 0;
  }

  .row-time {
    font-size: 0.72rem;
    font-weight: 300;
    color: var(--fg-dim);
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }

  /* ── Week grid ───────────────────────────── */
  .week-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0;
    padding: 0;
  }

  .day-block {
    border-right: 1px solid var(--divider);
    border-bottom: 1px solid var(--divider);
    padding: 2rem 2rem 1.5rem;
  }

  .day-pill {
    font-family: 'DM Serif Display', serif;
    font-size: 2rem;
    color: var(--fg);
    letter-spacing: -0.02em;
    margin-bottom: 1.25rem;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .day-full {
    font-size: 0.7rem;
    font-family: 'DM Mono', monospace;
    font-weight: 300;
    letter-spacing: 0.08em;
    color: var(--fg-dim);
    text-transform: uppercase;
  }

  .day-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .week-row {
    display: flex;
    align-items: baseline;
    gap: 0.85rem;
    padding: 0.45em 0.3em;
    border-bottom: 1px solid var(--divider);
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.1s;
  }

  .week-row:last-child { border-bottom: none; }

  .week-row:hover {
    background: var(--fg-faint);
    padding-left: 0.7em;
  }

  .week-time {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    width: 2.8rem;
    letter-spacing: 0.04em;
  }

  .week-name {
    font-size: 0.75rem;
    font-weight: 300;
    color: var(--fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.01em;
  }

  /* ── Hover preview portal ────────────────── */
  .preview-portal {
    position: fixed;
    top: var(--py, -9999px);
    left: var(--px, -9999px);
    transform: translate(20px, -55%);
    z-index: 9999;
    pointer-events: none;
    animation: fadeIn 0.12s ease forwards;
  }

  .preview-portal img {
    width: 210px;
    height: 290px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
    box-shadow: 0 20px 60px rgba(0,0,0,0.9), 0 0 0 1px var(--divider);
  }

  .preview-title {
    font-family: 'DM Mono', monospace;
    font-size: 0.65rem;
    color: var(--fg-dim);
    padding: 0.5rem 0.1rem 0;
    max-width: 210px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.03em;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(20px, -52%); }
    to   { opacity: 1; transform: translate(20px, -55%); }
  }

  /* ── Splash / Loading ────────────────────── */
  .splash {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100vh;
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--fg-dim);
  }

  .splash-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.3; transform: scale(0.7); }
  }

  /* ── Empty state ────────────────────────── */
  .empty-state {
    font-size: 0.72rem;
    color: rgba(240,238,232,0.18);
    padding: 1.5rem 2rem;
    letter-spacing: 0.05em;
  }

  /* ── Week column header ─────────────────── */
  .col-week .col-header {
    position: sticky;
    top: 0;
    background: #0c0c0f;
    z-index: 10;
    padding: 3rem 2.5rem 2rem;
  }
</style>