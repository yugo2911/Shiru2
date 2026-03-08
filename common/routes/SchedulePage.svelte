<script context='module'>
  import SectionsManager from '@/modules/sections.js'
  import SearchPage from '@/routes/search/SearchPage.svelte'
  import { writable, get } from 'simple-store-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { cache, caches } from '@/modules/cache.js'
  import Helper from '@/modules/helper.js'

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

  const key=writable({})
  const search=writable(cache.getEntry(caches.HISTORY,'lastSchedule')||{ scheduleList:true, format:['TV'], format_not:[], genre:[], genre_not:[], tag:[], tag_not:[], status:[], status_not:[] })
  search.subscribe(v=>{ const s={...v}; delete s.load; delete s.preview; cache.setEntry(caches.HISTORY,'lastSchedule',s) })

  async function fetchAllScheduleEntries(variables) {
    const results={ data:{ Page:{ media:[], pageInfo:{ hasNextPage:false } } } }
    const airingLists=await (variables.hideSubs ? animeSchedule.dubAiringLists.value : animeSchedule.subAiringLists.value)
    let ids=airingLists.map(entry => {
      const media=variables.hideSubs ? entry.media?.media : entry
      return media?.id ? { id:media.id, idMal:media.idMal??null } : null
    }).filter(Boolean)

    if ((variables.hideMyAnime||variables.showMyAnime) && Helper.isAuthorized()) {
      const statuses=(variables.hideMyAnime ? variables.hideStatus : variables.showStatus)
      const userIds=await Helper.userLists(variables).then(res => {
        if (!res?.data && res?.errors) throw res.errors[0]
        if (Helper.isAniAuth()) return Array.from(new Set(res.data.MediaListCollection.lists.filter(({status})=>statuses.includes(status)).flatMap(l=>l.entries.map(({media})=>media.id))))
        return res.data.MediaList.filter(({node})=>statuses.includes(Helper.statusMap(node.my_list_status.status))).map(({node})=>node.id)
      })
      ids=ids.filter(({id,idMal})=>Helper.isAniAuth() ? (variables.hideMyAnime ? !userIds.includes(id) : userIds.includes(id)) : (variables.hideMyAnime ? !userIds.includes(idMal) : userIds.includes(idMal)))
    }

    const searchParams={ ...SectionsManager.sanitiseObject(variables), page:1, perPage:50 }
    const idList=ids.map(({id})=>id).filter(Boolean)
    if (idList.length) searchParams.id=idList

    const res=await anilistClient.searchAllIDS(searchParams)
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media=res.data.Page.media

    if (variables.hideSubs) {
      results.data.Page.media=results.data.Page.media.filter((media,index,self) => {
        const c=airingLists.find(e=>e.media?.media?.id===media.id)
        if (c?.delayedIndefinitely && c?.status?.toUpperCase()?.includes('FINISHED')) return false
        const numEp=c.subtractedEpisodeNumber ? (c.episodeNumber-c.subtractedEpisodeNumber) : 1
        let predict=false
        if (c?.media?.media?.airingSchedule?.nodes?.length) {
          const now=new Date()
          predict=c.media.media.airingSchedule.nodes.filter(n=>new Date(n.airingAt)>now).length===0
          if (predict && !((numEp>4) && !c.unaired)) {
            const latestEp=Math.max(...c.media.media.airingSchedule.nodes.map(n=>n.episode))
            const latestAt=Math.max(...c.media.media.airingSchedule.nodes.map(n=>new Date(n.airingAt).getTime()))
            c.media.media.airingSchedule.nodes.unshift({ episode:latestEp+1, airingAt:new Date(latestAt+(c.delayedIndefinitely ? 6*365*24*60*60*1000 : 7*24*60*60*1000)).toISOString().slice(0,-5)+'Z' })
          }
        }
        return (!(c?.media?.media?.airingSchedule?.nodes[0]?.episode>media.episodes)||!media.episodes) && (!predict||!((numEp>4)&&!c.unaired)) && c?.media?.media?.airingSchedule?.nodes[0]?.airingAt && self.findIndex(m=>m.id===media.id)===index
      }).sort((a,b) => {
        const aE=airingLists.find(e=>e.media?.media?.id===a.id), bE=airingLists.find(e=>e.media?.media?.id===b.id)
        const aD=aE?.delayedIndefinitely?1:0, bD=bE?.delayedIndefinitely?1:0
        return aD!==bD ? aD-bD : new Date(nextAiring(aE?.media?.media?.airingSchedule?.nodes,variables)?.airingAt).getTime()-new Date(nextAiring(bE?.media?.media?.airingSchedule?.nodes,variables)?.airingAt).getTime()
      })
    } else {
      results.data.Page.media=results.data.Page.media.filter((media,index,self)=>nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m=>m?.id===media?.id)===index).sort((a,b)=>nextAiring(a.airingSchedule?.nodes)?.airingAt-nextAiring(b.airingSchedule?.nodes)?.airingAt)
    }

    const todayIdx=new Date().getDay()
    const orderedDays=[...DAYS.slice(todayIdx),...DAYS.slice(0,todayIdx)]
    const grouped={}
    for (const media of results.data.Page.media) {
      const node=nextAiring(media?.airingSchedule?.nodes,variables)
      if (!node?.airingAt) continue
      ;(grouped[DAYS[new Date(node.airingAt*1000).getDay()]] ??= []).push(media)
    }
    const withHeaders=[]
    for (const day of orderedDays) { if (!grouped[day]) continue; withHeaders.push({__dayHeader:true,day},...grouped[day]) }
    results.data.Page.media=withHeaders
    return results
  }
