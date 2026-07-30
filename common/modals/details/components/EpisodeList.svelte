<script context='module'>
  import { animeSchedule } from '@/modules/anime/animeschedule.js'
  import { malDubs } from '@/modules/anime/animedubs.js'
  import { settings } from '@/modules/settings.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { createListener, past } from '@/modules/util.js'

  const episodeRx = /Episode (\d+) - (.*)/
  const { reactive, init } = createListener(['torrent-button'])
  init(true)

  async function dubbedEpisode(i, media) {
    if (!settings.value.cardAudio) return
    const episode = i + 1
    const entry = (await animeSchedule.dubAiringLists.value)?.find(entry => entry.media?.media?.id === media.id)
    const episodeEntry = (await animeSchedule.dubAiredLists.value)?.find(entry => entry?.id === media.id && entry?.episode?.aired === episode)
    if (entry && !episodeEntry) {
      const airingEntry = entry?.media?.media?.airingSchedule?.nodes.find((entry) => entry.episode === episode)
      const airingSchedule = airingEntry || entry?.media?.media?.airingSchedule?.nodes[episode - 1] || entry?.media?.media?.airingSchedule?.nodes[0]
      const isDelayed = (episodeDate) => !!(episodeDate && (((new Date(entry.delayedUntil) >= new Date(episodeDate)) && ((new Date(entry.delayedFrom) > new Date(episodeDate)) || (new Date(entry.delayedUntil).getTime() === new Date(episodeDate).getTime()) || ((new Date(entry.delayedFrom) <= new Date(episodeDate)) && (entry.episodeNumber === entry.media?.media?.airingSchedule?.nodes[0].episode) && (new Date(entry.delayedUntil).getTime() === new Date(entry.media?.media?.airingSchedule?.nodes[0].airingAt).getTime()))) && (new Date(entry.delayedUntil) > new Date())) || entry.delayedIndefinitely))
      const delayed = isDelayed(entry.episodeDate) || (airingEntry && isDelayed(airingSchedule?.airingAt))
      const numberOfEpisodes = entry.subtractedEpisodeNumber || 1
      if (entry.episodeDate && entry.episodeNumber <= episode) {
        const airDate = past(new Date(delayed ? entry.delayedUntil : entry.episodeDate), entry.episodeNumber >= episode ? 0 : episode - entry.episodeNumber, true)
        return { airdate: airDate, text: `${entry.delayedIndefinitely ? 'Suspended' : entry.delayedIndefinitely ? 'Not Planned' : ((episode > entry.episodeNumber) && (numberOfEpisodes > 4) && !entry.unaired) ? 'In Production' : since(airDate) + (delayed ? ` (${entry.delayedText || 'Delayed'})` : '')}`, delayed: delayed }
      } else if (airingSchedule && airingSchedule.episode <= episode) {
        return { airdate: airingSchedule.airingAt, text: `${since(new Date(airingSchedule.airingAt))} ${(delayed ? `(${entry.delayedText || 'Delayed'})` : '')}`, delayed: delayed && !entry.delayedIndefinitely }
      } else {
        return { airdate: new Date().toISOString(), text: `Finished`, delayed: false }
      }
    } else if (episodeEntry) {
      return { airdate: episodeEntry.episode.airedAt, text: `${since(new Date(episodeEntry.episode.airedAt))}`, delayed: false }
    } else if ((await malDubs.dubLists.value)?.incomplete?.includes(media.idMal) && (await animeSchedule.dubAiredLists.value).find(entry => entry?.id === media.id && entry?.episode?.aired === 1)) {
      return { text: `Not Planned`, delayed: true, notPlanned: true }
    } else if (!entry && !episodeEntry && (media.seasonYear >= new Date().getFullYear()) && await malDubs.isDubMedia(media)) {
      return { text: `In Production`, delayed: false }
    }
  }
</script>

