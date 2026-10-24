<script>
  import { settings } from '@/modules/settings.js'
  import { cache, caches, mediaCache } from '@/modules/cache.js'
  import { page, modal, playPage } from '@/modules/navigation.js'
  import { getAnimeProgress, setAnimeProgress } from '@/modules/anime/animeprogress.js'
<<<<<<< HEAD
  import { playAnime, autoStageNext } from '@/modals/torrent/TorrentModal.svelte'
  import { anilistClient } from '@/modules/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import AnimeResolver from '@/modules/anime/animeresolver.js'
  import { durationMap, getMediaMaxEp } from '@/modules/anime/anime.js'
  import { createEventDispatcher } from 'svelte'
  import { fade } from 'svelte/transition'
  import Subtitles from '@/modules/subtitles.js'
  import { toTS, fastPrettyBytes, matchPhrase, videoRx, isValidNumber, debounce } from '@/modules/util.js'
  import { toast } from 'svelte-sonner'
  import { getChaptersAniSkip } from '@/modules/anime/anime.js'
  import { mediaCache } from '@/modules/cache.js'
=======
  import { playAnime } from '@/modals/torrent/TorrentModal.svelte'
  import { anilistClient } from '@/modules/providers/anilist/anilist.js'
  import { episodesList } from '@/modules/episodes.js'
  import AnimeResolver from '@/modules/anime/animeresolver.js'
  import { durationMap, getMediaMaxEp } from '@/modules/anime/anime.js'
  import { createEventDispatcher, onMount } from 'svelte'
  import Subtitles from '@/modules/player/subtitles.js'
  import PiP from '@/modules/player/pip.js'
  import HoldSpeed from '@/modules/player/holdspeed.js'
  import Thumbnails from '@/modules/player/thumbnails.js'
  import Chapters from '@/modules/player/chapters.js'
  import Volume from '@/modules/player/volume.js'
  import { updateDiscordRPC, screenshot, trackLabel } from '@/modules/player/util.js'
  import { toTS, matchPhrase, videoRx, isValidNumber, debounce } from '@/modules/util.js'
  import { toast } from '@/modules/lib/toast.js'
>>>>>>> shiru-base-copy
  import Seekbar from '@/routes/player/components/Seekbar.svelte'
  import Stats, { stats, toggleStats } from '@/routes/player/components/Stats.svelte'
  import TorrentStats from '@/routes/player/components/TorrentStats.svelte'
  import { click } from '@/modules/lib/click.js'
  import VideoDeband from 'video-deband'
  import NestedDropdown from '@/components/overlays/NestedDropdown.svelte'
  import Helper from '@/modules/providers/helper.js'

  import { w2gEmitter, state } from '@/routes/w2g/WatchTogetherPage.svelte'
  import ManagerModal from '@/modals/manager/ManagerModal.svelte'
  import Keybinds, { loadWithDefaults, condition } from 'svelte-keybinds'
  import { SUPPORTS } from '@/modules/support.js'
  import 'rvfc-polyfill'
<<<<<<< HEAD
  import { IPC, ELECTRON, ANDROID } from '@/modules/bridge.js'
  import WPC from '@/modules/wpc.js'
  import { X, Minus, ArrowDown, ArrowUp, Captions, CircleHelp, Contrast, FastForward, Keyboard, EllipsisVertical, SquareArrowOutUpRight, List, Eye, EyeOff, FilePlus2, ListMusic, ListVideo, Maximize, Minimize, Pause, PictureInPicture, PictureInPicture2, Play, Proportions, RefreshCcw, Rewind, RotateCcw, RotateCw, ScreenShare, SkipBack, SkipForward, Users, Volume1, Volume2, VolumeX, SlidersVertical, SquarePen, Milestone, ClockArrowDown, ClockArrowUp,FolderOpen, Download } from 'lucide-svelte'
  import { jimakuClient } from '@/modules/jimaku.js'
  import SoftModal from '@/components/modals/SoftModal.svelte'
  import EpisodePanel from '@/components/EpisodePanel.svelte'
=======
  import { ELECTRON, ANDROID, TORRENT } from '@/modules/bridge.js'
  import { unload } from '@/modules/torrent.js'
  import { Settings, Gauge, Timer, X, Minus, Captions, CaptionsOff, CircleHelp, Contrast, FastForward, Keyboard, EllipsisVertical, SquareArrowOutUpRight, List, Eye, FilePlus2, ListMusic, ListVideo, Maximize, Minimize, Pause, PictureInPicture, PictureInPicture2, Play, Proportions, RefreshCcw, Rewind, RotateCcw, RotateCw, ScreenShare, SkipBack, SkipForward, Volume1, Volume2, VolumeX, SlidersVertical, SquarePen, Milestone, ClockArrowDown, ClockArrowUp } from 'lucide-svelte'
>>>>>>> shiru-base-copy
  import Debug from 'debug'
  const debug = Debug('ui:player')

  const emit = createEventDispatcher()

  w2gEmitter.addEventListener('playerupdate', ({ detail }) => {
    currentTime = detail.time
    paused = detail.paused
  })
  w2gEmitter.addEventListener('setindex', ({ detail }) => {
    playFile(detail)
  })

  export function playFile (file) {
    if (isValidNumber(file)) handleCurrent(videos?.[file])
    else handleCurrent(file)
  }

  function updatew2g () {
    saveAnimeProgress()
    w2gEmitter.dispatchEvent(new CustomEvent('player', { detail: { time: Math.floor(currentTime), paused } }))
  }

  export let miniplayer = false
  $: viewAnime = $modal[modal.ANIME_DETAILS]
  $condition = () => SUPPORTS.keybinds && $page === page.PLAYER && (((!miniplayer && (!$modal || !modal.length) && !document.querySelector('.modal.show') && (!SUPPORTS.isAndroid || immersed))) || viewAnime)

  export let files = []
  export let playableFiles = []
  export let updateCurrent
  export let paused = true
  export let miniplayerShelved = false
  $: updateFiles(files)
  let src = null
  let video = null
  let container = null
  let current = null
  const errorToasts = new Set()
  let subs = null
  let chapters = null
  let duration = 0.1
  let wasPaused = null
  let seeking = false
  let videos = []
  let immersed = false
  let buffering = false
  let immerseTimeout = null
  let bufferTimeout = null
  let subHeaders = null
<<<<<<< HEAD
  let jimakuShow = false
  let jimakuFiles = []
  let pip = false
  // const presentationRequest = null
  // const presentationConnection = null
  // const canCast = false
  let isFullscreen = false
  let ended = false
  let gain = 0
  let volume = Number(cache.getEntry(caches.GENERAL, 'volume')) || 1
  let volumeBoosted = false
  let volumeLimit = 1
  let volumeText = ''
  let volumeVisible = false
  let volumeTimeout
  let subText = ''
  let subVisible = false
  let subTimeout
  let wheelAccumulator = 0
  let boostScrollCount = 0
  let boostResetTimer = null
  let audioCtx = null
  let source = null
  let gainNode = null
=======
  let appActive = true
  let isFullscreen = false
  let ended = false
>>>>>>> shiru-base-copy
  let playbackRate = 1
  let showEpisodes = false
  let externalPlayerReady = false
  let launchedExternal = false
  $: externalPlayback = ($settings.enableExternal || launchedExternal) && (SUPPORTS.isAndroid || $settings.playerPath)
  $: safeduration = externalPlayback ? ((current?.media?.media?.duration || (current?.media?.media?.format && durationMap[current?.media?.media?.format]) || 24) * 60) : (isFinite(duration) ? duration : currentTime)
  $: {
    if (hidden) setDiscordRPC(media, video?.currentTime)
    else setDiscordRPC(media, (paused && ($page !== page.PLAYER)))
  }
  function setDiscordRPC (np = media, browsing) {
    updateDiscordRPC(np, browsing, { hidden, safeduration, targetTime, paused, w2g: state.value?.code })
  }

  const pictureInPicture = new PiP(resetImmerse)
  const holdSpeed = new HoldSpeed(playPause)
  const thumbnails = new Thumbnails()
  const volume = new Volume()

  window.addEventListener('fileEdit', () => {
    if (current) {
      debug('Detected a user update to the parsed file(s), now updating the media...')
      const index = videos.indexOf(current)
      updateCurrent({ detail: current })
      current = videos[index]
    }
  })

  function dismissErrorToasts() {
    for (const id of errorToasts) toast.dismiss(id, { silent: true })
    errorToasts.clear()
  }

  function checkAudio () {
    volume.restore(video, media)
    if ('audioTracks' in HTMLVideoElement.prototype) {
      if (src && !video.audioTracks.length) {
        errorToasts.add(toast.error('Audio Codec Unsupported', {
          description: "This torrent's audio codec is not supported, try a different release by disabling Autoplay Torrents in RSS settings.",
          force: true
        }))
      } else if (src && video.audioTracks.length > 1) {
        const preferredTrack = [...video.audioTracks].find(({ language }) => language === $settings.audioLanguage)
        if (preferredTrack) return selectAudio(preferredTrack.id)

        const japaneseTrack = [...video.audioTracks].find(({ language }) => language === 'jpn')
        if (japaneseTrack) return selectAudio(japaneseTrack.id)
      }
    }
  }

  const updateSubs = debounce((delayChanged = false) => {
    if (!subs?.renderer) return
    subs.renderer.resize()
    if (delayChanged) subs.renderer._timeupdate({ type: 'seeking' })
  }, 200) // stupid fix (resize) because video metadata doesn't update for multiple frames
  function setLastSubtitle(label) {
    cache.setEntry(caches.HISTORY, 'lastSubtitle', { ...(cache.getEntry(caches.HISTORY, 'lastSubtitle') || {}), [media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name]: label })
  }
  function checkSubtitle() {
    const lastSubtitle = cache.getEntry(caches.HISTORY, 'lastSubtitle')?.[`${media?.media?.id || media?.title || media?.parseObject?.title || media?.parseObject?.file_name}`]
    if (subHeaders?.length && lastSubtitle) {
      if (lastSubtitle === 'OFF') {
        subs.selectCaptions(-1)
        updateSubs()
      } else {
        for (const track of subHeaders) {
          if (!track) continue
          const trackName = trackLabel(track, subHeaders)
          if (matchPhrase(lastSubtitle, trackName, trackName?.length > 10 ? 3 : 2, true) && track?.number) {
            subs.selectCaptions(track.number)
            updateSubs()
            break
          }
        }
      }
    }
  }

<<<<<<< HEAD
  async function exploreJimaku () {
    if (!media?.media?.id) {
      toast.error('No Media ID', { description: 'Unable to find media ID for Jimaku search' })
      return
    }
    if (!settings.value.jimakuKey) {
      toast.error('No API Key', { description: 'Please configure your Jimaku API key in Settings' })
      return
    }
    jimakuShow = true
    try {
      const search = await jimakuClient.search({ anilist_id: media.media.id })
      const entry = search?.[0]
      if (!entry) {
        jimakuFiles = []
        return
      }
      const files = await jimakuClient.getFiles(entry.id, { episode: media.episode })
      jimakuFiles = files || []
    } catch (err) {
      toast.error('Jimaku Error', { description: err.message })
      jimakuFiles = []
    }
  }
  async function downloadJimakuFile (file) {
    try {
      const response = await fetch(file.url)
      const blob = await response.blob()
      const subtitleFile = new File([blob], file.name, { type: 'application/x-subrip' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(subtitleFile)
      window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer }))
      toast.success('Subtitles Loaded', { description: file.name })
      closeJimaku()
    } catch (err) {
      toast.error('Download Error', { description: err.message })
    }
  }
  function closeJimaku () {
    jimakuShow = false
    jimakuFiles = []
  }

  // if ('PresentationRequest' in window) {
  //   const handleAvailability = aval => {
  //     canCast = !!aval
  //   }
  //   presentationRequest = new PresentationRequest(['build/cast.html'])
  //   presentationRequest.addEventListener('connectionavailable', e => initCast(e))
  //   navigator.presentation.defaultRequest = presentationRequest
  //   presentationRequest.getAvailability().then(aval => {
  //     aval.onchange = e => handleAvailability(e.target.value)
  //     handleAvailability(aval.value)
  //   })
  // }