</script>

<script>
  import { onMount } from 'svelte'
  import { click } from '@/modules/click.js'
  import { modal } from '@/modules/navigation.js'

  const TODAY=DAYS[new Date().getDay()]
  const fmtTime=(ts,h12=false)=>ts ? new Date(ts*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:h12}) : ''

  let textGroups=[], textVars=null, now=new Date()
  let fontSize=100, use12h=false, showToday=true

  onMount(()=>{
    const t=setInterval(()=>{ now=new Date() },1000)
    return ()=>clearInterval(t)
  })

  function trackMouse(node) {
    const fn=e=>{ node.style.setProperty('--mx',e.clientX+'px'); node.style.setProperty('--my',e.clientY+'px') }
    node.addEventListener('mousemove',fn)
    return { destroy:()=>node.removeEventListener('mousemove',fn) }
  }

  function processMediaData(mediaList, variables) {
    return mediaList.reduce((acc,item)=>{
      if (item.__dayHeader) acc.push({day:item.day,items:[]})
      else acc.at(-1)?.items.push({media:item, airingAt:nextAiring(item?.airingSchedule?.nodes,variables)?.airingAt??null})
      return acc
    },[])
  }

  $search.load=(_,__,variables)=>{
    textVars=variables
    const raw=fetchAllScheduleEntries(variables)
    raw.then(r=>{ textGroups=processMediaData(r?.data?.Page?.media??[],variables) }).catch(()=>{ textGroups=[] })
    return SectionsManager.wrapResponse(raw,150)
  }

  $: todayGroup=textGroups.find(g=>g.day===TODAY)??null
  $: otherGroups=textGroups.filter(g=>g.day!==TODAY)
</script>

<div class='hidden-search'><SearchPage {key} {search}/></div>

