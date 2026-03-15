<script lang="ts">
  import { labs } from './store';
  import type { Observation } from './store';

  let selected: Observation | null = null;

  function label(obs: Observation) {
    return obs.code?.text ?? obs.code?.coding?.[0]?.display ?? 'Lab';
  }

  function valueStr(obs: Observation) {
    if (obs.valueQuantity) return `${obs.valueQuantity.value} ${obs.valueQuantity.unit ?? ''}`;
    if (obs.valueString) return obs.valueString;
    return '—';
  }

  function refRange(obs: Observation) {
    const r = obs.referenceRange?.[0];
    if (!r) return '—';
    if (r.text) return r.text;
    const low = r.low?.value ?? '?';
    const high = r.high?.value ?? '?';
    return `${low} – ${high} ${r.low?.unit ?? ''}`;
  }

  function interpretation(obs: Observation) {
    return obs.interpretation?.[0]?.text
      ?? obs.interpretation?.[0]?.coding?.[0]?.display
      ?? '—';
  }

  function interpretationColor(obs: Observation) {
    const val = interpretation(obs).toLowerCase();
    if (val.includes('high') || val.includes('abnormal')) return 'text-red-600 bg-red-50';
    if (val.includes('low')) return 'text-yellow-600 bg-yellow-50';
    if (val.includes('normal')) return 'text-green-600 bg-green-50';
    return 'text-gray-600 bg-gray-50';
  }

  function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  function open(obs: Observation) { selected = obs; }
  function close() { selected = null; }
</script>

<div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full relative overflow-hidden">
  <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
    <span class="text-2xl">🧪</span>
    <h2 class="font-semibold text-gray-800 text-lg flex-1">Lab Reports</h2>
    <span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">{$labs.length}</span>
  </div>

  <ul class="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-72">
    {#each $labs as obs}
      <li>
        <button
          class="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
          on:click={() => open(obs)}
        >
          <div class="flex-1 min-w-0 pr-3">
            <p class="text-sm font-medium text-gray-800 truncate">{label(obs)}</p>
            <p class="text-xs text-gray-500">{formatDate(obs.effectiveDateTime)}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-gray-700">{valueStr(obs)}</span>
            <span class="text-gray-300">›</span>
          </div>
        </button>
      </li>
    {:else}
      <li class="px-5 py-6 text-sm text-gray-400 text-center">No lab reports found</li>
    {/each}
  </ul>
</div>

{#if selected}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/30 z-40" on:click={close}></div>
  <div class="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col">
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h3 class="font-semibold text-gray-800 truncate pr-4">{label(selected)}</h3>
      <button class="text-gray-400 hover:text-gray-600 text-xl shrink-0" on:click={close}>✕</button>
    </div>
    <div class="p-6 flex flex-col gap-3 text-sm overflow-y-auto">
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Value</span>
        <span class="font-semibold text-gray-800">{valueStr(selected)}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Reference Range</span>
        <span class="font-medium text-gray-800">{refRange(selected)}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Interpretation</span>
        <span class="font-medium px-2 py-0.5 rounded-full text-xs {interpretationColor(selected)}">{interpretation(selected)}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Date</span>
        <span class="font-medium text-gray-800">{formatDate(selected.effectiveDateTime)}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Status</span>
        <span class="font-medium text-gray-800 capitalize">{selected.status ?? '—'}</span>
      </div>
    </div>
  </div>
{/if}
