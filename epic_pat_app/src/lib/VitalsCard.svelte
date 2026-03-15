<script lang="ts">
  import { vitals, selectedItem } from './store';
  import type { Observation } from './store';

  let selected: Observation | null = null;

  function label(obs: Observation) {
    return obs.code?.text ?? obs.code?.coding?.[0]?.display ?? 'Observation';
  }

  function valueStr(obs: Observation) {
    if (obs.valueQuantity) return `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`;
    if (obs.valueString) return obs.valueString;
    if (obs.component?.length) {
      return obs.component
        .map((c) => `${c.valueQuantity?.value ?? '?'} ${c.valueQuantity?.unit ?? ''}`)
        .join(' / ');
    }
    return '—';
  }

  function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  function openDetail(obs: Observation) {
    selected = obs;
  }

  function close() {
    selected = null;
  }
</script>

<div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full relative overflow-hidden">
  <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
    <span class="text-2xl">❤️</span>
    <h2 class="font-semibold text-gray-800 text-lg flex-1">Vitals</h2>
    <span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">{$vitals.length}</span>
  </div>

  <ul class="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-72">
    {#each $vitals as obs}
      <li>
        <button
          class="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
          on:click={() => openDetail(obs)}
        >
          <div>
            <p class="text-sm font-medium text-gray-800">{label(obs)}</p>
            <p class="text-xs text-gray-500">{formatDate(obs.effectiveDateTime)}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-blue-600">{valueStr(obs)}</span>
            <span class="text-gray-300">›</span>
          </div>
        </button>
      </li>
    {:else}
      <li class="px-5 py-6 text-sm text-gray-400 text-center">No vitals recorded</li>
    {/each}
  </ul>
</div>

<!-- Detail slide-in panel -->
{#if selected}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/30 z-40" on:click={close}></div>
  <div class="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col transform transition-transform">
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h3 class="font-semibold text-gray-800">{label(selected)}</h3>
      <button class="text-gray-400 hover:text-gray-600 text-xl" on:click={close}>✕</button>
    </div>
    <div class="p-6 flex flex-col gap-4 overflow-y-auto">
      <div class="flex flex-col gap-3 text-sm">
        <div class="flex justify-between py-2 border-b border-gray-50">
          <span class="text-gray-500">Value</span>
          <span class="font-semibold text-gray-800">{valueStr(selected)}</span>
        </div>
        <div class="flex justify-between py-2 border-b border-gray-50">
          <span class="text-gray-500">Date</span>
          <span class="font-medium text-gray-800">{formatDate(selected.effectiveDateTime)}</span>
        </div>
        <div class="flex justify-between py-2 border-b border-gray-50">
          <span class="text-gray-500">Status</span>
          <span class="font-medium text-gray-800 capitalize">{selected.status ?? '—'}</span>
        </div>
        {#if selected.component?.length}
          <p class="text-gray-500 font-medium mt-2">Components</p>
          {#each selected.component as c}
            <div class="flex justify-between py-2 border-b border-gray-50">
              <span class="text-gray-500">{c.code?.text ?? c.code?.coding?.[0]?.display ?? ''}</span>
              <span class="font-medium text-gray-800">{c.valueQuantity?.value} {c.valueQuantity?.unit ?? ''}</span>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
