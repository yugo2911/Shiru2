<script>
  import { click } from '@/modules/click.js'
  import { ChevronUp, ChevronDown } from 'lucide-svelte'
  export let size = 0
  export let rowSize = 4
  export let showMore = false
  export let toggleList
</script>

{#if size > rowSize}
  <div class='d-flex justify-content-center mb-30'>
    <hr class='w-full' />
    <button type='button' class='btn btn-square h-40 w-40 rounded-circle border border-light bg-dark-light position-absolute d-flex align-items-center justify-content-center pointer' title={showMore ? 'Show Less' : 'Show More'}  use:click={toggleList}>
      <svelte:component this={ showMore ? ChevronUp : ChevronDown } size='2.2rem' style='margin-right: .05rem' strokeWidth='3' />
    </button>
  </div>
{/if}

<style>
  

  .btn {
    margin-top: -1rem;
    background: var(--card-surface) !important;
    border: 1px solid var(--card-line) !important;
    color: var(--card-dim) !important;
    border-radius: 50% !important;
    box-shadow: none !important;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .btn:hover {
    background: var(--card-accent-dim) !important;
    border-color: var(--card-accent) !important;
    color: var(--card-accent) !important;
  }

  /* Divider line */
  hr {
    border-color: var(--card-line) !important;
    opacity: 1;
  }
</style>