<script>
  import { page, modal, playPage, goBack, goForward, canGoBack, canGoForward } from '@/modules/navigation.js'
  import { nowPlaying as media } from '@/components/MediaHandler.svelte'
  import { hasUnreadNotifications } from '@/modals/NotificationsModal.svelte'
  import Helper from '@/modules/helper.js'
  import { Home, Settings, LogIn, Bell, BellDot, Download, Users, CalendarSearch, Search, ChevronLeft, ChevronRight, TvMinimalPlay, History, ListVideo } from 'lucide-svelte'
  import { fade } from 'svelte/transition'

  const sfx = {
    menu: new Audio('./audio/カーソル移動6.mp3'),
  }

  function playSfx(sound) {
    sound.currentTime = 0
    sound.play().catch(() => {})
  }

  let hidden = true
  let hideTimer = null
  const ZONE = 60

  function onMouseMove(e) {
    const nearEdge = e.clientX <= ZONE
    if (nearEdge) {
      hidden = false
      clearTimeout(hideTimer)
      if ($page === page.PLAYER) {
        hideTimer = setTimeout(() => { hidden = true }, 1500)
      }
    } else if (!hidden) {
      hidden = true
    }
  }

  function startIdle() {
    if ($page === page.PLAYER) {
      hideTimer = setTimeout(() => { hidden = true }, 1500)
    }
  }

  $: if ($page) hidden = $page !== page.PLAYER ? false : true
</script>

<svelte:window on:mousemove={onMouseMove} />

{#if !hidden}
<nav class="top-nav" transition:fade={{ duration: 400 }}>
  <div class="nav-links">
    <button class="nav-item nav-icon-btn nav-back" on:click={() => { playSfx(sfx.menu); goBack() }} title="Back" disabled={!$canGoBack}>
      <ChevronLeft size="1.6rem" color={$canGoBack ? 'currentColor' : 'var(--gray-color-very-dim)'} />
    </button>
    <button class="nav-item nav-icon-btn nav-back" on:click={() => { playSfx(sfx.menu); goForward() }} title="Forward" disabled={!$canGoForward}>
      <ChevronRight size="1.6rem" color={$canGoForward ? 'currentColor' : 'var(--gray-color-very-dim)'} />
    </button>
    <span class="nav-divider"></span>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.HOME) }} title="Home">
      <Home size="1.6rem" />
    </button>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.SCHEDULE) }} title="Schedule">
      <CalendarSearch size="1.6rem" />
    </button>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.SEARCH) }} title="Search">
      <Search size="1.6rem" />
    </button>
    {#if $media?.media || ($playPage && (Object.keys($media).length > 0))}
      <button class="nav-item nav-icon-btn" on:click={() => {
        playSfx(sfx.menu)
        if ($playPage && page.value === page.PLAYER) {
          playPage.set(false)
        }
        if ($playPage) {
          page.navigateTo(page.PLAYER)
        } else {
          modal.toggle(modal.ANIME_DETAILS, $media?.media)
        }
      }} title={$media?.display ? 'Last Watched' : 'Now Playing'}>
        {#if $playPage}
          <TvMinimalPlay size="1.6rem" />
        {:else if $media?.display}
          <History size="1.6rem" />
        {:else}
          <ListVideo size="1.6rem" />
        {/if}
      </button>
    {/if}
    <button class="nav-item nav-icon-btn nav-notify" on:click={() => { playSfx(sfx.menu); modal.toggle(modal.NOTIFICATIONS) }} title="Notifications">
      {#if $hasUnreadNotifications > 0}
        <BellDot size="1.6rem" class="fill-1" style="--fill-color: var(--notify-color)" />
      {:else}
        <Bell size="1.6rem" />
      {/if}
    </button>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.TORRENT_MANAGER) }} title="Torrents">
      <Download size="1.6rem" />
    </button>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.WATCH_TOGETHER) }} title="Watch Together">
      <Users size="1.6rem" />
    </button>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); page.navigateTo(page.SETTINGS) }} title="Settings">
      <Settings size="1.6rem" />
    </button>
    <button class="nav-item nav-icon-btn" on:click={() => { playSfx(sfx.menu); modal.toggle(modal.PROFILE) }} title={Helper.getUser() ? 'Profile' : 'Login'}>
      {#if Helper.getUser()}
        <img src={Helper.getUserAvatar()} class="nav-avatar" alt="avatar" />
      {:else}
        <LogIn size="1.6rem" />
      {/if}
    </button>
  </div>
</nav>
{/if}

<style>
  .top-nav {
    position: fixed;
    top: 50%;
    left: 1rem;
    transform: translateY(-50%);
    z-index: 999;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.8rem 0.4rem;
    background: rgba(18, 18, 18, 0.65);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    gap: 0.2rem;
  }
  .nav-links { display: flex; flex-direction: column; gap: 0.2rem; align-items: center; }
  .nav-item { background: none; border: none; color: #fff; font-weight: 800; font-size: 0.75rem; letter-spacing: 0.1em; opacity: 0.5; cursor: pointer; text-transform: uppercase; transition: opacity 0.15s; }
  .nav-item.active { opacity: 1; color: #fff; text-shadow: 0 0 10px rgba(255,255,255,0.3); }
  .nav-divider { width: 1.8rem; height: 1px; background: rgba(255,255,255,0.12); flex-shrink: 0; margin: 0.2rem 0; }
  .nav-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 3.2rem; height: 3.2rem; padding: 0; border-radius: 50%; opacity: 0.5; overflow: hidden; transition: opacity 0.15s, background 0.15s; }
  .nav-icon-btn:hover { opacity: 1; background: rgba(255,255,255,0.08); }
  .nav-back[disabled] { opacity: 0.3; cursor: default; }
  .nav-back[disabled]:hover { opacity: 0.3; background: none; }
  .nav-notify :global(.fill-1) { font-variation-settings: 'FILL' 1; color: var(--fill-color); filter: drop-shadow(0 0 .6rem var(--fill-color)); }
  .nav-avatar { width: 100%; height: 100%; object-fit: cover; }

  @media (pointer: none), (pointer: coarse) {
    .top-nav { display: none; }
  }
</style>