=======
>>>>>>> shiru-base-copy
  // document.fullscreenElement isn't reactive
  let orientationLockable = true // might as well stop trying to lock the orientation when the device doesn't support it.
  document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement
    if (document.fullscreenElement) {
      if (SUPPORTS.isAndroid) window.AndroidFullScreen?.immersiveMode()
      if (orientationLockable) screen.orientation.lock('landscape').then(success => debug(success), failure => { if (!failure?.toString()?.includes('NotSupportedError')) { debug(failure) } else { orientationLockable = false } })
    } else {
      if (SUPPORTS.isAndroid) {
        window.AndroidFullScreen?.showSystemUI()
        ANDROID.hideStatusBar()
      }
      if (orientationLockable) screen.orientation.unlock()
    }
  })

  function handleHeaders () {
    subHeaders = subs?.headers
  }

  function updateFiles (files) {
    if (files?.length) {
      videos = files.filter(file => videoRx.test(file.name))
      if (videos?.length) {
        if (subs) {
          subs.files = files || []
        }
      }
    } else {
      dismissErrorToasts()
      holdSpeed.reset()
      src = ''
      buffering = true
      current = null
      currentTime = 0
      targetTime = 0
      if (subs) {
        subs.destroy()
        subs = null
      }
      if (chapters) {
        chapters.destroy()
        chapters = null
      }
    }
  }

  /**
   * @type {VideoDeband}
   */
  let deband

  function loadDeband (load, video) {
    if (!video) return
    if (load && !deband) {
      deband = new VideoDeband(video)
      deband.canvas.classList.add('deband-canvas')
      video.before(deband.canvas)
    } else if (!load && deband) {
      deband.destroy()
      deband.canvas.remove()
      deband = null
    }
  }
  $: loadDeband($settings.playerDeband, video)

  async function handleCurrent (file) {
    dismissErrorToasts()
    holdSpeed.reset()
    paused = true
    canPlay = false
    video?.pause?.()
    externalPlayerReady = false
    showBuffering()
    if (file) {
      thumbnails.clear()
      currentTime = 0
      targetTime = 0
      skipNextProgress = false
      currentSkippable = null
      completed = false
      subDelay = 0
      subDelayText = ''
      if (subs) {
        subs.destroy()
        subs = null
      }
      if (chapters) {
        chapters.destroy()
        chapters = null
      }
      current = file
      setCurrent(file)
    }
  }

  async function setCurrent(file, launchExternal = false) {
    if ((externalPlayback || launchExternal) && document.fullscreenElement) document.exitFullscreen()
    if (!externalPlayback) {
      src = file.url
      if (!launchExternal) {
        chapters = new Chapters()
        subs = new Subtitles(video, files, current, handleHeaders)
        video.load()
        await loadAnimeProgress()
      } else video.load()
    } else externalPlaying = false
    emit('current', current) // #handleCurrent in MediaHandler
    if (externalPlayback) {
      TORRENT.onExternalReady(() => {
        hideBuffering()
        externalPlayerReady = true
        setTimeout(() => {
          if (externalPlayerReady && !externalPlaying) autoPlay()
        }, 1_500)
      })
    }
    paused = true
    if (!launchExternal) {
      currentTime = 0
      targetTime = 0
    }
    launchedExternal = launchExternal
    TORRENT.setPlayback(file, settings.value.enableExternal || launchExternal)
  }

  export let media

  $: checkAvail(media, current)
  let hasNext = false
  let hasLast = false
  function hasNextEpisode() {
    return media?.media && (media?.media?.nextAiringEpisode?.episode - 1 || (media?.media?.episodes || getMediaMaxEp(media?.media)) > media?.episode)
  }
  function checkAvail (media, current) {
    if ((((media?.media?.nextAiringEpisode?.episode - 1 || getMediaMaxEp(media?.media)) - (media?.zeroEpisode ? 1 : 0)) > media?.episode) || ((media?.media && !media.media.nextAiringEpisode?.episode && !media.media.airingSchedule?.nodes?.[0]?.episode && !media.media.episodes))) hasNext = true
    else hasNext = videos.indexOf(current) !== videos.length - 1
    if (media?.media && (media?.episode > 1 || (media?.zeroEpisode && media?.episode === 1))) hasLast = true
    else hasLast = videos.indexOf(current) > 0
  }

  async function loadAnimeProgress () {
    let animeProgress
    if (!current?.media?.media?.id || !isValidNumber(current?.media?.episode) || current?.media?.failed || !media?.media?.id || !isValidNumber(media?.episode)) animeProgress = await getAnimeProgress({ name: current?.media?.parseObject?.anime_title ? (current?.media?.parseObject?.anime_title + ((media?.season || current?.media?.parseObject?.anime_season ? ` S${media?.season || current?.media?.parseObject?.anime_season}` : '') + ((media?.episode || current?.media?.parseObject?.episode_number ? ` E${media?.episode || current?.media?.parseObject?.episode_number}` : '')))) : current?.name })
    else animeProgress = await getAnimeProgress({ name: current?.media?.parseObject?.anime_title ? (current?.media?.parseObject?.anime_title + ((media?.season || current?.media?.parseObject?.anime_season ? ` S${media?.season || current?.media?.parseObject?.anime_season}` : '') + ((media?.episode || current?.media?.parseObject?.episode_number ? ` E${media?.episode || current?.media?.parseObject?.episode_number}` : '')))) : current?.name, mediaId: current.media.media.id, episode: current.media.episode })
    if (!animeProgress) return

    skipNextProgress = true
    const currentTime = Math.max(animeProgress.currentTime - 5, 0) // Load 5 seconds before
    seek(currentTime - video.currentTime)
  }

  let skipNextProgress = false
  function saveAnimeProgress (error = false) {
    if (!error && (buffering || video.readyState < 4)) return
    if (skipNextProgress) {
      skipNextProgress = false
      return
    }
    if (error) {
      currentTime = 0
      targetTime = 0
      video.currentTime = targetTime
    }
    if (!current?.media?.media?.id || !isValidNumber(current?.media?.episode) || current?.media?.failed || !media?.media?.id || !isValidNumber(media?.episode)) setAnimeProgress({ name: current?.media?.parseObject?.anime_title ? (current?.media?.parseObject?.anime_title + ((media?.season || current?.media?.parseObject?.anime_season ? ` S${media?.season || current?.media?.parseObject?.anime_season}` : '') + ((media?.episode || current?.media?.parseObject?.episode_number ? ` E${media?.episode || current?.media?.parseObject?.episode_number}` : '')))) : current?.name, currentTime: video.currentTime, safeduration })
    else setAnimeProgress({ mediaId: current.media.media.id, episode: current.media.episode, currentTime: video.currentTime, safeduration })
  }
  setInterval(() => {
    if (!paused) saveAnimeProgress()
  }, 10_000)

  function cycleSubtitles () {
    if (current && subs?.headers) {
      const tracks = subs.headers.filter(header => header)
      const index = tracks.indexOf(subs.headers[subs.current]) + 1
<<<<<<< HEAD
      const selectedIndex = index >= tracks.length ? -1 : subs.headers.indexOf(tracks[index])
      subs.selectCaptions(selectedIndex)
      updateSubs()
      const selectedTrack = selectedIndex === -1 ? 'Subtitles Off' : tracks[index]?.name || tracks[index]?.language || 'Subtitle'
      subText = selectedTrack
      subVisible = true
      clearTimeout(subTimeout)
      subTimeout = setTimeout(() => subVisible = false, 1500)
=======
      const newIndex = index >= tracks.length ? -1 : subs.headers.indexOf(tracks[index])
      subs.selectCaptions(newIndex)
      updateSubs()
      setLastSubtitle(newIndex === -1 ? 'OFF' : trackLabel(subs.headers[newIndex], subs.headers))
>>>>>>> shiru-base-copy
    }
  }

  let subDelay = 0
  let subDelayText = ''
  let subDelayVisible = false
  let subDelayTimeout
  $: updateDelay(subDelay)
  function updateDelay(delay) {
    if (subs?.renderer) {
      subs.renderer.timeOffset = Number(delay)
      updateSubs(true)
    }
  }
  function setSubDelay(delay) {
    subDelay = delay
    subDelayText = subDelay > 0 ? `+${subDelay}s` : `${subDelay}s`;
    subDelayVisible = true;
    clearTimeout(subDelayTimeout);
    subDelayTimeout = setTimeout(() => (subDelayVisible = false), 600)
  }

  let currentTime = 0
  let targetTime = 0
  $: targetTime = (!paused && currentTime) || targetTime
  function handleMouseDown ({ detail }) {
    seeking = true
    if (wasPaused == null) {
      wasPaused = paused
      paused = true
    }
    targetTime = detail / 100 * safeduration
  }
  function handleMouseUp () {
    seeking = false
    paused = wasPaused
    wasPaused = null
    currentTime = targetTime
  }
  $: pagePause($page, $playPage, $modal)
  let pagePaused = 0
  function pagePause(_page, _playPage, _modal) {
    if (externalPlayback) return
    if (buffer === 0 && pagePaused) {
      pagePaused = 1
      return
    }
    const updateRequest = _modal[modal.UPDATE_PROMPT]
    const playerPage = _page === page.PLAYER || (!_playPage && updateRequest)
    const playPage = _playPage || updateRequest
    const viewDetails = Object.keys(_modal).length === 1 && _modal[modal.ANIME_DETAILS]
    const overlayCount = Object.keys(_modal).length
    if (!video?.ended) {
      if ((!playerPage || viewDetails || updateRequest) && !paused && playPage && !$pictureInPicture) {
        pagePaused = 2
        playPause()
      } else if (playerPage && paused && pagePaused === 2 && !overlayCount && playPage && !$pictureInPicture) {
        pagePaused = 1
        playPause()
      } else if (overlayCount && ((!viewDetails && !updateRequest && !playerPage) || overlayCount > 1) && !paused && !playPage && !$pictureInPicture) {
        pagePaused = 2
        playPause()
      } else if ((!overlayCount || viewDetails || updateRequest) && paused && pagePaused === 2 && !playPage && !$pictureInPicture) {
        pagePaused = 1
        playPause()
      } else if ((!playerPage || overlayCount) && paused && pagePaused && pagePaused !== 2) {
        pagePaused = 3
      }
    }
    if (!pagePaused) pagePaused = 1
  }
  async function promptFiller () {
    emit('duration', { current, duration })
    const fillerEpisode = await episodesList.getSingleEpisode(media?.media?.idMal, media?.episode)
    filler = fillerEpisode?.filler && 'Filler'
    recap = fillerEpisode?.recap && 'Recap'
    resolvePrompt = current?.failed || current?.media?.failed || current?.parseObject?.failed
    skipPrompt = filler || recap
  }
  async function autoPlay (promptSkip = false) {
    if (!promptSkip) await promptFiller()
    if ((($page === page.PLAYER && modal.length === 0) || $pictureInPicture) && !resolvePrompt && !skipPrompt) {
      if (externalPlayback) playPause()
      else if (!hidden) {
        video.play()
        resetImmerse()
        updateSubs()
      }
    } else if (!externalPlayback) video.pause()
  }

  let externalPlaying = false
  function playPause () {
    if (hidden) return
    if (externalPlayback) {
      const duration = current.media?.media?.duration || durationMap[current.media?.media?.format]
      if (duration) {
        TORRENT.onExternalWatched(watchTime => {
          const watchDuration = duration * 60
          checkCompletionByTime(watchTime, watchDuration)
          currentTime = watchTime > watchDuration ? watchDuration : watchTime
          targetTime = watchTime > watchDuration ? watchDuration : watchTime
          launchedExternal = false
        })
      }
      externalPlaying = true
      if (SUPPORTS.isAndroid) {
        TORRENT.onAndroidExternal(url => {
          const startTime = Date.now()
          const externalWatched = () => {
            const watchTime = (Date.now() - startTime) / 1_000
            const watchDuration = duration * 60
            checkCompletionByTime(watchTime, watchDuration)
            currentTime = watchTime > watchDuration ? watchDuration : watchTime
            targetTime = watchTime > watchDuration ? watchDuration : watchTime
            launchedExternal = false
          }
          ANDROID.launchExternal?.(url)?.then?.(() => externalWatched())
        })
      }
      TORRENT.launchExternal(current)
    } else paused = !paused
    resetImmerse()
    updateSubs()
  }
  let hidden = false
  let visibilityPaused = true
  const handleVisibility = visible => {
    if ($settings.playerPause && !$pictureInPicture) {
      hidden = !visible
      if (!video?.ended) {
        if (hidden) {
          holdSpeed.cancelHold()
          visibilityPaused = paused
          paused = true
        } else if (!visibilityPaused) paused = false
      }
    }
  }
  ELECTRON.isMinimized().then(isMinimized => {
    handleVisibility(!isMinimized)
    ELECTRON.onMinimize(handleVisibility)
  })
  function tryPlayNext () {
    currentSkippable = null
    if ($settings.playerAutoplay && !state.value) playNext()
  }
  function playNext () {
    if (hasNext) {
      const index = videos.indexOf(current)
      if (index + 1 < videos.length) {
        const target = (index + 1) % videos.length
        handleCurrent(videos[target])
        w2gEmitter.dispatchEvent(new CustomEvent('index', { detail: target }))
      } else if (media?.media?.nextAiringEpisode?.episode - 1 || ((media?.media?.episodes || getMediaMaxEp(media?.media)) > media?.episode)) {
        playAnime(media.media, media.episode + 1)
      }
    }
  }
  function playLast () {
    if (hasLast) {
      const index = videos.indexOf(current)
      if (index > 0) {
        handleCurrent(videos[index - 1])
        w2gEmitter.dispatchEvent(new CustomEvent('index', { detail: index - 1 }))
      } else if (media?.episode > 1 || (media?.zeroEpisode && media?.episode === 1)) {
        playAnime(media.media, media.episode - 1)
      }
    }
  }
  function handleWheel(event) {
<<<<<<< HEAD
    if (viewAnime) return
    if (event.target.closest?.('.episodes-panel')) return
=======
    const onPlayerPage = $page === page.PLAYER
    const onDropdown = event.target?.closest('.dropdown') || event.target?.closest('.nd-panel') // checks for dropdowns like subtitles or audio tracks as they can be scrollable.
    const onOverflow = event.target?.closest('.overflow-auto') || event.target?.closest('.overflow-y-auto') || event.target?.closest('.overflow-y-scroll') // checks for potentially scrollable containers
    const hasFileModal = modal.exists(modal.FILE_MANAGER) || modal.exists(modal.FILE_EDITOR)
    if (onPlayerPage ? hasFileModal || onDropdown || onOverflow || (modal.length && miniplayerShelved) : !miniplayer || miniplayerShelved) return
>>>>>>> shiru-base-copy
    event.preventDefault()
    volume.handleWheel(event, video, media)
  }
  function toggleFullscreen () {
    if (!externalPlayback) document.fullscreenElement ? document.exitFullscreen() : document.querySelector('.page-wrapper').requestFullscreen()
  }
  function skip () {
    const current = chapters?.findChapter(currentTime)
    if (current) {
      if (!chapters?.isChapterSkippable(current) && ((current.end - current.start) / 1_000) > 100) {
        currentTime = currentTime + 85
      } else {
        const endtime = current.end / 1_000
        if ((safeduration - endtime | 0) === 0 && hasNext && settings.value.playerAutoplay) return playNext()
        currentTime = endtime
        currentSkippable = null
      }
    } else if (currentTime < 10) {
      currentTime = 90
    } else if (safeduration - currentTime < 90) {
      currentTime = safeduration
    } else {
      currentTime = currentTime + 85
    }
    targetTime = currentTime
    video.currentTime = targetTime
  }
  function seek (time) {
    if (externalPlayback) return
    currentTime = currentTime + time
    targetTime = currentTime
    video.currentTime = targetTime
  }
  function forward () {
    seek(settings.value.playerSeek)
  }
  function rewind () {
    seek(-settings.value.playerSeek)
  }
  function selectAudio (id) {
    if (id != null) {
      if (Array.from(video.audioTracks).find(track => track.enabled)?.id === id) return
      for (const track of video.audioTracks) track.enabled = track.id === id
      seek(-0.2) // stupid fix because video freezes up when changing tracks
    }
  }
  function selectVideo (id) {
    if (id != null) {
      if (Array.from(video.videoTracks).find(track => track.selected)?.id === id) return
      for (const track of video.videoTracks) track.selected = track.id === id
      updateSubs()
    }
  }
  let fitWidth = settings.value.playerCoverVideo ?? false
  function toggleFitWidth(value = fitWidth) {
    fitWidth = !value
    $settings.playerCoverVideo = fitWidth
    return value
  }

  function handlePlayerClick(event) {
    if (holdSpeed.consumeClick(event.currentTarget)) return
    if ($page === page.PLAYER && modal.length === 0) playPause()
    else if (!miniplayerShelved) page.navigateTo(page.PLAYER)
  }

  function handleMobilePlayerClick(event) {
    if (holdSpeed.consumeClick(event.currentTarget)) return
    toggleImmerse()
  }
<<<<<<< HEAD
  let fitWidth = cache.getEntry(caches.GENERAL, 'fitWidth') === 'true'
=======

  function handleMiniplayerClick(event) {
    if (holdSpeed.consumeClick(event.currentTarget)) return
    page.navigateTo(page.PLAYER)
  }