<!-- fab -->
<div class="vmw">
  <div class="vopts">
    <div class="og">
      <span>Font Size <em>{fontSize}%</em></span>
      <input type="range" min="70" max="150" step="5" bind:value={fontSize}/>
    </div>
    <div class="og">
      <span>Time Format</span>
      <div class="row">
        <button class:active={!use12h} on:click={()=>use12h=false}>24h</button>
        <button class:active={use12h}  on:click={()=>use12h=true}>12h</button>
      </div>
    </div>
    <div class="og">
      <span>Today Panel</span>
      <div class="row">
        <button class:active={showToday}  on:click={()=>showToday=true}>Show</button>
        <button class:active={!showToday} on:click={()=>showToday=false}>Hide</button>
      </div>
    </div>
  </div>
  <button class="fab">
    <span class="fab-cur">Guide</span>
    <span class="fab-nxt">{textGroups.length ? `${textGroups.reduce((a,g)=>a+g.items.length,0)} entries` : 'loading…'}</span>
  </button>
</div>

<!-- guide -->
<div class='guide-root' style="font-size:{fontSize}%">
  {#if textGroups.length}
    <div class='guide-wrap' class:no-today={!showToday}>
      {#if showToday}
        <div class='guide-now'>
          <div class='guide-now-header'>
            <span class='guide-now-title'>Airtime today</span>
            <span class='guide-now-date'>{now.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})+', '+now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span>
          </div>
          {#if todayGroup}
            <div class='guide-list'>
              {#each todayGroup.items as {media,airingAt}}
                {@const img=media?.coverImage?.extraLarge||media?.coverImage?.medium}
                <div class='guide-row' use:trackMouse use:click={()=>modal.open(modal.ANIME_DETAILS,media)}>
                  <span class='guide-name'>{anilistClient.title(media)}</span>
                  <span class='guide-time'>{fmtTime(airingAt,use12h)}</span>
                  {#if img}<img class='guide-hover-art' src={img} alt=''/>{/if}
                </div>
              {/each}
            </div>
          {:else}<div class='guide-empty'>No airings today</div>{/if}
        </div>
      {/if}
      <div class='guide-week'>
        <div class='guide-week-header'>Weekly Schedule</div>
        {#each otherGroups as group}
          <div class='guide-day-section'>
            <div class='guide-day-name'>{group.day}</div>
            <div class='guide-list'>
              {#each group.items as {media,airingAt}}
                {@const img=media?.coverImage?.extraLarge||media?.coverImage?.medium}
                <div class='guide-row' use:trackMouse use:click={()=>modal.open(modal.ANIME_DETAILS,media)}>
                  <span class='guide-name'>{anilistClient.title(media)}</span>
                  <span class='guide-time'>{fmtTime(airingAt,use12h)}</span>
                  {#if img}<img class='guide-hover-art' src={img} alt=''/>{/if}
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
  .hidden-search { display:none; }

  /* fab */
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
  .vopts button { background:#1a1a1a; border:1px solid transparent; color:#888; padding:8px; border-radius:6px; cursor:pointer; font-size:11px; flex:1; text-align:center; }
  .vopts button.active { border-color:var(--accent-color); color:var(--accent-color); background:color-mix(in srgb,var(--accent-color),transparent 95%); }
  .vopts input[type="range"] { width:100%; accent-color:var(--accent-color); cursor:pointer; margin:2px 0; }

  /* guide */
  .guide-root { overflow-y:auto; height:100vh; }
  .guide-loading { padding:3em; text-align:center; color:rgba(190,190,210,0.3); font-size:0.95em; letter-spacing:0.05em; }
  .guide-wrap { display:grid; grid-template-columns:320px 1fr; min-height:80vh; padding:2rem; max-width:800px; margin:0 auto; }
  .guide-wrap.no-today { grid-template-columns:1fr; }
  .guide-now { border-right:1px solid rgba(255,255,255,0.07); padding-right:2rem; margin-right:2rem; }
  .guide-now-header { margin-bottom:1.5rem; }
  .guide-now-title { display:block; font-size:2.5em; font-weight:700; color:#fff; letter-spacing:-0.02em; }
  .guide-now-date { display:block; font-size:0.85em; color:rgba(255,255,255,0.3); margin-top:0.4em; font-weight:400; }
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