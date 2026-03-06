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
    // Hide My Anime / Show My Anime
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
      // filter out entries without airing schedule, duplicates [only allow first occurrence], and completed dubs, then sort entries from first airing to last airing.
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => {
        const cachedItem = airingLists.find(entry => entry.media?.media?.id === media.id)
        if (cachedItem?.delayedIndefinitely && cachedItem?.status?.toUpperCase()?.includes('FINISHED')) { // skip these as they are VERY likely partial dubs so production isn't necessarily in a suspended state.
          return false
        }
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
      // filter out entries without airing schedule and duplicates [only allow first occurrence], then sort entries from first airing to last airing.
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m => m?.id === media?.id) === index).sort((a, b) => nextAiring(a.airingSchedule?.nodes)?.airingAt - nextAiring(b.airingSchedule?.nodes)?.airingAt)
    }

    // Group by weekday and inject __dayHeader sentinels, starting from today
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

  let textModeGroups = []
  let textModeVars = null

  $search.load = (_, __, variables) => {
    textModeVars = variables
    const raw = fetchAllScheduleEntries(variables)
    raw.then(result => {
      const media = result?.data?.Page?.media ?? []
      const groups = []
      let cur = null
      for (const item of media) {
        if (item.__dayHeader) { cur = { day: item.day, items: [] }; groups.push(cur) }
        else if (cur) cur.items.push(item)
      }
      textModeGroups = groups
    })
    return SectionsManager.wrapResponse(raw, 150)
  }
</script>

{#if ($settings.scheduleView === 'text' || $settings.scheduleView === 'single') && textModeGroups.length}
  <div class='text-grid-wrap'>
    <SearchPage key={key} search={search}/>
    <div class='text-grid' class:single-col={$settings.scheduleView === 'single'}>
      {#each textModeGroups as group}
        <div class='text-col'>
          <div class='text-day-header'>{group.day}</div>
          {#each group.items as item}
            <ScheduleCard data={item} variables={textModeVars} />
          {/each}
        </div>
      {/each}
    </div>
  </div>
{:else}
  <SearchPage key={key} search={search}/>
{/if}

<style>
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