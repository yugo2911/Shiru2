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
    /* Override default button styles with design system */
    background: #131317 !important;
    border: 1px solid rgba(255,255,255,0.12) !important;
    color: rgba(237,237,234,0.55) !important;
    border-radius: 50% !important;
    box-shadow: none !important;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .btn:hover {
    background: rgba(212,245,94,0.08) !important;
    border-color: #d4f55e !important;
    color: #d4f55e !important;
  }

  /* Divider line */
  hr {
    border-color: rgba(255,255,255,0.07) !important;
    opacity: 1;
  }
</style>