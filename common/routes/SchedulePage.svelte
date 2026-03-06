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

  export const groupedDays = writable([])

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
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => {
        const cachedItem = airingLists.find(entry => entry.media?.media?.id === media.id)
        if (cachedItem?.delayedIndefinitely && cachedItem?.status?.toUpperCase()?.includes('FINISHED')) {
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
      results.data.Page.media = results.data.Page.media.filter((media, index, self) => nextAiring(media?.airingSchedule?.nodes)?.airingAt && self.findIndex(m => m?.id === media?.id) === index).sort((a, b) => nextAiring(a.airingSchedule?.nodes)?.airingAt - nextAiring(b.airingSchedule?.nodes)?.airingAt)
    }

    // Group by weekday starting from today
    const todayIdx = new Date().getDay()
    const orderedDays = [...DAYS.slice(todayIdx), ...DAYS.slice(0, todayIdx)]
    const grouped = {}
    for (const media of results.data.Page.media) {
      const node = nextAiring(media?.airingSchedule?.nodes, variables)
      if (!node?.airingAt) continue
      const day = DAYS[new Date(node.airingAt * 1000).getDay()]
      ;(grouped[day] ??= []).push(media)
    }

    // Populate grouped days store for column view
    groupedDays.set(orderedDays.filter(d => grouped[d]).map(d => ({ day: d, entries: grouped[d] })))

    // Build flat sentinel array for normal view
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
  import { airingAt, getAiringInfo } from '@/modules/anime/anime.js'
  import { modal } from '@/modules/navigation.js'
  import { click } from '@/modules/click.js'

  $search.load = (_, __, variables) => SectionsManager.wrapResponse(fetchAllScheduleEntries(variables), 150)

  function getEpisodeInfo (media) {
    const _airingAt = airingAt(media, { scheduleList: true })
    if (!_airingAt) return null
    return getAiringInfo(_airingAt)
  }

  function viewMedia (media) {
    modal.open(modal.ANIME_DETAILS, media)
  }
</script>

{#if $settings.textGridView}
  <div class='schedule-columns'>
    {#each $groupedDays as { day, entries }}
      <div class='day-col'>
        <div class='day-col-header'>{day}</div>
        <div class='day-col-entries'>
          {#each entries as media}
            {@const info = getEpisodeInfo(media)}
            <div class='day-entry' use:click={() => viewMedia(media)}>
              <span class='day-entry-time'>{info?.time ?? 'TBA'}</span>
              <span class='day-entry-ep'>{info?.episode ?? 'Upcoming'}</span>
              <span class='day-entry-title'>{anilistClient.title(media)}</span>
              {#if media?.averageScore}<span class='day-entry-score'>{Math.round(media.averageScore / 10) * 10}%</span>{/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else}
  <SearchPage key={key} search={search}/>
{/if}

<style>
  .schedule-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 0;
    padding: 1.2rem 1rem 2rem;
  }

  .day-col {
    display: flex;
    flex-direction: column;
    border-right: 1px solid rgba(255,255,255,0.06);
    min-width: 0;
  }

  .day-col:last-child {
    border-right: none;
  }

  .day-col-header {
    font-size: 1.1rem;
    font-weight: 700;
    color: rgba(255,255,255,0.5);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.6rem 1.2rem 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    position: sticky;
    top: 0;
    background: hsl(var(--dark-color-hsl));
    z-index: 2;
  }

  .day-col-entries {
    display: flex;
    flex-direction: column;
  }

  .day-entry {
    display: grid;
    grid-template-columns: 5.5rem 1fr auto;
    grid-template-rows: auto auto;
    column-gap: 0.6rem;
    padding: 0.55rem 1.2rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer;
    transition: background 0.1s ease;
    align-items: center;
  }

  .day-entry:hover {
    background: rgba(255,255,255,0.05);
  }

  .day-entry-time {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--accent-color, rgba(160,160,220,0.9));
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    grid-row: 1 / 3;
    align-self: center;
  }

  .day-entry-ep {
    font-size: 0.9rem;
    font-weight: 400;
    color: rgba(190,190,210,0.35);
    white-space: nowrap;
    grid-column: 2;
    grid-row: 1;
    line-height: 1.2;
  }

  .day-entry-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: rgba(235,235,248,0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    grid-column: 2;
    grid-row: 2;
    line-height: 1.3;
  }

  .day-entry-score {
    font-size: 0.9rem;
    font-weight: 500;
    color: rgba(190,190,210,0.3);
    font-variant-numeric: tabular-nums;
    grid-column: 3;
    grid-row: 1 / 3;
    align-self: center;
    white-space: nowrap;
  }
</style>