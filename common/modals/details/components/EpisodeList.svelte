<script context='module'>
  import { SUPPORTS } from '@/modules/support.js'
  import { createListener } from '@/modules/util.js'

  const { reactive, init } = createListener(['torrent-button'])
  init(true)
</script>

<script>
  import { loadedTorrent, completedTorrents, seedingTorrents, stagingTorrents } from '@/modules/torrent.js'
  import { since, monthDay, matchPhrase, capitalize } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import { onMount, onDestroy } from 'svelte'
  import { liveAnimeProgress } from '@/modules/anime/animeprogress.js'
  import { getHash } from '@/modules/anime/animehash.js'
  import { getEpisodes } from '@/modules/anime/episodedata.js'
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
    episodeList = await getEpisodes(media, episodeCount)
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
                <div class='d-flex episode-thumb' class:thumb-empty={!image}>
                  {#if image}
                    <SmartImage class='img-cover {!SUPPORTS.isAndroid ? `ep-card-h` : `h-165`} w-full w-sm-265' images={[image, './404_episode.png']}/>
                  {:else}
                    <div class='ep-placeholder {!SUPPORTS.isAndroid ? `ep-card-h` : `h-165`} w-full w-sm-265'></div>
                  {/if}
                  {#if length}
                    <span class='duration position-absolute bottom-0 left-0 m-5 py-2 px-6 bg-black-50 rounded-1'>{length}m</span>
                  {/if}
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
                  <div class='w-full d-flex flex-column mb-15'>
                    {#if media?.episodes !== 1}
                      <div class='text-accent font-weight-bold font-size-14 ep-num mb-2'>
                        EP {episode}
                      </div>
                    {/if}
                    <div class='d-flex flex-row w-full align-items-center'>
                      <div class='text-white font-weight-bold font-size-16 title' title={resolvedTitle}>
                        <span class='ep-title'>{resolvedTitle || 'Episode ' + episode}</span>
                      </div>
                    </div>
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
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  :global(.episode-card .ep-title) {
    letter-spacing: 0.02em;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  :global(.episode-card .duration) {
    font-size: 0.85rem;
    font-weight: 700;
    color: white;
    /* color: var(--card-accent); */
    flex-shrink: 0;
    z-index: 2;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid var(--card-line);
    padding: 0.125rem 0.375rem;
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