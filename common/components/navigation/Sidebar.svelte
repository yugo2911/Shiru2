<script>
  import { nowPlaying as media } from '@/components/MediaHandler.svelte'
  import { hasUnreadNotifications as unread } from '@/modals/NotificationsModal.svelte'
  import { updateState } from '@/modals/UpdateModal.svelte'
  import { settings } from '@/modules/settings.js'
  import { SUPPORTS } from '@/modules/support.js'
  import { status } from '@/modules/networking.js'
  import { click } from '@/modules/click.js'
  import { toast } from 'svelte-sonner'
  import Helper from '@/modules/helper.js'
  import { page, modal, playPage, goBack, goForward, canGoBack, canGoForward } from '@/modules/navigation.js'
  import { IPC, ELECTRON, VERSION } from '@/modules/bridge.js'
  import SidebarLink from '@/components/navigation/SidebarLink.svelte'
  import { ChevronLeft, ChevronRight, CalendarSearch, Download, CloudDownload, Heart, Home, Search, ListVideo, History, TvMinimalPlay, LogIn, Settings, Users, Bell, BellDot } from 'lucide-svelte'

  let statusTransition = false, fullScreen = false
  const isDarwin = VERSION.platform === 'darwin'
  const btnSize = !SUPPORTS.isAndroid ? '2rem' : '2.2rem'

  $: if ($status) { 
    statusTransition = true
    setTimeout(() => (statusTransition = false), 3000)
  }

  ELECTRON.isFullScreen().then(v => { 
    fullScreen = v
    ELECTRON.onFullScreen(f => fullScreen = f) 
  })

  const navTo = (p) => page.navigateTo(p)
  const openDonate = () => IPC.emit('open', 'https://github.com/sponsors/RockinChaos/')
</script>