<script>
  import { loadedTorrent, completedTorrents, seedingTorrents, stagingTorrents } from '@/modules/torrent.js'
  import { since, monthDay, matchPhrase, capitalize } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import { onMount, onDestroy } from 'svelte'
  import { episodeByAirDate } from '@/modules/extensions/handler.js'
  import { liveAnimeProgress } from '@/modules/anime/animeprogress.js'
  import { getHash } from '@/modules/anime/animehash.js'
  import { episodesList } from '@/modules/episodes.js'
  import { getAniMappings, hasZeroEpisode, durationMap } from '@/modules/anime/anime.js'
  import EpisodeListSk from '@/components/skeletons/EpisodeListSk.svelte'
  import TorrentButton from '@/components/TorrentButton.svelte'
  import AudioLabel from '@/components/AudioLabel.svelte'
  import SmartImage from '@/components/visual/SmartImage.svelte'

  export let media

  export let episodeOrder = true

  export let watched = false

  export let episodeCount

  export let userProgress = 0

  export let play

  export let episodeLoad = null

  export let mobileList = false

  export let episodeList = []

  let mobileWaiting = null

  $: id = media.id
  $: idMal = media.idMal
  $: duration = media.duration
  $: animeProgress = liveAnimeProgress(id)

  let loadScroll = false
  let maxEpisodes = 15
  let currentEpisodes = []
  function handleScroll(event) {
    const container = event.target
    if (currentEpisodes.length !== episodeList.length && container.scrollTop + container.clientHeight + 80 >= container.scrollHeight) {
      loadScroll = true
      const nextBatch = (episodeOrder ? episodeList : [...episodeList]?.reverse())?.slice(currentEpisodes.length, currentEpisodes.length + maxEpisodes)
      currentEpisodes = [...new Set([...currentEpisodes, ...nextBatch])]
    }
  }

  async function load () {
    const mappings = await getAniMappings(id) || {}
    const { episodes, specialCount, episodeCount: newEpisodeCount } = mappings
    const getEpisode = (episode) => {
      const keys = Object.keys(episodes || {})
      const episodeData = episodes?.[episode] || episodes?.[`O${episode}`]
      // Handle mappings edge case where there are two entries with the same episode. This typically happens when a movie or special gets broken up into multiple parts for streaming e.g: https://anilist.co/anime/151384 and https://anilist.co/anime/194884
      if (episode === 1 && specialCount === 0 && episodes?.['1'] && episodes?.['O1'] && (media.format === 'MOVIE' || media.format === 'SPECIAL' || episodeData?.title?.en?.match(/MOVIE/i)) && keys.length > (media.episodes ?? 0) && media.status === 'FINISHED') {
        return episodes[keys[1]]
      }
      return episodeData
    }

    /** @type {{ zeroEpisode: object; airingAt: number; episode: number; filler?: boolean; dubAiring?: object; }[]} */
    episodeList = Array.from({ length: (newEpisodeCount > episodeCount ? newEpisodeCount : episodeCount) }, (_, i) => ({
      episode: i + 1, image: null, summary: null, rating: null, title: null, length: null, airdate: null, airingAt: null, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
    }))
    let alEpisodes = episodeList

    // fallback: pull episodes from airing schedule if anime doesn't have expected episode count
    if (!(media.episodes && media.episodes === newEpisodeCount && media.status === 'FINISHED')) {
      const settled = media.airingSchedule
      if (settled?.length >= newEpisodeCount) {
        alEpisodes = settled.map((episode, i) => ({
          ...episode, airingAt: episode.airingAt, episode: episode.episode, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
        }))
      } else if (settled?.length) {
        const settledMap = settled.reduce((acc, { airingAt, episode }) => {
          acc[episode] = { airingAt, episode }
          return acc
        }, {})
        alEpisodes = alEpisodes.map((episode, i) => {
          const settledData = settledMap?.[episode.episode]
          if (settledData) return { ...episode, airingAt: settledData.airingAt ?? episode.airingAt, episode: settledData.episode ?? episode.episode, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)}
          return episode
        })
      }
    }

    if ((alEpisodes.length < episodeCount) || (!alEpisodes.length && !episodeCount)) {
      const eps = await episodesList.getEpisodeData(idMal)
      if (eps?.length > 0) {
        const lastId = eps[eps.length - 1].episode_id
        alEpisodes = Array.from({ length: (lastId) }, (_, i) => ({
          episode: i + 1, image: null, summary: null, rating: null, title: (lastId <= 100 ? eps.find(e => e.episode_id === (i + 1)) : episodesList.getSingleEpisode(idMal, (i + 1)))?.title, length: null, airdate: null, airingAt: (lastId <= 100 ? eps.find(e => e.episode_id === (i + 1)) : episodesList.getSingleEpisode(idMal, (i + 1)))?.aired, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
        }))
      } else if ((media?.status === 'RELEASING' || media?.status === 'FINISHED')) {
        alEpisodes = Array.from({ length: (media?.mediaListEntry?.progress > 0 ? media?.mediaListEntry?.progress : 1) }, (_, i) => ({
          episode: i + 1, image: null, summary: null, rating: null, title: null, length: null, airdate: null, airingAt: null, filler: episodesList.getSingleEpisode(idMal, (i + 1)), dubAiring: dubbedEpisode(i, media)
        }))
      }
    }

    let lastValidAirDate = null
    let lastDuration = durationMap[media?.format]
    let zeroAsFirstEpisode
    const zeroEpisode = await hasZeroEpisode(media, mappings)
    const kitsuMappings = await episodesList.getKitsuEpisodes(media.id)
    if (zeroEpisode) alEpisodes.unshift({ episode: 0, title: zeroEpisode[0].title, airingAt: media.airingSchedule?.nodes?.find(node => node.episode === 1)?.airingAt || zeroEpisode[0].airingAt, filler: episodesList.getSingleEpisode(idMal, 0), dubAiring: dubbedEpisode(0, media)})
    for (const { episode, title: oldTitle, airingAt, filler, dubAiring } of alEpisodes?.length ? alEpisodes : [{ episode: 1, title: null, airingAt: null, filler: null, dubAiring: null }]) {
      const airingPromise = await airingAt
      const alDate = airingPromise && new Date(typeof airingPromise === 'number' ? (airingPromise || 0) * 1000 : (airingPromise || 0))

      // validate by air date if the anime has specials AND doesn't have matching episode count
      const needsValidation = !(!specialCount || (media.episodes && media.episodes === newEpisodeCount && episodes && getEpisode(Number(episode))))
      const { image, summary, overview, rating, title: newTitle, length, airdate } = needsValidation ? episodeByAirDate(null, episodes, episode) : (episodes && getEpisode(Number(episode)) || {})
      const kitsuEpisode = kitsuMappings?.data?.find(ep => ep?.attributes?.number === episode)?.attributes
      const streamingTitle = !media.streamingEpisodes?.find(ep => episodeRx.exec(ep.title) && Number(episodeRx.exec(ep.title)[1]) === (media?.episodes + 1)) && media.streamingEpisodes?.find(ep => episodeRx.exec(ep.title) && Number(episodeRx.exec(ep.title)[1]) === episode && episodeRx.exec(ep.title)[2] && !episodeRx.exec(ep.title)[2].toLowerCase().trim().startsWith('episode'))
      const streamingThumbnail = media.streamingEpisodes?.find(ep => episodeRx.exec(ep.title) && Number(episodeRx.exec(ep.title)[1]) === episode)?.thumbnail
      const title = episode === 0 ? oldTitle : newTitle?.en || oldTitle?.en || (await episodesList.getSingleEpisode(idMal, episode))?.title || episodeRx.exec(streamingTitle?.title)?.[2]
      lastDuration = length || duration || lastDuration

      // fix any weird dates when maintainers are lazy.
      const scheduledEntry = media?.airingSchedule?.nodes.find((entry) => entry.episode === episode + (zeroEpisode ? 1 : 0))
      const scheduledDate = scheduledEntry ? new Date(scheduledEntry.airingAt * 1000) : null
      let validatedAiringAt = lastValidAirDate ? (((scheduledDate >= lastValidAirDate) || ((scheduledDate?.getDate() >= lastValidAirDate.getDate()) && (scheduledDate?.getMonth() >= lastValidAirDate.getMonth()) && (scheduledDate?.getFullYear() >= lastValidAirDate.getFullYear()))) ? scheduledDate : null) : scheduledDate
      if (!validatedAiringAt) {
        const fallbackAirDate = airdate ? new Date(airdate) : null
        validatedAiringAt = lastValidAirDate ? ((alDate || fallbackAirDate) >= lastValidAirDate) || (((alDate || fallbackAirDate)?.getDate() >= lastValidAirDate.getDate()) && ((alDate || fallbackAirDate)?.getMonth() >= lastValidAirDate.getMonth()) && ((alDate || fallbackAirDate)?.getFullYear() >= lastValidAirDate.getFullYear())) ? (alDate || fallbackAirDate) : null : (alDate || fallbackAirDate)
        if (validatedAiringAt) {
          lastValidAirDate = validatedAiringAt
        }
      } else {
        lastValidAirDate = validatedAiringAt
      }

      // fix for when multi-header sub releases aren't properly updated on Anilist, but the exact same dub multi-header release exists. Should prevent any episodes being marked unreleased if a dub clearly exists for it, therefore the sub exists.
      let _dubAiring = dubAiring
      if (_dubAiring && validatedAiringAt && media.status !== 'FINISHED') {
        _dubAiring = await dubAiring
        if (_dubAiring?.airdate && new Date(_dubAiring.airdate).getTime() < new Date(validatedAiringAt).getTime()) validatedAiringAt = _dubAiring.airdate
      }

      let zeroSummary
      if (episode === 0) { // might get lucky and randomly find the zero episode from anilist mappings
        const findZeroEpisode = (title, data) => {
          for (const route in data) if (matchPhrase(data[route]?.title?.en, title, 0.4)) return data[route]
          return null
        }
        const zeroEpisode = findZeroEpisode(title, mappings?.episodes)
        zeroSummary = zeroEpisode?.summary || zeroEpisode?.[0]?.summary || zeroEpisode?.overview || zeroEpisode?.[0]?.overview || 'This is a zero episode which means a prequel, prologue or a teaser which may be important to the story.'
        lastDuration = zeroEpisode?.length || zeroEpisode?.[0]?.length || lastDuration
      }
      if (zeroEpisode && episode === 1 && /episode\s*0/i.test(title || kitsuEpisode?.titles?.en_us || kitsuEpisode?.titles?.en_jp || newTitle?.jp || oldTitle?.jp)) {
        zeroAsFirstEpisode = true
        continue // skip setting this episode as it's Episode 0
      }

      const episodeNumber = episode - (zeroAsFirstEpisode ? 1 : 0)
      const foundTitle = (media?.status === 'FINISHED' || (validatedAiringAt && new Date(validatedAiringAt).getTime() <= (Date.now() + 7 * 24 * 60 * 60 * 1000))) ? title || kitsuEpisode?.titles?.en_us || kitsuEpisode?.titles?.en_jp || newTitle?.jp || oldTitle?.jp : null
      episodeList[episodeNumber - (!zeroEpisode ? 1 : 0)] = { zeroEpisode, episode: episodeNumber, image: (media?.status === 'FINISHED' || (validatedAiringAt && new Date(validatedAiringAt).getTime() <= (Date.now() + 7 * 24 * 60 * 60 * 1000))) ? episode === 0 ? zeroEpisode[0]?.thumbnail : episodeList.some((ep) => ep.image === (image || kitsuEpisode?.thumbnail?.original || streamingThumbnail) && ep.episode !== episodeNumber) ? null : (image || kitsuEpisode?.thumbnail?.original || streamingThumbnail) : null, summary: (media?.status === 'FINISHED' || (validatedAiringAt && new Date(validatedAiringAt).getTime() <= Date.now()) || ((episode === 0 || episode === 1) && !validatedAiringAt && media?.status === 'RELEASING')) ? episode === 0 ? (zeroSummary || summary || overview) : episodeList.some((ep) => ep.summary === (summary || overview || kitsuEpisode?.synopsis || kitsuEpisode?.description) && ep.episode !== episodeNumber) ? null : (summary || overview || kitsuEpisode?.synopsis || kitsuEpisode?.description) : `This episode ${validatedAiringAt || (media?.status === 'NOT_YET_RELEASED' && (media?.startDate?.month || media?.season || media?.seasonYear)) ? `will be released ${validatedAiringAt || media?.startDate?.month ? `${validatedAiringAt ? `on` : `in`} ${monthDay(validatedAiringAt || new Date(media.startDate.year, media.startDate.month, media.startDate.day), !validatedAiringAt)}` : `in ${media?.season ? capitalize(media?.season?.toLowerCase()) : ''} ${media?.seasonYear || ''}`}.` : ` is in production and does not have an estimated release date.`}`, rating, title: foundTitle && media?.episodes === 1 && (foundTitle.match(/ web|web |movie/i) || foundTitle.toLowerCase() === 'web') ? 'The Movie' : foundTitle, length: media?.status === 'FINISHED' || validatedAiringAt ? lastDuration : null, airdate: validatedAiringAt, airingAt: validatedAiringAt, filler, dubAiring: !zeroEpisode ? _dubAiring : dubbedEpisode(episodeNumber - 1, media) }
    }

    if (zeroEpisode && episodeList.length === alEpisodes.length) episodeList = episodeList.slice(0, -1)
    if (media?.bannerImage && episodeList?.some(episode => episode?.image)) episodeList = episodeList.map(episode => episode?.image ? episode : { ...episode, image: media?.bannerImage })
    currentEpisodes = episodeList?.slice(0, maxEpisodes)
    return episodeList && episodeList?.length > 0 ? episodeList : null
  }

  $: if (media) {
    episodeList = []
    episodeOrder = true
    currentEpisodes = []
    mobileWaiting = null
    loadScroll = false
    if (!mobileList) episodeLoad = load()
  }

  $: {
    if (episodeOrder) currentEpisodes = episodeList?.slice(0, maxEpisodes)
    else currentEpisodes = [...episodeList]?.reverse()?.slice(0, maxEpisodes)
  }

  let container
  $: if (id && container) container.scrollTo({top: 0, behavior: 'smooth'})
  function renderVisible() {
    if (!container || container.scrollHeight === 0 || container.clientHeight === 0) return
    if (currentEpisodes.length !== episodeList.length && !(container.scrollHeight > container.clientHeight)) {
      const nextBatch = (episodeOrder ? episodeList : [...episodeList]?.reverse())?.slice(currentEpisodes.length, currentEpisodes.length + maxEpisodes)
      currentEpisodes = [...new Set([...currentEpisodes, ...nextBatch])]
    }
  }

  function mobileWait(condition, interval = 1000) {
    if (mobileWaiting) return mobileList ? mobileWaiting : null
    mobileWaiting = new Promise(resolve => setTimeout(resolve, 1000))
    mobileWaiting = new Promise((resolve) => {
      const check = () => {
        if (mobileWaiting) {
          if (condition()) resolve()
          else setTimeout(check, interval)
        }
      }
      check()
    })
    return mobileWaiting
  }

  onMount(() => {
    setInterval(() => {
      if (!mobileList && episodeList?.length > maxEpisodes) renderVisible()
    }, 100)
  })

  onDestroy(() => {
    mobileWaiting = null
    episodeList = []
    episodeLoad = null
  })
