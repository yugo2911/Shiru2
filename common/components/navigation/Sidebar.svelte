<script>
  import { nowPlaying as media } from '@/components/MediaHandler.svelte'
  import { hasUnreadNotifications } from '@/modals/NotificationsModal.svelte'
  import { updateState } from '@/modals/UpdateModal.svelte'
  import { settings } from '@/modules/settings.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { status } from '@/modules/networking.js'
  import { click } from '@/modules/click.js'
  import { toast } from 'svelte-sonner'
  import Helper from '@/modules/helper.js'
  import { page, modal, playPage } from '@/modules/navigation.js'
  import { IPC, ELECTRON, VERSION } from '@/modules/bridge.js'
  import { goBack, goForward, canGoBack, canGoForward } from '@/modules/navigation.js'
  import SidebarLink from '@/components/navigation/SidebarLink.svelte'
  import { ChevronLeft, ChevronRight, CalendarSearch, Download, CloudDownload, Heart, Home, Search, ListVideo, History, TvMinimalPlay, LogIn, Settings, Users, Bell, BellDot } from 'lucide-svelte'

  const btnSize = !SUPPORTS.isAndroid ? '2rem' : '2.2rem'
  let _status = status.value
  $: statusTransition = false
  $: {
    if (_status !== $status) {
      statusTransition = true
      setTimeout(() => (statusTransition = false), 3000)
      _status = $status
    }
  }
  let fullScreen = false
  ELECTRON.isFullScreen().then(isFullScreen => {
    fullScreen = isFullScreen
    ELECTRON.onFullScreen((isFullScreen) => fullScreen = isFullScreen)
  })
</script>

