<script context='module'>
  import SectionsManager from '@/modules/sections.js'
  import SearchPage from '@/routes/search/SearchPage.svelte'
  import { writable } from 'simple-store-svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { nextAiring } from '@/modules/anime/anime.js'
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { cache, caches } from '@/modules/cache.js'
  import Helper from '@/modules/helper.js'

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const key = writable({})
  const search = writable(cache.getEntry(caches.HISTORY, 'lastSchedule') || { scheduleList: true, format: ['TV'], format_not: [], genre: [], genre_not: [], tag: [], tag_not: [], status: [], status_not: [] })
  search.subscribe(value => {
    const searched = { ...value }
    delete searched.load
    delete searched.preview
    cache.setEntry(caches.HISTORY, 'lastSchedule', searched)
  })

  async function fetchAllScheduleEntries (variables) {
    const results = { data: { Page: { media: [], pageInfo: { hasNextPage: false } } } }
    const airingLists = await (variables.hideSubs ? animeSchedule.dubAiringLists.value : animeSchedule.subAiringLists.value)
    let ids = airingLists.map(entry => {
        const media = variables.hideSubs ? entry.media?.media : entry
        return media?.id ? { id: media.id, idMal: media.idMal ?? null } : null
    }).filter(item => item != null)

    if ((variables.hideMyAnime || variables.showMyAnime) && Helper.isAuthorized()) {
      const userIds = await Helper.userLists(variables).then(res => {
        if (!res?.data && res?.errors) throw res.errors[0]
        if (Helper.isAniAuth()) return Array.from(new Set(res.data.MediaListCollection.lists.filter(({ status }) => (variables.hideMyAnime ? variables.hideStatus : variables.showStatus).includes(status)).flatMap(list => list.entries.map(({ media }) => media.id))))
        else return res.data.MediaList.filter(({ node }) => (variables.hideMyAnime ? variables.hideStatus : variables.showStatus).includes(Helper.statusMap(node.my_list_status.status))).map(({ node }) => node.id)
      })
      ids = ids.filter(({ id, idMal }) => Helper.isAniAuth() ? variables.hideMyAnime ? !userIds.includes(id) : userIds.includes(id) : variables.hideMyAnime ? !userIds.includes(idMal) : userIds.includes(idMal))
    }
    const res = await anilistClient.searchAllIDS({ id: ids.map(({ id }) => id).filter(Boolean), ...SectionsManager.sanitiseObject(variables), page: 1, perPage: 50 })
    if (!res?.data && res?.errors) throw res.errors[0]
    results.data.Page.media = results.data.Page.media.concat(res.data.Page.media)
    if (variables.hideSubs) {
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => {
        const cachedItem = airingLists.find(entry => entry.media?.media?.id === media.id)
        if (cachedItem?.delayedIndefinitely && cachedItem?.status?.toUpperCase()?.includes('FINISHED')) return false
        const numberOfEpisodes = cachedItem.subtractedEpisodeNumber ? (cachedItem.episodeNumber - cachedItem.subtractedEpisodeNumber) : 1
        let predict = false
        if (cachedItem?.media?.media?.airingSchedule?.nodes?.length) {
            const now = new Date()
            const futureEpisodes = cachedItem.media.media.airingSchedule.nodes.filter(node => new Date(node.airingAt) > now)
            predict = futureEpisodes.length === 0
            if (predict && !((numberOfEpisodes > 4) && !cachedItem.unaired)) {
                const latestEpisode = Math.max(...cachedItem.media.media.airingSchedule.nodes.map(node => node.episode))
                const latestAiringAt = Math.max(...cachedItem.media.media.airingSchedule.nodes.map(node => new Date(node.airingAt).getTime()))
                cachedItem.media.media.airingSchedule.nodes.unshift({
                    episode: latestEpisode + 1,
                    airingAt: new Date(latestAiringAt + (cachedItem.delayedIndefinitely ? 6 * 365 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000)).toISOString().slice(0, -5) + 'Z'
                })
            }
        }
        return (!(cachedItem?.media?.media?.airingSchedule?.nodes[0]?.episode > media.episodes) || !media.episodes) && (!predict || !((numberOfEpisodes > 4) && !cachedItem.unaired)) && cachedItem?.media?.media?.airingSchedule?.nodes[0]?.airingAt && self.findIndex(m => m.id === media.id) === index
      }).sort((a, b) => {
          const aEntry = airingLists.find(entry => entry.media?.media?.id === a.id)
          const bEntry = airingLists.find(entry => entry.media?.media?.id === b.id)
          const aDelayed = aEntry?.delayedIndefinitely ? 1 : 0
          const bDelayed = bEntry?.delayedIndefinitely ? 1 : 0
          if (aDelayed !== bDelayed) return aDelayed - bDelayed
          return new Date(nextAiring(aEntry?.media?.media?.airingSchedule?.nodes, variables)?.airingAt).getTime() - new Date(nextAiring(bEntry?.media?.media?.airingSchedule?.nodes, variables)?.airingAt).getTime()
      })
    } else {
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m => m?.id === media?.id) === index).sort((a, b) => nextAiring(a.airingSchedule?.nodes)?.airingAt - nextAiring(b.airingSchedule?.nodes)?.airingAt)
    }

    const todayIdx = new Date().getDay()
    const orderedDays = [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)]
    const grouped = {}
    for (const media of results.data.Page.media) {
      const node = nextAiring(media?.airingSchedule?.nodes, variables)
      if (!node?.airingAt) continue
      const day = DAYS[new Date(node.airingAt * 1000).getDay()]
      ;(grouped[day] ??= []).push(media)
    }
    const withHeaders = []
    for (const day of orderedDays) {
      if (!grouped[day]) continue
      withHeaders.push({ __dayHeader: true, day })
      withHeaders.push(...grouped[day])
    }
    results.data.Page.media = withHeaders
    return results
  }
