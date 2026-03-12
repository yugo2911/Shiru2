<script>
  import { page, modal, playPage } from '@/modules/navigation.js'
  import { nowPlaying as media } from '@/components/MediaHandler.svelte'
  import { hasUnreadNotifications } from '@/modals/NotificationsModal.svelte'
  import NavbarLink from '@/components/navigation/NavbarLink.svelte'
  import { Home, Search, Users, Download, CalendarSearch, Settings, Bell, BellDot, ListVideo, History, TvMinimalPlay } from 'lucide-svelte'

  const btnSize = '2.2rem'
</script>

<nav class='navbar z-80 navbar-fixed-bottom d-block d-md-none border-0'>
  <div class='navbar-menu h-full d-flex flex-row justify-content-center align-items-center m-0 animate'>

    <NavbarLink click={() => page.navigateTo(page.HOME)} _page={page.HOME} text='Home' let:active>
      <div class='nb-item' class:nb-active={active}>
        <Home size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
        <span class='nb-label'>Home</span>
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

    <NavbarLink click={() => page.navigateTo(page.SEARCH)} _page={page.SEARCH} icon='search' text='Search' let:active>
      <div class='nb-item' class:nb-active={active}>
        <Search size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
        <span class='nb-label'>Search</span>
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

    <NavbarLink click={() => page.navigateTo(page.SCHEDULE)} _page={page.SCHEDULE} icon='schedule' text='Schedule' let:active>
      <div class='nb-item' class:nb-active={active}>
        <CalendarSearch size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
        <span class='nb-label'>Schedule</span>
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

    {#if $media?.media || ($playPage && (Object.keys($media).length > 0))}
      {@const currentMedia = $modal[modal.ANIME_DETAILS]?.data}
      {@const wasModal = $modal && modal.length}
      <NavbarLink
        click={() => {
          if ($playPage && (page.value === page.PLAYER) && !wasModal) { playPage.set(false) }
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
        {@const isActive = active && (currentMedia?.id === $media?.media?.id)}
        <div class='nb-item' class:nb-active={isActive}>
          <svelte:component this={$playPage ? TvMinimalPlay : $media?.display ? History : ListVideo}
            size={btnSize} strokeWidth='2' color={isActive ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nb-label'>{$media?.display ? 'History' : 'Playing'}</span>
          {#if isActive}<span class='nb-pip' />{/if}
        </div>
      </NavbarLink>
    {/if}

    <NavbarLink click={() => page.navigateTo(page.WATCH_TOGETHER)} _page={page.WATCH_TOGETHER} icon='groups' text='Watch Together' let:active>
      <div class='nb-item' class:nb-active={active}>
        <Users size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
        <span class='nb-label'>Together</span>
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

    <NavbarLink click={() => page.navigateTo(page.TORRENT_MANAGER)} _page={page.TORRENT_MANAGER} icon='download' text='Torrents' css='d-none d-sm-block' let:active>
      <div class='nb-item' class:nb-active={active}>
        <Download size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
        <span class='nb-label'>Torrents</span>
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

    <NavbarLink click={() => { modal.toggle(modal.NOTIFICATIONS) }} icon='bell' text='Notifications' _modal={modal.NOTIFICATIONS} let:active let:hovering>
      <div class='nb-item' class:nb-active={active}>
        {#if $hasUnreadNotifications && $hasUnreadNotifications > 0}
          <div class='nb-bell-wrap'>
            <BellDot size={btnSize} class='notify' strokeWidth='2' color='var(--notify)' />
            <span class='nb-badge'>{$hasUnreadNotifications}</span>
          </div>
          <span class='nb-label' style='color:var(--notify)'>Alerts</span>
        {:else}
          <Bell size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class='nb-label'>Alerts</span>
        {/if}
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

    <NavbarLink click={() => page.navigateTo(page.SETTINGS)} _page={page.SETTINGS} icon='settings' text='Settings' let:active>
      <div class='nb-item' class:nb-active={active}>
        <Settings size={btnSize} strokeWidth='2' color={active ? 'var(--acc)' : 'var(--dim)'} />
        <span class='nb-label'>Settings</span>
        {#if active}<span class='nb-pip' />{/if}
      </div>
    </NavbarLink>

  </div>
</nav>

<style>
  /* ── Tokens ──────────────────────────────────────────────────── */
  .navbar {
    --bg:      #0d0d10;
    --line:    rgba(255,255,255,0.07);
    --fg:      #ededea;
    --dim:     rgba(237,237,234,0.32);
    --faint:   rgba(237,237,234,0.05);
    --acc:     #d4f55e;
    --acc-dim: rgba(212,245,94,0.10);
    --notify:  #a78bfa;

    background: rgba(13,13,16,0.96) !important;
    border-top: 1px solid var(--line) !important;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    font-family: 'IBM Plex Mono', monospace;
  }

  /* ── Nav item ────────────────────────────────────────────────── */
  .nb-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.28rem;
    padding: 0.55rem 0.7rem 0.45rem;
    border-top: 2px solid transparent;
    cursor: pointer;
    position: relative;
    transition: background 0.12s, border-color 0.12s;
    border-radius: 0 0 6px 6px;
    min-width: 3.2rem;
  }
  .nb-item:hover {
    background: var(--faint);
    border-top-color: var(--line);
  }
  .nb-active {
    background: var(--acc-dim);
    border-top-color: var(--acc) !important;
  }

  /* ── Label ───────────────────────────────────────────────────── */
  .nb-label {
    font-size: 0.58rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dim);
    white-space: nowrap;
    transition: color 0.12s;
  }
  .nb-active .nb-label { color: var(--acc); }

  /* ── Active pip ──────────────────────────────────────────────── */
  .nb-pip {
    position: absolute;
    top: -2px;
    left: 50%;
    transform: translateX(-50%);
    width: 18px;
    height: 2px;
    border-radius: 0 0 2px 2px;
    background: var(--acc);
    box-shadow: 0 0 8px var(--acc);
  }

  /* ── Notification badge ──────────────────────────────────────── */
  .nb-bell-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .nb-badge {
    position: absolute;
    top: -0.3rem;
    right: -0.45rem;
    font-size: 0.55rem;
    font-weight: 700;
    background: var(--notify);
    color: var(--bg);
    border-radius: 99px;
    padding: 0.05em 0.4em;
    letter-spacing: 0.02em;
    line-height: 1.4;
  }

  /* ── Glow animations ─────────────────────────────────────────── */
  .navbar .animate :global(.notify) {
    animation: purple_glow 1.4s ease-in-out infinite alternate,
               bell_shake 10s infinite;
  }
  @keyframes purple_glow {
    from { filter: drop-shadow(0 0 3px rgba(167,139,250,0.4)); }
    to   { filter: drop-shadow(0 0 10px rgba(167,139,250,0.9)); }
  }
</style>