<script>
  import { onDestroy } from 'svelte'
  import { formatMap, genreIcons, getEpisodeMetadataForMedia, getKitsuMappings, getMediaMaxEp, playMedia } from '@/modules/anime/anime.js'
  import { playAnime } from '@/modals/torrent/TorrentModal.svelte'
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
  import { ExternalLink, Clapperboard, Users, Heart, Play, Timer, TrendingUp, Tv, Hash, ArrowDown01, ArrowUp10 } from 'lucide-svelte'

  $: view = $modal[modal.ANIME_DETAILS]?.data
  function close () { modal.close(modal.ANIME_DETAILS) }

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
  mediaCache.subscribe((value) => {
    if (value && (JSON.stringify(value[media?.id]) !== JSON.stringify(media))) media = value[media?.id]
  })

  $: episodeOrder = !!staticMedia
  $: watched = media?.mediaListEntry?.status === 'COMPLETED'
  $: userProgress = ['CURRENT', 'REPEATING', 'PAUSED', 'DROPPED'].includes(media?.mediaListEntry?.status) && media?.mediaListEntry?.progress
  $: missingIds = staticMedia && []
  $: recommendations = staticMedia && anilistClient.recommendations({ id: staticMedia.id })
  $: searchIDS = staticMedia && (async () => {
    const searchIDS = [
      ...(staticMedia.relations?.edges?.filter(({ node }) => node.type === 'ANIME').map(({ node }) => node.id) || []),
      ...((await recommendations)?.data?.Media?.recommendations?.edges?.map(({ node }) => node.mediaRecommendation?.id) || [])
    ]
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

  $: staticMedia && (_modal?.focus(), container && container.scrollTo({ top: 0, behavior: 'smooth' }))
  $: staticMedia && (modal.length === 1 && $modal[modal.ANIME_DETAILS] && _modal?.focus())
  $: {
    if (staticMedia) {
      if (scrollTags) scrollTags.scrollLeft = 0
      if (scrollGenres) scrollGenres.scrollLeft = 0
    }
  }

  function checkClose ({ keyCode }) { if (keyCode === 27) close() }

  function play (media, episode, force = false) {
    if (!media) return
    if (isValidNumber(episode)) return playAnime(media, episode, force)
    if (media.status === 'NOT_YET_RELEASED') return
    playMedia(media)
  }

  function getPlayButtonText (media) {
    if (media?.mediaListEntry) {
      const { status, progress } = media.mediaListEntry
      if (progress) return status === 'COMPLETED' ? 'Rewatch Now' : 'Continue Now'
    }
    return 'Watch Now'
  }

  $: playButtonText = getPlayButtonText(media)

  function toggleFavourite () {
    media.isFavourite = anilistClient.favourite({ id: media.id })
  }

  function handlePlay (id, episode, torrentOnly) {
    const cachedMedia = mediaCache.value[id]
    if (!cachedMedia) return
    const cachedEpisode = isValidNumber(episode) ? episode : cachedMedia?.mediaListEntry?.progress
    const desiredEpisode = isValidNumber(episode) ? episode : cachedEpisode && cachedEpisode !== 0 ? cachedEpisode + 1 : cachedEpisode
    if (torrentOnly) {
      if (desiredEpisode) return playAnime(cachedMedia, desiredEpisode)
      if (cachedMedia?.status === 'NOT_YET_RELEASED') return
      playMedia(cachedMedia)
    } else play(cachedMedia, desiredEpisode)
  }

  IPC.on('play-anime', (id, episode, torrentOnly) => handlePlay(id, episode, torrentOnly))
  window.addEventListener('play-anime', (e) => { const { id, episode, torrentOnly } = e.detail; handlePlay(id, episode, torrentOnly) })
  window.addEventListener('play-torrent', (e) => add(e.detail.magnet, null, null, null, e.detail.base64))
  IPC.on('play-torrent', (detail) => add(detail.magnet, null, null, null, detail.base64))

  function sanitize (body) {
    if (!body) return ''
    const cleanBody = body.trim()
      .replace(/\.\.+(?=\s*$)/gm, '.')
      .replace(/\n/g, '<br>')
      .replace(/(<br\s*\/?>){2,}/gi, '<br><br>')
      .replace(/^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi, '')
    marked.setOptions({ pedantic: false, breaks: true, gfm: true })
    return DOMPurify.sanitize(marked.parse(cleanBody).trim(), {
      ALLOWED_TAGS: ['p','br','span','div','h1','h2','h3','h4','h5','h6','strong','em','b','i','u','s','del','ins','mark','ul','ol','li','blockquote','code','pre','a','img','table','thead','tbody','tfoot','tr','th','td','hr','details','summary','input'],
      ALLOWED_ATTR: ['href','target','rel','title','src','alt','width','height','class','id','align','type','checked','disabled']
    })
  }

  let episodeList = []
  let episodeLoad
  $: if (episodeLoad) { episodeLoad.then(eps => { episodeList = eps }) }

  let showExternalLinks = false

  function closeOnClickOutside (node, onClose) {
    function handle (e) { if (!node.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handle, true)
    return { destroy () { document.removeEventListener('mousedown', handle, true) } }
  }

  onDestroy(() => {})
</script>

<div
  class='dm-root'
  class:dm-root--show={staticMedia}
  on:keydown={checkClose}
  tabindex='-1'
  role='button'
  bind:this={_modal}
>
  {#if staticMedia}

    <!-- Close -->
    <button class='dm-close' type='button' use:click={() => close()}>&times;</button>

    <!-- ════ HERO ════════════════════════════════════════════════════════ -->
    <div class='dm-hero'>
      <!-- background banner image — same vibe as .bg-image in HomePage -->
      <SmartImage
        class='dm-hero__bg'
        images={[
          staticMedia.bannerImage,
          ...(staticMedia.trailer?.id ? [
            `https://i.ytimg.com/vi/${staticMedia.trailer.id}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${staticMedia.trailer.id}/hqdefault.jpg`
          ] : []),
          () => getKitsuMappings(staticMedia).then(m => [
            m?.included?.[0]?.attributes?.coverImage?.original,
            m?.included?.[0]?.attributes?.coverImage?.large,
            m?.included?.[0]?.attributes?.coverImage?.small,
            m?.included?.[0]?.attributes?.coverImage?.tiny
          ]),
          () => getEpisodeMetadataForMedia(staticMedia).then(m => m?.[1]?.image)
        ]}
      />
      <!-- diagonal vignette — mirrors .curse-overlay + .vignette from HomePage -->
      <div class='dm-hero__vignette' />

      <div class='dm-hero__body'>
        <!-- Cover art -->
        <div class='dm-cover'>
          <SmartImage
            class='dm-cover__img'
            color={media.coverImage.color || '#e60012'}
            images={[staticMedia.coverImage?.extraLarge, staticMedia.coverImage?.medium, './404_cover.png']}
          />
          <AudioLabel media={staticMedia} viewAnime={true} />
        </div>

        <!-- Title + meta + actions -->
        <div class='dm-hero__info'>
          <!-- hero-title style from HomePage -->
          <h1 class='dm-title select-all'>{anilistClient.title(staticMedia)}</h1>

          <!-- stat-grid style from HomePage -->
          <div class='dm-stat-grid'>
            {#if staticMedia.averageScore}
              <div class='dm-stat' title='{staticMedia.averageScore / 10} by {anilistClient.reviews(staticMedia)} reviews'>
                <span class='dm-stat__label'>RATING</span>
                <span class='dm-stat__value'><TrendingUp size='1.1rem' /> {staticMedia.averageScore}%</span>
              </div>
            {/if}
            {#if staticMedia.format}
              <div class='dm-stat'>
                <span class='dm-stat__label'>FORMAT</span>
                <span class='dm-stat__value'>{formatMap[staticMedia.format]}</span>
              </div>
            {/if}
            {#if staticMedia.episodes !== 1}
              {@const maxEp = getMediaMaxEp(staticMedia)}
              <div class='dm-stat'>
                <span class='dm-stat__label'>EPISODES</span>
                <span class='dm-stat__value'>{maxEp && maxEp !== 0 ? maxEp : '?'}</span>
              </div>
            {:else if staticMedia.duration}
              <div class='dm-stat'>
                <span class='dm-stat__label'>LENGTH</span>
                <span class='dm-stat__value'>{staticMedia.duration}<small> min</small></span>
              </div>
            {/if}
            {#if staticMedia.averageScore && staticMedia.stats?.scoreDistribution}
              <div class='dm-stat' title='{staticMedia.averageScore / 10} by {anilistClient.reviews(staticMedia)} reviews'>
                <span class='dm-stat__label'>REVIEWS</span>
                <span class='dm-stat__value'>{anilistClient.reviews(staticMedia)}</span>
              </div>
            {/if}
          </div>

          <!-- cta-row style from HomePage -->
          <div class='dm-cta-row'>
            <button
              class='dm-btn-play'
              use:click={() => play(media)}
              disabled={staticMedia.status === 'NOT_YET_RELEASED'}
            >
              <Play fill='currentColor' size='1.3rem' /> {playButtonText}
            </button>

            <!-- icon cluster — styled like .icon-btn from HomePage -->
            <div class='dm-icon-cluster'>
              {#if Helper.isAuthorized()}
                <Scoring class='dm-icon-btn' {media} viewAnime={true} />
              {/if}

              {#if Helper.isAniAuth()}
                <button
                  class='dm-icon-btn'
                  title={media.isFavourite ? 'Unfavourite' : 'Favourite'}
                  use:click={toggleFavourite}
                  disabled={!Helper.isAniAuth()}
                >
                  <Heart
                    color={media.isFavourite ? '#e60012' : 'currentColor'}
                    fill={media.isFavourite ? '#e60012' : 'transparent'}
                    size='1.4rem'
                  />
                </button>
              {/if}

              <TrailerModal {staticMedia} />
              <AnimeThemesModal {staticMedia} />

              {#if staticMedia.externalLinks?.filter(l => !l.isDisabled).length}
                {@const al = staticMedia.externalLinks.filter(l => !l.isDisabled)}
                {@const official  = al.filter(l => l.type === 'OFFICIAL')}
                {@const streaming = al.filter(l => l.type === 'STREAMING')}
                {@const info      = al.filter(l => l.type === 'INFO')}
                {@const social    = al.filter(l => l.type === 'SOCIAL')}
                {@const other     = al.filter(l => !['OFFICIAL','STREAMING','INFO','SOCIAL'].includes(l.type))}
                <div class='dm-ext-wrap' use:closeOnClickOutside={() => showExternalLinks = false}>
                  <button class='dm-icon-btn' title='External Links' use:click={() => showExternalLinks = !showExternalLinks}>
                    <ExternalLink size='1.2rem' />
                  </button>
                  {#if showExternalLinks}
                    <div class='dm-ext-menu'>
                      {#each [['Official', official], ['Streaming', streaming], ['Info', info], ['Social', social]] as [label, links]}
                        {#if links.length}
                          <div class='dm-ext-label'>{label}</div>
                          {#each links as link}
                            <button class='dm-ext-item' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                              {#if link.icon}<img class='dm-ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1rem' />{/if}
                              <span>{link.site}</span>
                              {#if link.language}<span class='dm-ext-lang'>{link.language}</span>{/if}
                            </button>
                          {/each}
                        {/if}
                      {/each}
                      {#each other as link}
                        <button class='dm-ext-item' use:click={() => { IPC.emit('open', link.url); showExternalLinks = false }}>
                          {#if link.icon}<img class='dm-ext-icon' src={link.icon} alt='' on:error={e => e.currentTarget.style.display='none'} />{:else}<ExternalLink size='1rem' />{/if}
                          <span>{link.site}</span>
                          {#if link.language}<span class='dm-ext-lang'>{link.language}</span>{/if}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              {#if staticMedia.id}
                <button class='dm-icon-btn' title='Open AniList' use:click={() => IPC.emit('open', `https://anilist.co/anime/${staticMedia.id}`)}>
                  <img class='dm-site-icon' src='./anilist_icon.png' alt='Anilist' />
                </button>
              {/if}
              {#if staticMedia.idMal}
                <button class='dm-icon-btn' title='Open MyAnimeList' use:click={() => IPC.emit('open', `https://myanimelist.net/anime/${staticMedia.idMal}`)}>
                  <img class='dm-site-icon' src='./myanimelist_icon.png' alt='MyAnimeList' />
                </button>
              {/if}
            </div>
          </div>

          <Following media={staticMedia} />
        </div>
      </div>
    </div>
    <!-- ════ END HERO ════════════════════════════════════════════════════ -->

    <!-- ════ TWO-COLUMN BODY — episodes LEFT (sticky), info RIGHT ════════ -->
    <div class='dm-body' bind:this={container}>

      <!-- ══ EPISODES col ════════════════════════════════════════════════ -->
      <aside class='dm-ep-col'>
        <div class='dm-ep-header'>
          <span class='dm-ep-label'>EPISODES</span>
          {#if episodeList?.length}
            <button
              class='dm-icon-btn dm-ep-order'
              title='Reverse order'
              use:click={() => { episodeOrder = !episodeOrder }}
            >
              <svelte:component this={episodeOrder ? ArrowDown01 : ArrowUp10} size='1.6rem' />
            </button>
          {/if}
        </div>

        <div class='dm-ep-scroll'>
          <EpisodeList
            bind:episodeLoad={episodeLoad}
            media={staticMedia}
            {episodeOrder}
            bind:userProgress
            bind:watched
            episodeCount={getMediaMaxEp(media)}
            {play}
          />
        </div>
      </aside>

      <!-- ══ INFO col ════════════════════════════════════════════════════ -->
      <main class='dm-info-col'>

        <Details media={staticMedia} alt={recommendations} />

        <!-- Tags — pill style matching nav-links from HomePage -->
        <div bind:this={scrollTags} class='dm-tag-rail'>
          {#each staticMedia.tags as tag}
            <span class='dm-tag'>
              <Hash size='1.1rem' />
              <b>{tag.name}</b>
              <span class='dm-tag__pct'>{tag.rank}%</span>
            </span>
          {/each}
        </div>

        <!-- Genres -->
        <div bind:this={scrollGenres} class='dm-tag-rail dm-tag-rail--genre'>
          {#each staticMedia.genres as genre}
            <span class='dm-tag dm-tag--genre'>
              <svelte:component this={genreIcons[genre]} size='1.1rem' />
              {genre}
            </span>
          {/each}
        </div>

        <!-- Synopsis — mirrors .synopsis from HomePage -->
        {#if staticMedia.description}
          <div class='dm-section-label'>SYNOPSIS</div>
          <div class='dm-synopsis select-all'>{@html sanitize(staticMedia.description)}</div>
        {/if}

        <!-- Relations -->
        <ToggleList
          list={staticMedia.relations?.edges?.filter(({ node, relationType }) =>
            relationType !== 'CHARACTER' &&
            node.type === 'ANIME' &&
            node.format !== 'MUSIC' &&
            !(settings.value.adult === 'none' && node.isAdult) &&
            !(settings.value.adult !== 'hentai' && node.genres?.includes('Hentai')) &&
            !missingIds.includes(node.id)
          ).sort((a, b) => (a.node.seasonYear || Infinity) - (b.node.seasonYear || Infinity))}
          promise={searchIDS}
          let:item
          let:promise
          title='Relations'
        >
          {#await promise}
            <div class='small-card'><SmallCardSk /></div>
          {:then res}
            {#if res}
              <div class='small-card'>
                <SmallCard data={item.node} type={item.relationType.replace(/_/g, ' ').toLowerCase()} />
              </div>
            {/if}
          {/await}
        </ToggleList>

        <!-- Recommendations -->
        {#await recommendations then res}
          {@const recMedia = res?.data?.Media}
          {#if recMedia}
            <ToggleList
              list={recMedia.recommendations?.edges?.filter(({ node }) =>
                node.mediaRecommendation &&
                !(settings.value.adult === 'none' && node.mediaRecommendation.isAdult) &&
                !(settings.value.adult !== 'hentai' && node.mediaRecommendation.genres?.includes('Hentai')) &&
                !missingIds.includes(node.mediaRecommendation.id)
              ).sort((a, b) => b.node.rating - a.node.rating)}
              promise={searchIDS}
              let:item
              let:promise
              title='Recommendations'
            >
              {#await promise}
                <div class='small-card'><SmallCardSk /></div>
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

      </main>
    </div>
    <!-- ════ END BODY ═════════════════════════════════════════════════════ -->

  {/if}
</div>

<style>
  /* ─────────────────────────────────────────────────────────────────────
     TOKEN REFERENCE  (mirrors HomePage palette exactly)
     --bg:        #2b2b2b   main dark surface
     --bg-raised: #3c3c3c   card / raised surface
     --accent:    #e60012   Nintendo red
     --cyan:      #00c3e3   focus / hover highlight
     --text:      #ffffff
  ───────────────────────────────────────────────────────────────────── */

  /* ── Root ─────────────────────────────────────────────────────────── */
  .dm-root {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    background: #2b2b2b;        /* matches :global(body) in HomePage    */
    color: #fff;
    font-family: system-ui, sans-serif; /* matches HomePage global font  */
    overflow: hidden;
  }
  .dm-root--show { display: flex; flex-direction: column; }

  /* ── Close — same visual as .brand pill ──────────────────────────── */
  .dm-close {
    position: fixed;
    top: 1rem; right: 1.2rem;
    z-index: 999;
    background: rgba(0,0,0,0.55);
    border: none;
    color: #fff;
    font-size: 1.9rem;
    font-weight: 900;
    width: 3.4rem; height: 3.4rem;
    border-radius: 50px;
    cursor: pointer;
    line-height: 1;
    transition: background 0.13s, transform 0.1s;
    backdrop-filter: blur(8px);
  }
  .dm-close:hover { background: #e60012; transform: scale(1.08); }

  /* ── HERO ─────────────────────────────────────────────────────────── */
  .dm-hero {
    position: relative;
    flex-shrink: 0;
    width: 100%;
    min-height: 34vh;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    background: #2b2b2b;
  }

  /* bg image — grayscale + low opacity, same as .bg-image in HomePage  */
  :global(.dm-hero__bg) {
    position: absolute !important;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover;
    object-position: center 20%;
    filter: grayscale(20%) opacity(0.45);
    pointer-events: none;
  }

  /* vignette — matches .vignette + .curse-overlay from HomePage         */
  .dm-hero__vignette {
    position: absolute; inset: 0;
    background:
      linear-gradient(to top,  #2b2b2b 18%, transparent 100%),
      linear-gradient(to right, #2b2b2b 8%, transparent 55%);
    pointer-events: none;
  }

  .dm-hero__body {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: flex-end;
    gap: 2rem;
    padding: 2rem 3% 1.6rem;
    width: 100%;
  }

  /* Cover art */
  .dm-cover {
    flex-shrink: 0;
    position: relative;
    width: clamp(96px, 11vw, 160px);
    aspect-ratio: 2/3;
    border-radius: 12px;          /* same as .card-unit radius           */
    overflow: hidden;
    box-shadow: 0 10px 30px rgba(0,0,0,0.7);
  }
  :global(.dm-cover__img) {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover;
  }

  .dm-hero__info { flex: 1; min-width: 0; }

  /* Title — .hero-title from HomePage */
  .dm-title {
    font-size: clamp(1.8rem, 3.5vw, 3.2rem);
    font-weight: 900;
    line-height: 0.95;
    letter-spacing: -2px;
    text-transform: uppercase;
    margin: 0 0 1.2rem;
    color: #fff;
    text-shadow: 0 2px 16px rgba(0,0,0,0.8);
  }

  /* Stat grid — .stat-grid from HomePage */
  .dm-stat-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 2rem;
    margin-bottom: 1.4rem;
    background: rgba(0,0,0,0.4);
    padding: 1rem 1.8rem;
    border-radius: 12px;
    width: fit-content;
    border: 1px solid rgba(255,255,255,0.05);
  }
  .dm-stat { display: flex; flex-direction: column; }
  .dm-stat__label {
    font-size: 0.68rem;
    font-weight: 800;
    opacity: 0.55;
    letter-spacing: 0.12em;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
  }
  .dm-stat__value {
    font-size: 1.3rem;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  /* CTA row — .cta-row from HomePage */
  .dm-cta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 1.2rem;
    margin-bottom: 0.8rem;
  }

  /* Play button — .btn-play from HomePage */
  .dm-btn-play {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    background: #e60012;
    color: #fff;
    border: 3px solid transparent;
    border-radius: 50px;
    padding: 0.9rem 2.6rem;
    font-weight: 900;
    font-size: 0.95rem;
    letter-spacing: 0.05em;
    cursor: pointer;
    text-transform: uppercase;
    transition: transform 0.1s, border-color 0.1s;
    white-space: nowrap;
  }
  .dm-btn-play:hover:not(:disabled) { transform: scale(1.05); border-color: #fff; }
  .dm-btn-play:disabled { opacity: 0.35; cursor: not-allowed; }

  /* Icon cluster — .icon-btn from HomePage */
  .dm-icon-cluster {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
  }
  .dm-icon-btn {
    background: rgba(255,255,255,0.12);
    border-radius: 50%;
    width: 42px; height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    color: #fff;
    opacity: 0.9;
    padding: 0;
    transition: transform 0.1s, color 0.1s, background 0.1s;
    flex-shrink: 0;
  }
  .dm-icon-btn:hover { transform: scale(1.1); color: #e60012; background: rgba(255,255,255,0.18); }
  .dm-site-icon { width: 1.6rem; height: 1.6rem; border-radius: 4px; }

  /* External links dropdown */
  .dm-ext-wrap { position: relative; }
  .dm-ext-menu {
    position: absolute;
    bottom: calc(100% + 0.5rem);
    left: 0;
    z-index: 200;
    min-width: 17rem;
    background: #3c3c3c;          /* .bg-raised surface                 */
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 0.5rem 0;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
  }
  .dm-ext-label {
    padding: 0.45rem 1.1rem 0.1rem;
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    opacity: 0.45;
  }
  .dm-ext-item {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.48rem 1.1rem;
    border: none;
    background: none;
    color: #fff;
    font-size: 1.2rem;
    font-weight: 700;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .dm-ext-item:hover { background: rgba(255,255,255,0.07); color: #00c3e3; }
  .dm-ext-icon { width: 1.4rem; height: 1.4rem; border-radius: 3px; object-fit: contain; }
  .dm-ext-lang { margin-left: auto; font-size: 0.75rem; opacity: 0.45; }

  /* ─────────────────────────────────────────────────────────────────────
     TWO-COLUMN BODY
  ───────────────────────────────────────────────────────────────────── */
  .dm-body {
    flex: 1;
    display: grid;
    grid-template-columns: 400px 1fr;
    grid-template-areas: 'ep info';
    overflow: hidden;
    min-height: 0;
  }

  /* ── EPISODES col ─────────────────────────────────────────────────── */
  aside.dm-ep-col {
    grid-area: ep;
    display: flex;
    flex-direction: column;
    background: #222;             /* slightly darker than #2b2b2b        */
    border-right: 2px solid rgba(255,255,255,0.05); /* .header border    */
    overflow: hidden;
  }

  .dm-ep-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.1rem 1.6rem 0.9rem;
    border-bottom: 2px solid rgba(255,255,255,0.05);
    background: #222;
  }

  /* label — .nav-item active uppercase tracking style */
  .dm-ep-label {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #e60012;               /* accent — mirrors .section-toggle    */
  }

  .dm-ep-order {
    background: rgba(255,255,255,0.07);
    border-radius: 50px;          /* pill — matches .brand / nav-links   */
    width: auto;
    height: auto;
    padding: 6px 14px;
    border: 1px solid rgba(255,255,255,0.08);
  }
  .dm-ep-order:hover { background: rgba(255,255,255,0.14); color: #fff; transform: none; }

  .dm-ep-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 0.3rem 0;
  }
  .dm-ep-scroll::-webkit-scrollbar { width: 3px; }
  .dm-ep-scroll::-webkit-scrollbar-track { background: transparent; }
  .dm-ep-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  /* ── INFO col ─────────────────────────────────────────────────────── */
  main.dm-info-col {
    grid-area: info;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.8rem 3% 4rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  main.dm-info-col::-webkit-scrollbar { width: 3px; }
  main.dm-info-col::-webkit-scrollbar-track { background: transparent; }
  main.dm-info-col::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

  /* Section label — same pattern as .stat .label */
  .dm-section-label {
    font-size: 0.7rem;
    font-weight: 800;
    opacity: 0.5;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 1.8rem 0 0.7rem;
    padding-left: 0.1rem;
  }

  /* Synopsis — .synopsis from HomePage */
  .dm-synopsis {
    font-size: 1.1rem;
    line-height: 1.62;
    opacity: 0.92;
    background: rgba(0,0,0,0.4);
    padding: 1.2rem 1.8rem;
    border-radius: 12px;
    margin-bottom: 0.5rem;
  }

  /* Tag / genre pills — .nav-links pill wrap from HomePage */
  .dm-tag-rail {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.8rem 0 0.1rem;
  }
  .dm-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 5px 14px;
    border-radius: 50px;          /* pill — matches nav-links            */
    background: rgba(0,0,0,0.3);
    border: 1px solid rgba(255,255,255,0.07);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #ccc;
    white-space: nowrap;
    transition: background 0.12s, color 0.12s;
  }
  .dm-tag:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .dm-tag b { font-weight: 900; }
  .dm-tag__pct { opacity: 0.4; font-weight: 700; font-size: 0.7rem; }
  .dm-tag--genre {
    background: rgba(230,0,18,0.1);
    border-color: rgba(230,0,18,0.25);
    color: #ff8a91;
  }
  .dm-tag--genre:hover { background: rgba(230,0,18,0.2); color: #fff; }

  /* Small card shells (unchanged API) */
  .small-card { display: inline-block; }

  /* ── Focus ring — matches :global(*:focus-visible) in HomePage ─────── */
  :global(.dm-root *:focus-visible) {
    outline: 4px solid #00c3e3;
    outline-offset: 2px;
    border-radius: 8px;
  }
  :global(.dm-root *:focus:not(:focus-visible)) { outline: none; }

  /* ── Responsive ───────────────────────────────────────────────────── */
  @media (max-width: 860px) {
    .dm-body {
      grid-template-columns: 1fr;
      grid-template-areas: 'ep' 'info';
      overflow: visible;
      flex: none;
    }
    aside.dm-ep-col {
      max-height: 52vh;
      border-right: none;
      border-bottom: 2px solid rgba(255,255,255,0.05);
    }
    main.dm-info-col { overflow: visible; }
    .dm-root { overflow-y: auto; }
    .dm-hero__body { flex-direction: column; align-items: flex-start; gap: 1rem; padding: 1.4rem 4% 1rem; }
    .dm-cover { width: clamp(80px, 20vw, 120px); }
    .dm-stat-grid { gap: 1.5rem; padding: 0.9rem 1.4rem; }
  }

  @media (max-width: 520px) {
    .dm-title { font-size: 1.7rem; letter-spacing: -1px; }
    main.dm-info-col { padding: 1.2rem 4% 3rem; }
  }
</style>