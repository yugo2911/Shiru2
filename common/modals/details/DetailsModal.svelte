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
  import { Heart, Play, ArrowDown01, ArrowUp10, ExternalLink, Music, X } from 'lucide-svelte'
  import { getAnimeThemes, getBestVideo, formatThemeLabel } from '@/modules/animethemes.js'
  import SoftModal from '@/components/modals/SoftModal.svelte'

  $: view = $modal[modal.ANIME_DETAILS]?.data
  function close () {
    modal.close(modal.ANIME_DETAILS)
  }

  let _modal
  let container = null
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
      // reset handled by key block on staticMedia.id
    }
  }
  function checkClose ({ keyCode }) {
    if (keyCode === 27) close()
  }

  function closeOnClickOutside(node, onClose) {
    function handle(e) {
      if (!node.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handle, true)
    return { destroy() { document.removeEventListener('mousedown', handle, true) } }
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
  let showExternalLinks = false
  let showAnimeThemes = false
  let animeThemesData = null
  let animeThemesLoading = false
  let prevMediaId = null
  $: if (staticMedia?.id && staticMedia.id !== prevMediaId) {
    prevMediaId = staticMedia.id
    animeThemesData = null
    showAnimeThemes = false
  }
  $: if (episodeLoad) {
    episodeLoad.then(episodes => {
      episodeList = episodes
    })
  }

  async function loadAnimeThemes() {
    if (animeThemesData || animeThemesLoading) return
    animeThemesLoading = true
    const anilistId = staticMedia?.id
    if (anilistId) {
      animeThemesData = await getAnimeThemes(anilistId)
    }
    animeThemesLoading = false
  }

  let activeTheme = null
  let activeVideo = null
  let themeLoading = true

  function playThemeVideo(video, theme) {
    if (!video?.link) return
    activeVideo = video
    activeTheme = theme
    themeLoading = true
    modal.toggle(modal.ANIME_THEME)
    showAnimeThemes = false
  }
  function closeThemePlayer() { modal.close(modal.ANIME_THEME) }

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
                <div class='anime-meta-label'>
                  {#if staticMedia.seasonYear}{staticMedia.seasonYear}{/if}{#if staticMedia.season && staticMedia.seasonYear} · {/if}{#if staticMedia.season}<span class='text-capitalize'>{staticMedia.season.toLowerCase()}</span>{/if}{#if staticMedia.format} · {formatMap[staticMedia.format]}{/if}
                </div>
                <h1 class='anime-title select-all'>{anilistClient.title(staticMedia)}</h1>
                <div class='anime-stats'>
                  {#if staticMedia.averageScore}
                    <span class='anime-stat-score'>{staticMedia.averageScore}%</span>
                    <span class='anime-stat-sep'>·</span>
                  {/if}
                  {#if staticMedia.episodes !== 1}
                    {@const maxEp = getMediaMaxEp(staticMedia)}
                    <span>{maxEp && maxEp !== 0 ? maxEp : '?'} episodes</span>
                    <span class='anime-stat-sep'>·</span>
                  {:else if staticMedia.duration}
                    <span>{staticMedia.duration} min</span>
                    <span class='anime-stat-sep'>·</span>
                  {/if}
                  {#if staticMedia.averageScore && staticMedia.stats?.scoreDistribution}
                    <span title='{anilistClient.reviews(staticMedia)} user reviews'>{anilistClient.reviews(staticMedia)} reviews</span>
                  {/if}
                </div>
                <div class='d-flex flex-row flex-wrap play'>
                  <button class='btn btn-lg btn-secondary w-250 text-dark font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center mr-20 mt-20'
                          use:click={() => play(media)}
                          disabled={staticMedia.status === 'NOT_YET_RELEASED'}>
                    <Play class='mr-10' fill='currentColor' size='1.6rem' />
                    {playButtonText}
                  </button>
                  <div class='mt-20 d-flex'>
                    {#if Helper.isAuthorized()}
                      <Scoring class='mr-10 '{media} viewAnime={true} />
                    {/if}
                    {#if Helper.isAniAuth()}
                      <button class='btn bg-dark-light btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0 mr-10' data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title={media.isFavourite ? 'Unfavourite' : 'Favourite'} use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
                        <div class='favourite d-flex align-items-center justify-content-center' title={media.isFavourite ? 'Unfavourite' : 'Favourite'}>
                          <Heart color={media.isFavourite ? 'var(--tertiary-color)' : 'currentColor'} fill={media.isFavourite ? 'var(--tertiary-color)' : 'transparent'} size='1.7rem' />
                        </div>
                      </button>
                    {/if}
                    <TrailerModal {staticMedia} />
                    <SoftModal class='pointer-events-none w-full scrollbar-none align-items-center mb-30' css={`top-0 left-0 position-fixed`} bind:showModal={$modal[modal.ANIME_THEME]} shouldRender={true} close={closeThemePlayer} id={modal.ANIME_THEME}>
                      {#if activeTheme && activeVideo}
                        <div class='pointer-events-auto player-shell wm-calc'>
                          <div class='player-header'>
                            <span class='player-badge'>{formatThemeLabel(activeTheme)}</span>
                            <span class='player-title'>
                              {#if activeTheme.song?.title}{activeTheme.song.title}{/if}{#if activeTheme.song?.artists?.[0]?.name} · {activeTheme.song.artists[0].name}{/if}
                            </span>
                            <button type='button' class='btn btn-square bg-transparent shadow-none border-0 d-flex align-items-center justify-content-center ml-auto mr-5' use:click={closeThemePlayer}><X size='1.7rem' strokeWidth='3'/></button>
                          </div>
                          <div class='player-body'>
                            {#if $modal[modal.ANIME_THEME]}
                              {#key activeVideo.link}
                                <SmartImage class='player-thumb' images={[staticMedia.bannerImage, staticMedia.coverImage?.extraLarge]} hidden={!themeLoading}/>
                                <video
                                  class='player-video'
                                  class:d-none={themeLoading}
                                  src={activeVideo.link}
                                  autoplay
                                  controls
                                  on:canplay={() => { themeLoading = false }}
                                />
                              {/key}
                            {/if}
                          </div>
                        </div>
                      {/if}
                    </SoftModal>
                    <div class='position-relative' use:closeOnClickOutside={() => showAnimeThemes = false}>
                      <button class='btn bg-dark-light btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0 mr-10' class:d-flex={staticMedia.id} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='Anime Themes' use:click={() => { if(!showAnimeThemes) loadAnimeThemes(); showAnimeThemes = !showAnimeThemes }}>
                        <Music size='1.7rem' />
                      </button>
                      {#if showAnimeThemes}
                        <div class='ext-dropdown position-absolute'>
                          {#if animeThemesLoading}
                            <div class='ext-group-label'>Loading...</div>
                          {:else if !animeThemesData?.length}
                            <div class='ext-group-label'>No themes found</div>
                          {:else}
                            {#each animeThemesData as theme}
                              {@const entries = theme.entries || []}
                              {@const videos = entries.flatMap(e => e.videos || [])}
                              {@const bestVideo = getBestVideo(videos)}
                              {#if bestVideo}
                                <button class='ext-item d-flex align-items-center' use:click={() => playThemeVideo(bestVideo, theme)}>
                                  <Music size='1.3rem' class='ext-icon-svg' />
                                  <span class='ext-site'>{formatThemeLabel(theme)}</span>
                                  {#if theme.song?.title}
                                    <span class='ext-lang'>{theme.song.title}</span>
                                  {/if}
                                  {#if theme.song?.artists?.[0]?.name}
                                    <span class='ext-tag'>{theme.song.artists[0].name}</span>
                                  {/if}
                                </button>
                              {/if}
                            {/each}
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <button class='btn bg-dark-light btn-lg btn-square d-none align-items-center justify-content-center shadow-none border-0 mr-10' class:d-flex={staticMedia.id} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='AniList' use:click={() => IPC.emit('open', `https://anilist.co/anime/${staticMedia.id}`)} on:contextmenu|preventDefault={() => copyToClipboard(`https://anilist.co/anime/${staticMedia.id}`, 'share URL')}>
                      <img class='rounded w-20' src='./anilist_icon.png' alt='Anilist'>
                    </button>
                    <button class='btn bg-dark-light btn-lg btn-square d-none align-items-center justify-content-center shadow-none border-0 mr-10' class:d-flex={staticMedia.idMal} data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='MyAnimeList' use:click={() => IPC.emit('open', `https://myanimelist.net/anime/${staticMedia.idMal}`)} on:contextmenu|preventDefault={() => copyToClipboard(`https://myanimelist.net/anime/${staticMedia.idMal}`, 'share URL')}>
                      <img class='rounded w-20' src='./myanimelist_icon.png' alt='MyAnimeList'>
                    </button>
                    {#if staticMedia.externalLinks?.filter(l => !l.isDisabled).length}
                      {@const activeLinks = staticMedia.externalLinks.filter(l => !l.isDisabled)}
                      {@const officialLinks = activeLinks.filter(l => l.type === 'OFFICIAL')}
                      {@const streamingLinks = activeLinks.filter(l => l.type === 'STREAMING')}
                      {@const infoLinks = activeLinks.filter(l => l.type === 'INFO')}
                      {@const socialLinks = activeLinks.filter(l => l.type === 'SOCIAL')}
                      {@const otherLinks = activeLinks.filter(l => !['OFFICIAL','STREAMING','INFO','SOCIAL'].includes(l.type))}
                      <div class='position-relative' use:closeOnClickOutside={() => showExternalLinks = false}>
                        <button class='btn bg-dark-light btn-lg btn-square d-flex align-items-center justify-content-center shadow-none border-0' data-toggle='tooltip' data-placement='top' data-target-breakpoint='md' data-title='External Links' use:click={() => showExternalLinks = !showExternalLinks}>
                          <ExternalLink size='1.7rem' />
                        </button>
                        {#if showExternalLinks}
                          <div class='ext-dropdown position-absolute'>
                            {#if officialLinks.length}
                              <div class='ext-group-label'>Official</div>
                              {#each officialLinks as link}
                                <button class='ext-item ext-item-official d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.3rem' class='ext-icon-svg ext-icon-svg-official' />{/if}
                                  <span class='ext-site'>{link.site || 'Official Website'}</span>
                                </button>
                              {/each}
                            {/if}
                            {#if streamingLinks.length}
                              <div class='ext-group-label'>Streaming</div>
                              {#each streamingLinks as link}
                                <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.3rem' class='ext-icon-svg' />{/if}
                                  <span class='ext-site'>{link.site}</span>
                                  {#if link.language}<span class='ext-lang'>{link.language}</span>{/if}
                                </button>
                              {/each}
                            {/if}
                            {#if infoLinks.length}
                              <div class='ext-group-label'>Info</div>
                              {#each infoLinks as link}
                                <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.3rem' class='ext-icon-svg' />{/if}
                                  <span class='ext-site'>{link.site}</span>
                                </button>
                              {/each}
                            {/if}
                            {#if socialLinks.length}
                              <div class='ext-group-label'>Social</div>
                              {#each socialLinks as link}
                                <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.3rem' class='ext-icon-svg' />{/if}
                                  <span class='ext-site'>{link.site}</span>
                                </button>
                              {/each}
                            {/if}
                            {#each otherLinks as link}
                              <button class='ext-item d-flex align-items-center' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                {#if link.icon}<img class='ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1.3rem' class='ext-icon-svg' />{/if}
                                <span class='ext-site'>{link.site}</span>
                                {#if link.language}<span class='ext-lang'>{link.language}</span>{/if}
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
                <Following media={staticMedia} />
              </div>
            </div>
            <div class='meta-block'>
              <Details media={staticMedia} alt={recommendations} />
              {#if staticMedia.genres?.length}
                <div class='meta-row'>
                  <span class='meta-key'>Genres</span>
                  <span class='meta-val'>
                    {#each staticMedia.genres as genre, i}
                      <span class='meta-genre'><svelte:component this={genreIcons[genre]} size='1.1rem' />{genre}</span>{#if i < staticMedia.genres.length - 1}<span class='meta-inline-sep'>, </span>{/if}
                    {/each}
                  </span>
                </div>
              {/if}
              {#if staticMedia.tags?.length}
                <div class='meta-row'>
                  <span class='meta-key'>Tags</span>
                  <span class='meta-val meta-tags'>
                    {#each staticMedia.tags as tag, i}
                      <span class='meta-tag'>{tag.name}<span class='meta-tag-rank'> {tag.rank}%</span></span>{#if i < staticMedia.tags.length - 1}<span class='meta-inline-sep'>, </span>{/if}
                    {/each}
                  </span>
                </div>
              {/if}
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
    background: #0d0d10 !important;
    font-family: 'IBM Plex Mono', monospace;
    color: #ededea;
  }

  /* ── Close button ────────────────────────────── */
  .close {
    top: 5rem !important;
    left: unset !important;
    right: 3rem !important;
    background: rgba(13,13,16,0.75) !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    color: rgba(237,237,234,0.55) !important;
    border-radius: 3px !important;
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 2rem !important;
    line-height: 1 !important;
    backdrop-filter: blur(8px);
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .close:hover {
    background: rgba(237,237,234,0.10) !important;
    border-color: rgba(255,255,255,0.22) !important;
    color: #ededea !important;
  }

  /* ── Episode order toggle button ─────────────── */
  .order {
    top: 7rem !important;
    left: -5rem !important;
    background: rgba(13,13,16,0.75) !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    color: rgba(237,237,234,0.38) !important;
    border-radius: 3px !important;
    backdrop-filter: blur(8px);
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .order:hover {
    background: rgba(212,245,94,0.08) !important;
    border-color: #d4f55e !important;
    color: #d4f55e !important;
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

  /* ── Anime meta label (year · season · format) ── */
  .anime-meta-label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1.1rem;
    font-weight: 500;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #d4f55e;
    margin-bottom: 0.7rem;
    opacity: 0.9;
  }

  /* ── Anime title ─────────────────────────────── */
  .anime-title {
    font-family: 'Syne', sans-serif;
    font-size: clamp(3rem, 5vw, 5.5rem);
    font-weight: 800;
    letter-spacing: -0.03em;
    color: #ededea;
    line-height: 1.0;
    margin: 0 0 1rem 0;
  }

  /* ── Inline stat row ─────────────────────────── */
  .anime-stats {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1.35rem;
    color: rgba(237,237,234,0.45);
    margin-bottom: 1.8rem;
  }
  .anime-stat-score {
    color: #d4f55e;
    font-weight: 700;
    font-size: 1.5rem;
  }
  .anime-stat-sep {
    margin: 0 0.6rem;
    color: rgba(237,237,234,0.15);
  }

  /* ── Meta def-list block ─────────────────────── */
  .meta-block {
    padding: 1.6rem 0 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid rgba(255,255,255,0.06);
    margin-top: 1rem;
  }
  .meta-row {
    display: flex;
    align-items: baseline;
    gap: 1.5rem;
    padding: 0.65rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .meta-key {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(237,237,234,0.25);
    width: 5.5rem;
    flex-shrink: 0;
    padding-top: 0.15rem;
  }
  .meta-val {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1rem;
    color: rgba(237,237,234,0.7);
    line-height: 1.7;
    flex: 1;
  }
  .meta-genre {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    text-transform: capitalize;
  }
  .meta-genre :global(svg) {
    color: rgba(212,245,94,0.55);
    flex-shrink: 0;
    width: 1rem !important;
    height: 1rem !important;
  }
  .meta-inline-sep { color: rgba(237,237,234,0.18); }
  .meta-tags { color: rgba(237,237,234,0.6); }
  .meta-tag-rank {
    color: rgba(237,237,234,0.2);
    font-size: 0.8rem;
    margin-left: 0.2rem;
  }

  /* ── Meta stat row (kept for compat) ────────── */
  :global(.font-size-18) {
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 1.15rem !important;
    color: rgba(237,237,234,0.45) !important;
    letter-spacing: 0.04em;
  }
  :global(.font-size-18 svg) { color: #d4f55e !important; }

  /* ── Primary watch button ────────────────────── */
  :global(.btn-secondary) {
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 1.15rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    background: #d4f55e !important;
    color: #0d0d10 !important;
    border: none !important;
    border-radius: 3px !important;
    box-shadow: none !important;
    transition: opacity 0.12s;
  }
  :global(.btn-secondary:hover:not(:disabled)) { opacity: 0.85; }
  :global(.btn-secondary:disabled)             { opacity: 0.3; cursor: not-allowed; }

  /* ── Square icon buttons (fav, trailer, share…) ─ */
  :global(.btn.bg-dark-light) {
    font-family: 'IBM Plex Mono', monospace !important;
    background: rgba(13,13,16,0.65) !important;
    border: 1px solid rgba(255,255,255,0.10) !important;
    color: rgba(237,237,234,0.55) !important;
    border-radius: 3px !important;
    box-shadow: none !important;
    backdrop-filter: blur(6px);
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  :global(.btn.bg-dark-light:hover) {
    background: rgba(237,237,234,0.10) !important;
    border-color: rgba(255,255,255,0.22) !important;
    color: #ededea !important;
  }

  /* ── Synopsis section header ─────────────────── */
  hr {
    border-color: rgba(255,255,255,0.07) !important;
    opacity: 1;
  }

  /* ── Synopsis body text ──────────────────────── */
  :global(.font-size-16) {
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 1.15rem !important;
    font-weight: 300 !important;
    color: rgba(237,237,234,0.45) !important;
    line-height: 1.75 !important;
  }
  /* rendered markdown links in synopsis */
  :global(.font-size-16 a) {
    color: #d4f55e !important;
    text-decoration: none;
  }
  :global(.font-size-16 a:hover) { text-decoration: underline; }

  /* ── Episode section reverse label ──────────── */
  :global(.more.text-muted) {
    font-family: 'IBM Plex Mono', monospace !important;
    font-size: 0.9rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.14em !important;
    text-transform: uppercase !important;
    color: rgba(212,245,94,0.55) !important;
    transition: color 0.1s;
  }
  :global(.more.text-muted:hover) { color: #d4f55e !important; }

  /* ── External links dropdown ─────────────────── */
  .ext-dropdown {
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
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.2em;
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
    font-size: 1rem;
    padding: 0.6rem 1.1rem;
    text-align: left;
    cursor: pointer;
    gap: 0.8rem;
    align-items: center;
    transition: background 0.1s, color 0.1s;
  }
  .ext-item:hover {
    background: rgba(237,237,234,0.07);
    color: #ededea;
  }
  .ext-item-official { color: #d4f55e; }
  .ext-item-official:hover { background: rgba(212,245,94,0.09) !important; }
  .ext-icon {
    width: 1.5rem;
    height: 1.5rem;
    object-fit: contain;
    border-radius: 3px;
    flex-shrink: 0;
  }
  :global(.ext-icon-svg) {
    flex-shrink: 0;
    color: rgba(237,237,234,0.3);
  }
  :global(.ext-icon-svg-official) { color: #d4f55e !important; }
  .ext-site {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ext-lang {
    font-size: 0.75rem;
    color: rgba(237,237,234,0.25);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }
  .ext-tag {
    font-size: 0.7rem;
    color: rgba(212,245,94,0.6);
    background: rgba(212,245,94,0.08);
    padding: 0.1rem 0.4rem;
    border-radius: 2px;
    margin-left: 0.4rem;
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }

  /* ── Theme / Trailer player shell (shared with TrailerModal pattern) ── */
  :global(.player-shell) {
    border-radius: 0.6rem;
    overflow: hidden;
    box-shadow: 0 32px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.08);
    background: #0d0d10;
  }
  :global(.wm-calc) {
    width: 100%;
    max-width: min(max(70vw, 100rem), calc(75vh * (16 / 9)));
  }
  :global(.player-header) {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0 0.75rem 0 1.4rem;
    height: 4.2rem;
    background: linear-gradient(90deg, rgba(212,245,94,0.06) 0%, transparent 60%);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  :global(.player-badge) {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    color: #d4f55e;
    background: rgba(212,245,94,0.1);
    border: 1px solid rgba(212,245,94,0.28);
    border-radius: 3px;
    padding: 0.18rem 0.5rem;
    flex-shrink: 0;
  }
  :global(.player-title) {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 1.05rem;
    font-weight: 500;
    color: rgba(237,237,234,0.65);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  :global(.player-close) {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: rgba(237,237,234,0.35);
    cursor: pointer;
    padding: 0.55rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.12s, background 0.12s;
  }
  :global(.player-close:hover) { color: #ededea; background: rgba(237,237,234,0.08); }
  :global(.player-body) {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #000;
    overflow: hidden;
  }
  :global(.player-thumb) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  :global(.player-video) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  /* ── Banner fade overlay ─────────────────────── */
  :global(.anime-details) {
    -webkit-mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%);
    mask-image: linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%);
  }
</style>