>>>>>>> shiru-base-copy
  let showKeybinds = false
  let showTorrentStats = false
  let contextMenu = false
  let contextMenuX = 0
  let contextMenuY = 0
  function handleContextMenu(e) {
    contextMenu = true
    const w = 260
    const h = 380
    contextMenuX = Math.min(e.clientX, window.innerWidth - w)
    contextMenuY = Math.min(e.clientY, window.innerHeight - h)
  }

  $: animeAccent = media?.media?.coverImage?.color || '#888888'

  loadWithDefaults({
    KeyX: {
      fn: () => !viewAnime && screenshot(video, subs),
      id: 'screenshot_monitor',
      icon: ScreenShare,
      type: 'icon',
      desc: 'Save Screenshot to Clipboard'
    },
    KeyI: {
      fn: () => !viewAnime && toggleStats(),
      icon: List,
      id: 'list',
      type: 'icon',
      desc: 'Toggle Stats'
    },
    KeyO: {
      fn: () => { if (media?.media) modal.toggle(modal.ANIME_DETAILS, media.media) },
      icon: Eye,
      id: 'eye',
      type: 'icon',
      desc: 'Toggle Now Playing'
    },
    KeyH: {
      fn: () => {
        if (!viewAnime) {
          resolvePrompt = false
          modal.toggle(modal.FILE_MANAGER)
        }
      },
      icon: SquarePen,
      id: 'squarepen',
      type: 'icon',
      desc: 'Toggle File Manager'
    },
    Backquote: {
      fn: () => !viewAnime && (showKeybinds = !showKeybinds),
      id: 'help_outline',
      icon: CircleHelp,
      type: 'icon',
      desc: 'Toggle Keybinds'
    },
    Space: {
      fn: event => !viewAnime && holdSpeed.handleKeyDown(event),
      id: 'play_arrow',
      icon: Play,
      type: 'icon',
      desc: 'Play/Pause / Hold to Speed Up'
    },
    KeyN: {
      fn: () => !viewAnime && playNext(),
      id: 'skip_next',
      icon: SkipForward,
      type: 'icon',
      desc: 'Next Episode'
    },
    KeyB: {
      fn: () => !viewAnime && playLast(),
      id: 'skip_previous',
      icon: SkipBack,
      type: 'icon',
      desc: 'Previous Episode'
    },
    KeyA: {
      fn: () => !viewAnime && ($settings.playerDeband = !$settings.playerDeband),
      id: 'deblur',
      icon: Contrast,
      type: 'icon',
      desc: 'Toggle Video Debanding'
    },
    KeyM: {
      fn: () => !viewAnime && volume.toggleMute() && volume.showTemporarily(),
      id: 'volume_off',
      icon: VolumeX,
      type: 'icon',
      desc: 'Toggle Mute'
    },
    KeyP: {
      fn: () => !viewAnime && pictureInPicture.togglePopout(),
      id: 'picture_in_picture',
      icon: PictureInPicture2,
      type: 'icon',
      desc: 'Toggle Picture in Picture'
    },
    KeyF: {
      fn: () => !viewAnime && toggleFullscreen(),
      id: 'fullscreen',
      icon: Maximize,
      type: 'icon',
      desc: 'Toggle Fullscreen'
    },
    KeyS: {
      fn: () => !viewAnime && skip(),
      id: '+90',
      desc: 'Skip Intro/90s'
    },
    KeyW: {
<<<<<<< HEAD
      fn: () => !viewAnime && (fitWidth = !fitWidth, cache.setEntry(caches.GENERAL, 'fitWidth', String(fitWidth))),
=======
      fn: () => !viewAnime && toggleFitWidth(),
>>>>>>> shiru-base-copy
      id: 'fit_width',
      icon: Proportions,
      type: 'icon',
      desc: 'Toggle Video Cover'
    },
    KeyC: {
      fn: () => !viewAnime && cycleSubtitles(),
      id: 'subtitles',
      icon: Captions,
      type: 'icon',
      desc: 'Cycle Subtitles'
    },
    KeyV: {
      fn: () => !viewAnime && volume.toggleGain(video, media) && volume.showTemporarily(),
      id: 'toggle_gain',
      icon: SlidersVertical,
      type: 'icon',
      desc: 'Toggle Volume Limit Increase'
    },
    ArrowLeft: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        rewind()
      },
      id: 'fast_rewind',
      icon: Rewind,
      type: 'icon',
      desc: 'Rewind'
    },
    ArrowRight: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        forward()
      },
      id: 'fast_forward',
      icon: FastForward,
      type: 'icon',
      desc: 'Seek'
    },
    ArrowUp: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        volume.adjust(0.05, media)
      },
      id: 'volume_up',
      icon: Volume2,
      type: 'icon',
      desc: 'Volume Up'
    },
    ArrowDown: {
      fn: e => {
        if (viewAnime) return
        e.stopImmediatePropagation()
        e.preventDefault()
        volume.adjust(-0.05, media)
      },
      id: 'volume_down',
      icon: Volume1,
      type: 'icon',
      desc: 'Volume Down'
    },
    BracketLeft: {
      fn: () => !viewAnime && !externalPlayback && (playbackRate = (video.defaultPlaybackRate = Math.max(0.1, Number((video.defaultPlaybackRate - 0.1).toFixed(1))))),
      id: 'history',
      icon: RotateCcw,
      type: 'icon',
      desc: 'Decrease Playback Rate'
    },
    BracketRight: {
      fn: () => !viewAnime && !externalPlayback && (playbackRate = (video.defaultPlaybackRate = Math.min(16, Number((video.defaultPlaybackRate + 0.1).toFixed(1))))),
      id: 'update',
      icon: RotateCw,
      type: 'icon',
      desc: 'Increase Playback Rate'
    },
    Backslash: {
      fn: () => !viewAnime && !externalPlayback && (playbackRate = (video.defaultPlaybackRate = 1)),
      icon: RefreshCcw,
      id: 'schedule',
      type: 'icon',
      desc: 'Reset Playback Rate'
    },
    Comma: {
      fn: (e) => !viewAnime && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && setSubDelay(Number((Number(subDelay) + (e.shiftKey ? -1.0 : -0.1)).toFixed(1))),
      id: 'sub_delay_decrease',
      icon: ClockArrowDown,
      type: 'icon',
      desc: 'Subtitle Delay -0.1s / -1.0s'
    },
    Period: {
      fn: (e) => !viewAnime && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA' && setSubDelay(Number((Number(subDelay) + (e.shiftKey ? 1.0 : 0.1)).toFixed(1))),
      id: 'sub_delay_increase',
      icon: ClockArrowUp,
      type: 'icon',
      desc: 'Subtitle Delay +0.1s / +1.0s'
    }
  })

  function immersePlayer () {
    if ((safeduration - currentTime) !== 0) {
      immersed = true
      immerseTimeout = undefined
    }
  }

  let immerseToken = 0
  function resetImmerse() {
    clearTimeout(immerseTimeout)
    const token = ++immerseToken
    const wasImmersed = immersed
    setTimeout(() => {
      if (token !== immerseToken || wasImmersed !== immersed) return
      immersed = false
      if (!paused || miniplayer) {
        immerseTimeout = setTimeout(() => {
          if (token === immerseToken) immersePlayer()
        }, (paused ? 5 : 1.5) * 1_000)
      }
    })
  }

  function toggleImmerse () {
    if (immersed) resetImmerse()
    else {
      clearTimeout(immerseTimeout)
      immersed = !immersed
    }
  }

  let canPlay = !!src
  function hideBuffering () {
    canPlay = !!src
    if (bufferTimeout) {
      clearTimeout(bufferTimeout)
      bufferTimeout = null
    }
    buffering = false
  }

  function showBuffering (skipCheck = false) {
    if (bufferTimeout) clearTimeout(bufferTimeout)
    bufferTimeout = setTimeout(() => {
      if (((skipCheck || video?.readyState < 3) && !externalPlayback) || (externalPlayback && !externalPlayerReady)) {
        buffering = true
        resetImmerse()
      }
    }, 150)
  }
  $: navigator.mediaSession?.setPositionState({
    duration: Math.max(0, safeduration || 0),
    playbackRate: 1,
    position: Math.max(0, Math.min(safeduration || 0, currentTime || 0))
  })
  $: updateAndroidMediaSession(media, !!src && !externalPlayback && (((!$playPage || $page === page.PLAYER) && appActive) || $pictureInPicture), paused, safeduration, playbackRate, hasLast, hasNext)

  function updateAndroidMediaSession(np = media, active = !!src && !externalPlayback && (((!$playPage || $page === page.PLAYER) && appActive) || $pictureInPicture), isPaused = paused, mediaDuration = safeduration, rate = playbackRate, last = hasLast, next = hasNext) {
    ANDROID.setMediaSession?.({
      active,
      playing: active && !isPaused,
      title: np?.title || 'Shiru',
      subtitle: np?.media?.format === 'MOVIE' && (np.media?.episodes ?? 0) <= 1 ? 'The Movie' : [np?.episode === 0 || np?.episode ? `Episode ${np.episode}${np.media?.episodes ? ` of ${np.media.episodes}` : ''}` : '', np?.episodeTitle].filter(Boolean).join(' - ') || 'Streaming the Universe',
      artwork: np?.artwork || np?.thumbnail || '',
      position: currentTime,
      duration: mediaDuration,
      playbackRate: rate || 1,
      hasLast: last,
      hasNext: next
    })
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', playPause)
    navigator.mediaSession.setActionHandler('pause', playPause)
    navigator.mediaSession.setActionHandler('nexttrack', playNext)
    navigator.mediaSession.setActionHandler('previoustrack', playLast)
    navigator.mediaSession.setActionHandler('seekforward', forward)
    navigator.mediaSession.setActionHandler('seekbackward', rewind)
  }
  let filler = null
  let recap = null
  let skipPrompt = false
  function skipResponse (skip) {
    skipPrompt = false
    if (skip) playNext()
    else autoPlay(true)
  }
  let resolvePrompt = false
  function resolveResponse (resolve) {
    resolvePrompt = false
    if (resolve) modal.open(modal.FILE_MANAGER)
    else autoPlay(true)
  }
  let buffer = 0
  TORRENT.onProgress(progress => {
    buffer = progress * 100
  })

  let currentSkippable = null
  function checkSkippableChapters () {
<<<<<<< HEAD
    const current = findChapter(currentTime)
    if (current) {
      currentSkippable = isChapterSkippable(current)
    }
  }
  const MAX_TOTAL_SKIP_TIME = 180
  const skippableChaptersRx = [
    ['Intro', /^intro$/mi],
    ['Opening', /^op$|opening$|title$|^ncop/mi],
    ['Outro', /^outro$/mi],
    ['Ending', /^ed$|ending$|^nced/mi],
    ['Credits', /credits/i],
    ['Preview', /^preview$|previews$|pv$|next$/mi],
    ['Recap', /recap/mi]
  ]
  function isChapterSkippable(chapter) {
    if (((chapter.end - chapter.start) / 1_000) > MAX_TOTAL_SKIP_TIME) return null // Anything longer than 180s (3m) is likely invalid, skipping this chapter would be a mistake!
    for (const [name, regex] of skippableChaptersRx) {
      if (/** @type {RegExp} */ chapter.text && (regex).test(chapter.text.trim())) {
        return name
      }
    }
    return null
  }
  function findChapter (time) {
    if (!chapters.length) return null
    for (const chapter of chapters) {
      if (time < (chapter.end / 1_000) && time >= (chapter.start / 1_000)) return chapter
    }
  }
  function mergeMicroSkippable(_chapters) {
    const isSkippable = (chapter) => chapter.text && skippableChaptersRx.some(([_, rx]) => rx.test(chapter.text.trim()))
    const isShort = (chapter) => ((chapter.end - chapter.start) / 1_000) < 10 // anything shorter than 10 seconds is just fluff... probably a mistake.
    const underMaxSkip = (chapter) => (chapter.end - chapter.start) / 1_000 <= MAX_TOTAL_SKIP_TIME
    for (let i = 0; i < _chapters.length - 1; i++) {
      const cur = _chapters[i]
      const next = _chapters[i + 1]
      if (isSkippable(cur) && isSkippable(next) && underMaxSkip(cur) && underMaxSkip(next)) {
        if (isShort(cur) && !isShort(next)) {
          next.start = cur.start
          _chapters.splice(i, 1)
          i--
        } else if (!isShort(cur) && isShort(next)) {
          cur.end = next.end
          _chapters.splice(i + 1, 1)
          i--
        } else if (isShort(cur) && isShort(next)) {
          cur.end = next.end
          _chapters.splice(i + 1, 1)
          i--
        }
      }
    }
    return _chapters
  }

  // remaps chapters to what the seekbar uses and adds potentially missing chapters
  function sanitiseChapters (_chapters, safeduration) {
    if (!_chapters?.length) return []
    const first = _chapters[0]
    for (const chapter of _chapters) { // Fix negative values
      if (typeof chapter.start === 'number' && chapter.start < 0) chapter.start = -chapter.start // Fixes negative start values, likely was a mistake and is actually correct if positive.
      if (typeof chapter.end === 'number' && chapter.end < 0) chapter.end = -chapter.end // Fixes negative end values, likely was a mistake and is actually correct if positive.
    }
    if (first.start !== 0 && _chapters.some(ch => ch?.start === 0)) { // Fix incorrect order of chapters (when start === 0 is somewhere else)
      _chapters.sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0))
    }
    const boundaryMatches = _chapters.map((ch, i) => ({ ch, i })).filter(({ ch }) => ch.start === first.end)
    if (boundaryMatches.length > 0) { // Fix overlapping chapters where valid chapter end time matches a valid chapter start time.
      boundaryMatches.sort((a, b) => (a.ch.end - a.ch.start) - (b.ch.end - b.ch.start))
      const boundaryIndex = boundaryMatches[0].i
      if (boundaryIndex > 1) _chapters.splice(1, boundaryIndex - 1)
    }
    _chapters = _chapters.map((chapter, index, arr) => {
      if (chapter.start === chapter.end) { // Fix chapters with incorrect start/end times which causes an invisible seekbar, this happens when the start and end time are identical
        const nextChapter = arr[index + 1] // We now assume each chapter is a bookmark and use the next chapters start time and the current chapters end time.
        return { ...chapter, end: nextChapter ? nextChapter.start : safeduration * 1_000 } // Use next chapter's start or ensure the entire safe duration of seekbar is visible.
      }
      return chapter
    })
    _chapters[_chapters.length - 1].end = safeduration * 1_000 // fix the final chapter so its duration actually reaches the end of the video...
    _chapters[0].start = 0

    mergeMicroSkippable(_chapters)
    if (JSON.stringify(chapters) !== JSON.stringify(_chapters)) chapters = _chapters

    const sanitised = []
    let chapterCounter = 1
    for (let { start, end, text } of _chapters) {
      if (start > safeduration * 1_000) continue
      if (end > safeduration * 1_000) end = safeduration * 1_000
      if (text && /^[\d:.\s]+$/.test(text)) { // Replace numerical/timestamp-like chapter names
        text = `Chapter ${chapterCounter}`
        chapterCounter++
      }
      sanitised.push({ size: (end / 10 / safeduration) - (start / 10 / safeduration), text })
    }
    return sanitised
  }

  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = 200
  const thumbnailData = {
    thumbnails: [],
    canvas: thumbCanvas,
    context: thumbCanvas.getContext('2d'),
    interval: null,
    video: null
  }

  function getThumbnail (percent) {
    return thumbnailData.thumbnails[Math.floor(percent / 100 * safeduration / thumbnailData.interval)] || ' '
  }
  function createThumbnail (vid = video) {
    if (vid?.readyState >= 2) {
      const index = Math.floor(vid.currentTime / thumbnailData.interval)
      if (!thumbnailData.thumbnails[index]) {
        thumbnailData.context.fillRect(0, 0, 200, thumbnailData.canvas.height)
        thumbnailData.context.drawImage(vid, 0, 0, 200, thumbnailData.canvas.height)
        thumbnailData.thumbnails[index] = thumbnailData.canvas.toDataURL('image/jpeg')
      }
    }
  }
  let videoWidth, videoHeight
  function initThumbnails () {
    const height = 200 / (videoWidth / videoHeight)
    if (!isNaN(height)) {
      thumbnailData.interval = safeduration / 300 < 5 ? 5 : safeduration / 300
      thumbnailData.canvas.height = height
      generateThumbnails()
    }
  }
  let thumbnailProcess = null
  async function generateThumbnails() {
    debug('Starting thumbnail generation...')
    if (thumbnailProcess && thumbnailProcess.running) {
      debug('Detected a currently running thumbnail generation process, interrupting...')
      thumbnailProcess.videoDraw.remove()
      thumbnailProcess.running = false
      await new Promise(resolve => setTimeout(resolve, 5 * 1_000))
    }
    const t0 = performance.now()
    thumbnailProcess = { videoDraw: document.createElement('video'), running: true}
    const videoDraw = thumbnailProcess.videoDraw
    videoDraw.src = current.url
    videoDraw.preload = 'auto'
    videoDraw.volume = 0
    videoDraw.playbackRate = 0
    videoDraw.onloadeddata = () => {
      let index = 0
      let lastIndex = 0
      function captureThumbnail() {
        if (!thumbnailProcess.running) {
          debug('Thumbnail generation process was interrupted due to a change in the video url, exiting...')
          return
        }
        let dynamicDuration = (buffer / 100) * videoDraw.duration
        if (!isFinite(dynamicDuration)) {
          debug('Video is still loading... waiting to generate thumbnails...')
          setTimeout(() => captureThumbnail(), 1_000)
          return
        }
        while (thumbnailData.thumbnails[index]) index++
        const currentTime = index * thumbnailData.interval
        if (currentTime >= dynamicDuration && currentTime < videoDraw.duration) {
          if (lastIndex !== index) {
            lastIndex = index
            debug(`Reached currently downloaded video duration, current seek time is: ${currentTime}s (${index} of ${buffer}%), waiting for buffer update...`)
          }
          setTimeout(() => {
            if (currentTime < (buffer / 100) * videoDraw.duration) {
              lastIndex = 0
              debug('Detected a buffer change, continuing thumbnail generation...')
            }
            captureThumbnail()
          }, 1_000)
          return
        }

        if (currentTime >= videoDraw.duration) {
          debug('Thumbnail generation has successfully completed, took:', (toTS((performance.now() - t0) / 1_000)))
          videoDraw.remove()
          return
        } else if (isFinite(currentTime) && currentTime >= 0 && currentTime <= dynamicDuration) {
          videoDraw.currentTime = currentTime
        } else {
          debug('Something went wrong calculating the current time for the thumbnails video, calculated:', currentTime, dynamicDuration, buffer)
          return
        }

        videoDraw.onseeked = () => {
          if (!thumbnailProcess.running) {
            debug('Thumbnail generation process was interrupted due to a change in the video url, exiting...')
            return
          }
          thumbnailData.context.fillRect(0, 0, 200, thumbnailData.canvas.height)
          thumbnailData.context.drawImage(videoDraw, 0, 0, 200, thumbnailData.canvas.height)
          thumbnailData.thumbnails[index] = thumbnailData.canvas.toDataURL('image/jpeg')
          captureThumbnail()
        }
      }
      captureThumbnail()
    }
    videoDraw.onerror = (e) => {
      debug('Error loading video for thumbnail generation:', e)
      videoDraw.remove()
    }
  }

  // const isWindows = navigator.appVersion.includes('Windows')
  // let innerWidth, innerHeight
  const menubarOffset = 0
  // $: calcMenubarOffset(innerWidth, innerHeight, videoWidth, videoHeight)
  // function calcMenubarOffset (innerWidth, innerHeight, videoWidth, videoHeight) {
  //   // outerheight resize and innerheight resize is mutual, additionally update on metadata and app state change
  //   if (videoWidth && videoHeight) {
  //     // so windows is very dumb, and calculates windowed mode as if it was window XP, with the old bars, but not when maximised
  //     const isMaximised = screen.availWidth === window.outerWidth && screen.availHeight === window.outerHeight
  //     const menubar = Math.max(0, isWindows && !isMaximised ? window.outerHeight - innerHeight - 8 : window.outerHeight - innerHeight)
  //     // element ratio calc
  //     const videoRatio = videoWidth / videoHeight
  //     const { offsetWidth, offsetHeight } = video
  //     const elementRatio = offsetWidth / offsetHeight
  //     // video is shorter than element && has space for menubar offset
  //     if (!document.fullscreenElement && menubar && elementRatio <= videoRatio && offsetHeight - offsetWidth / videoRatio > menubar) {
  //       menubarOffset = (menubar / 2) * -1
  //     } else {
  //       menubarOffset = 0
  //     }
  //   }
  // }

  function openContextMenuFromButton(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    contextMenu = true
    const w = 260
    const h = 380
    contextMenuX = Math.min(rect.left, window.innerWidth - w)
    contextMenuY = Math.min(rect.bottom, window.innerHeight - h)
  }
  function toggleDropdown ({ target }) {
    target.classList.toggle('active')
    target.closest('.dropdown').classList.toggle('show')
=======
    const current = chapters?.findChapter(currentTime)
    currentSkippable = current ? chapters?.isChapterSkippable(current) : null
    if (currentSkippable && $settings.playerAutoSkip) skip()
>>>>>>> shiru-base-copy
  }

  let completed = false
  function checkCompletion () {
    if (!completed && $settings.playerAutocomplete) {
      checkCompletionByTime(currentTime, safeduration)
    }
  }

  function checkCompletionByTime (currentTime, safeduration) {
    let threshold = $settings.playerAutocompleteThreshold / 100
    if (externalPlayerReady && threshold > 0.7) threshold = 0.7 // accommodates skipping op/ed in external player.
    if (safeduration && currentTime && (video?.readyState || externalPlayerReady) && (currentTime >= safeduration * threshold) && (media?.media?.episodes || (media?.media?.nextAiringEpisode?.episode >= (media.episodeRange?.last || media.episode)))) {
      debug(`Marking current episode as completed as it has met the ${$settings.playerAutocompleteThreshold}% threshold.`)
      completed = true
      externalPlayerReady = false
      const _media = media.episodeRange ? structuredClone(media) : media
      if (media.episodeRange) _media.episode = media.episodeRange.last
      Helper.updateEntry(_media)
      if ($settings.playerAutoDownloadNext && !externalPlayback && hasNextEpisode()) autoStageNext({ media: media.media, episode: media.episode + 1 })
      if (externalPlayback) tryPlayNext()
    }
  }
  function checkError ({ target }) {
    // nothing is playing... skip showing a toast.
    if (!current || !src) {
      debug('Ignoring video error after playback was cleared.', target.error)
      return
    }
    // video playback failed - show a message saying why
    let toastId
    switch (target.error?.code) {
      case target.error.MEDIA_ERR_ABORTED:
        debug('You aborted the video playback.')
        break
      case target.error.MEDIA_ERR_NETWORK:
        debug('A network error caused the video download to fail part-way.', target.error)
        saveAnimeProgress(true)
        toastId = toast.error('Video Network Error', {
          description: 'A network error caused the video download to fail part-way. Dismiss this toast to reload the video.',
          duration: Infinity,
          force: true,
          onDismiss: () => {
            errorToasts.delete(toastId)
            target.load()
          }
        })
        break
      case target.error.MEDIA_ERR_DECODE:
        debug('The video playback was aborted due to a corruption problem or because the video used features your browser did not support.', target.error)
        saveAnimeProgress(true)
        toastId = toast.error('Video Decode Error', {
          description: 'The video playback was aborted due to a corruption problem. Dismiss this toast to reload the video.',
          duration: Infinity,
          force: true,
          onDismiss: () => {
            errorToasts.delete(toastId)
            target.load()
          }
        })
        break
      case target.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
        if (target.error.message !== 'MEDIA_ELEMENT_ERROR: Empty src attribute') {
          debug('The video could not be loaded, either because the server or network failed or because the format is not supported.', target.error)
          saveAnimeProgress(true)
          errorToasts.add(toast.error('Video Codec Unsupported', {
            description: 'The video could not be loaded, either because the server or network failed or because the format is not supported. Try a different release by disabling Autoplay Torrents in RSS settings.',
            duration: 30_000,
            force: true
          }))
        }
        break
      default:
        debug('An unknown video playback error occurred.')
        break
    }
    if (toastId) errorToasts.add(toastId)
  }

  function handleSeekbarKey (e) {
    if (e.key === 'ArrowLeft') {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
      rewind()
    } else if (e.key === 'ArrowRight') {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
      forward()
    } else if (e.key === 'ArrowDown') {
      e.stopPropagation()
      e.stopImmediatePropagation()
      e.preventDefault()
      document.querySelector('[data-name=\'toggleFullscreen\']')?.focus()
    }
  }

  let fileInput
  function handleFile(event) {
    const file = event.target.files[0]
    if (!file) return
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dataTransfer }))
  }

  onMount(() => {
    let destroyed = false
    let mediaActionListener
    let appStateListener
    ANDROID.onAppStateChange?.(isActive => (appActive = isActive))?.then?.(listener => {
      if (destroyed) listener?.remove()
      else appStateListener = listener
    })
    ANDROID.onMediaAction?.((action, position) => {
      if (!src || externalPlayback) return
      if (action === 'last') playLast()
      else if (action === 'next') playNext()
      else if (action === 'seek' && isValidNumber(position)) {
        currentTime = Math.max(0, Math.min(safeduration || position, position))
        targetTime = currentTime
        video.currentTime = targetTime
        updateAndroidMediaSession()
      }
      else if ((action === 'play' && paused) || (action === 'pause' && !paused)) playPause()
    })?.then?.(listener => {
      if (destroyed) listener?.remove()
      else mediaActionListener = listener
    })
    return () => {
      destroyed = true
      appStateListener?.remove()
      mediaActionListener?.remove()
      ANDROID.setMediaSession?.({ active: false })
    }
  })
