<script>
  import { onDestroy } from 'svelte'
  import { formatMap, genreIcons, getEpisodeMetadataForMedia, getKitsuMappings, getMediaMaxEp, playMedia } from '@/modules/anime/anime.js'
  import { playAnime } from '@/modals/torrent/TorrentModal.svelte'
  import { copyToClipboard } from '@/modules/clipboard.js'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { add } from '@/modules/torrent.js'
  import { anilistClient } from '@/modules/anilist.js'
  import { isValidNumber } from '@/modules/util.js'
  import { click } from '@/modules/click.js'
  import Details from '@/modals/details/components/Details.svelte'
  import EpisodeList from '@/modals/details/components/EpisodeList.svelte'
  import ToggleList from '@/modals/details/components/ToggleList.svelte'
  import Scoring from '@/components/Scoring.svelte'
  import TrailerModal from '@/modals/TrailerModal.svelte'
  import SmartImage from '@/components/visual/SmartImage.svelte'
  import AudioLabel from '@/components/AudioLabel.svelte'
  import Following from '@/modals/details/components/Following.svelte'
  import { IPC } from '@/modules/bridge.js'
  import SmallCard from '@/components/cards/SmallCard.svelte'
  import SmallCardSk from '@/components/skeletons/SmallCardSk.svelte'
  import Helper from '@/modules/helper.js'
  import { modal } from '@/modules/navigation.js'
  import DOMPurify from 'dompurify'
  import { marked } from 'marked'
  import { ExternalLink } from 'lucide-svelte'
  import { Clapperboard, Users, Heart, Play, Timer, TrendingUp, Tv, Hash, ArrowDown01, ArrowUp10 } from 'lucide-svelte'

  $: view = $modal[modal.ANIME_DETAILS]?.data
  function close () {
    modal.close(modal.ANIME_DETAILS)
  }

  let _modal
  let container = null
  let scrollTags = null
  let scrollGenres = null
  let staticMedia
  $: media = mediaCache.value[view?.id] || view
  $: {
    if (media && (!staticMedia || staticMedia?.id !== media?.id)) staticMedia = media
    else if (!media && staticMedia) staticMedia = null
  }
  mediaCache.subscribe((value) => { if (value && (JSON.stringify(value[media?.id]) !== JSON.stringify(media))) media = value[media?.id] })
  $: episodeOrder = !!staticMedia
  $: watched = media?.mediaListEntry?.status === 'COMPLETED'
  $: userProgress =  ['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media?.mediaListEntry?.status) && media?.mediaListEntry?.progress
  $: missingIds = staticMedia && []
  $: recommendations = staticMedia && anilistClient.recommendations({ id: staticMedia.id })
  $: searchIDS = staticMedia && (async () => {
    const searchIDS = [...(staticMedia.relations?.edges?.filter(({ node }) => node.type === 'ANIME').map(({ node }) => node.id) || []), ...((await recommendations)?.data?.Media?.recommendations?.edges?.map(({ node }) => node.mediaRecommendation?.id) || [])]
    if (searchIDS.length === 0) {
      missingIds = searchIDS.filter(id => !mediaCache.value[id])
      return Promise.resolve([])
    }
    const result = await anilistClient.searchAllIDS({ page: 1, perPage: 50, id: searchIDS })
    missingIds = searchIDS.filter(id => !mediaCache.value[id])
    return Promise.resolve({
      ...result,
      data: {
        ...result.data,
        Page: {
          ...result.data.Page,
          media: (result?.data?.Page?.media || []).filter(media => mediaCache.value[media.id])
        }
      }
    })
  })()
  $: staticMedia && (_modal?.focus(), (container && container.scrollTo({top: 0, behavior: 'smooth'})))
  $: staticMedia && (modal.length === 1 && $modal[modal.ANIME_DETAILS] && _modal?.focus())
  $: {
    if (staticMedia) {
      if (scrollTags) scrollTags.scrollLeft = 0
      if (scrollGenres) scrollGenres.scrollLeft = 0
    }
  }
  function checkClose ({ keyCode }) {
    if (keyCode === 27) close()
  }
  function play (media, episode, force = false) {
    if (!media) return
    if (isValidNumber(episode)) return playAnime(media, episode, force)
    if (media.status === 'NOT_YET_RELEASED') return
    playMedia(media)
  }
  function getPlayButtonText (media) {
    if (media?.mediaListEntry) {
      const { status, progress } = media.mediaListEntry
      if (progress) {
        if (status === 'COMPLETED') {
          return 'Rewatch Now'
        } else {
          return 'Continue Now'
        }
      }
    }
    return 'Watch Now'
  }
  $: playButtonText = getPlayButtonText(media)
  function toggleFavourite () {
    media.isFavourite = anilistClient.favourite({ id: media.id })
  }

  function handlePlay(id, episode, torrentOnly) {
    const cachedMedia = mediaCache.value[id]
    if (!cachedMedia) return
    const cachedEpisode = isValidNumber(episode) ? episode : cachedMedia?.mediaListEntry?.progress
    const desiredEpisode = (isValidNumber(episode) ? episode : cachedEpisode && cachedEpisode !== 0 ? cachedEpisode + 1 : cachedEpisode)
    if (torrentOnly) {
      if (desiredEpisode) return playAnime(cachedMedia, desiredEpisode)
      if (cachedMedia?.status === 'NOT_YET_RELEASED') return
      playMedia(cachedMedia)
    } else play(cachedMedia, desiredEpisode)
  }

  IPC.on('play-anime', (id, episode, torrentOnly) => {
    handlePlay(id, episode, torrentOnly)
  })

  window.addEventListener('play-anime', (event) => {
    const { id, episode, torrentOnly } = event.detail
    handlePlay(id, episode, torrentOnly)
  })

  window.addEventListener('play-torrent', (event) => add(event.detail.magnet, null, null, null, event.detail.base64))

  IPC.on('play-torrent', (detail) => add(detail.magnet, null, null, null, detail.base64))

  function sanitize(body) {
    if (!body) return ''
    const cleanBody = body.trim()
      .replace(/\.\.+(?=\s*$)/gm, '.') // Remove excessive trailing "..."
      .replace(/\n/g, '<br>')  // Convert all \n to <br>
      .replace(/(<br\s*\/?>){2,}/gi, '<br><br>') // Then collapse 2+ <br> to exactly 2
      .replace(/^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi, '') // Remove any prepended or appended <br>.
    marked.setOptions({
      pedantic: false,
      breaks: true,
      gfm: true
    })
    return DOMPurify.sanitize(marked.parse(cleanBody).trim(), {
      ALLOWED_TAGS: [
        'p', 'br', 'span', 'div',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'mark',
        'ul', 'ol', 'li',
        'blockquote',
        'code', 'pre',
        'a',
        'img',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'hr',
        'details', 'summary',
        'input'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'title',
        'src', 'alt', 'width', 'height',
        'class', 'id',
        'align',
        'type', 'checked', 'disabled'
      ]
    })
  }

  let episodeList = []
  let episodeLoad
  $: if (episodeLoad) {
    episodeLoad.then(episodes => {
      episodeList = episodes
    })
  }

  let showExternalLinks = false
  let showAnimeThemes = false

  function closeOnClickOutside(node, onClose) {
    function handle(e) { if (!node.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle, true)
    return { destroy() { document.removeEventListener('mousedown', handle, true) } }
  }

  let resizeObserver
  let leftColumn, rightColumn
  function syncHeights() {
    if (leftColumn && rightColumn) {
      const leftHeight = leftColumn.offsetHeight
      if (rightColumn.style.height !== `${leftHeight}px`) {
        rightColumn.style.height = `${leftHeight}px`
      }
    }
  }

  $: {
    resizeObserver?.disconnect()
    if (staticMedia) {
      resizeObserver = new ResizeObserver(syncHeights)
      if (leftColumn) resizeObserver.observe(leftColumn)
    }
  }

  onDestroy(() => resizeObserver?.disconnect())
</script>

<div class='modal modal-full z-50' class:show={staticMedia} on:keydown={checkClose} tabindex='-1' role='button' bind:this={_modal}>
  <div class='h-full modal-content bg-dark p-0 overflow-y-auto position-relative' bind:this={container}>
    {#if staticMedia}
      <button class='close pointer z-30 bg-dark-light top-20 right-0 position-fixed' type='button' use:click={() => close()}> &times; </button>
      <SmartImage class='w-full cover-img anime-details position-absolute' images={[
        staticMedia.bannerImage,
        ...(staticMedia.trailer?.id ? [
          `https://i.ytimg.com/vi/${staticMedia.trailer.id}/maxresdefault.jpg`,
          `https://i.ytimg.com/vi/${staticMedia.trailer.id}/hqdefault.jpg`] : []),
        () => getKitsuMappings(staticMedia).then(metadata =>
          [metadata?.included?.[0]?.attributes?.coverImage?.original,
          metadata?.included?.[0]?.attributes?.coverImage?.large,
          metadata?.included?.[0]?.attributes?.coverImage?.small,
          metadata?.included?.[0]?.attributes?.coverImage?.tiny]),
        () => getEpisodeMetadataForMedia(staticMedia).then(metadata => metadata?.[1]?.image)]}/>
      <div class='row px-20'>
        <div class='col-lg-7 col-12 pb-10'>
          <div bind:this={leftColumn}>
            <div class='d-flex flex-sm-row flex-column align-items-sm-end pb-20 mb-15'>
              <div class='cover d-flex flex-row align-items-sm-end align-items-center justify-content-center mw-full mb-sm-0 mb-20 w-full' style='max-height: 50vh;'>
                <div class='position-relative h-full'>
                  <SmartImage class='rounded cover-img overflow-hidden h-full w-full' color={media.coverImage.color || 'var(--tertiary-color)'} images={[staticMedia.coverImage?.extraLarge, staticMedia.coverImage?.medium, './404_cover.png']}/>
                  <AudioLabel media={staticMedia} viewAnime={true} />
                </div>
              </div>
              <div class='pl-sm-20 ml-sm-20'>
                <h1 class='font-weight-very-bold text-white select-all mb-0 font-scale-40'>{anilistClient.title(staticMedia)}</h1>
                <div class='d-flex flex-row font-size-18 flex-wrap mt-5'>
                  {#if staticMedia.averageScore}
                    <div class='d-flex flex-row mt-10' title='{staticMedia.averageScore / 10} by {anilistClient.reviews(staticMedia)} reviews'>
                      <TrendingUp class='mx-10' size='2.2rem' />
                      <span class='mr-20'>
                        Rating: {staticMedia.averageScore + '%'}
                      </span>
                    </div>
                  {/if}
                  {#if staticMedia.format}
                    <div class='d-flex flex-row mt-10'>
                      <Tv class='mx-10' size='2.2rem' />
                      <span class='mr-20 text-capitalize'>
                        Format: {formatMap[staticMedia.format]}
                      </span>
                    </div>
                  {/if}
                  {#if staticMedia.episodes !== 1}
                    {@const maxEp = getMediaMaxEp(staticMedia)}
                    <div class='d-flex flex-row mt-10'>
                      <Clapperboard class='mx-10' size='2.2rem' />
                      <span class='mr-20'>
                      Episodes: {maxEp && maxEp !== 0 ? maxEp : '?'}
                      </span>
                    </div>
                  {:else if staticMedia.duration}
                    <div class='d-flex flex-row mt-10'>
                      <Timer class='mx-10' size='2.2rem' />
                      <span class='mr-20'>
                        Length: {staticMedia.duration + ' min'}
                      </span>
                    </div>
                  {/if}
                  {#if staticMedia.averageScore && staticMedia.stats?.scoreDistribution}
                    <div class='d-flex flex-row mt-10'>
                      <Users class='mx-10' size='2.2rem' />
                      <span class='mr-20' title='{staticMedia.averageScore / 10} by {anilistClient.reviews(staticMedia)} reviews'>
                        Reviews: {anilistClient.reviews(staticMedia)}
                      </span>
                    </div>
                  {/if}
                </div>
<div class='d-flex flex-row flex-wrap play'>
  <button class='btn btn-lg btn-secondary w-250 text-dark font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center mr-20 mt-20'
          use:click={() => play(media)}
          disabled={staticMedia.status === 'NOT_YET_RELEASED'}>
    <Play class='mr-10' fill='currentColor' size='1.6rem' />
    {playButtonText}
  </button>

  <div class='mt-20 d-flex align-items-center'>
    {#if Helper.isAuthorized()}
      <Scoring class='mr-10' {media} viewAnime={true} />
    {/if}

    {#if Helper.isAniAuth()}
      <button class='btn bg-dark-light btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0 mr-10' data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title={media.isFavourite ? 'Unfavourite' : 'Favourite'} use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
        <div class='favourite d-flex align-items-center justify-content-center' title={media.isFavourite ? 'Unfavourite' : 'Favourite'}>
          <Heart color={media.isFavourite ? 'var(--tertiary-color)' : 'currentColor'} fill={media.isFavourite ? 'var(--tertiary-color)' : 'transparent'} size='1.7rem' />
        </div>
      </button>
    {/if}

    <TrailerModal {staticMedia} />

    {#if staticMedia.externalLinks?.filter(l => !l.isDisabled).length}
      {@const activeLinks = staticMedia.externalLinks.filter(l => !l.isDisabled)}
      {@const officialLinks = activeLinks.filter(l => l.type === 'OFFICIAL')}
      {@const streamingLinks = activeLinks.filter(l => l.type === 'STREAMING')}
      {@const infoLinks = activeLinks.filter(l => l.type === 'INFO')}
      {@const socialLinks = activeLinks.filter(l => l.type === 'SOCIAL')}
      {@const otherLinks = activeLinks.filter(l => !['OFFICIAL','STREAMING','INFO','SOCIAL'].includes(l.type))}
      <div class='position-relative mr-10' use:closeOnClickOutside={() => showExternalLinks = false}>
        <button class='btn bg-dark-light btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0' data-toggle='tooltip' data-title='External Links' use:click={() => showExternalLinks = !showExternalLinks}>
          <ExternalLink size='1.5rem' />
        </button>
        {#if showExternalLinks}
          <div class='ext-dropdown position-absolute'>
            {#if officialLinks.length}
              <div class='ext-group-label'>Official</div>
              {#each officialLinks as link}
                <button class='ext-item ext-item-official d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.2rem' class='ext-icon-svg ext-icon-svg-official' />{/if}
                  <span class='ext-site'>{link.site || 'Official Website'}</span>
                </button>
              {/each}
            {/if}
            {#if streamingLinks.length}
              <div class='ext-group-label'>Streaming</div>
              {#each streamingLinks as link}
                <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.2rem' class='ext-icon-svg' />{/if}
                  <span class='ext-site'>{link.site}</span>
                  {#if link.language}<span class='ext-lang'>{link.language}</span>{/if}
                </button>
              {/each}
            {/if}
            {#if infoLinks.length}
              <div class='ext-group-label'>Info</div>
              {#each infoLinks as link}
                <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.2rem' class='ext-icon-svg' />{/if}
                  <span class='ext-site'>{link.site}</span>
                </button>
              {/each}
            {/if}
            {#if socialLinks.length}
              <div class='ext-group-label'>Social</div>
              {#each socialLinks as link}
                <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.2rem' class='ext-icon-svg' />{/if}
                  <span class='ext-site'>{link.site}</span>
                </button>
              {/each}
            {/if}
            {#each otherLinks as link}
              <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.2rem' class='ext-icon-svg' />{/if}
                <span class='ext-site'>{link.site}</span>
                {#if link.language}<span class='ext-lang'>{link.language}</span>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <button class='btn bg-dark-light btn-lg btn-square d-none align-items-center justify-content-center shadow-none border-0 mr-10' class:d-flex={staticMedia.id} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='Share to Clipboard' use:click={() => copyToClipboard(`https://anilist.co/anime/${staticMedia.id}`, 'share URL')} on:contextmenu|preventDefault={() => IPC.emit('open', `https://anilist.co/anime/${staticMedia.id}`)}>
      <img class='rounded w-20' src='./anilist_icon.png' alt='Anilist'>
    </button>
    <button class='btn bg-dark-light btn-lg btn-square d-none align-items-center justify-content-center shadow-none border-0' class:d-flex={staticMedia.idMal} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='Share to Clipboard' use:click={() => copyToClipboard(`https://myanimelist.net/anime/${staticMedia.idMal}`, 'share URL')} on:contextmenu|preventDefault={() => IPC.emit('open', `https://myanimelist.net/anime/${staticMedia.idMal}`)}>
      <img class='rounded w-20' src='./myanimelist_icon.png' alt='MyAnimeList'>
    </button>
  </div>
</div>
                <Following media={staticMedia} />
              </div>
            </div>
            <Details media={staticMedia} alt={recommendations} />
            <div bind:this={scrollTags} class='m-0 px-20 pb-0 pt-10 d-flex flex-row text-nowrap overflow-x-scroll text-capitalize align-items-start'>
              {#each staticMedia.tags as tag}
                <div class='bg-dark-light px-20 py-10 mr-10 rounded text-nowrap d-flex align-items-center'>
                  <Hash class='mr-5' size='1.8rem' /><span class='font-weight-bolder select-all'>{tag.name}</span><span class='font-weight-light'>: {tag.rank}%</span>
                </div>
              {/each}
            </div>
            <div bind:this={scrollGenres} class='m-0 px-20 pb-0 pt-10 d-flex flex-row text-nowrap overflow-x-scroll text-capitalize align-items-start'>
              {#each staticMedia.genres as genre}
                <div class='bg-dark-light px-20 py-10 mr-10 rounded text-nowrap d-flex align-items-center select-all'><svelte:component this={genreIcons[genre]} class='mr-5' size='1.8rem' /> {genre}</div>
              {/each}
            </div>
            {#if staticMedia.description}
              <div class='w-full d-flex flex-row align-items-center pt-20 mt-10'>
                <hr class='w-full' />
                <div class='font-size-18 font-weight-semi-bold px-20 text-white'>Synopsis</div>
                <hr class='w-full' />
              </div>
              <div class='font-size-16 pt-20 select-all'>
                {@html sanitize(staticMedia.description)}
              </div>
            {/if}
            {#if episodeList?.length}
              <div class='w-full d-flex d-lg-none flex-row align-items-center pt-20 mt-10 pointer' aria-hidden='true' use:click={() => { episodeOrder = !episodeOrder }}>
                <hr class='w-full' />
                <div class='position-absolute font-size-18 font-weight-semi-bold px-20 text-white' style='left: 50%; transform: translateX(-50%);'>Episodes</div>
                <hr class='w-full' />
                <div class='ml-auto pl-20 font-size-12 more text-muted text-nowrap pr-20' use:click={() => { episodeOrder = !episodeOrder }}>Reverse</div>
              </div>
            {/if}
            <div class='col-lg-5 col-12 d-lg-none flex-column mt-20'>
              <EpisodeList bind:episodeList={episodeList} mobileList={true} media={staticMedia} {episodeOrder} bind:userProgress bind:watched episodeCount={getMediaMaxEp(media)} {play} class='h-600' />
            </div>
            <div class='d-lg-block'>
              <ToggleList list={ staticMedia.relations?.edges?.filter(({ node, relationType }) => relationType !== 'CHARACTER' && node.type === 'ANIME' && node.format !== 'MUSIC' && !(settings.value.adult === 'none' && node.isAdult) && !(settings.value.adult !== 'hentai' && node.genres?.includes('Hentai')) && !missingIds.includes(node.id)).sort((a, b) => (a.node.seasonYear || Infinity) - (b.node.seasonYear || Infinity)) } promise={searchIDS} let:item let:promise title='Relations'>
                {#await promise}
                  <div class='small-card'>
                    <SmallCardSk />
                  </div>
                {:then res}
                  {#if res}
                    <div class='small-card'>
                      <SmallCard data={item.node} type={item.relationType.replace(/_/g, ' ').toLowerCase()} />
                    </div>
                  {/if}
                {/await}
              </ToggleList>
              {#await recommendations then res}
                {@const media = res?.data?.Media}
                {#if media}
                  <ToggleList list={ media.recommendations?.edges?.filter(({ node }) => node.mediaRecommendation && !(settings.value.adult === 'none' && node.mediaRecommendation.isAdult) && !(settings.value.adult !== 'hentai' && node.mediaRecommendation.genres?.includes('Hentai')) && !missingIds.includes(node.mediaRecommendation.id)).sort((a, b) => b.node.rating - a.node.rating) } promise={searchIDS} let:item let:promise title='Recommendations'>
                    {#await promise}
                      <div class='small-card'>
                        <SmallCardSk />
                      </div>
                    {:then res}
                      {#if res}
                        <div class='small-card'>
                          <SmallCard data={item.node.mediaRecommendation} type={item.node.rating} />
                        </div>
                      {/if}
                    {/await}
                  </ToggleList>
                {/if}
              {/await}
            </div>
          </div>
        </div>
        <div class='col-lg-5 col-12 d-none d-lg-flex flex-column pl-lg-20' bind:this={rightColumn}>
          <button class='close order pointer z-30 bg-dark-light position-absolute' class:d-none={!episodeList?.length} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='Reverse Episodes' use:click={()=> {episodeOrder = !episodeOrder}}>
            <svelte:component this={episodeOrder ? ArrowDown01 : ArrowUp10} size='2rem' />
          </button>
          <EpisodeList bind:episodeLoad={episodeLoad} media={staticMedia} {episodeOrder} bind:userProgress bind:watched episodeCount={getMediaMaxEp(media)} {play} />
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  

  /* ── Modal shell ─────────────────────────────── */
  :global(.modal-full .modal-content) {
    background: var(--card-bg) !important;
    font-family: var(--font-mono);
    color: var(--card-fg);
  }

  /* ── Close button ────────────────────────────── */
  .close {
    top: 5rem !important;
    left: unset !important;
    right: 3rem !important;
    background: rgba(13,13,16,0.75) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-dim) !important;
    border-radius: 3px !important;
    font-family: var(--font-mono) !important;
    font-size: 2rem !important;
    line-height: 1 !important;
    backdrop-filter: blur(8px);
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .close:hover {
    background: var(--card-faint) !important;
    border-color: rgba(255,255,255,0.22) !important;
    color: var(--card-fg) !important;
  }

  /* ── Episode order toggle button ─────────────── */
  .order {
    top: 7rem !important;
    left: -5rem !important;
    background: rgba(13,13,16,0.75) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-dim) !important;
    border-radius: 3px !important;
    backdrop-filter: blur(8px);
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .order:hover {
    background: var(--card-accent-dim) !important;
    border-color: var(--card-accent) !important;
    color: var(--card-accent) !important;
  }

  /* ── Layout ──────────────────────────────────── */
  .row {
    padding-top: 12rem !important;
  }
  @media (min-width: 769px) {
    .row { padding: 0 10rem; }
  }

  .cover {
    aspect-ratio: 7/10;
  }
  @media (min-width: 577px) {
    .cover { max-width: 35% !important; }
    .play  { justify-content: left; }
  }

  .play { justify-content: center; }

  /* ── Anime title ─────────────────────────────── */
  :global(.font-scale-40) {
    font-family: var(--font-display) !important;
    font-size: clamp(2.4rem, 4vw, 4rem) !important;
    font-weight: 800 !important;
    letter-spacing: -0.03em !important;
    color: var(--card-fg) !important;
    line-height: 1.1 !important;
  }

  /* ── Meta stat row (rating, format, episodes…) ── */
  :global(.font-size-18) {
    font-family: var(--font-mono) !important;
    font-size: 1.15rem !important;
    color: var(--card-dim) !important;
    letter-spacing: 0.04em;
  }
  /* Icon tint in stat row */
  :global(.font-size-18 svg) {
    color: var(--card-accent) !important;
    filter: drop-shadow(0 0 6px rgba(212,245,94,0.35));
  }

  /* ── Primary watch button ────────────────────── */
  :global(.btn-secondary) {
    font-family: var(--font-mono) !important;
    font-size: 1.15rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    background: var(--card-accent) !important;
    color: var(--card-bg) !important;
    border: none !important;
    border-radius: 3px !important;
    box-shadow: none !important;
    transition: opacity 0.12s;
  }
  :global(.btn-secondary:hover:not(:disabled)) { opacity: 0.85; }
  :global(.btn-secondary:disabled)             { opacity: 0.3; cursor: not-allowed; }

  /* ── Square icon buttons (fav, trailer, share…) ─ */
  :global(.btn.bg-dark-light) {
    font-family: var(--font-mono) !important;
    background: rgba(13,13,16,0.65) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-dim) !important;
    border-radius: 3px !important;
    box-shadow: none !important;
    backdrop-filter: blur(6px);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  :global(.btn.bg-dark-light:hover) {
    background: var(--card-faint) !important;
    border-color: rgba(255,255,255,0.22) !important;
    color: var(--card-fg) !important;
  }

  /* ── Tags strip ──────────────────────────────── */
  :global(.px-20.py-10.mr-10.rounded.text-nowrap) {
    font-family: var(--font-mono) !important;
    background: var(--card-faint) !important;
    border: 1px solid var(--card-line) !important;
    border-radius: 3px !important;
    font-size: 1.05rem !important;
    color: var(--card-dim) !important;
    transition: background 0.1s;
  }
  :global(.px-20.py-10.mr-10.rounded.text-nowrap:hover) {
    background: rgba(237,237,234,0.09) !important;
  }
  /* Tag rank % dimmer */
  :global(.font-weight-light) {
    color: rgba(237,237,234,0.28) !important;
  }
  /* Tag / genre icons — accent with subtle glow */
  :global(.px-20.py-10.mr-10.rounded svg) {
    color: var(--card-accent) !important;
    filter: drop-shadow(0 0 4px var(--card-acc-dim));
  }

  /* ── Synopsis section header ─────────────────── */
  :global(.font-weight-semi-bold) {
    font-family: var(--font-mono) !important;
    font-size: 1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.22em !important;
    text-transform: uppercase !important;
    color: var(--card-dim) !important;
    white-space: nowrap;
    background: var(--card-bg);
    padding: 0 1.4rem !important;
  }

  /* ── Dividers ────────────────────────────────── */
  hr {
    border-color: var(--card-line) !important;
    opacity: 1;
  }

  /* ── Synopsis body text ──────────────────────── */
  :global(.font-size-16) {
    font-family: var(--font-mono) !important;
    font-size: 1.15rem !important;
    font-weight: 300 !important;
    color: rgba(237,237,234,0.45) !important;
    line-height: 1.75 !important;
  }
  /* rendered markdown links in synopsis */
  :global(.font-size-16 a) {
    color: var(--card-accent) !important;
    text-decoration: none;
  }
  :global(.font-size-16 a:hover) { text-decoration: underline; }

  /* ── Episode section reverse label ──────────── */
  :global(.more.text-muted) {
    font-family: var(--font-mono) !important;
    font-size: 0.9rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.14em !important;
    text-transform: uppercase !important;
    color: rgba(212,245,94,0.55) !important;
    transition: color 0.1s;
  }
  :global(.more.text-muted:hover) { color: var(--card-accent) !important; }

  /* ── Banner fade overlay ─────────────────────── */
  :global(.anime-details) {
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%);
  }
  /* ── External links dropdown ─────────────────── */
.ext-dropdown {
  position: absolute;
  bottom: calc(100% + 0.8rem);
  right: 0;
  min-width: 20rem;
  max-width: 28rem;
  background: #111116;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 5px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6);
  backdrop-filter: blur(14px);
  z-index: 200;
  padding: 0.5rem 0;
}
.ext-group-label {
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.70rem;
  font-weight: 600;
  letter-spacing: 0.20em;
  text-transform: uppercase;
  color: rgba(237,237,234,0.25);
  padding: 0.65rem 1.1rem 0.25rem;
}
.ext-item {
  display: flex;
  width: 100%;
  background: transparent;
  border: none;
  color: rgba(237,237,234,0.65);
  font-family: 'IBM Plex Mono', monospace;
  font-size: 0.98rem;
  padding: 0.6rem 1.1rem;
  text-align: left;
  cursor: pointer;
  gap: 0.8rem;
  align-items: center;
  transition: background .1s, color .1s;
}
.ext-item:hover { background: rgba(237,237,234,0.07); color: #ededea; }
.ext-item-official { color: #d4f55e; }
.ext-item-official:hover { background: rgba(212,245,94,0.09) !important; }
.ext-icon { width: 1.4rem; height: 1.4rem; object-fit: contain; border-radius: 3px; flex-shrink: 0; }
:global(.ext-icon-svg) { flex-shrink: 0; color: rgba(237,237,234,0.3); }
:global(.ext-icon-svg-official) { color: #d4f55e !important; }
.ext-site { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ext-lang { font-size: 0.73rem; color: rgba(237,237,234,0.25); text-transform: uppercase; letter-spacing: 0.08em; flex-shrink: 0; }
</style>