<div class='sidebar z-80 d-md-block' class:animated={$settings.expandingSidebar}>
  <div class='z--1 pointer-events-none h-full bg-dark position-absolute' style='width: var(--sidebar-width)'/>
  <div class='sidebar-overlay z--1 pointer-events-none h-full position-absolute' class:animated={$settings.expandingSidebar} />
  <div class='sidebar-menu h-full d-flex flex-column m-0 pb-5 animate' class:br-10={!$settings.expandingSidebar}>

    <div class='w-50 top-0 flex-shrink-0 pointer-events-none {_status?.match(/offline/i) ? `h-25` : `${VERSION.platform === `darwin` && !fullScreen ? `h-25` : `h-0`}`}' class:status-transition={statusTransition}/>

    <!-- Logo + nav arrows -->
    {#if !SUPPORTS.isAndroid}
      <div class='logo-block'>
        <img src='./icon_filled.png' tabindex='-1' class='app-logo d-sm-h-none' alt='ico' use:click={() => page.navigateTo(page.HOME)} />
        <div class='nav-arrows'>
          <SidebarLink click={goBack} icon='moveleft' css='p-0 m-0 h-auto w-auto' innerCss='arrow-btn rounded-left-block'>
            <ChevronLeft size='1.4rem' class='flex-shrink-0' strokeWidth='2.5' color={$canGoBack ? 'var(--acc)' : 'var(--dim)'} />
          </SidebarLink>
          <SidebarLink click={goForward} icon='moveright' css='p-0 m-0 h-auto w-auto' innerCss='arrow-btn rounded-right-block'>
            <ChevronRight size='1.4rem' class='flex-shrink-0' strokeWidth='2.5' color={$canGoForward ? 'var(--acc)' : 'var(--dim)'} />
          </SidebarLink>
        </div>
      </div>

      <div class='divider' />
    {/if}

    <!-- Primary nav -->
    <nav class='nav-section'>
      <div class='nav-label'>NAVIGATE</div>

      <SidebarLink click={() => page.navigateTo(page.HOME)} _page={page.HOME} icon='home' text='Home' css='{!SUPPORTS.isAndroid ? `mt-md-h-auto` : ``}' let:active>
        <div class='nav-item' class:nav-item-active={active}>
          <Home size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nav-text'>Home</span>
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>

      <SidebarLink click={() => page.navigateTo(page.SEARCH)} _page={page.SEARCH} icon='search' text='Search' let:active>
        <div class='nav-item' class:nav-item-active={active}>
          <Search size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nav-text'>Search</span>
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>

      <SidebarLink click={() => page.navigateTo(page.SCHEDULE)} _page={page.SCHEDULE} icon='schedule' text='Schedule' let:active>
        <div class='nav-item' class:nav-item-active={active}>
          <CalendarSearch size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nav-text'>Schedule</span>
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>

      {#if $media?.media || ($playPage && (Object.keys($media).length > 0))}
        {@const currentMedia = $modal[modal.ANIME_DETAILS]?.data}
        {@const wasModal = $modal && modal.length}
        <SidebarLink
          click={() => {
            if ($playPage && ($page === page.PLAYER) && !wasModal) { playPage.set(false) }
            if ($playPage) { page.navigateTo(page.PLAYER) }
            else if (currentMedia?.id === $media?.media.id && modal.length === 1) { modal.close(modal.ANIME_DETAILS) }
            else { modal.open(modal.ANIME_DETAILS, $media?.media) }
          }}
          rbClick={() => {
            if ($media?.media) {
              if (currentMedia?.id === $media.media.id && modal.length === 1) { modal.close(modal.ANIME_DETAILS) }
              else { modal.open(modal.ANIME_DETAILS, $media.media) }
            }
          }}
          _page={$playPage ? page.PLAYER : null} icon='queue_music'
          text={$media?.display ? 'Last Watched' : 'Now Playing'}
          _modal={modal.ANIME_DETAILS} let:active>
          <div class='nav-item' class:nav-item-active={active}>
            <svelte:component this={$playPage ? TvMinimalPlay : $media?.display ? History : ListVideo}
              size={btnSize} class='nav-icon' strokeWidth='2'
              color={active && (currentMedia?.id === $media?.media?.id) ? 'var(--acc)' : 'var(--dim)'} />
            <span class='nav-text'>{$media?.display ? 'Last Watched' : 'Now Playing'}</span>
            {#if active}<span class='nav-pip' />{/if}
          </div>
        </SidebarLink>
      {/if}

      <SidebarLink click={() => page.navigateTo(page.WATCH_TOGETHER)} _page={page.WATCH_TOGETHER} icon='groups' text='Watch Together' let:active>
        <div class='nav-item' class:nav-item-active={active}>
          <Users size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nav-text'>Together</span>
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>

      <SidebarLink click={() => page.navigateTo(page.TORRENT_MANAGER)} _page={page.TORRENT_MANAGER} icon='download' text='Torrents' css='d-sm-h-none' let:active>
        <div class='nav-item' class:nav-item-active={active}>
          <Download size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nav-text'>Torrents</span>
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>
    </nav>

    <div class='divider' />

    <!-- System nav -->
    <nav class='nav-section nav-bottom'>
      <div class='nav-label'>SYSTEM</div>

      {#if $settings.donate && !SUPPORTS.isAndroid}
        <SidebarLink click={() => { IPC.emit('open', 'https://github.com/sponsors/RockinChaos/') }} icon='favorite' text='Support This App' css='d-sm-h-none' let:active let:hovering>
          <div class='nav-item' class:nav-item-active={hovering}>
            <Heart size={btnSize} class='nav-icon donate' strokeWidth='2' fill={hovering ? 'var(--donate)' : 'none'} color={hovering ? 'var(--donate)' : 'var(--dim)'} />
            <span class='nav-text'>Support</span>
          </div>
        </SidebarLink>
      {/if}

      {#if $updateState === 'downloading'}
        <SidebarLink click={() => { toast('Update is downloading...', { description: 'This may take a moment, the update will be ready shortly.' }) }} icon='download' text='Update Downloading...' css='d-sm-h-none' _modal={modal.UPDATE_PROMPT} let:hovering>
          <div class='nav-item update-downloading'>
            <CloudDownload size={btnSize} class='nav-icon' strokeWidth='2' color='var(--update-dl)' />
            <span class='nav-text' style='color:var(--update-dl)'>Updating…</span>
          </div>
        </SidebarLink>
      {:else if $updateState === 'ready' || $updateState === 'ignored' || $updateState === 'aborted'}
        <SidebarLink click={() => { if ($updateState !== 'ready') updateState.set('ready'); else modal.open(modal.UPDATE_PROMPT) }} icon='download' text='Update Available!' css='d-sm-h-none' _modal={modal.UPDATE_PROMPT} let:hovering>
          <div class='nav-item' class:nav-item-active={hovering}>
            <CloudDownload size={btnSize} class='nav-icon update-ready' strokeWidth='2' color='var(--update-ready)' />
            <span class='nav-text' style='color:var(--update-ready)'>Update!</span>
          </div>
        </SidebarLink>
      {/if}

      <SidebarLink click={() => { modal.toggle(modal.NOTIFICATIONS) }} icon='bell' text='Notifications' _modal={modal.NOTIFICATIONS} let:active let:hovering>
        <div class='nav-item' class:nav-item-active={active}>
          {#if $hasUnreadNotifications && $hasUnreadNotifications > 0}
            <BellDot size={btnSize} class='nav-icon notify' strokeWidth='2' color='var(--notify)' />
            <span class='nav-text' style='color:var(--notify)'>Alerts</span>
            <span class='notif-badge'>{$hasUnreadNotifications}</span>
          {:else}
            <Bell size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
            <span class='nav-text'>Alerts</span>
          {/if}
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>

      <SidebarLink click={() => page.navigateTo(page.SETTINGS)} _page={page.SETTINGS} icon='settings' text='Settings' let:active>
        <div class='nav-item' class:nav-item-active={active}>
          <Settings size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nav-text'>Settings</span>
          {#if active}<span class='nav-pip' />{/if}
        </div>
      </SidebarLink>

      {#if !SUPPORTS.isAndroid}
        <SidebarLink click={() => modal.toggle(modal.PROFILE)} icon='login' text={Helper.getUser() ? 'Profiles' : 'Login'} _modal={modal.PROFILE} image={Helper.getUserAvatar()} let:active>
          <div class='nav-item' class:nav-item-active={active}>
            {#if Helper.getUserAvatar()}
              <img src={Helper.getUserAvatar()} alt='avatar' class='user-avatar' />
            {:else}
              <LogIn size={btnSize} class='nav-icon' strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
            {/if}
            <span class='nav-text'>{Helper.getUser() ? 'Profile' : 'Login'}</span>
            {#if active}<span class='nav-pip' />{/if}
          </div>
        </SidebarLink>
      {/if}
    </nav>

  </div>
</div>

<style>
  /* ── Design tokens ─────────────────────────────────────────── */
  .sidebar {
    --bg:        #0d0d10;
    --bg2:       #131317;
    --line:      rgba(255,255,255,0.07);
    --fg:        #ededea;
    --dim:       rgba(237,237,234,0.32);
    --faint:     rgba(237,237,234,0.05);
    --acc:       #d4f55e;
    --acc-dim:   rgba(212,245,94,0.10);
    --acc-glow:  rgba(212,245,94,0.18);
    --donate:    #f472b6;
    --notify:    #a78bfa;
    --update-dl:    #5eaff5;
    --update-ready: #4ade80;

    background: none !important;
    overflow-y: unset;
    overflow-x: visible;
    left: unset;
    font-family: 'IBM Plex Mono', monospace;
  }

  .sidebar.animated,
  .sidebar-overlay.animated {
    transition: width .8s cubic-bezier(0.25, 0.8, 0.25, 1),
                left  .8s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  }
  .sidebar.animated:hover { width: 22rem; }

  .sidebar-overlay {
    width: var(--sidebar-width);
    background: linear-gradient(180deg, rgba(13,13,16,0.98) 0%, rgba(13,13,16,0.92) 100%);
    border-right: 1px solid var(--line);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .sidebar.animated:hover .sidebar-overlay { width: 63rem; }

  /* ── Logo block ─────────────────────────────────────────────── */
  .logo-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.6rem 0 1rem;
    gap: 0.8rem;
    position: relative;
    z-index: 1;
  }
  .app-logo {
    width: 2.4rem;
    height: 2.4rem;
    object-fit: contain;
    cursor: pointer;
    opacity: 0.9;
    transition: opacity 0.15s;
    filter: drop-shadow(0 0 8px var(--acc-glow));
  }
  .app-logo:hover { opacity: 1; }

  .nav-arrows {
    display: flex;
    gap: 0.2rem;
  }
  :global(.arrow-btn) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 4px;
    transition: background 0.12s;
  }
  :global(.arrow-btn:hover) { background: var(--faint); }

  /* ── Divider ────────────────────────────────────────────────── */
  .divider {
    width: calc(100% - 1.6rem);
    margin: 0.4rem auto;
    height: 1px;
    background: var(--line);
    flex-shrink: 0;
    position: relative;
    z-index: 1;
  }

  /* ── Nav sections ───────────────────────────────────────────── */
  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.6rem 0;
    position: relative;
    z-index: 1;
  }
  .nav-bottom { margin-top: auto; }

  .nav-label {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.2em;
    color: rgba(237,237,234,0.18);
    padding: 0 0 0.5rem 1.1rem;
    text-transform: uppercase;
  }

  /* ── Nav items ──────────────────────────────────────────────── */
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.85rem;
    padding: 0.55rem 1.1rem;
    border-left: 2px solid transparent;
    border-radius: 0 6px 6px 0;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, padding-left 0.12s;
    position: relative;
    width: 100%;
    box-sizing: border-box;
  }
  .nav-item:hover {
    background: var(--faint);
    border-left-color: var(--line);
  }
  .nav-item-active {
    background: var(--acc-dim);
    border-left-color: var(--acc) !important;
  }

  :global(.nav-icon) {
    flex-shrink: 0;
    transition: color 0.12s;
  }

  .nav-text {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.82rem;
    font-weight: 400;
    letter-spacing: 0.06em;
    color: var(--dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 0.12s;
    /* Hidden by default, shown on hover/expanded */
    opacity: 0;
    max-width: 0;
    transition: opacity 0.2s, max-width 0.3s, color 0.12s;
  }
  .nav-item-active .nav-text { color: var(--acc); }

  .sidebar.animated:hover .nav-text {
    opacity: 1;
    max-width: 12rem;
  }

  /* Active pip */
  .nav-pip {
    position: absolute;
    right: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--acc);
    box-shadow: 0 0 6px var(--acc);
    opacity: 0;
    transition: opacity 0.2s;
  }
  .sidebar.animated:hover .nav-pip { opacity: 1; }

  /* ── Notification badge ─────────────────────────────────────── */
  .notif-badge {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 0.62rem;
    font-weight: 600;
    background: var(--notify);
    color: var(--bg);
    border-radius: 99px;
    padding: 0.1em 0.5em;
    flex-shrink: 0;
    letter-spacing: 0.02em;
    margin-left: auto;
  }

  /* ── User avatar ────────────────────────────────────────────── */
  .user-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 4px;
    object-fit: cover;
    border: 1px solid var(--line);
    flex-shrink: 0;
  }
  .nav-item-active .user-avatar { border-color: var(--acc); }

  /* ── Glowing animations ─────────────────────────────────────── */
  .sidebar .animate :global(.donate) {
    animation: pink_glow 1.4s ease-in-out infinite alternate;
  }
  .sidebar .animate :global(.notify) {
    animation: purple_glow 1.4s ease-in-out infinite alternate,
               bell_shake 10s infinite;
  }
  .sidebar .animate :global(.update-ready) {
    animation: green_glow 1.4s ease-in-out infinite alternate;
  }

  @keyframes pink_glow {
    from { filter: drop-shadow(0 0 3px rgba(244,114,182,0.4)); }
    to   { filter: drop-shadow(0 0 10px rgba(244,114,182,0.9)); }
  }
  @keyframes purple_glow {
    from { filter: drop-shadow(0 0 3px rgba(167,139,250,0.4)); }
    to   { filter: drop-shadow(0 0 10px rgba(167,139,250,0.9)); }
  }
  @keyframes green_glow {
    from { filter: drop-shadow(0 0 3px rgba(74,222,128,0.4)); }
    to   { filter: drop-shadow(0 0 10px rgba(74,222,128,0.9)); }
  }
</style>