</script>

<script>
  import { settings } from '@/modules/settings.js'
  import ScheduleCard from '@/components/cards/ScheduleCard.svelte'

  let textGroups = [], textVars = null

  $search.load = (_, __, variables) => {
    textVars = variables
    const raw = fetchAllScheduleEntries(variables)
    raw.then(r => {
      textGroups = (r?.data?.Page?.media ?? []).reduce((acc, item) => {
        if (item.__dayHeader) acc.push({ day: item.day, items: [] })
        else acc.at(-1)?.items.push(item)
        return acc
      }, [])
    })
    return SectionsManager.wrapResponse(raw, 150)
  }

  const views = ['big', 'small', 'text', 'single']
  const toggleView = () => {
    const idx = views.indexOf($settings.scheduleView || 'big')
    $settings.scheduleView = views[(idx + 1) % views.length]
  }

  $: isTextMode = $settings.scheduleView === 'text' || $settings.scheduleView === 'single'
</script>

<button class="view-switch-fab" on:click={toggleView}>
  {$settings.scheduleView || 'big'}
</button>

<SearchPage key={key} search={search}/>

{#if isTextMode && textGroups.length}
  <div class='text-grid-wrap'>
    <div class='text-grid' class:single-col={$settings.scheduleView === 'single'}>
      {#each textGroups as group}
        <div class='text-col'>
          <div class='text-day-header'>{group.day}</div>
          {#each group.items as item}
            <ScheduleCard data={item} variables={textVars} />
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .view-switch-fab {
    position: fixed;
    bottom: 60px;
    left: 60px;
    z-index: 9999;
    padding: 15px 25px;
    font-size: 32px;
    font-weight: bold;
    text-transform: uppercase;
    background: #2edf82;
    color: #000;
    border: none;
    border-radius: 50px;
    cursor: pointer;
  }

  .text-grid-wrap :global(.schedule-grid) {
    display: none !important;
  }

  .text-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 0 0.5rem;
    padding: 0.5rem;
    align-items: start;
  }
  .text-grid.single-col { grid-template-columns: minmax(280px, 600px); justify-content: center; }

  .text-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .text-day-header {
    padding: 1rem 0.6rem 0.4rem;
    font-size: 1.05rem;
    font-weight: 700;
    color: rgba(190, 190, 210, 0.45);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
</style>