</script>

<div bind:this={container} class='episode-list overflow-y-auto overflow-x-hidden {$$restProps.class}' on:scroll={handleScroll}>
  {#await (episodeLoad || mobileWait(() => episodeList?.length > 0 || !episodeList)?.then(() => episodeList))}
    {#each Array.from({ length: media?.status !== 'NOT_YET_RELEASED' ? Math.max(Math.min(episodeCount || 0, maxEpisodes), 1) : 1 }) as _}
      <div class='w-full px-20 my-20 content-visibility-auto scale h-150' class:h-165={SUPPORTS.isAndroid}>
        <EpisodeListSk />
      </div>
    {/each}
  {:then _}
    {#if episodeList}
      {#each currentEpisodes as { zeroEpisode, episode, image, summary, rating, title, length, airdate, filler, dubAiring}, index}
        {#await Promise.all([title, filler, dubAiring, currentEpisodes[episodeOrder ? index - 1 : index + 1]?.dubAiring])}
          {#each Array.from({length: Math.min(episodeCount || 0, maxEpisodes)}) as _, index}
            <div class='w-full px-20 content-visibility-auto scale h-150' class:h-165={SUPPORTS.isAndroid} class:my-20={!mobileList || index !== 0}>
              <EpisodeListSk/>
            </div>
          {/each}
        {:then [title, filler, dubAiring, nextDubAiring]}
          {#if media?.status === 'FINISHED' || (episodeOrder ? (index === 0 || ((currentEpisodes[index - 1]?.airdate && (new Date(currentEpisodes[index - 1].airdate).getTime() <= new Date().getTime())) || (media?.status !== 'NOT_YET_RELEASED' && airdate && currentEpisodes[index - 1]?.airdate && (currentEpisodes[index - 1]?.airdate === airdate)) || (nextDubAiring?.airdate && new Date(nextDubAiring.airdate).getTime() === new Date(dubAiring.airdate).getTime()))) : (index === currentEpisodes.length - 1 || (currentEpisodes[index + 1]?.airdate && (new Date(currentEpisodes[index + 1]?.airdate).getTime() <= new Date().getTime())) || (currentEpisodes[index + 1]?.airdate && currentEpisodes[index + 1]?.airdate === airdate) || (nextDubAiring?.airdate && new Date(nextDubAiring.airdate).getTime() === new Date(dubAiring.airdate).getTime())))}
            {@const unreleased = media?.status !== 'FINISHED' && ((airdate && new Date(airdate).getTime() > new Date()) || (!airdate && (episode > 1 || media?.status === 'NOT_YET_RELEASED')))}
            {@const completed = !watched && userProgress >= (episode + (zeroEpisode ? 1 : 0))}
            {@const target = userProgress + 1 === (episode + (zeroEpisode ? 1 : 0))}
            {@const hasFiller = filler?.filler || filler?.recap}
            {@const progress = !watched && ($animeProgress?.[episode] ?? 0)}
            {@const resolvedTitle = episodeList.filter((ep) => ep.episode < episode).some((ep) => matchPhrase(ep.title, title, 0.1, true)) ? null : title}
            {@const largeCard = image}
            {@const resolvedHash = ($completedTorrents || $seedingTorrents || $stagingTorrents || $loadedTorrent) && getHash(media?.id, { episode, client: true, batchGuess: true }, false, true)}
            <div class='w-full content-visibility-auto scale my-20' class:load-in={!loadScroll} class:opacity-half={completed} class:scale-target={target} class:px-20={!target} class:px-10={target} class:ep-card-h={!SUPPORTS.isAndroid && largeCard} class:h-165={SUPPORTS.isAndroid && largeCard}>
              <div role='button' tabindex='0' class='episode-card rounded-2 w-full h-full overflow-hidden d-flex flex-xsm-column flex-row position-relative {unreleased ? `unreleased not-allowed` : `pointer`}' class:not-reactive={!$reactive} class:smallCard={!largeCard} class:android={SUPPORTS.isAndroid}  class:border={target || hasFiller} class:bg-black={completed} class:border-secondary={hasFiller} class:bg-dark-light={!completed} use:click={() => play(media, episode)} on:contextmenu|preventDefault={() => play(media, episode, true)}>
                <div class='unreleased-overlay position-absolute top-0 left-0 right-0 h-full pointer-events-none rounded-2' class:d-none={!unreleased}/>
                {#if image}
                  <div class='d-flex episode-thumb'>
                    <SmartImage class='img-cover {!SUPPORTS.isAndroid ? `ep-card-h` : `h-165`} w-full w-sm-265' images={[image, './404_episode.png']}/>
                    {#if resolvedHash}
                      <div class='position-relative torrent-button-container'>
                        <div class='position-absolute top-0 right-0 text-danger icon-padding icon-shadow'>
                          <TorrentButton class='btn btn-square shadow-none bg-transparent bd-highlight h-40 w-40' hash={[resolvedHash]} search={{ media, episode }} size={'3rem'} strokeWidth={'2.3'}/>
                        </div>
                      </div>
                    {/if}
                    {#if dubAiring}
                      <div class='position-relative d-none sm-label'>
                        <AudioLabel {media} episodeList={true} dubbed={dubAiring?.airdate && (new Date(dubAiring.airdate).getTime() <= new Date().getTime())} subbed={(airdate && (new Date(airdate).getTime() <= new Date().getTime())) || (dubAiring?.airdate && (new Date(dubAiring.airdate).getTime() <= new Date().getTime()))} />
                      </div>
                    {/if}
                  </div>
                {/if}
                {#if hasFiller}
                  <div class='position-absolute bottom-0 right-0 bg-secondary py-5 px-10 text-dark rounded-top rounded-left font-weight-bold'>
                    {filler?.filler ? 'Filler' : 'Recap'}
                  </div>
                {/if}
                {#if !image && resolvedHash}
                  <div class='position-absolute bottom-0 right-0 mr-5 mb-5 text-danger icon-shadow torrent-button-container' class:mb-30={hasFiller}>
                    <TorrentButton class='btn btn-square shadow-none bg-transparent bd-highlight h-40 w-40' hash={[resolvedHash]} search={{ media, episode }} size={'3rem'} strokeWidth={'2.3'}/>
                  </div>
                {/if}
                <div class='h-full w-full px-20 pt-15 d-flex flex-column'>
                  <div class='w-full d-flex flex-row mb-15'>
<div class='text-white font-weight-bold font-size-16 title' title={resolvedTitle}>
  {#if resolvedTitle && !new RegExp(`(?<![\\d.])${episode}(?![\\d.])`).test(resolvedTitle) && media?.episodes !== 1}<span class='ep-num'>{episode}.</span> {/if}<span class='ep-title'>{resolvedTitle || 'Episode ' + episode}</span>
</div>
                    {#if length}
                      <span class='duration ml-auto'>{length}m</span>
                    {/if}
                  </div>
                  {#if completed}
                    <div class='progress mb-10'>
                      <div class='progress-bar w-full'/>
                    </div>
                  {:else if progress}
                    <div class='progress mb-10'>
                      <div class='progress-bar' style='width: {progress}%'/>
                    </div>
                  {/if}
                  <div class='airdate' class:mb-5={dubAiring} class:mb-10={!dubAiring}>
                    {#if dubAiring}
                      <div class='d-flex flex-row date-row'>
                        <div class='mr-5 py-5 px-10 text-dark text-nowrap rounded-top rounded-left font-weight-bold' class:lg-label={image} class:bg-danger={dubAiring.delayed} class:bg-senary={!dubAiring.delayed}>
                          Dub: {dubAiring.text}
                        </div>
                        <div class='py-5 px-10 text-dark text-nowrap rounded-top rounded-left font-weight-bold bg-septenary' class:lg-label={image} class:bg-danger={!airdate && dubAiring.delayed && !dubAiring.notPlanned}>
                          Sub:
                          {#if airdate}
                            {since(new Date(airdate))}
                          {:else if !dubAiring.notPlanned}
                            {dubAiring.text}
                          {:else if (media.status === 'RELEASING' && episode > 1 && unreleased) || (media.status === 'NOT_YET_RELEASED' && !media.startDate?.month && !media?.season)}
                            In Production
                          {:else if ((media.status === 'NOT_YET_RELEASED' || episode <= 1) && !media.startDate?.month && media?.season)}
                            {capitalize(media.season.toLowerCase()) + ' ' + (media.seasonYear || '')}
                          {:else if ((media.status === 'NOT_YET_RELEASED' || episode <= 1) && media.startDate?.month)}
                            {monthDay(new Date(media.startDate.year, media.startDate.month, media.startDate.day), true)}
                          {:else if media.status === 'FINISHED'}
                            Released
                          {:else}
                            Unknown
                          {/if}
                        </div>
                      </div>
                    {:else}
                      {#if airdate}
                        {since(new Date(airdate))}
                      {:else if (media.status === 'RELEASING' && episode > 1 && unreleased) || (media.status === 'NOT_YET_RELEASED' && !media.startDate?.month && !media?.season)}
                        In Production
                      {:else if ((media.status === 'NOT_YET_RELEASED' || episode <= 1) && !media.startDate?.month && media?.season)}
                        {capitalize(media.season.toLowerCase()) + ' ' + (media.seasonYear || '')}
                      {:else if ((media.status === 'NOT_YET_RELEASED' || episode <= 1) && media.startDate?.month)}
                        {monthDay(new Date(media.startDate.year, media.startDate.month, media.startDate.day), true)}
                      {:else if media.status === 'FINISHED'}
                        Released
                      {:else}
                        Unknown
                      {/if}
                    {/if}
                    {#if airdate && dubAiring && (new Date(airdate).getTime() > new Date().getTime())}
                      <span class='d-none' class:sm-label={image}>{since(new Date(airdate))}</span>
                    {/if}
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {/await}
      {/each}
    {/if}
  {/await}
</div>

<style>
  .episode-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 1.5rem;
    row-gap: 0.5rem;
    padding: 0.5rem;
  }

  .episode-list > :global(*) {
    width: 100%;
    margin: 0 !important;
    padding: 0 0.25rem !important;
  }

  @media (max-width: 768px) {
    .episode-list {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }
  }

  /* Card surface: match the panels used in DetailsModal/EpisodeFocusArea
     (--card-bg2 surface, --card-line border, 12px radius) instead of the
     plain bg-dark-light/bg-black flat rectangles. */
  :global(.episode-card) {
    background: var(--card-bg2) !important;
    border: 1px solid var(--card-line) !important;
    border-radius: 12px !important;
    transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }
  :global(.episode-card.pointer:hover) {
    border-color: var(--card-accent) !important;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
  }
  :global(.episode-card.unreleased) {
    border-style: dashed;
  }

  /* Gradient scrim behind the thumbnail so the image blends into the card
     instead of cutting off sharply. --episode-card-gradient is already
     defined in themes.css for exactly this purpose. */
  .episode-thumb {
    position: relative;
  }
  .episode-thumb::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: var(--episode-card-gradient);
  }
  @media (max-width: 768px) {
    .episode-thumb::after {
      background: var(--episode-preview-card-gradient);
    }
  }

  /* Progress bar: use the shared accent instead of a default browser blue,
     so "in progress" matches the accent color used on Continue Now etc. */
  :global(.episode-card .progress) {
    background: var(--card-line);
    border-radius: 50px;
    overflow: hidden;
    height: 2px;
  }
  :global(.episode-card .progress-bar) {
    background: var(--card-accent);
    height: 100%;
    border-radius: 50px;
  }

  :global(.episode-card .title) {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
  }
  :global(.episode-card .ep-num) {
    flex-shrink: 0;
    color: var(--card-accent);
    font-size: 1.5rem;
    font-weight: 700;
  }
  :global(.episode-card .ep-title) {
    letter-spacing: 0.02em;
    line-height: 1.4;
  }
  :global(.episode-card .duration) {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--card-accent);
    flex-shrink: 0;
  }
  :global(.episode-card .airdate) {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--card-dim);
    letter-spacing: 0.01em;
  }
  :global(.episode-card .date-row) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ep-card-h {
    height: 115px;
  }
</style>