<div class="sidebar z-80 d-md-block" class:animated={$settings.expandingSidebar}>
  <div class="sidebar-bg" />
  <div class="sidebar-overlay" class:animated={$settings.expandingSidebar} />
  
  <div class="sidebar-menu h-full d-flex flex-column m-0 pb-5" class:br-10={!$settings.expandingSidebar}>
    <div class="status-spacer" 
      class:is-offline={$status?.includes('offline')} 
      class:is-darwin={isDarwin && !fullScreen} 
      class:status-transition={statusTransition} />

    {#if !SUPPORTS.isAndroid}
      <div class="logo-block">
        <img src="./icon_filled.png" class="app-logo" alt="ico" use:click={() => navTo(page.HOME)} />
        <div class="nav-arrows">
          <SidebarLink click={goBack} innerCss="arrow-btn"><ChevronLeft size="1.4rem" strokeWidth="2.5" color={$canGoBack ? 'var(--acc)' : 'var(--dim)'} /></SidebarLink>
          <SidebarLink click={goForward} innerCss="arrow-btn"><ChevronRight size="1.4rem" strokeWidth="2.5" color={$canGoForward ? 'var(--acc)' : 'var(--dim)'} /></SidebarLink>
        </div>
      </div>
      <div class="divider" />
    {/if}

    <nav class="nav-section">
      <div class="nav-label">NAVIGATE</div>
      {#each [[page.HOME, Home, 'Home'], [page.SEARCH, Search, 'Search'], [page.SCHEDULE, CalendarSearch, 'Schedule']] as [p, Icon, txt]}
        <SidebarLink click={() => navTo(p)} _page={p} text={txt} let:active>
          <div class="nav-item" class:nav-item-active={active}>
            <svelte:component this={Icon} size={btnSize} class="nav-icon" color={active ? 'var(--acc)' : 'var(--dim)'} />
            <span class="nav-text">{txt}</span>
            {#if active}<span class="nav-pip" />{/if}
          </div>
        </SidebarLink>
      {/each}

      {#if $media?.media || $playPage}
        {@const cur = $modal[modal.ANIME_DETAILS]?.data}
        {@const isPlayer = $playPage && $page === page.PLAYER}
        <SidebarLink 
          click={() => { if (isPlayer && !($modal && modal.length)) playPage.set(false); $playPage ? navTo(page.PLAYER) : (cur?.id === $media?.media?.id ? modal.close(modal.ANIME_DETAILS) : modal.open(modal.ANIME_DETAILS, $media?.media)) }} 
          _page={$playPage ? page.PLAYER : null} 
          text={$media?.display ? 'Last Watched' : 'Now Playing'} 
          let:active>
          <div class="nav-item" class:nav-item-active={active}>
            <svelte:component this={$playPage ? TvMinimalPlay : $media?.display ? History : ListVideo} size={btnSize} class="nav-icon" color={active ? 'var(--acc)' : 'var(--dim)'} />
            <span class="nav-text">{$media?.display ? 'Last Watched' : 'Now Playing'}</span>
            {#if active}<span class="nav-pip" />{/if}
          </div>
        </SidebarLink>
      {/if}

      <SidebarLink click={() => navTo(page.WATCH_TOGETHER)} _page={page.WATCH_TOGETHER} text="Together" let:active>
        <div class="nav-item" class:nav-item-active={active}><Users size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} /><span class="nav-text">Together</span>{#if active}<span class="nav-pip" />{/if}</div>
      </SidebarLink>
    </nav>

    <div class="divider" />
    
    <nav class="nav-section nav-bottom">
      <div class="nav-label">SYSTEM</div>
      
      {#if $settings.donate && !SUPPORTS.isAndroid}
        <SidebarLink click={openDonate} text="Support" let:hovering>
          <div class="nav-item" class:nav-item-active={hovering}><Heart size={btnSize} fill={hovering ? 'var(--donate)' : 'none'} color={hovering ? 'var(--donate)' : 'var(--dim)'} /><span class="nav-text">Support</span></div>
        </SidebarLink>
      {/if}

      {#if $updateState === 'downloading'}
        <SidebarLink click={() => toast('Update downloading...')} text="Updating">
          <div class="nav-item"><CloudDownload size={btnSize} color="var(--update-dl)" /><span class="nav-text" style="color:var(--update-dl)">Updating…</span></div>
        </SidebarLink>
      {:else if ['ready','ignored','aborted'].includes($updateState)}
        <SidebarLink click={() => $updateState !== 'ready' ? updateState.set('ready') : modal.open(modal.UPDATE_PROMPT)} text="Update!" let:hovering>
          <div class="nav-item" class:nav-item-active={hovering}><CloudDownload size={btnSize} color="var(--update-ready)" /><span class="nav-text" style="color:var(--update-ready)">Update!</span></div>
        </SidebarLink>
      {/if}

      <SidebarLink click={() => modal.toggle(modal.NOTIFICATIONS)} text="Alerts" _modal={modal.NOTIFICATIONS} let:active>
        <div class="nav-item" class:nav-item-active={active}>
          {#if $unread > 0}
            <BellDot size={btnSize} color="var(--notify)" /><span class="nav-text" style="color:var(--notify)">Alerts</span><span class="notif-badge">{$unread}</span>
          {:else}
            <Bell size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} /><span class="nav-text">Alerts</span>
          {/if}
          {#if active}<span class="nav-pip" />{/if}
        </div>
      </SidebarLink>

      {#if !SUPPORTS.isAndroid}
        {@const user = Helper.getUser()}
        {@const avatar = Helper.getUserAvatar()}
        <SidebarLink click={() => modal.toggle(modal.PROFILE)} text={user ? 'Profile' : 'Login'} _modal={modal.PROFILE} let:active>
          <div class="nav-item" class:nav-item-active={active}>
            {#if avatar}<img src={avatar} alt="avatar" class="user-avatar" />{:else}<LogIn size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} />{/if}
            <span class="nav-text">{user ? 'Profile' : 'Login'}</span>
            {#if active}<span class="nav-pip" />{/if}
          </div>
        </SidebarLink>
      {/if}
    </nav>
  </div>
</div>

<style>
  .sidebar { 
    --bg:#0d0d10; --line:rgba(255,255,255,0.07); --dim:rgba(237,237,234,0.32); 
    --faint:rgba(237,237,234,0.05); --acc:#d4f55e; --acc-dim:rgba(212,245,94,0.1); 
    --donate:#f472b6; --notify:#a78bfa; --update-dl:#5eaff5; --update-ready:#4ade80; 
    background:none!important; overflow:visible; font-family:'IBM Plex Mono',monospace; 
  }

  .sidebar-bg { position:absolute; height:100%; width:var(--sidebar-width); background:var(--bg); z-index:-1; pointer-events:none; }
  
  .sidebar-overlay { 
    position:absolute; height:100%; width:var(--sidebar-width); z-index:-1; pointer-events:none;
    background:linear-gradient(180deg, rgba(13,13,16,0.98) 0%, rgba(13,13,16,0.92) 100%); 
    border-right:1px solid var(--line); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); 
  }

  .sidebar.animated, .sidebar-overlay.animated { transition: width .8s cubic-bezier(0.25,0.8,0.25,1)!important; }
  .sidebar.animated:hover { width:22rem; } 
  .sidebar.animated:hover .sidebar-overlay { width:63rem; }
  .sidebar.animated:hover .nav-text { opacity:1; max-width:12rem; }
  .sidebar.animated:hover .nav-pip { opacity:1; }

  .status-spacer { width:50%; flex-shrink:0; transition: height 0.3s; }
  .status-spacer.is-offline { height: 25px; }
  .status-spacer.is-darwin { height: 25px; }

  .logo-block { display:flex; flex-direction:column; align-items:center; padding:1.6rem 0 1rem; gap:0.8rem; }
  .app-logo { width:2.4rem; height:2.4rem; cursor:pointer; opacity:0.9; }
  .nav-arrows { display:flex; gap:0.2rem; }
  
  :global(.arrow-btn) { display:flex; align-items:center; justify-content:center; width:1.8rem; height:1.8rem; transition:background 0.12s; border:1px solid transparent; }
  :global(.arrow-btn:hover) { background:var(--faint); border-color:var(--line); }

  .divider { width:calc(100% - 1.6rem); margin:0.4rem auto; height:1px; background:var(--line); }
  
  .nav-section { display:flex; flex-direction:column; gap:0.1rem; padding:0.6rem 0; }
  .nav-label { font-size:0.62rem; font-weight:600; letter-spacing:0.2em; color:rgba(237,237,234,0.18); padding:0 0 0.5rem 1.1rem; text-transform:uppercase; }
  
  .nav-item { display:flex; align-items:center; gap:0.85rem; padding:0.55rem 1.1rem; border-left:2px solid transparent; cursor:pointer; transition:background 0.12s, border-color 0.12s; }
  .nav-item:hover { background:var(--faint); border-left-color:var(--line); }
  .nav-item-active { background:var(--acc-dim); border-left-color:var(--acc)!important; }

  .nav-text { font-size:0.82rem; color:var(--dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:0; max-width:0; transition:opacity 0.2s, max-width 0.3s; }
  .nav-item-active .nav-text { color:var(--acc); }

  .nav-pip { position:absolute; right:0; top:50%; transform:translateY(-50%); width:3px; height:20px; background:var(--acc); opacity:0; }
  .notif-badge { font-size:0.62rem; font-weight:600; background:var(--notify); color:var(--bg); padding:0.1em 0.4em; margin-left:auto; }
  .user-avatar { width:2rem; height:2rem; border:1px solid var(--line); object-fit:cover; }
  .nav-item-active .user-avatar { border-color:var(--acc); }
</style>