</script>

<div
  class='player w-full h-full d-flex flex-column overflow-hidden position-relative'
  class:ratio-16-9={!canPlay || !src || externalPlayback}
  class:pointer={miniplayer}
  class:rounded-top-10={miniplayer}
  class:miniplayer
  class:pip={$pictureInPicture && !SUPPORTS.isAndroid}
  class:immersed={immersed}
  class:buffering={($page === page.PLAYER || miniplayer) && buffering}
  class:fitWidth
  bind:this={container}
  role='none'
  on:mousemove={resetImmerse}
  on:touchmove={resetImmerse}
  on:keypress={resetImmerse}
  on:keydown={resetImmerse}
  on:mouseleave={immersePlayer}
  on:wheel={handleWheel}
  on:contextmenu|preventDefault={handleContextMenu}
  style:--player-accent={animeAccent}>
  {#if showKeybinds && !miniplayer}
    <div class='position-absolute bg-tp w-full h-full z-10 font-size-12 p-20 d-flex align-items-center justify-content-center' on:pointerup|self={() => (showKeybinds = false)} tabindex='-1' role='button'>
      <Keybinds let:prop={item} autosave={true} clickable={true}>
        {#if item?.type}
          <div class='bind icon' title={item?.desc} style='pointer-events: all !important;'>
            {#if item?.icon}
              <svelte:component this={item.icon} size='2rem' />
            {/if}
          </div>
        {:else}
          <div class='bind font-weight-normal' title={item?.desc} style='pointer-events: all !important;'>{item?.id || ''}</div>
        {/if}
      </Keybinds>
    </div>
  {/if}
  <video
    crossorigin='anonymous'
    class='position-absolute h-full w-full'
    preload='auto'
    {src}
    bind:this={video}
    use:pictureInPicture={{ subs, deband, container, paused }}
    use:holdSpeed={{ src, externalPlayback, miniplayer }}
    use:thumbnails={{ current, safeduration, externalPlayback, buffer }}
    bind:volume={$volume.level}
    bind:duration
    bind:currentTime
    bind:paused
    bind:ended
    bind:muted={$volume.muted}
    bind:playbackRate
    on:error={checkError}
    on:pause={updatew2g}
    on:pause={holdSpeed.stopHold}
    on:play={updatew2g}
    on:seeked={updatew2g}
    on:seeked={() => updateAndroidMediaSession()}
    on:timeupdate={() => thumbnails.capture()}
    on:timeupdate={checkCompletion}
    on:timeupdate={checkSkippableChapters}
    on:waiting={showBuffering}
    on:loadeddata={hideBuffering}
    on:pause={() => { immersed = false }}
    on:canplay={hideBuffering}
    on:playing={hideBuffering}
    on:loadedmetadata={hideBuffering}
    on:ended={holdSpeed.stopHold}
    on:ended={tryPlayNext}
    on:loadedmetadata={thumbnails.start}
    on:loadedmetadata={() => chapters?.load(current, safeduration)}
    on:loadedmetadata={() => autoPlay()}
    on:loadedmetadata={checkAudio}
    on:loadedmetadata={checkSubtitle}
    on:loadedmetadata={loadAnimeProgress}
  ><track kind='captions' src='' srclang='en' label='English'/></video>
  <div class='buffering-position position-absolute top-0 left-0 w-full h-full d-none align-items-center justify-content-center pointer-events-none z-10' class:d-flex={SUPPORTS.isAndroid && $pictureInPicture}>
    <div class='bufferingDisplay'/>
  </div>
  <Stats {video} {paused} {miniplayer} {current} {playableFiles} {playFile} />
  <ManagerModal playing={current} files={playableFiles} {playFile} />
<<<<<<< HEAD
<div class='top z-40 d-title' style='position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;'>
  
  <div class:hidden={!showTorrentStats} style='display: flex; justify-content: center; align-items: center; padding-top: 20px; pointer-events: auto; gap: 20px;'>
    <div class='d-flex align-items-center'>
      <Users class='pt-5 block-scale-30' strokeWidth={3} />
      <span class='stats font-scale-24 ml-10'>{torrent.peers || 0}</span>
    </div>
    <div class='d-flex align-items-center'>
      <ArrowDown class='block-scale-30' />
      <span class='stats font-scale-24 ml-10'>{fastPrettyBytes(torrent.down)}/s</span>
    </div>
    <div class='d-flex align-items-center'>
      <ArrowUp class='block-scale-30' />
      <span class='stats font-scale-24 ml-10'>{fastPrettyBytes(torrent.up)}/s</span>
=======
  <div class='top z-40 row d-title' class:justify-content-center={!$settings.playerTitleTop} class:align-items-center={!$settings.playerTitleTop}>
    {#if $settings.playerTitleTop && (!SUPPORTS.isAndroid || !$pictureInPicture)}
      <div class='stats pl-20 col-4 d-title'>
        <div class='font-weight-bold overflow-hidden text-truncate font-scale-23'>
          {#if media?.title}
            {media?.title}
          {:else if media?.media?.title} <!-- useful when a torrent is EXTREMELY slow at loading... -->
            {anilistClient.title(media?.media)}
          {:else if current}
            {AnimeResolver.cleanFileName(current?.name)}
          {/if}
        </div>
        <div class='font-weight-normal overflow-hidden text-truncate text-muted font-scale-16'>
          {#if (media?.episode === 0 || media?.episode) && media?.media?.episodes !== 1 && media?.media?.format !== 'MOVIE' && (!media?.episodeTitle || !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle))}
            {@const maxEpisodes = getMediaMaxEp(media.media) - (media.zeroEpisode ? 1 : 0)}
            Episode {media.episodeRange ? `${media.episodeRange.first} ~ ${media.episodeRange.last}` : media.episode}
            {#if maxEpisodes && (Number(maxEpisodes) > 1)} of {maxEpisodes}{:else if !maxEpisodes && videos && (videos.length > 1)} of {videos.length}{/if} <!-- for when the media fails to resolve, we can predict that the file length is likely the episode count. -->
          {:else if current && (videos?.length > 1)}
            Episode {videos.indexOf(current) + 1} of {videos.length} <!-- fallback for when the media fails to resolve and we also fail to resolve the episode numbers, best to indicate what file we are currently on. -->
          {/if}
          {#if (media?.episode === 0 || media?.episode) && media?.media?.format !== 'MOVIE' && (media?.episodeTitle && !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle) && media?.media?.episodes !== 1)} - {/if}
          {#if media?.episodeTitle}{media.episodeTitle}{/if}
        </div>
      </div>
    {/if}
    <div class='d-flex justify-content-center bottom-0 d-title d-filler' class:col-4={$settings.playerTitleTop}>
      <TorrentStats visible={!SUPPORTS.isAndroid || !$pictureInPicture} />
      {#if resolvePrompt}
        <div class='position-absolute text-monospace rounded skipPrompt d-flex flex-column align-items-center text-center bg-dark-light p-20 z-50 mt-60' class:w-500={SUPPORTS.isAndroid}>
          <div class='skipFont'>
            Failed to <b>identify</b> the media from the file name, would you like to fix it?
          </div>
          <div class='d-flex justify-content-center mt-20'>
            <button class='btn btn-primary mx-2 mr-20 d-flex align-items-center justify-content-center' type='button' use:click={() => resolveResponse(true)}>
              <span>Yes</span>
            </button>
            <button class='btn btn-secondary mx-2 ml-20 d-flex align-items-center justify-content-center' type='button' use:click={() => resolveResponse(false)}>
              <span>No</span>
            </button>
          </div>
        </div>
      {:else if skipPrompt}
        <div class='position-absolute text-monospace rounded skipPrompt d-flex flex-column align-items-center text-center bg-dark-light p-20 z-50 mt-60' class:w-500={SUPPORTS.isAndroid}>
          <div class='skipFont'>
            This episode has been marked as a <b>{filler || recap}</b>, do you want to skip?
          </div>
          <div class='d-flex justify-content-center mt-20'>
            <button class='btn btn-primary mx-2 mr-20 d-flex align-items-center justify-content-center' type='button' use:click={() => skipResponse(true)}>
              <span>Yes</span>
            </button>
            <button class='btn btn-secondary mx-2 ml-20 d-flex align-items-center justify-content-center' type='button' use:click={() => skipResponse(false)}>
              <span>No</span>
            </button>
          </div>
        </div>
      {/if}
>>>>>>> shiru-base-copy
    </div>
  </div>
  {#if paused && !seeking}
    <div class='now-playing' transition:fade={{ duration: 200 }}>
      <div class='now-playing-inner'>
        <div class='np-eyebrow'>You're Watching</div>
        <div class='np-title'>
          {#if media?.title}
            {media?.title}
          {:else if media?.media?.title}
            {anilistClient.title(media?.media)}
          {:else if current}
            {AnimeResolver.cleanFileName(current.name)}
          {/if}
        </div>
        <div class='np-episode'>
          {#if (media?.episode === 0 || media?.episode) && media?.media?.episodes !== 1 && media?.media?.format !== 'MOVIE' && (!media?.episodeTitle || !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle))}
            Episode {media.episodeRange ? `${media.episodeRange.first} ~ ${media.episodeRange.last}` : media.episode}
          {:else if current && (videos?.length > 1)}
            Episode {videos.indexOf(current) + 1}
          {/if}
          {#if (media?.episode === 0 || media?.episode) && media?.media?.format !== 'MOVIE' && (media?.episodeTitle && !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle) && media?.media?.episodes !== 1)}{' - '}{/if}
          {#if media?.episodeTitle}{media.episodeTitle}{/if}
        </div>
      </div>
    </div>
  {/if}

  {#if resolvePrompt || skipPrompt}
    <div style='position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); pointer-events: auto;'>
      <div class='text-monospace rounded skipPrompt d-flex flex-column align-items-center text-center bg-dark-light p-20 z-50' class:w-500={SUPPORTS.isAndroid}>
        {#if resolvePrompt}
          <div class='skipFont'>Failed to <b>identify</b> the media, fix it?</div>
          <div class='d-flex justify-content-center mt-20'>
            <button class='btn btn-primary mx-2 mr-20' use:click={() => resolveResponse(true)}>Yes</button>
            <button class='btn btn-secondary mx-2 ml-20' use:click={() => resolveResponse(false)}>No</button>
          </div>
        {:else}
          <div class='skipFont'>This is a <b>{filler || recap}</b>, skip?</div>
          <div class='d-flex justify-content-center mt-20'>
            <button class='btn btn-primary mx-2 mr-20' use:click={() => skipResponse(true)}>Yes</button>
            <button class='btn btn-secondary mx-2 ml-20' use:click={() => skipResponse(false)}>No</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
  <div class='middle d-flex align-items-center justify-content-center flex-grow-1 position-relative'>
<<<<<<< HEAD
    <div aria-hidden='true' class='w-full h-full position-absolute toggle-fullscreen' on:dblclick={toggleFullscreen} on:click|self={() => { if ($page === page.PLAYER && modal.length === 0) { playPause(); } else if (!miniplayerShelved) { page.navigateTo(page.PLAYER) } }} />
    <div aria-hidden='true' class='w-full h-full position-absolute toggle-immerse d-none' on:dblclick={toggleFullscreen} on:click|self={toggleImmerse} />
    <div class='w-full h-full position-absolute mobile-focus-target d-none' use:click={() => { page.navigateTo(page.PLAYER) }} />
    <span aria-hidden='true' class='icon ctrl align-items-center justify-content-end w-150 mw-full mr-auto' class:hidden={externalPlayback} class:mb-50={!miniplayer} on:click={rewind}><Rewind size='3rem' /></span>

    {#if !miniplayer || !miniplayerShelved}
      <div class='d-flex align-items-center position-relative' class:mb-50={!miniplayer} style='width: 100%;' title='Play/Pause'>
        {#if hasLast}
          <span class='icon ctrl position-absolute rounded-10 text-white' style={externalPlayback ? `left: 5%` : `left: 15%`} title='Last' data-name='playPause' use:click={playLast}>
            <SkipBack size='3rem' />
          </span>
        {/if}
          <span class='icon ctrl position-absolute rounded-10 text-white' data-name='playPause' style='left: 50%; margin-left: -3rem;' use:click={playPause}>
            {#if ended}
              <RotateCw size='3rem' />
            {:else}
              {#if paused}
                <Play size='3rem' />
              {:else}
                <Pause size='3rem' />
              {/if}
            {/if}
          </span>
        {#if hasNext}
          <span class='icon ctrl position-absolute rounded-10 text-white' style={externalPlayback ? `right: 5%` : `right: 15%`} title='Next' data-name='playPause' use:click={playNext}>
            <SkipForward size='3rem' />
=======
    <div aria-hidden='true' class='w-full h-full position-absolute toggle-fullscreen' on:dblclick={toggleFullscreen} use:holdSpeed on:click|self={handlePlayerClick} />
    <div aria-hidden='true' class='w-full h-full position-absolute toggle-immerse d-none' on:dblclick={toggleFullscreen} use:holdSpeed on:click|self={handleMobilePlayerClick} />
    <div aria-hidden='true' class='w-full h-full position-absolute mobile-focus-target d-none' use:holdSpeed on:click|self={handleMiniplayerClick} />
    <span aria-hidden='true' class='icon ctrl align-items-center justify-content-end w-150 mw-full mr-auto' class:hidden={externalPlayback || (SUPPORTS.isAndroid && $pictureInPicture)} class:mb-50={!miniplayer} on:click={rewind}><Rewind size='3rem' /></span>
    <!-- miniplayer buttons -->
    {#if miniplayer && !miniplayerShelved}
      <span class='position-absolute rounded-10 top-0 right-0 m-10 btn-shadow button' class:ctrl={!SUPPORTS.isAndroid} class:mr-40={!SUPPORTS.isAndroid} class:mr-50={SUPPORTS.isAndroid} title='Minimize' data-name='playPause' use:click={() => (playPage.set(!playPage.value))}>
        <Minus size='1.9rem' strokeWidth='3'/>
      </span>
      <span class='position-absolute rounded-10 top-0 right-0 m-10 btn-shadow button' class:ctrl={!SUPPORTS.isAndroid} title='Exit' data-name='playPause' use:click={() => { unload(null, null, true); if ($page === page.PLAYER) page.navigateTo(page.HOME)}}>
        <X size='1.9rem' strokeWidth='3'/>
      </span>
    {/if}
    {#if !miniplayer || !miniplayerShelved}
      <div class='d-flex align-items-center position-relative' class:mb-50={!miniplayer} style='width: 100%;' title='Play/Pause'>
        <div class='position-absolute bufferingDisplay' style='left: 50%; margin-left: -2.5rem;' class:d-none={SUPPORTS.isAndroid && $pictureInPicture}/>
        <span class='icon ctrl position-absolute rounded-10 text-white' style={externalPlayback ? `left: 5%` : `left: 15%`} title='{hasLast ? `Last` : `No Previous Episode`}' data-name='playPause' disabled={!hasLast} class:not-allowed={!hasLast} class:text-very-muted={!hasLast} class:hidden={SUPPORTS.isAndroid && $pictureInPicture} use:click={playLast}>
          <SkipBack size='3rem' fill='currentColor' />
        </span>
        <span class='icon ctrl position-absolute rounded-10 text-white' data-name='playPause' style='left: 50%; margin-left: -3rem;' class:hidden={SUPPORTS.isAndroid && $pictureInPicture} use:click={playPause}>
          {#if ended}
            <RotateCw size='3rem' />
          {:else}
            {#if paused}
              <Play size='3rem' fill='currentColor' />
            {:else}
              <Pause size='3rem' fill='currentColor' />
            {/if}
          {/if}
        </span>
        <span class='ui-volume position-absolute z-10 font-weight-bold font-scale-40 rounded-10 pointer-events-none bg-blur py-6px opacity-90 opacity-ts-3' style='left: 50%; margin-left: -3rem;' class:transparent={!$volume.visible} class:text-white={$volume.boosted || !$volume.boostCount} class:boosting={!$volume.boosted && $volume.boostCount} class:muted={$volume.level === 0}>{$volume.text}</span>
        {#if subDelayText}
          <span class='position-absolute z-10 font-weight-bold font-scale-40 text-white rounded-10 pointer-events-none bg-blur py-6px opacity-90 opacity-ts-3' style='left: 50%; margin-left: -3rem;' class:transparent={!subDelayVisible}>{subDelayText}</span>
        {/if}
        <span class='playback-rate-display position-absolute z-10 font-weight-bold font-scale-40 text-white rounded-10 pointer-events-none bg-blur py-6px opacity-90 opacity-ts-3' style='left: 50%; margin-left: -3rem;' class:transparent={!$holdSpeed}>{$holdSpeed}</span>
        <span class='icon ctrl position-absolute rounded-10 text-white' style={externalPlayback ? `right: 5%` : `right: 15%`} title='{hasNext ? `Next` : `No Next Episode`}' data-name='playPause' disabled={!hasNext} class:not-allowed={!hasNext} class:text-very-muted={!hasNext} class:hidden={SUPPORTS.isAndroid && $pictureInPicture} use:click={playNext}>
            <SkipForward size='3rem' fill='currentColor' />
>>>>>>> shiru-base-copy
          </span>
      </div>
      <span aria-hidden='true' class='icon ctrl align-items-center w-150 mw-full ml-auto' class:hidden={externalPlayback || (SUPPORTS.isAndroid && $pictureInPicture)} class:mb-50={!miniplayer} on:click={forward}><FastForward size='3rem' /></span>
      {#if currentSkippable}
<<<<<<< HEAD
        <button class='skip position-absolute bottom-0 right-0 mr-20 mb-5 z-30 d-flex align-items-center justify-content-center' use:click={skip}>
          <FastForward size='1.8rem' /><span class='ml-5'>Skip {currentSkippable}</span>
        </button>
      {/if}
    {/if}
    <span class='ui-volume position-absolute z-10 pointer-events-none opacity-90 opacity-ts-3 d-flex align-items-center justify-content-center' class:transparent={!volumeVisible}>
      <svg class='volume-ring' viewBox='0 0 100 100'>
        <circle class='ring-bg' cx='50' cy='50' r='42' />
        <circle class='ring-fill' cx='50' cy='50' r='42'
          style='stroke-dashoffset: {264 - (264 * (volumeBoosted ? Math.min(gain, 3) / 3 : volume))}' />
      </svg>
      <span class='volume-icon-inner'>
        {#if muted || volume === 0}
          <VolumeX size='2.8rem' />
        {:else if volumeBoosted}
          <Volume2 size='2.8rem' />
        {:else if volume < 0.5}
          <Volume1 size='2.8rem' />
        {:else}
          <Volume2 size='2.8rem' />
        {/if}
      </span>
    </span>
    <span class='position-absolute z-10 font-weight-bold font-scale-40 text-white pointer-events-none icon-shadow opacity-90 opacity-ts-3' style='left: 0; bottom: 6rem;' class:transparent={!subVisible}>{subText}</span>
    {#if subDelayText}
      <span class='position-absolute z-10 font-weight-bold font-scale-50 text-white pointer-events-none icon-shadow opacity-90 opacity-ts-3' class:transparent={!subDelayVisible}>{subDelayText}</span>
    {/if}
=======
        <button type='button' class='skip btn text-dark position-absolute bottom-0 right-0 mr-20 mb-5 font-weight-bold z-30 d-flex align-items-center justify-content-center' class:hidden={SUPPORTS.isAndroid && $pictureInPicture} use:click={skip}>
          <FastForward size='1.8rem' fill='currentColor' /><span class='ml-5'>Skip {currentSkippable}</span>
        </button>
      {/if}
    {/if}
>>>>>>> shiru-base-copy
  </div>
  <div class='bottom d-flex z-40 flex-column px-20' class:hidden={SUPPORTS.isAndroid && $pictureInPicture}>
    {#if !$settings.playerTitleTop}
      <div class='stats pl-5 d-title'>
        <div class='font-weight-bold overflow-hidden text-truncate font-scale-23'>
          {#if media?.title}
            {media?.title}
          {:else if media?.media?.title} <!-- useful when a torrent is EXTREMELY slow at loading... -->
            {anilistClient.title(media?.media)}
          {:else if current}
            {AnimeResolver.cleanFileName(current?.name)}
          {/if}
        </div>
        <div class='font-weight-normal overflow-hidden text-truncate text-muted font-scale-16'>
          {#if (media?.episode === 0 || media?.episode) && media?.media?.episodes !== 1 && media?.media?.format !== 'MOVIE' && (!media?.episodeTitle || !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle))}
            {@const maxEpisodes = getMediaMaxEp(media.media) - (media.zeroEpisode ? 1 : 0)}
            Episode {media.episodeRange ? `${media.episodeRange.first} ~ ${media.episodeRange.last}` : media.episode}
            {#if maxEpisodes && (Number(maxEpisodes) > 1)} of {maxEpisodes}{:else if !maxEpisodes && videos && (videos.length > 1)} of {videos.length}{/if} <!-- for when the media fails to resolve, we can predict that the file length is likely the episode count. -->
          {:else if current && (videos?.length > 1)}
            Episode {videos.indexOf(current) + 1} of {videos.length} <!-- fallback for when the media fails to resolve and we also fail to resolve the episode numbers, best to indicate what file we are currently on. -->
          {/if}
          {#if (media?.episode === 0 || media?.episode) && media?.media?.format !== 'MOVIE' && (media?.episodeTitle && !new RegExp(`(?<![\\d.])${media.episode}(?![\\d.])`).test(media.episodeTitle) && media?.media?.episodes !== 1)} - {/if}
          {#if media?.episodeTitle}{media.episodeTitle}{/if}
        </div>
      </div>
    {/if}
    <div class='w-full d-flex align-items-center h-20 mb-5 seekbar' tabindex='0' role='button' on:keydown={handleSeekbarKey}>
      <Seekbar
        accentColor='{completed || (media?.media && ((($mediaCache[media.media.id] || media.media)?.mediaListEntry?.progress - (media?.zeroEpisode ? 1 : 0)) >= (media.episodeRange ? media.episodeRange.last : media.episode))) ? `var(--completed-color-dim)` : animeAccent}'
        class='font-size-20'
        length={safeduration}
        {buffer}
        progress={currentTime / safeduration * 100}
        on:seeking={handleMouseDown}
        on:seeked={handleMouseUp}
        chapters={chapters?.sanitise($chapters, safeduration) || []}
        getThumbnail={thumbnails.get}
      />
    </div>
    <div class='d-flex'>
      <span class='icon ctrl m-5 text-white' title='Play/Pause [Space]' data-name='playPause' use:click={playPause}>
        {#if ended}
          <RotateCw size='2rem' />
        {:else}
          {#if paused}
            <Play size='2rem' />
          {:else}
            <Pause size='2rem' />
          {/if}
        {/if}
      </span>
<<<<<<< HEAD
      {#if hasLast}
        <span class='icon ctrl m-5 d-btn text-white' title='Last [B]' use:click={playLast}>
          <SkipBack size='2rem' />
        </span>
      {/if}
      {#if hasNext}
        <span class='icon ctrl m-5 d-btn text-white' title='Next [N]' use:click={playNext}>
          <SkipForward size='2rem' />
        </span>
      {/if}
      <div class='d-none w-auto volume' class:d-flex={!externalPlayback}>
        <span class='icon ctrl m-5 text-white' title='Mute [M]' data-name='toggleMute' use:click={toggleMute}>
          {#if muted}
            <VolumeX size='2rem' />
=======
      <button type='button' class='icon ctrl m-5 d-btn text-white bg-transparent border-0 no-scale' title='{hasLast ? `Last [B]` : `No Previous Episode`}' disabled={!hasLast} class:not-allowed={!hasLast} class:text-very-muted={!hasLast} use:click={playLast}>
        <SkipBack size='2rem' fill='currentColor' />
      </button>
      <button type='button' class='icon ctrl m-5 d-btn text-white bg-transparent border-0 no-scale' title='{hasNext ? `Next [N]` : `No Next Episode`}' disabled={!hasNext} class:not-allowed={!hasNext} class:text-very-muted={!hasNext} use:click={playNext}>
        <SkipForward size='2rem' fill='currentColor' />
      </button>
      <div class='d-none w-auto volume' class:d-flex={!externalPlayback}>
        <span class='icon ctrl m-5 text-white' title='Mute [M]' data-name='toggleMute' use:click={() => volume.toggleMute()}>
          {#if $volume.muted}
            <VolumeX size='2rem' fill='currentColor' />
>>>>>>> shiru-base-copy
          {:else}
            <Volume2 size='2rem' />
          {/if}
        </span>
        {#if !$volume.boosted}
          <input class='ctrl h-full custom-range' tabindex='-1' type='range' min='0' max='1' step='any' data-name='setVolume' bind:value={$volume.level} />
        {:else}
          <input class='ctrl h-full custom-range' class:boost-color={$volume.gain > 1} tabindex='-1' type='range' min='0' max='3' step='any' data-name='setVolume' bind:value={$volume.gain} on:input={event => volume.setGain(event, media)}/>
        {/if}
<<<<<<< HEAD
        {#if (volume === 1) || volumeBoosted}
          <span class='icon ctrl boost p-0 mt-15 d-flex align-items-center justify-content-center text-white' class:boost-color={volumeBoosted} title='Increase Volume Limit [V]' data-name='toggleGain' use:click={toggleGain}>
            <SlidersVertical size='1.4rem' />
=======
        {#if ($volume.level === 1) || $volume.boosted}
          <span class='icon ctrl boost p-0 mt-15 d-flex align-items-center justify-content-center text-white' class:boost-color={$volume.boosted} title='Increase Volume Limit [V]' data-name='toggleGain' use:click={() => volume.toggleGain(video, media)}>
            <SlidersVertical size='1.4rem' fill='currentColor' />
>>>>>>> shiru-base-copy
          </span>
        {/if}
      </div>
      <div class='ts font-scale-20' class:mr-auto={playbackRate === 1}>{toTS(targetTime, safeduration > 3600 ? 2 : 3)} / {toTS(safeduration - targetTime, safeduration > 3600 ? 2 : 3)}</div>
      {#if playbackRate !== 1}
        <div class='ts mr-auto font-scale-20'>{playbackRate.toFixed(1)}x</div>
      {/if}
      <input type='file' class='d-none' id='search-subtitle' accept='.srt,.vtt,.ass,.ssa,.sub,.txt' on:input|preventDefault|stopPropagation={handleFile} bind:this={fileInput}/>
<<<<<<< HEAD
      <span class='icon text-white ctrl d-flex align-items-center h-full' title='More' use:click={openContextMenuFromButton}>
        <EllipsisVertical size='2.5rem' strokeWidth={2.5} />
      </span>
      <span class='icon text-white ctrl mr-5 d-flex align-items-center keybinds' title='Keybinds [`]' use:click={() => (showKeybinds = true)}>
        <Keyboard size='2.5rem' strokeWidth={2.5} />
      </span>
      <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Episodes' use:click={() => showEpisodes = !showEpisodes}>
        <ListVideo size='2.5rem' strokeWidth={2.5} />
      </span>
      {#if 'audioTracks' in HTMLVideoElement.prototype && video?.audioTracks?.length > 1}
        <div class='dropdown dropup with-arrow' use:click={toggleDropdown}>
          <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Audio Tracks'>
=======
      <NestedDropdown direction='top' panelHeightPadding={6} panelColor='var(--dark-color-glass)' containerEl={container} items={[
          ...(!externalPlayback ? [{
            icon: Gauge,
            label: 'Playback speed',
            value: playbackRate === 1 ? 'Normal' : `${playbackRate.toFixed(1)}x`,
            children: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8].map(rate => ({
              label: rate === 1 ? 'Normal' : `${rate}x`,
              value: playbackRate === rate ? '✓' : undefined,
              valueCSS: 'text-primary font-size-18 font-weight-very-bold',
              onSelect: () => (playbackRate = (video.defaultPlaybackRate = rate))
            }))
          }] : []),
          ...(!externalPlayback ? [{
            icon: Milestone,
            label: 'Chapter Source',
            value: $settings.playerChapterSkip === 'embedded' ? 'Embedded' : 'Aniskip',
            children: [
              {
                label: 'Embedded',
                value: $settings.playerChapterSkip === 'embedded' ? '✓' : undefined,
                valueCSS: 'text-primary font-size-18 font-weight-very-bold',
                onSelect: () => { $settings.playerChapterSkip = 'embedded'; chapters?.useEmbedded(); }
              },
              {
                label: 'Aniskip',
                value: $settings.playerChapterSkip === 'aniskip' ? '✓' : undefined,
                valueCSS: 'text-primary font-size-18 font-weight-very-bold',
                onSelect: () => { $settings.playerChapterSkip = 'aniskip'; chapters?.load(current, safeduration); }
              }
            ]
          }] : []),
          ...(!externalPlayback ? [{
            icon: Proportions,
            label: 'Video Fit',
            value: fitWidth ? 'Fill' : 'Best fit',
            children: [
              {
                label: 'Fill',
                value: fitWidth ? '✓' : undefined,
                valueCSS: 'text-primary font-size-18 font-weight-very-bold',
                onSelect: () => { toggleFitWidth(false) }
              },
              {
                label: 'Best fit',
                value: !fitWidth ? '✓' : undefined,
                valueCSS: 'text-primary font-size-18 font-weight-very-bold',
                onSelect: () => { toggleFitWidth(true) }
              }
            ]
          }] : []),
          ...(!externalPlayback ? [{
            icon: FilePlus2,
            label: 'Add Subtitles',
            close: true,
            onSelect: () => fileInput.click()
          }] : []),
          ...(!externalPlayback ? [{
            icon: ScreenShare,
            label: 'Screenshot',
            onSelect: () => screenshot(video, subs)
          }] : []),
          {
            icon: SquarePen,
            label: 'File Manager',
            close: true,
            onSelect: () => { resolvePrompt = false; modal.toggle(modal.FILE_MANAGER) }
          },
          ...((!externalPlayback || launchedExternal) && (SUPPORTS.isAndroid || $settings.playerPath) ? [{
            icon: SquareArrowOutUpRight,
            label: 'External Player',
            close: true,
            onSelect: () => setCurrent(current, true)
          }] : []),
          ...(!externalPlayback ? [{
            icon: Contrast,
            label: 'Video Debanding',
            value: $settings.playerDeband ? 'On' : 'Off',
            onSelect: () => { $settings.playerDeband = !$settings.playerDeband }
          }] : []),
          {
            icon: List,
            label: 'Stats',
            value: $stats ? 'On' : 'Off',
            onSelect: () => toggleStats()
          }
        ]}>
        <span class='icon text-white ctrl d-flex align-items-center h-full' title='More'>
          <EllipsisVertical size='2.5rem' strokeWidth={2.5} />
        </span>
      </NestedDropdown>
      <span class='icon text-white ctrl d-flex align-items-center keybinds' title='Keybinds [`]' use:click={() => (showKeybinds = true)}>
        <Keyboard size='2.5rem' strokeWidth={2.5} />
      </span>
      {#if $playPage && media?.media}
        <span class='icon text-white ctrl d-flex align-items-center' title='Now Playing [O]' use:click={() => modal.toggle(modal.ANIME_DETAILS, media.media)}>
          <Eye size='2.5rem' strokeWidth={2.5} />
        </span>
      {/if}
      {#if 'audioTracks' in HTMLVideoElement.prototype && video?.audioTracks?.length > 1 && !externalPlayback}
        <NestedDropdown title='Audio Tracks' direction='top' panelWidth={25} panelHeightPadding={6} panelColor='var(--dark-color-glass)' containerEl={container} items={Object.values(video.audioTracks).map((track, _, allTracks) => ({
          label: trackLabel(track, allTracks, 'label'),
          value: track.enabled ? '✓' : undefined,
          valueCSS: 'text-primary font-size-18 font-weight-very-bold',
          onSelect: () => selectAudio(track.id)
        }))}>
          <span class='icon text-white ctrl d-flex align-items-center h-full' title='Audio Tracks'>
>>>>>>> shiru-base-copy
            <ListMusic size='2.5rem' strokeWidth={2.5} />
          </span>
        </NestedDropdown>
      {/if}
<<<<<<< HEAD
      {#if $playPage && media?.media}
        <span class='icon text-white ctrl mr-5 d-flex align-items-center' title='Now Playing [O]' use:click={() => modal.toggle(modal.ANIME_DETAILS, media.media)}>
          <Eye size='2.5rem' strokeWidth={2.5} />
        </span>
      {/if}
      {#if 'videoTracks' in HTMLVideoElement.prototype && video?.videoTracks?.length > 1}
        <div class='dropdown dropup with-arrow' use:click={toggleDropdown}>
          <span class='icon text-white ctrl mr-5 d-flex align-items-center h-full' title='Video Tracks'>
=======
      {#if 'videoTracks' in HTMLVideoElement.prototype && video?.videoTracks?.length > 1 && !externalPlayback}
        <NestedDropdown title='Video Tracks' direction='top' panelWidth={25} panelHeightPadding={6} panelColor='var(--dark-color-glass)' containerEl={container} items={Object.values(video.videoTracks).map((track, _, allTracks) => ({
          label: trackLabel(track, allTracks, 'label'),
          value: track.selected ? '✓' : undefined,
          valueCSS: 'text-primary font-size-18 font-weight-very-bold',
          onSelect: () => selectVideo(track.id)
        }))}>
          <span class='icon text-white ctrl d-flex align-items-center h-full' title='Video Tracks'>
>>>>>>> shiru-base-copy
            <ListVideo size='2.5rem' strokeWidth={2.5} />
          </span>
        </NestedDropdown>
      {/if}
      {#if subHeaders?.length && !externalPlayback}
        <NestedDropdown title='Subtitles/CC' direction='top' panelWidth={25} panelHeightPadding={3} panelColor='var(--dark-color-glass)' containerEl={container} items={[
            {
              icon: Settings,
              label: 'Options',
              children: [
                {
                  type: 'input',
                  icon: Timer,
                  label: 'Offset',
                  inputmode: 'numeric',
                  pattern: '-?[0-9]*.?[0-9]*',
                  step: '0.1',
                  min: -9999,
                  max: 9999,
                  value: subDelay,
                  onInput: (/** @type {number} */ value) => (subDelay = value)
                },
                {
                  icon: FilePlus2,
                  label: 'Add Subtitles',
                  close: true,
                  onSelect: () => fileInput.click()
                }
              ]
            },
            {
              label: 'Off',
              icon: CaptionsOff,
              value: subHeaders && subs?.current === -1 ? '✓' : undefined,
              valueCSS: 'text-primary font-size-18 font-weight-very-bold',
              onSelect: () => {
                subs.selectCaptions(-1)
                updateSubs()
                setLastSubtitle('OFF')
              }
            },
            { type: 'separator' },
            ...subHeaders.map(track => {
              if (!track) return null
              const label = trackLabel(track, subHeaders)
              return {
                label,
                value: track.number === subs.current ? '✓' : undefined,
                valueCSS: 'text-primary font-size-18 font-weight-very-bold',
                onSelect: () => {
                  subs.selectCaptions(track.number)
                  updateSubs()
                  setLastSubtitle(label)
                }
              }
            }).filter(Boolean)
          ]}>
          <span class='icon text-white ctrl d-flex align-items-center h-full' title='Subtitles [C]'>
            <Captions size='2.5rem' strokeWidth={2.5} />
          </span>
        </NestedDropdown>
      {/if}
<<<<<<< HEAD

      <!--{#if 'PresentationRequest' in window && canCast && current}-->
      <!--  <span class='icon text-white ctrl mr-5 d-flex align-items-center text-white' title='Cast Video [D]' data-name='toggleCast' use:click={toggleCast}>-->
      <!--    {#if presentationConnection}-->
      <!--      <Cast size='2.5rem' fill='currentColor' strokeWidth={0} />-->
      <!--    {:else}-->
      <!--      <Cast size='2.5rem' strokeWidth={2.5} />-->
      <!--    {/if}-->
      <!--  </span>-->
      <!--{/if}-->
=======
>>>>>>> shiru-base-copy
      {#if 'pictureInPictureEnabled' in document}
        <span class='icon text-white ctrl d-none align-items-center' class:d-flex={!externalPlayback} title='Popout Window [P]' data-name='togglePopout' use:click={pictureInPicture.togglePopout}>
          {#if $pictureInPicture}
            <PictureInPicture size='2.5rem' strokeWidth={2.5} />
          {:else}
            <PictureInPicture2 size='2.5rem' strokeWidth={2.5} />
          {/if}
        </span>
      {/if}
      <span class='icon text-white ctrl d-none align-items-center' class:d-flex={!externalPlayback} title='Fullscreen [F]' data-name='toggleFullscreen' use:click={toggleFullscreen}>
        {#if isFullscreen}
          <Minimize size='2.5rem' strokeWidth={2.5} />
        {:else}
          <Maximize size='2.5rem' strokeWidth={2.5} />
        {/if}
      </span>
    </div>
  </div>

  {#if showEpisodes && media?.media}
    <div class='episodes-overlay' on:click={() => showEpisodes = false} on:contextmenu|preventDefault={() => showEpisodes = false}></div>
    <div class='episodes-panel' on:click|stopPropagation on:contextmenu|stopPropagation>
      <div class='episodes-panel-header'>
        <span class='episodes-panel-title'>EPISODES</span>
        <button class='episodes-panel-close' on:click={() => showEpisodes = false}>✕</button>
      </div>
      <EpisodePanel
        media={media.media}
        episodeCount={getMediaMaxEp(media.media)}
        userProgress={media.media?.mediaListEntry?.progress || 0}
        play={(m, ep) => { playAnime(m, ep); showEpisodes = false }}
      />
    </div>
  {/if}

<SoftModal class='p-0 w-700 mw-full rounded overflow-hidden jimaku-modal' bind:showModal={jimakuShow} close={closeJimaku} id='jimaku'>

  <!-- Header -->
  <div class='jimaku-header'>
    <div>
      <div class='jimaku-label'>Subtitles</div>
      <h5 class='jimaku-title'>Jimaku</h5>
    </div>
    <button class='jimaku-close' on:click={closeJimaku}>✕</button>
  </div>

  <!-- Body -->
  {#if jimakuFiles.length}
    <div class='jimaku-list'>
      {#each jimakuFiles as file, i}
        <div class='jimaku-row'>
          <span class='jimaku-index'>{String(i + 1).padStart(2, '0')}</span>
          <div class='jimaku-name'>{file.name}</div>
          <button class='jimaku-dl' on:click={() => downloadJimakuFile(file)}>
            <Download size='0.85rem' />
            DL
          </button>
        </div>
      {/each}
    </div>
  {:else}
    <div class='jimaku-empty'>No subtitles found for this series</div>
  {/if}
</SoftModal>
{#if contextMenu}
  <div
    class="ctx-overlay"
    on:click={() => contextMenu = false}
    on:contextmenu|preventDefault={() => contextMenu = false}
  >
    <div
      class="ctx-menu"
      style="left: {contextMenuX}px; top: {contextMenuY}px;"
      on:click|stopPropagation
      on:contextmenu|stopPropagation
    >
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { playPause(); contextMenu = false }}>
        <span class="ctx-label">{paused ? 'Play' : 'Pause'}</span>
        <span class="ctx-hint">Space</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { toggleMute(); contextMenu = false }}>
        <span class="ctx-label">{muted ? 'Unmute' : 'Mute'}</span>
        <span class="ctx-hint">M</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { fitWidth = !fitWidth; cache.setEntry(caches.GENERAL, 'fitWidth', String(fitWidth)); contextMenu = false }}>
        <span class="ctx-label">{fitWidth ? 'Contain' : 'Cover'}</span>
        <span class="ctx-hint">W</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { cycleSubtitles(); contextMenu = false }}>
        <span class="ctx-label">Subtitles</span>
        <span class="ctx-arrow">›</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { toggleFullscreen(); contextMenu = false }}>
        <span class="ctx-label">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        <span class="ctx-hint">F</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { togglePopout(); contextMenu = false }}>
        <span class="ctx-label">{pip ? 'Exit PiP' : 'Picture in Picture'}</span>
        <span class="ctx-hint">P</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { playLast(); contextMenu = false }}>
        <span class="ctx-label">Previous Episode</span>
        <span class="ctx-hint">B</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { playNext(); contextMenu = false }}>
        <span class="ctx-label">Next Episode</span>
        <span class="ctx-hint">N</span>
      </div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { volumeLimit = volumeLimit >= 3 ? 1 : volumeLimit + 0.5; contextMenu = false }}>
        <span class="ctx-label">Volume Limit: {(volumeLimit * 100).toFixed(0)}%</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={externalPlayback} on:click={() => { fileInput.click(); contextMenu = false }}>
        <span class="ctx-label">Add Subtitles</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={!media?.media || externalPlayback} on:click={() => { exploreJimaku(); contextMenu = false }}>
        <span class="ctx-label">Jimaku Subtitles</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={externalPlayback} on:click={() => { if ($settings.playerChapterSkip === 'embedded') { $settings.playerChapterSkip = 'aniskip'; findChapters() } else { $settings.playerChapterSkip = 'embedded'; chapters = embeddedChapters }; contextMenu = false }}>
        <span class="ctx-label">Chapter Source</span>
        <span class="ctx-hint">{$settings.playerChapterSkip === 'embedded' ? 'Embedded' : 'Aniskip'}</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={!((!externalPlayback || launchedExternal) && (SUPPORTS.isAndroid || $settings.playerPath))} on:click={() => { setCurrent(current, true); contextMenu = false }}>
        <span class="ctx-label">External Player</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" class:d-none={!media?.media || externalPlayback} on:click={() => { modal.open(modal.TORRENT_MENU, { media: media.media, episode: media.episode }); contextMenu = false }}>
        <span class="ctx-label">Torrent Selection</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { resolvePrompt = false; modal.toggle(modal.FILE_MANAGER); contextMenu = false }}>
        <span class="ctx-label">File Manager</span>
      </div>
      <div class="ctx-item" role="button" tabindex="-1" on:click={() => { showTorrentStats = !showTorrentStats; contextMenu = false }}>
        <span class="ctx-label">{showTorrentStats ? 'Hide' : 'Show'} Stats</span>
      </div>
    </div>
  </div>
{/if}
</div>
<style>
  :global(.deband-canvas) {
    max-width: 100%;
    max-height: 100%;
    width: 100% !important;
    height: 100% !important;
    top: 50%;
    left: 50%;
    position: absolute;
    transform: translate(-50%, -50%);
    pointer-events: none;
    object-fit: contain;
  }
  :global(.deband-canvas) ~ video {
    opacity: 0;
  }
  .fitWidth video, .fitWidth :global(.deband-canvas) {
    object-fit: cover !important;
  }
  .custom-range {
    color: var(--player-accent);
    --thumb-height: 0px;
    --track-height: 3px;
    --track-color: hsla(var(--white-color-hsl), 0.2);
    --brightness-hover: 120%;
    --brightness-down: 80%;
    --clip-edges: 2px;
    --target-height: max(var(--track-height), var(--thumb-height));
    position: relative;
    background: hsla(var(--white-color-hsl), 0);
    overflow: hidden;
    transition: all ease 100ms;
    appearance: none;
  }
  .custom-range:hover {
    --thumb-height: 12px;
  }

  .custom-range:active {
    cursor: grabbing;
  }
  .custom-range::-webkit-slider-runnable-track {
    height: var(--target-height);
    position: relative;
        background: linear-gradient(var(--track-color) 0 0) scroll no-repeat center /
      100% calc(var(--track-height));
  }

  .custom-range::-webkit-slider-thumb {
    position: relative;
    height: var(--thumb-height);
    width: var(--thumb-width, var(--thumb-height));
    -webkit-appearance: none;
    --thumb-radius: calc((var(--target-height) * 0.5) - 1px);
    --clip-top: calc((var(--target-height) - var(--track-height)) * 0.5);
    --clip-bottom: calc(var(--target-height) - var(--clip-top));
    --clip-further: calc(100% + 1px);
    --box-fill: calc(-100vmax - var(--thumb-width, var(--thumb-height))) 0 0
      100vmax currentColor;

    background: linear-gradient(currentColor 0 0) scroll no-repeat left center /
      50% calc(var(--track-height) + 1px);
    background-color: currentColor;
    box-shadow: var(--box-fill);
    border-radius: var(--thumb-width, var(--thumb-height));

    filter: brightness(100%);
    clip-path: polygon(
      100% -1px,
      var(--clip-edges) -1px,
      0 var(--clip-top),
      -100vmax var(--clip-top),
      -100vmax var(--clip-bottom),
      0 var(--clip-bottom),
      var(--clip-edges) 100%,
      var(--clip-further) var(--clip-further)
    );
  }

  .custom-range:hover::-webkit-slider-thumb {
    filter: brightness(var(--brightness-hover));
    cursor: grab;
  }

  .custom-range:active::-webkit-slider-thumb {
    filter: brightness(var(--brightness-down));
    cursor: grabbing;
  }

  .custom-range.boost-color {
    color: var(--player-accent);
    filter: saturate(1.4);
  }

  .custom-range:focus {
    outline: none;
  }

  .bind {
    font-size: 1.8rem;
    font-weight: bold;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }
  .stats {
    font-size: 2.3rem;
    padding-top: 1.5rem;
    white-space: nowrap;
    font-weight: 600;
    font-family: var(--font-mono);
    letter-spacing: 0.04em;
  }
  .skipPrompt {
    margin-top: 10rem;
    font-family: var(--font-mono);
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-fg);
    backdrop-filter: blur(12px);
  }
  .skipFont {
    font-size: 1.6rem !important;
    color: var(--card-dim);
    line-height: 1.6;
  }
  .skipFont b {
    color: var(--card-accent);
    font-weight: 600;
  }
  .miniplayer {
    height: auto !important;
    cursor: pointer !important;
  }
  .miniplayer .top,
  .miniplayer .bottom, .miniplayer .skip {
    display: none !important;
  }
  .miniplayer video {
    position: relative !important;
  }
  .bg-tp {
    background: hsla(var(--bg-hsl), 0.82);
    backdrop-filter: blur(16px);
    border: 1px solid var(--card-line);
    border-radius: 6px;
  }

  video {
    transition: margin-top 0.2s ease;
  }
  .player {
    user-select: none;
    font-family: var(--font-mono);
    background: var(--black-color);
  }

  /* ── Top bar title/subtitle ─────────────────── */
  /* NOTE: these use px/vw, not rem — this app's root font-size is scaled
     down to ~48-62% (see :root --default-html-font-size), so 1rem here is
     only ~8-10px, not 16px. rem-based clamps were silently capping the
     title around 22-34px. */
  .now-playing {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding-left: clamp(16px, 1.6vw, 32px);
    /* readability scrim so the text holds up over any banner art */
    background: linear-gradient(100deg, rgba(0,0,0,0.325) 0%, rgba(0,0,0,0.195) 30%, rgba(0,0,0,0.039) 60%, rgba(0,0,0,0) 80%);
    pointer-events: none;
  }
  .now-playing-inner {
    max-width: min(640px, 46vw);
    pointer-events: none;
  }
  .np-eyebrow {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 15px;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--card-fg);
    opacity: 0.7;
    text-shadow: 0 1px 4px rgba(0,0,0,0.9);
    margin-bottom: 10px;
  }
  .np-title {
    font-family: var(--font-display);
    font-weight: 800;
    letter-spacing: -0.01em;
    font-size: clamp(30px, 3.4vw, 54px);
    line-height: 1.18;
    color: var(--card-fg);
    text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 4px 5px rgba(0,0,0,0.55);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: 14px;
  }
  .np-episode {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: clamp(17px, 1.3vw, 23px);
    letter-spacing: 0.04em;
    color: var(--card-fg);
    opacity: 0.78;
    text-shadow: 0 1px 4px rgba(0,0,0,0.9);
  }

  .pip :global(canvas:not(.w-full)) {
    width: 1px !important;
    height: 1px !important;
  }

  .icon {
    font-size: 2.8rem;
    padding: 1.5rem;
    display: flex;
  }

  .immersed {
    cursor: none;
  }

  .immersed .middle .ctrl,
  .immersed .top,
  .immersed .bottom, .immersed .skip {
    pointer-events: none;
    opacity: 0;
  }
  .pip video {
    opacity: 0.1%;
  }

  .bufferingDisplay {
    border: 4px solid hsla(var(--white-color-hsl), 0);
    border-top: 4px solid var(--white-color);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 1s linear infinite;
    will-change: transform;
    opacity: 0;
    visibility: hidden;
    transition: 0.2s opacity ease 0s;
    filter: drop-shadow(0 0 8px var(--black-color));
  }

  .buffering .bufferingDisplay {
    opacity: 1 !important;
    visibility: visible !important;
  }
  .pip .bufferingDisplay {
    display: none;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }

    100% {
      transform: rotate(360deg);
    }
  }

  .middle .ctrl {
    font-size: 4rem;
    z-index: 3;
    display: none;
  }
  :fullscreen {
    background: var(--black-color) !important;
  }

  @media (pointer: none), (pointer: coarse) {
    .middle .ctrl {
      display: flex;
    }
  }
  .miniplayer .middle {
    transition: background 0.2s ease;
    position: absolute !important;
    width: 100%;
    height: 100%;
  }
  .miniplayer .middle .ctrl[data-name='playPause'] {
    display: flex;
    font-size: 2.8rem;
  }
  .miniplayer .middle .ctrl[data-name='playPause'] {
    font-size: 5.625rem;
  }
  .miniplayer:hover .middle {
    background: hsla(var(--black-color-hsl), 0.4);
  }
  .middle .ctrl[data-name='playPause'] {
    font-size: 6.75rem;
  }

  .middle .ctrl,
  .bottom .ctrl:hover,
  .bottom .ts:hover,
  .bottom .hover .ts {
    filter: drop-shadow(0 0 8px var(--black-color));
  }
  .skip {
    transition: background 0.12s;
    font-family: inherit !important;
    font-size: 1rem !important;
    font-weight: 600 !important;
    letter-spacing: 0 !important;
    background: rgba(18, 18, 18, 0.9) !important;
    color: #fff !important;
    border: 1px solid rgba(255, 255, 255, 0.2) !important;
    border-radius: 6px !important;
    padding: 8px 14px !important;
    gap: 6px;
  }
  .skip:hover {
    background: rgba(0, 0, 0, 0.95) !important;
    border-color: rgba(255, 255, 255, 0.35) !important;
  }
  .skip :global(svg) {
    color: inherit;
  }
  .skip:hover :global(svg) {
    filter: none;
  }

  .bottom {
    transition: 0.2s opacity ease 0s;
    zoom: 1.3;
  }
  .top {
    transition: 0.2s opacity ease 0s;
  }
  .mr-50 {
    margin-right: 5rem !important;
  }
  .mb-50 {
    margin-bottom: 5rem !important;
  }

  .ctrl {
    cursor: pointer;
  }

  .boost-color {
    color: var(--quindenary-color) !important;
  }

  .bottom .volume .boost {
    width: 3rem;
    height: 3rem;
  }

  .bottom .volume .custom-range {
    width: 5vw;
    height: 100%;
    color: var(--white-color);
  }
  .bottom .volume .custom-range.boost-color {
    color: var(--white-color) !important;
  }

  .h-20 {
    height: 2rem;
  }
  .rounded-10 {
    border-radius: 1rem;
  }

  @keyframes boostPulse {
    0%, 100% { color: var(--white-color); }
    20% { color: var(--quindenary-color); }
  }
  .ui-volume.muted, .ui-volume.boosting {
    transition: opacity .3s ease-in-out, color .7s ease-in-out !important;
  }
  .ui-volume.boosting {
    animation: boostPulse 1.5s ease-in-out infinite !important;
  }
  .ui-volume.muted {
    color: var(--paused-color) !important;
  }
  .volume-ring {
    width: 7rem;
    height: 7rem;
    transform: rotate(-90deg);
  }
  .ring-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 6;
  }
  .ring-fill {
    fill: none;
    stroke: var(--white-color);
    stroke-width: 6;
    stroke-linecap: round;
    stroke-dasharray: 264;
    transition: stroke-dashoffset 0.1s ease-out;
  }
  .ui-volume.muted .ring-fill {
    stroke: var(--paused-color);
  }
  .ui-volume.boosting .ring-fill {
    stroke: var(--quindenary-color);
  }
  .volume-icon-inner {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-shadow {
    filter: drop-shadow(0rem 0rem 0.5rem hsla(var(--black-color-hsl), 0.9));
  }

  .bottom .ts {
    font-family: var(--font-mono);
    color: var(--card-fg);
    white-space: nowrap;
    align-self: center;
    line-height: var(--base-line-height);
    padding: 0 1.56rem;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-shadow: 0 1px 6px rgba(0,0,0,0.8);
  }

  .seekbar {
    font-size: 2rem !important;
  }
  .miniplayer .mobile-focus-target {
    display: block !important;
  }
  .miniplayer .mobile-focus-target:focus-visible {
    background: hsla(209, 100%, 55%, 0.3);
  }

  @media (max-width: 30rem) {
    .d-btn {
      display: none !important;
    }
  }

  @media (max-width: 60rem) {
    .d-title {
      display: block !important;
      max-width: none !important;
      grid-row: unset !important;
      grid-column: unset !important;
    }
    .d-filler {
      display: flex !important;
    }
    .mt-60 {
      margin-top: 6rem !important;
    }
  }

  @media (pointer: none), (pointer: coarse) {
    .bottom .ctrl[data-name='playPause'],
    .bottom .volume,
    .bottom .keybinds {
      display: none !important;
    }
    @media (orientation: portrait) {
      .top  {
        padding-top: var(--safe-area-top) !important;
      }
    }
    .middle .ctrl {
      display: flex !important;
    }
    .miniplayer .middle .ctrl {
      display: none !important;
    }
    .toggle-immerse {
      display: block !important;
    }
    .toggle-fullscreen {
      display: none !important;
    }
  }
<<<<<<< HEAD

  /* ── Skip/Resolve prompt action buttons ────────── */
  .skipPrompt :global(.btn-primary) {
    font-family: var(--font-mono) !important;
    font-size: 1.1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    background: transparent !important;
    color: var(--card-dim) !important;
    border: 1px solid var(--card-line) !important;
    border-radius: 3px !important;
    box-shadow: none !important;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
    min-width: 8rem;
  }
  .skipPrompt :global(.btn-primary:hover) {
    background: var(--card-faint) !important;
    border-color: rgba(255,255,255,0.22) !important;
    color: var(--card-fg) !important;
  }
  .skipPrompt :global(.btn-secondary) {
    font-family: var(--font-mono) !important;
    font-size: 1.1rem !important;
    font-weight: 500 !important;
    letter-spacing: 0.08em !important;
    background: var(--card-accent) !important;
    color: var(--card-bg) !important;
    border: none !important;
    border-radius: 3px !important;
    box-shadow: 0 2px 14px rgba(212,245,94,0.2) !important;
    min-width: 8rem;
    transition: opacity 0.12s;
  }
  .skipPrompt :global(.btn-secondary:hover) { opacity: 0.85; }

  /* ── Stats debug panel ──────────────────────────── */
  :global(.text-monospace.rounded) {
    font-family: var(--font-mono) !important;
    font-size: 1rem !important;
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-fg) !important;
    backdrop-filter: blur(12px);
    border-radius: 4px !important;
  }
  :global(.text-monospace.rounded .pbf:hover) {
    background: var(--card-accent-dim) !important;
    color: var(--card-accent) !important;
  }

  /* ── Ctrl icon hover glow ───────────────────────── */
  .ctrl {
    cursor: pointer;
    transition: color 0.12s, filter 0.12s;
  }
  .ctrl:hover {
    color: var(--card-fg) !important;
    filter: drop-shadow(0 0 6px var(--card-acc-dim));
  }

  /* ── Dropdown menu ──────────────────────────────── */
  :global(.player .dropdown-menu),
  :global(.player .bg-dark.rounded.dr-arrow) {
    font-family: var(--font-mono) !important;
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    border-radius: 4px !important;
    color: var(--card-fg) !important;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7) !important;
  }
  :global(.player .option) {
    font-family: var(--font-mono) !important;
    font-size: 1.1rem !important;
    color: var(--card-dim) !important;
    transition: background 0.1s, color 0.1s;
  }
  :global(.player .option:hover) {
    background: var(--card-faint) !important;
    color: var(--card-fg) !important;
  }
  :global(.player .option svg) {
    color: var(--card-accent);
    filter: drop-shadow(0 0 4px var(--card-acc-dim));
  }

  /* ── Torrent stats bar (peers / speed) ─────────── */
  .top .stats {
    font-size: 1.8rem;
    padding-top: 0;
    font-weight: 500;
    letter-spacing: 0.04em;
    color: var(--card-dim);
    text-shadow: 0 1px 8px rgba(0,0,0,0.9);
  }
  .top .icon {
    color: var(--card-accent);
    filter: drop-shadow(0 0 5px var(--card-acc-dim));
    padding: 0.8rem 0.6rem;
    text-shadow: none;
  }


  /* ══ Jimaku subtitle modal ═════════════════════════════════ */
  :global(.jimaku-modal) {
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    font-family: var(--font-mono) !important;
    color: var(--card-fg) !important;
    box-shadow: 0 24px 64px rgba(0,0,0,0.85) !important;
  }

  /* Header */
  :global(.jimaku-header) {
    padding: 1.5rem 2rem 1.25rem;
    border-bottom: 1px solid var(--card-line);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  :global(.jimaku-label) {
    font-size: 0.72rem;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--card-accent);
    margin-bottom: 0.3rem;
    filter: drop-shadow(0 0 5px var(--card-acc-dim));
  }
  :global(.jimaku-title) {
    margin: 0;
    font-family: var(--font-display) !important;
    font-size: 1.6rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--card-fg);
  }
  :global(.jimaku-close) {
    background: none;
    border: none;
    color: var(--card-dim);
    cursor: pointer;
    font-size: 1.4rem;
    line-height: 1;
    padding: 0.25rem;
    transition: color 0.15s;
    font-family: var(--font-mono);
  }
  :global(.jimaku-close:hover) { color: var(--card-accent); }

  /* File list */
  :global(.jimaku-list) {
    overflow-y: auto;
    max-height: 60vh;
    scrollbar-width: thin;
    scrollbar-color: var(--card-line) transparent;
  }
  :global(.jimaku-row) {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.85rem 2rem;
    border-bottom: 1px solid var(--card-line);
    transition: background 0.1s, padding-left 0.15s;
    cursor: default;
  }
  :global(.jimaku-row:hover) {
    background: var(--card-faint);
    padding-left: 2.4rem;
  }
  :global(.jimaku-index) {
    font-size: 0.78rem;
    color: var(--card-accent);
    flex-shrink: 0;
    width: 1.5rem;
    font-variant-numeric: tabular-nums;
    filter: drop-shadow(0 0 4px var(--card-acc-dim));
  }
  :global(.jimaku-name) {
    flex: 1;
    min-width: 0;
    font-size: 1rem;
    font-weight: 300;
    color: var(--card-fg);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: 0.02em;
  }
  :global(.jimaku-dl) {
    flex-shrink: 0;
    background: var(--card-accent-dim);
    border: 1px solid var(--card-acc-dim);
    color: var(--card-accent);
    padding: 0.35rem 0.85rem;
    border-radius: 3px;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
  }
  :global(.jimaku-dl:hover) {
    background: var(--card-acc-dim) !important;
    border-color: var(--card-accent) !important;
    box-shadow: 0 0 10px var(--card-acc-dim) !important;
  }
  :global(.jimaku-empty) {
    padding: 3rem 2rem;
    text-align: center;
    font-size: 0.88rem;
    color: var(--card-faint);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-family: var(--font-mono);
  }

  /* ══ Context Menu (Windows-style) ════════════════════════════ */
  .ctx-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 99999;
  }
  .ctx-menu {
    position: fixed;
    min-width: 240px;
    padding: 4px 0;
    background: var(--card-surface);
    border: 1px solid color-mix(in srgb, var(--player-accent) 30%, var(--card-line));
    border-radius: 6px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    font-family: var(--font-mono);
    font-size: 1.1rem;
    color: var(--card-fg);
    user-select: none;
    z-index: 100000;
  }
  .ctx-item {
    display: flex;
    align-items: center;
    padding: 5px 28px 5px 16px;
    cursor: default;
    color: var(--card-dim);
    transition: background 0.08s, color 0.08s;
    white-space: nowrap;
    gap: 24px;
  }
  .ctx-item:hover {
    background: color-mix(in srgb, var(--player-accent) 12%, transparent);
    color: var(--player-accent);
  }
  .ctx-item .ctx-label {
    flex: 1;
  }
  .ctx-item .ctx-hint {
    font-size: 1rem;
    color: var(--card-faint);
    font-family: var(--font-mono);
    text-align: right;
  }
  .ctx-item:hover .ctx-hint {
    color: color-mix(in srgb, var(--player-accent) 75%, var(--card-fg));
  }
  .ctx-item .ctx-arrow {
    font-size: 1.4rem;
    color: var(--card-faint);
    line-height: 1;
  }
  .ctx-item:hover .ctx-arrow {
    color: color-mix(in srgb, var(--player-accent) 75%, var(--card-fg));
  }
  .ctx-sep {
    height: 1px;
    margin: 4px 8px;
    background: var(--card-line);
  }

  .episodes-overlay {
    position: fixed;
    inset: 0;
    z-index: 49;
  }

  .episodes-panel {
    position: absolute;
    bottom: 7.5rem;
    right: 3rem;
    width: 420px;
    max-height: 60vh;
    background: var(--card-surface);
    border: 1px solid var(--card-line);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
    z-index: 50;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .episodes-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--card-line);
    background: var(--card-bg2);
  }
  .episodes-panel-title {
    font-size: 0.75rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: var(--card-fg);
  }
  .episodes-panel-close {
    background: none;
    border: none;
    color: var(--card-dim);
    cursor: pointer;
    font-size: 1rem;
    padding: 4px 8px;
    border-radius: 4px;
    transition: color 0.15s, background 0.15s;
  }
  .episodes-panel-close:hover {
    color: var(--card-fg);
    background: var(--card-faint);
  }
  @media (max-width: 480px) {
    .episodes-panel {
      width: calc(100vw - 2rem);
      right: 1rem;
      bottom: 7rem;
    }
  }

</style>
=======
</style>
>>>>>>> shiru-base-copy
