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

  let groups = [], now = new Date()

  onMount(() => {
    const t = setInterval(() => { now = new Date() }, 1000)
    fetchAllScheduleEntries({ format: ['TV'] })
      .then(r => { groups = buildGroups(r.data.Page.media) }).catch(() => { groups = [] })
    return () => clearInterval(t)
  })

  function trackMouse (node) {
    const fn = e => { node.style.setProperty('--mx', e.clientX + 'px'); node.style.setProperty('--my', e.clientY + 'px') }
    node.addEventListener('mousemove', fn)
    return { destroy: () => node.removeEventListener('mousemove', fn) }
  }

  $: todayGroup = groups.find(g => g.day === TODAY) ?? null
  $: otherGroups = groups.filter(g => g.day !== TODAY)
</script>

<div class='guide-root'>
  {#if groups.length}
    <div class='guide-wrap'>
      <div class='guide-now'>
        <div class='guide-now-header'>
          <span class='guide-now-title'>Airtime today</span>
          <span class='guide-now-date'>{now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+', '+now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span>
        </div>
        {#if todayGroup}
          <div class='guide-list'>
            {#each todayGroup.items as {media,airingAt}}
              <div class='guide-row' use:trackMouse use:click={()=>modal.open(modal.ANIME_DETAILS,media)}>
                <span class='guide-name'>{anilistClient.title(media)}</span>
                <span class='guide-time'>{fmtTime(airingAt)}</span>
                {#if media?.coverImage?.extraLarge}<img class='guide-hover-art' src={media.coverImage.extraLarge} alt=''/>{/if}
              </div>
            {/each}
          </div>
        {:else}<div class='guide-empty'>No airings today</div>{/if}
      </div>
      <div class='guide-week'>
        <div class='guide-week-header'>Weekly Schedule</div>
        {#each otherGroups as group}
          <div class='guide-day-section'>
            <div class='guide-day-name'>{group.day}</div>
            <div class='guide-list'>
              {#each group.items as {media,airingAt}}
                <div class='guide-row' use:trackMouse use:click={()=>modal.open(modal.ANIME_DETAILS,media)}>
                  <span class='guide-name'>{anilistClient.title(media)}</span>
                  <span class='guide-time'>{fmtTime(airingAt)}</span>
                  {#if media?.coverImage?.extraLarge}<img class='guide-hover-art' src={media.coverImage.extraLarge} alt=''/>{/if}
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <div class='guide-loading'>Loading schedule…</div>
  {/if}
</div>

<style>
  .guide-root { overflow-y:auto; height:100vh; }
  .guide-loading { padding:3em; text-align:center; color:rgba(190,190,210,0.3); font-size:0.95em; letter-spacing:0.05em; }
  .guide-wrap { display:grid; grid-template-columns:320px 1fr; padding:2rem; max-width:800px; margin:0 auto; }
  .guide-now { border-right:1px solid rgba(255,255,255,0.07); padding-right:2rem; margin-right:2rem; }
  .guide-now-header { margin-bottom:1.5rem; }
  .guide-now-title { display:block; font-size:2.5em; font-weight:700; color:#fff; letter-spacing:-0.02em; }
  .guide-now-date { display:block; font-size:0.85em; color:rgba(255,255,255,0.3); margin-top:0.4em; }
  .guide-week-header { display:block; font-size:2.5em; font-weight:700; color:#fff; letter-spacing:-0.02em; margin-bottom:1.5rem; }
  .guide-list { display:flex; flex-direction:column; }
  .guide-row { display:flex; justify-content:space-between; align-items:baseline; padding:0.55em 0.25em; border-bottom:1px solid rgba(255,255,255,0.05); cursor:pointer; gap:1em; transition:background 0.12s; border-radius:4px; position:relative; }
  .guide-row:hover { background:rgba(255,255,255,0.04); }
  .guide-row:last-child { border-bottom:none; }
  .guide-name { font-size:1.3em; font-weight:400; color:rgba(255,255,255,0.75); flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .guide-time { font-size:1.2em; font-weight:500; color:rgba(255,255,255,0.35); flex-shrink:0; font-variant-numeric:tabular-nums; }
  .guide-day-section { margin-bottom:2em; }
  .guide-day-name { font-size:1.8em; font-weight:700; color:rgba(255,255,255,0.85); margin-bottom:0.75em; letter-spacing:-0.02em; }
  .guide-empty { color:rgba(255,255,255,0.2); font-size:0.85em; padding:1em 0; }
  .guide-hover-art { position:fixed; width:225px; height:310px; object-fit:cover; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,0.75); pointer-events:none; z-index:9999; opacity:0; transform:scale(0.92) translate(16px,-50%); transition:opacity 0.15s,transform 0.15s; top:var(--my,-9999px); left:var(--mx,-9999px); }
  .guide-row:hover .guide-hover-art { opacity:1; transform:scale(1) translate(16px,-50%); }
  @media (max-width:900px) {
    .guide-wrap { grid-template-columns:1fr; }
    .guide-now { border-right:none; border-bottom:1px solid rgba(255,255,255,0.07); padding-bottom:2rem; margin-bottom:2rem; padding-right:0; margin-right:0; }
  }
</style>