<script>
  import { page, modal, playPage } from '@/modules/navigation.js'
  import { nowPlaying as media } from '@/components/MediaHandler.svelte'
  import { hasUnreadNotifications as unread } from '@/modals/NotificationsModal.svelte'
  import NavbarLink from '@/components/navigation/NavbarLink.svelte'
  import { Home, Search, Users, Download, CalendarSearch, Settings, Bell, BellDot, ListVideo, History, TvMinimalPlay } from 'lucide-svelte'

  const btnSize = '2.2rem'
  const navTo = (p) => page.navigateTo(p)

  $: showMedia = $media?.media || $playPage
  $: mediaIcon = $playPage ? TvMinimalPlay : $media?.display ? History : ListVideo
  $: mediaText = $media?.display ? 'History' : 'Playing'
</script>

<nav class="navbar z-80 navbar-fixed-bottom d-block d-md-none border-0">
  <div class="navbar-menu h-full d-flex flex-row justify-content-center align-items-center m-0 animate">
    
    {#each [[page.HOME, Home, 'Home'], [page.SEARCH, Search, 'Search'], [page.SCHEDULE, CalendarSearch, 'Schedule']] as [p, Icon, txt]}
      <NavbarLink click={() => navTo(p)} _page={p} text={txt} let:active>
        <div class="nb-item" class:nb-active={active}>
          <svelte:component this={Icon} size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class="nb-label">{txt}</span>
          {#if active}<span class="nb-pip" />{/if}
        </div>
      </NavbarLink>
    {/each}

    {#if showMedia}
      {@const curId = $modal[modal.ANIME_DETAILS]?.data?.id}
      <NavbarLink
        click={() => { 
          if ($playPage && $page === page.PLAYER && !($modal && modal.length)) playPage.set(false); 
          $playPage ? navTo(page.PLAYER) : (curId === $media?.media?.id ? modal.close(modal.ANIME_DETAILS) : modal.open(modal.ANIME_DETAILS, $media?.media)) 
        }}
        _page={$playPage ? page.PLAYER : null} text={mediaText} let:active>
        <div class="nb-item" class:nb-active={active}>
          <svelte:component this={mediaIcon} size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class="nb-label">{mediaText}</span>
          {#if active}<span class="nb-pip" />{/if}
        </div>
      </NavbarLink>
    {/if}

    <NavbarLink click={() => navTo(page.WATCH_TOGETHER)} _page={page.WATCH_TOGETHER} text="Together" let:active>
      <div class="nb-item" class:nb-active={active}><Users size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} /><span class="nb-label">Together</span>{#if active}<span class="nb-pip" />{/if}</div>
    </NavbarLink>

    <NavbarLink click={() => navTo(page.TORRENT_MANAGER)} _page={page.TORRENT_MANAGER} text="Torrents" css="d-none d-sm-block" let:active>
      <div class="nb-item" class:nb-active={active}><Download size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} /><span class="nb-label">Torrents</span>{#if active}<span class="nb-pip" />{/if}</div>
    </NavbarLink>

    <NavbarLink click={() => modal.toggle(modal.NOTIFICATIONS)} text="Alerts" _modal={modal.NOTIFICATIONS} let:active>
      <div class="nb-item" class:nb-active={active}>
        {#if $unread > 0}
          <div class="nb-bell-wrap">
            <BellDot size={btnSize} class="notify" color="var(--notify)" />
            <span class="nb-badge">{$unread}</span>
          </div>
          <span class="nb-label" style="color:var(--notify)">Alerts</span>
        {:else}
          <Bell size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} />
          <span class="nb-label">Alerts</span>
        {/if}
        {#if active}<span class="nb-pip" />{/if}
      </div>
    </NavbarLink>

    <NavbarLink click={() => navTo(page.SETTINGS)} _page={page.SETTINGS} text="Settings" let:active>
      <div class="nb-item" class:nb-active={active}><Settings size={btnSize} color={active ? 'var(--acc)' : 'var(--dim)'} /><span class="nb-label">Settings</span>{#if active}<span class="nb-pip" />{/if}</div>
    </NavbarLink>
  </div>
</nav>

<style>
  .navbar { 
    --bg:#0d0d10; --line:rgba(255,255,255,0.07); --dim:rgba(237,237,234,0.32); 
    --faint:rgba(237,237,234,0.05); --acc:#d4f55e; --acc-dim:rgba(212,245,94,0.1); --notify:#a78bfa; 
    background:rgba(13,13,16,0.96)!important; border-top:1px solid var(--line)!important; 
    backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); font-family:'IBM Plex Mono',monospace; 
  }
  
  .nb-item { 
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.28rem; 
    padding:0.55rem 0.7rem 0.45rem; border-top:2px solid transparent; cursor:pointer; 
    position:relative; transition:background 0.12s, border-color 0.12s; min-width:3.2rem; 
  }
  
  .nb-item:hover { background:var(--faint); border-top-color:var(--line); }
  .nb-active { background:var(--acc-dim); border-top-color:var(--acc)!important; }
  
  .nb-label { font-size:0.58rem; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:var(--dim); transition:color 0.12s; }
  .nb-active .nb-label { color:var(--acc); }
  
  .nb-pip { position:absolute; top:-2px; left:50%; transform:translateX(-50%); width:18px; height:2px; background:var(--acc); }
  
  .nb-bell-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
  .nb-badge { position:absolute; top:-0.3rem; right:-0.45rem; font-size:0.55rem; font-weight:700; background:var(--notify); color:var(--bg); border-radius:99px; padding:0.05em 0.4em; line-height:1.4; }
  
  .navbar :global(.notify) { animation: purple_glow 1.4s ease-in-out infinite alternate; }
  @keyframes purple_glow { from { filter:drop-shadow(0 0 3px rgba(167,139,250,0.4)); } to { filter:drop-shadow(0 0 10px rgba(167,139,250,0.9)); } }
</style>