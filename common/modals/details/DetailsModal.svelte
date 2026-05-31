<script>
  import { onDestroy } from 'svelte'
  import { formatMap, genreIcons, getEpisodeMetadataForMedia, getKitsuMappings, getMediaMaxEp, playMedia } from '@/modules/anime/anime.js'
  import { playAnime } from '@/modals/torrent/TorrentModal.svelte'
  import { settings } from '@/modules/settings.js'
  import { mediaCache } from '@/modules/cache.js'
  import { add } from '@/modules/torrent.js'
  import { anilistClient, seasons } from '@/modules/anilist.js'
  import { isValidNumber } from '@/modules/util.js'
  import { click } from '@/modules/click.js'

  import EpisodeList from '@/modals/details/components/EpisodeList.svelte'
  import ToggleList from '@/modals/details/components/ToggleList.svelte'
  import Scoring from '@/components/Scoring.svelte'
  import TrailerModal from '@/modals/TrailerModal.svelte'
  import AnimeThemesModal from '@/modals/AnimeThemesModal.svelte'
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
  import { ExternalLink, Clapperboard, Users, Heart, Play, Timer, TrendingUp, Tv, Hash, ArrowDown01, ArrowUp10, Building2, Earth, Adult, FolderKanban, Languages, CalendarRange, MonitorPlay, Type } from 'lucide-svelte'

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

  let scrollDetails
  $: if (staticMedia && scrollDetails) scrollDetails.scrollLeft = 0

  const countryMap = {
    JP: 'Japan',
    KR: 'South Korea',
    US: 'United States',
    CN: 'China',
    HK: 'Hong Kong',
    TW: 'Taiwan'
  }
  const detailsMap = [
    { property: 'season', label: 'Season', icon: CalendarRange, custom: 'property' },
    { property: 'status', label: 'Status', icon: MonitorPlay },
    { property: 'studios', label: 'Studio', icon: Building2, custom: 'property' },
    { property: 'source', label: 'Source', icon: FolderKanban },
    { property: 'countryOfOrigin', label: 'Country', icon: Earth, custom: 'property' },
    { property: 'isAdult', label: 'Adult', icon: Adult },
    { property: 'english', label: 'English', icon: Type },
    { property: 'romaji', label: 'Romaji', icon: Languages },
    { property: 'native', label: 'Native', icon: '語', custom: 'icon' }
  ]

  let studio
  let seasonal
  function getCustomProperty (property, media) {
    if (property === 'averageScore') {
      return media.averageScore + '%'
    } else if (property === 'season') {
      return seasonal
    } else if (property === 'countryOfOrigin') {
      return countryMap[media.countryOfOrigin]
    } else if (property === 'studios') {
      return studio
    } else {
      return media[property]
    }
  }
  async function getProperty (property, media) {
    if (property === 'episode') {
      return media.nextAiringEpisode?.episode
    } else if (property === 'english' || property === 'romaji' || property === 'native') {
      return media.title[property]
    } else if (property === 'isAdult') {
      return (media.isAdult === true ? 'Rated 18+' : false)
    } else if (property === 'countryOfOrigin') {
      return countryMap[media.countryOfOrigin]
    } else if (property === 'studios') {
      studio = ((await recommendations)?.data?.Media || media)?.studios?.nodes?.map(node => node.name)?.[0]
      return studio
    } else if (property === 'season') {
      const details = await (((media.season || media.seasonYear || (media.status === 'NOT_YET_RELEASED')) && media) || getKitsuMappings(media.id))
      const attributes = details?.included?.[0]?.attributes
      const seasonYear = details.seasonYear || (attributes?.startDate && new Date(attributes?.startDate).getFullYear()) || (attributes?.createdAt && new Date(attributes?.createdAt).getFullYear())
      const season = (details.season || seasonYear && seasons[Math.floor((((attributes?.startDate && new Date(attributes?.startDate).getMonth()) || (attributes?.createdAt && new Date(attributes?.createdAt).getMonth())) / 12) * 4) % 4])?.toLowerCase()
      seasonal = (season || seasonYear) ? [season, seasonYear].filter(f => f).join(' ') : (media.status === 'NOT_YET_RELEASED') ? 'In Production' : null
      return seasonal
    }
    return media[property]
  }
</script>

<div class="modal modal-full z-50 BlueprintContainer" class:show={staticMedia} on:keydown={checkClose} tabindex="-1" role="button" bind:this={_modal} style="--accent-dynamic: {media?.coverImage?.color || '#e60012'}">
  <div class="h-full modal-content p-0 overflow-y-auto position-relative StructuralCanvas" bind:this={container}>
    {#if staticMedia}
      <div class="GridOverlay"></div>
      <div class="CornerAccent TopLeft"></div>
      <div class="CornerAccent TopRight"></div>
      <div class="CornerAccent BottomLeft"></div>
      <div class="CornerAccent BottomRight"></div>

      <button class="close TechnicalControl z-30" type="button" use:click={() => close()}>
        <span>✕</span>
      </button>

      <div class="BannerSection">
        <SmartImage class="BannerImage" images={[
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
        <div class="BannerTint"></div>
      </div>

      <div class="row MainGrid px-20">
        <div class="col-lg-7 col-12 ComplexLeftPane pb-10">
          <div bind:this={leftColumn}>
            <div class="d-flex flex-sm-row flex-column align-items-sm-stretch pb-20 mb-15 StructuralHeader">
              <div class="cover d-flex flex-row align-items-center justify-content-center mw-full mb-sm-0 mb-20 w-full SpecCoverFrame">
                <div class="position-relative h-full w-full InternalImageWrapper">
                  <SmartImage class="rounded cover-img overflow-hidden h-full w-full GraphicMatrix" color={media.coverImage.color || 'var(--tertiary-color)'} images={[staticMedia.coverImage?.extraLarge, staticMedia.coverImage?.medium, './404_cover.png']}/>
                  <AudioLabel media={staticMedia} viewAnime={true} />
                </div>
              </div>
              
              <div class="pl-sm-20 ml-sm-20 HeaderMetaBlock d-flex flex-column justify-content-between">
                <div>
                  <div class="TechnicalID">ID: #{staticMedia.id || 'NULL'}</div>
                  <h1 class="font-weight-very-bold text-white select-all mb-0 MassiveDisplayTitle">{anilistClient.title(staticMedia)}</h1>
                </div>
                
                <div class="TelemetryStrip d-flex flex-row flex-wrap mt-5">
                  {#if staticMedia.averageScore}
                    <div class="TelemetryItem" title="{staticMedia.averageScore / 10} by {anilistClient.reviews(staticMedia)} reviews">
                      <TrendingUp size="1.2rem" />
                      <span class="TelemetryValue">{staticMedia.averageScore}%</span>
                    </div>
                  {/if}
                  {#if staticMedia.format}
                    <div class="TelemetryItem">
                      <Tv size="1.2rem" />
                      <span class="TelemetryValue text-uppercase">{formatMap[staticMedia.format]}</span>
                    </div>
                  {/if}
                  {#if staticMedia.episodes !== 1}
                    {@const maxEp = getMediaMaxEp(staticMedia)}
                    <div class="TelemetryItem">
                      <Clapperboard size="1.2rem" />
                      <span class="TelemetryValue">EPs {maxEp && maxEp !== 0 ? maxEp : '?'}</span>
                    </div>
                  {:else if staticMedia.duration}
                    <div class="TelemetryItem">
                      <Timer size="1.2rem" />
                      <span class="TelemetryValue">LENGTH {staticMedia.duration} MIN</span>
                    </div>
                  {/if}
                  {#if staticMedia.averageScore && staticMedia.stats?.scoreDistribution}
                    <div class="TelemetryItem">
                      <Users size="1.2rem" />
                      <span class="TelemetryValue">REVIEWS {anilistClient.reviews(staticMedia)}</span>
                    </div>
                  {/if}
                </div>

                <div class="d-flex flex-row flex-wrap play ActionMatrix">
                  <button class="btn btn-lg PrimaryIndustrialButton w-250 text-dark font-weight-bold shadow-none border-0 d-flex align-items-center justify-content-center mr-20 mt-20"
                          use:click={() => play(media)}
                          disabled={staticMedia.status === 'NOT_YET_RELEASED'}>
                    <Play class="mr-10 ButtonIconFill" fill="currentColor" size="1.2rem" />
                    <span class="ButtonTextLabel">{playButtonText.toUpperCase()}</span>
                  </button>

                  <div class="mt-20 d-flex align-items-center SubActionGroup">
                    {#if Helper.isAuthorized()}
                      <div class="EmbeddedScoringPanel">
                        <Scoring class="mr-10" {media} viewAnime={true} />
                      </div>
                    {/if}

                    {#if Helper.isAniAuth()}
                      <button class="btn TechnicalSquareButton d-flex align-items-center justify-content-center shadow-none border-0 mr-10" data-toggle="tooltip" data-placement="top" data-target-breakpoint="md" data-title={media.isFavourite ? 'Unfavourite' : 'Favourite'} use:click={toggleFavourite} disabled={!Helper.isAniAuth()}>
                        <div class="favourite d-flex align-items-center justify-content-center" title={media.isFavourite ? 'Unfavourite' : 'Favourite'}>
                          <Heart color={media.isFavourite ? '#FF3E3E' : 'currentColor'} fill={media.isFavourite ? '#FF3E3E' : 'transparent'} size="1.2rem" />
                        </div>
                      </button>
                    {/if}

                    <TrailerModal {staticMedia} />

                    <AnimeThemesModal {staticMedia} />

                    {#if staticMedia.externalLinks?.filter(l => !l.isDisabled).length}
                      {@const activeLinks = staticMedia.externalLinks.filter(l => !l.isDisabled)}
                      {@const officialLinks = activeLinks.filter(l => l.type === 'OFFICIAL')}
                      {@const streamingLinks = activeLinks.filter(l => l.type === 'STREAMING')}
                      {@const infoLinks = activeLinks.filter(l => l.type === 'INFO')}
                      {@const socialLinks = activeLinks.filter(l => l.type === 'SOCIAL')}
                      {@const otherLinks = activeLinks.filter(l => !['OFFICIAL','STREAMING','INFO','SOCIAL'].includes(l.type))}
                      <div class="position-relative mr-10 DropdownAnchor" use:closeOnClickOutside={() => showExternalLinks = false}>
                        <button class="btn TechnicalSquareButton d-flex align-items-center justify-content-center shadow-none border-0" data-toggle="tooltip" data-title="External Links" use:click={() => showExternalLinks = !showExternalLinks}>
                          <ExternalLink size="1.2rem" />
                        </button>
                        {#if showExternalLinks}
                          <div class="ext-dropdown position-absolute IndustrialDropdown">
                            {#if officialLinks.length}
                              <div class="ext-group-label DropdownSectionHeader">OFFICIAL</div>
                              {#each officialLinks as link}
                                <button class="ext-item ext-item-official d-flex align-items-center DropdownRowItem" use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class="ext-icon BlueprintMiniIcon" src={link.icon} alt="" on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size="1rem" class="ext-icon-svg ext-icon-svg-official" />{/if}
                                  <span class="ext-site">{link.site || 'Official Website'}</span>
                                </button>
                              {/each}
                            {/if}
                            {#if streamingLinks.length}
                              <div class="ext-group-label DropdownSectionHeader">STREAMING</div>
                              {#each streamingLinks as link}
                                <button class="ext-item d-flex align-items-center DropdownRowItem" use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class="ext-icon BlueprintMiniIcon" src={link.icon} alt="" on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size="1rem" class="ext-icon-svg" />{/if}
                                  <span class="ext-site">{link.site}</span>
                                  {#if link.language}<span class="ext-lang TechnicalBadge">{link.language}</span>{/if}
                                </button>
                              {/each}
                            {/if}
                            {#if infoLinks.length}
                              <div class="ext-group-label DropdownSectionHeader">INFO</div>
                              {#each infoLinks as link}
                                <button class="ext-item d-flex align-items-center DropdownRowItem" use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class="ext-icon BlueprintMiniIcon" src={link.icon} alt="" on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size="1rem" class="ext-icon-svg" />{/if}
                                  <span class="ext-site">{link.site}</span>
                                </button>
                              {/each}
                            {/if}
                            {#if socialLinks.length}
                              <div class="ext-group-label DropdownSectionHeader">SOCIAL</div>
                              {#each socialLinks as link}
                                <button class="ext-item d-flex align-items-center DropdownRowItem" use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                  {#if link.icon}<img class="ext-icon BlueprintMiniIcon" src={link.icon} alt="" on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size="1rem" class="ext-icon-svg" />{/if}
                                  <span class="ext-site">{link.site}</span>
                                </button>
                              {/each}
                            {/if}
                            {#each otherLinks as link}
                              <button class="ext-item d-flex align-items-center DropdownRowItem" use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                                {#if link.icon}<img class="ext-icon BlueprintMiniIcon" src={link.icon} alt="" on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size="1rem" class="ext-icon-svg" />{/if}
                                <span class="ext-site">{link.site}</span>
                                {#if link.language}<span class="ext-lang TechnicalBadge">{link.language}</span>{/if}
                              </button>
                            {/each}
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <button class="btn TechnicalSquareButton d-none align-items-center justify-content-center shadow-none border-0 mr-10" class:d-flex={staticMedia.id} data-toggle="tooltip" data-placement="top" data-target-breakpoint="md" data-title="Open AniList" use:click={() => IPC.emit('open', `https://anilist.co/anime/${staticMedia.id}`)}>
                      <img class="rounded MonochromeLogo" src="./anilist_icon.png" alt="Anilist">
                    </button>
                    <button class="btn TechnicalSquareButton d-none align-items-center justify-content-center shadow-none border-0" class:d-flex={staticMedia.idMal} data-toggle="tooltip" data-placement="top" data-target-breakpoint="md" data-title="Open MyAnimeList" use:click={() => IPC.emit('open', `https://myanimelist.net/anime/${staticMedia.idMal}`)}>
                      <img class="rounded MonochromeLogo" src="./myanimelist_icon.png" alt="MyAnimeList">
                    </button>
                  </div>
                </div>
                <Following media={staticMedia} />
              </div>
            </div>

            <div bind:this={scrollDetails} class="details-strip card m-0 px-20 pb-0 pt-10 d-flex flex-row overflow-x-scroll text-capitalize align-items-start ParameterGrid">
              {#each detailsMap as detail}
                {#await getProperty(detail.property, staticMedia)}
                  {:then property}
                  {#if property}
                    <div class="ParameterCell d-flex flex-row mx-10 py-5 justify-content-center">
                      {#if detail.custom !== 'icon'}
                        <svelte:component size="1.2rem" this={detail.icon} class="mr-10 CellIcon" />
                      {:else}
                        <div class="mr-10 d-flex align-items-center text-nowrap font-size-12 font-weight-bold line-height-normal CustomCellSymbol">
                          {detail.icon}
                        </div>
                      {/if}
                      <div class="d-flex flex-column justify-content-center text-nowrap">
                        <span class="CellLabel">{detail.label}</span>
                        <div class="font-weight-bold select-all line-height-normal CellValue">
                          {#if detail.custom === 'property'}
                            {getCustomProperty(detail.property, staticMedia)}
                          {:else}
                            {property.toString().replace(/_/g, ' ').toLowerCase()}
                          {/if}
                        </div>
                      </div>
                    </div>
                  {/if}
                {/await}
              {/each}
            </div>

            <div class="LabelContainerHeader">TAGS</div>
            <div bind:this={scrollTags} class="m-0 px-20 pb-0 pt-10 d-flex flex-row text-nowrap overflow-x-scroll text-capitalize align-items-start StructuralTagStrip">
              {#each staticMedia.tags as tag}
                <div class="TechnicalDataTag px-20 py-10 mr-10 d-flex align-items-center">
                  <Hash class="mr-5 TagIcon" size="1rem" />
                  <span class="font-weight-bolder select-all TagName">{tag.name}</span>
                  <span class="font-weight-light TagMetrics">:{tag.rank}%</span>
                </div>
              {/each}
            </div>

            <div class="LabelContainerHeader">GENRES</div>
            <div bind:this={scrollGenres} class="m-0 px-20 pb-0 pt-10 d-flex flex-row text-nowrap overflow-x-scroll text-capitalize align-items-start StructuralTagStrip">
              {#each staticMedia.genres as genre}
                <div class="TechnicalDataTag px-20 py-10 mr-10 d-flex align-items-center select-all">
                  <svelte:component this={genreIcons[genre]} class="mr-5 TagIcon" size="1rem" />
                  <span class="TagName">{genre}</span>
                </div>
              {/each}
            </div>

            {#if staticMedia.description}
              <div class="w-full d-flex flex-row align-items-center pt-20 mt-10 SegmentDividerBlock">
                <div class="TechnicalDividerLine"></div>
                <div class="font-size-18 font-weight-semi-bold px-20 SegmentTitleText">SYNOPSIS</div>
                <div class="TechnicalDividerLine"></div>
              </div>
              <div class="font-size-16 pt-20 select-all TechnicalNarrativeText">
                {@html sanitize(staticMedia.description)}
              </div>
            {/if}

            {#if episodeList?.length}
              <div class="w-full d-flex d-lg-none flex-row align-items-center pt-20 mt-10 pointer MobileSectionToggle" aria-hidden="true" use:click={() => { episodeOrder = !episodeOrder }}>
                <div class="TechnicalDividerLine"></div>
                <div class="position-absolute font-size-18 font-weight-semi-bold px-20 SegmentTitleText" style="left: 50%; transform: translateX(-50%);">EPISODES</div>
                <div class="TechnicalDividerLine"></div>
                <div class="ml-auto pl-20 font-size-12 more text-nowrap pr-20 ReverseToggleLabel" use:click={() => { episodeOrder = !episodeOrder }}>INVERT</div>
              </div>
            {/if}

            <div class="col-lg-5 col-12 d-lg-none flex-column mt-20 StructuralMobileEpisodeList">
              <EpisodeList bind:episodeList={episodeList} mobileList={true} media={staticMedia} {episodeOrder} bind:userProgress bind:watched episodeCount={getMediaMaxEp(media)} {play} class="h-600" />
            </div>

            <div class="d-lg-block LinkedRelationsPanel">
              <ToggleList list={ staticMedia.relations?.edges?.filter(({ node, relationType }) => relationType !== 'CHARACTER' && node.type === 'ANIME' && node.format !== 'MUSIC' && !(settings.value.adult === 'none' && node.isAdult) && !(settings.value.adult !== 'hentai' && node.genres?.includes('Hentai')) && !missingIds.includes(node.id)).sort((a, b) => (a.node.seasonYear || Infinity) - (b.node.seasonYear || Infinity)) } promise={searchIDS} let:item let:promise title="RELATIONS">
                {#await promise}
                  <div class="small-card TechnicalCardShell">
                    <SmallCardSk />
                  </div>
                {:then res}
                  {#if res}
                    <div class="small-card TechnicalCardShell">
                      <SmallCard data={item.node} type={item.relationType.replace(/_/g, ' ').toLowerCase()} />
                    </div>
                  {/if}
                {/await}
              </ToggleList>

              {#await recommendations then res}
                {@const media = res?.data?.Media}
                {#if media}
                  <ToggleList list={ media.recommendations?.edges?.filter(({ node }) => node.mediaRecommendation && !(settings.value.adult === 'none' && node.mediaRecommendation.isAdult) && !(settings.value.adult !== 'hentai' && node.mediaRecommendation.genres?.includes('Hentai')) && !missingIds.includes(node.mediaRecommendation.id)).sort((a, b) => b.node.rating - a.node.rating) } promise={searchIDS} let:item let:promise title="RECOMMENDATIONS">
                    {#await promise}
                      <div class="small-card TechnicalCardShell">
                        <SmallCardSk />
                      </div>
                    {:then res}
                      {#if res}
                        <div class="small-card TechnicalCardShell">
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

        <div class="col-lg-5 col-12 d-none d-lg-flex flex-column pl-lg-20 StructuralRightPane" bind:this={rightColumn}>
          <div class="ControlTowerHeader">
            <span class="TowerTitle">EPISODES</span>
            <button class="close order pointer z-30 TowerOrderToggle" class:d-none={!episodeList?.length} data-toggle="tooltip" data-placement="top" data-target-breakpoint="md" data-title="Reverse Episodes" use:click={()=> {episodeOrder = !episodeOrder}}>
              <svelte:component this={episodeOrder ? ArrowDown01 : ArrowUp10} size="1.2rem" />
            </button>
          </div>
          <div class="TowerListBody">
            <EpisodeList bind:episodeLoad={episodeLoad} media={staticMedia} {episodeOrder} bind:userProgress bind:watched episodeCount={getMediaMaxEp(media)} {play} />
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  :global(.BlueprintContainer) {
    --home-bg: #2b2b2b;
    --home-panel: rgba(0,0,0,0.4);
    --home-panel-solid: #3c3c3c;
    --home-border: rgba(255,255,255,0.08);
    --home-text: #ffffff;
    --home-text-dim: rgba(255,255,255,0.6);
  }

  :global(.modal-full .StructuralCanvas) {
    background-color: var(--home-bg) !important;
    font-family: system-ui, sans-serif !important;
    color: var(--home-text) !important;
    position: relative;
    overflow-x: hidden !important;
  }

  .GridOverlay {
    display: none;
  }

  .CornerAccent {
    display: none;
  }

  .TechnicalControl {
    position: fixed !important;
    top: 20px !important; right: 20px !important; left: unset !important;
    background: var(--home-panel) !important;
    border: 1px solid var(--home-border) !important;
    color: var(--home-text) !important;
    border-radius: 50px !important;
    font-family: system-ui, sans-serif !important;
    font-size: 0.85rem !important;
    font-weight: 700;
    padding: 8px 18px !important;
    letter-spacing: 0.05em;
    backdrop-filter: blur(10px);
    z-index: 100;
    transition: all 0.15s;
  }
  .TechnicalControl:hover {
    background: var(--accent-dynamic) !important;
    border-color: var(--accent-dynamic) !important;
    color: #fff !important;
  }

  .BannerSection {
    position: absolute; top: 0; left: 0; width: 100%; height: 380px;
    z-index: 0; overflow: hidden;
    border-bottom: 1px solid var(--home-border);
  }
  :global(.BannerImage) {
    width: 100%; height: 100%; object-fit: cover;
    filter: grayscale(20%) opacity(0.3);
  }
  .BannerTint {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(to bottom, transparent 50%, var(--home-bg));
  }

  .MainGrid {
    position: relative; z-index: 2;
    padding-top: 180px !important;
    max-width: 1600px; margin: 0 auto;
  }

  .StructuralHeader {
    border: 1px solid var(--home-border);
    background: var(--home-panel);
    backdrop-filter: blur(8px);
    border-radius: 16px;
    padding: 20px; position: relative;
  }

  .SpecCoverFrame {
    aspect-ratio: 7/10; border: none;
    background: transparent; padding: 0;
    border-radius: 12px; overflow: hidden;
  }
  @media (min-width: 577px) {
    .SpecCoverFrame { max-width: 220px !important; }
  }
  .InternalImageWrapper {
    border: none; overflow: hidden;
    border-radius: 12px;
  }
  :global(.GraphicMatrix) {
    object-fit: cover; border-radius: 12px;
    transition: transform 0.3s;
  }
  .SpecCoverFrame:hover :global(.GraphicMatrix) {
    transform: scale(1.05);
  }

  .HeaderMetaBlock {
    flex: 1; min-width: 0;
  }
  .TechnicalID {
    font-size: 0.75rem; color: var(--home-text-dim); letter-spacing: 0.1em;
    margin-bottom: 4px; font-weight: 700;
  }

  :global(.MassiveDisplayTitle) {
    font-family: system-ui, sans-serif !important;
    font-size: clamp(2rem, 3.5vw, 3.2rem) !important;
    text-transform: uppercase;
    letter-spacing: -0.02em !important;
    line-height: 1.05 !important;
    color: #ffffff !important;
    margin-bottom: 15px !important;
    font-weight: 900 !important;
  }

  .TelemetryStrip { gap: 10px; margin-bottom: 15px; }
  .TelemetryItem {
    display: flex; align-items: center; gap: 6px;
    background: rgba(0,0,0,0.4);
    border: 1px solid var(--home-border);
    border-radius: 50px;
    padding: 6px 16px; font-size: 0.75rem;
  }
  .TelemetryItem :global(svg) { color: var(--accent-dynamic); }
  .TelemetryValue { color: var(--home-text); font-weight: 700; letter-spacing: 0.05em; }

  .ActionMatrix { gap: 10px; align-items: center; }
  :global(.PrimaryIndustrialButton) {
    background: var(--accent-dynamic) !important;
    color: #fff !important;
    font-family: system-ui, sans-serif !important;
    font-size: 0.95rem !important;
    letter-spacing: 0.05em !important;
    border-radius: 50px !important;
    padding: 12px 28px !important;
    border: 3px solid transparent !important;
    font-weight: 900 !important;
    transition: all 0.15s !important;
  }
  :global(.PrimaryIndustrialButton:hover:not(:disabled)) {
    transform: scale(1.05);
    border-color: #fff !important;
  }
  :global(.PrimaryIndustrialButton:disabled) {
    background: var(--home-panel-solid) !important;
    color: var(--home-text-dim) !important;
    opacity: 0.5;
  }

  :global(.TechnicalSquareButton) {
    width: 44px !important; height: 44px !important;
    background: rgba(0,0,0,0.4) !important;
    border: 1px solid var(--home-border) !important;
    color: var(--home-text) !important;
    border-radius: 50px !important;
    transition: all 0.15s;
  }
  :global(.TechnicalSquareButton:hover) {
    border-color: var(--accent-dynamic) !important;
    color: var(--accent-dynamic) !important;
    background: rgba(0,0,0,0.5) !important;
  }
  .MonochromeLogo {
    filter: grayscale(100%) brightness(130%); width: 18px; height: 18px;
  }

  .ParameterGrid {
    background: var(--home-panel) !important;
    border: 1px solid var(--home-border) !important;
    border-radius: 12px !important;
    gap: 0px;
    padding: 0 !important; margin-top: 20px !important;
    overflow: hidden;
  }
  .ParameterCell {
    border-right: 1px solid var(--home-border);
    padding: 14px 20px !important; margin: 0 !important;
    flex: 1; min-width: 140px; align-items: center;
  }
  .ParameterCell:last-child { border-right: none; }
  .ParameterCell :global(.CellIcon), .CustomCellSymbol {
    color: var(--accent-dynamic); margin-right: 12px !important;
  }
  .CustomCellSymbol { font-family: system-ui, sans-serif; font-size: 1.1rem; }
  .CellLabel {
    display: block; font-size: 0.65rem; color: var(--home-text-dim);
    letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700;
  }
  .CellValue {
    font-size: 0.85rem !important; color: var(--home-text) !important;
    margin-top: 2px; font-weight: 700;
  }

  .LabelContainerHeader {
    font-size: 0.7rem; color: var(--home-text-dim); font-weight: 700;
    letter-spacing: 0.1em; margin: 25px 0 10px 5px;
    text-transform: uppercase;
  }
  .StructuralTagStrip { gap: 8px; padding: 0 !important; }
  .TechnicalDataTag {
    background: rgba(0,0,0,0.4); border: 1px solid var(--home-border);
    padding: 8px 16px !important; margin: 0 !important;
    border-radius: 50px;
  }
  .TagIcon { color: var(--accent-dynamic); }
  .TagName { font-size: 0.8rem !important; color: var(--home-text); font-weight: 700; }
  .TagMetrics { font-size: 0.8rem; color: var(--home-text-dim); margin-left: 4px; }

  .SegmentDividerBlock { position: relative; margin-top: 30px !important; }
  .TechnicalDividerLine { height: 1px; background: var(--home-border); flex: 1; }
  .SegmentTitleText {
    color: var(--accent-dynamic) !important; font-size: 0.8rem !important;
    letter-spacing: 0.1em; font-weight: 900 !important;
  }
  .TechnicalNarrativeText {
    font-size: 1rem !important; line-height: 1.7 !important;
    color: var(--home-text) !important;
    background: rgba(0,0,0,0.4);
    padding: 20px; border-radius: 12px;
    border: 1px solid var(--home-border);
  }

  .StructuralRightPane {
    border-left: 1px solid var(--home-border);
    display: flex; flex-direction: column; height: auto;
  }
  .ControlTowerHeader {
    display: flex; align-items: center; justify-content: space-between;
    background: rgba(0,0,0,0.4); border: 1px solid var(--home-border);
    border-radius: 12px;
    padding: 12px 16px; margin-bottom: 15px;
  }
  .TowerTitle {
    font-size: 0.8rem; font-weight: 900; color: var(--home-text);
    letter-spacing: 0.1em;
  }
  .TowerOrderToggle {
    position: relative !important; top: unset !important; right: unset !important;
    background: rgba(0,0,0,0.4) !important; border: 1px solid var(--home-border) !important;
    color: var(--home-text) !important; padding: 8px !important;
    border-radius: 50px !important;
  }
  .TowerOrderToggle:hover {
    border-color: var(--accent-dynamic) !important; color: var(--accent-dynamic) !important;
  }
  .TowerListBody {
    flex: 1; background: rgba(0,0,0,0.4);
    border: 1px solid var(--home-border); border-radius: 12px;
    padding: 15px;
    overflow-y: auto;
  }

  .IndustrialDropdown {
    background: var(--home-panel-solid) !important;
    border: 1px solid var(--home-border) !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    z-index: 50; padding: 10px 0; width: 220px;
  }
  .DropdownSectionHeader {
    font-size: 0.65rem !important; color: var(--accent-dynamic) !important;
    padding: 6px 15px !important; letter-spacing: 0.1em; font-weight: 900;
  }
  .DropdownRowItem {
    background: transparent !important; color: var(--home-text) !important;
    padding: 8px 15px !important; font-size: 0.75rem !important;
    width: 100%; border: none !important;
    text-align: left; transition: background 0.12s;
  }
  .DropdownRowItem:hover {
    background: rgba(255,255,255,0.05) !important;
  }
  .BlueprintMiniIcon { width: 14px; height: 14px; margin-right: 8px; }
  .TechnicalBadge {
    font-size: 0.6rem; background: rgba(255,255,255,0.1);
    color: var(--home-text-dim);
    padding: 2px 6px; margin-left: auto; border-radius: 4px;
  }

  .TechnicalCardShell {
    border: 1px solid var(--home-border) !important;
    background: var(--home-panel) !important;
    border-radius: 12px !important;
    padding: 5px; margin-bottom: 10px;
  }

  @media (max-width: 991px) {
    .MainGrid { padding-top: 100px !important; }
    .StructuralRightPane { border-left: none; margin-top: 30px; }
    .ParameterCell { border-right: none; border-bottom: 1px solid var(--home-border); }
    .ParameterCell:last-child { border-bottom: none; }
  }
</style>