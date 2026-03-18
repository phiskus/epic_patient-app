<script lang="ts">
  import { medications } from './store';
  import type { MedicationRequest } from './store';

  let selected: MedicationRequest | null = null;

  function medName(m: MedicationRequest) {
    return m.medicationCodeableConcept?.text
      ?? m.medicationCodeableConcept?.coding?.[0]?.display
       ?? m.medicationReference?.display
      ?? 'Unknown medication';
  }

  function statusColor(status?: string) {
    if (status === 'active') return 'bg-green-100 text-green-700';
    if (status === 'stopped' || status === 'cancelled') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  }

  function formatDate(d?: string) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  function dosageText(m: MedicationRequest) {
    return m.dosageInstruction?.[0]?.text ?? '—';
  }

  function open(m: MedicationRequest) { selected = m; }
  function close() { selected = null; }
</script>

<div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full relative overflow-hidden">
  <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
    <span class="text-2xl">💊</span>
    <h2 class="font-semibold text-gray-800 text-lg flex-1">Medications</h2>
    <span class="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">{$medications.length}</span>
  </div>

  <ul class="flex-1 overflow-y-auto divide-y divide-gray-50 max-h-72">
    {#each $medications as med}
      <li>
        <button
          class="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
          on:click={() => open(med)}
        >
          <div class="flex-1 min-w-0 pr-3">
            <p class="text-sm font-medium text-gray-800 truncate">{medName(med)}</p>
            <p class="text-xs text-gray-500">{formatDate(med.authoredOn)}</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded-full font-medium capitalize {statusColor(med.status)}">{med.status ?? '—'}</span>
            <span class="text-gray-300">›</span>
          </div>
        </button>
      </li>
    {:else}
      <li class="px-5 py-6 text-sm text-gray-400 text-center">No medications found</li>
    {/each}
  </ul>
</div>

{#if selected}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="fixed inset-0 bg-black/30 z-40" on:click={close}></div>
  <div class="fixed right-0 top-0 h-full w-full max-w-sm bg-white z-50 shadow-2xl flex flex-col">
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h3 class="font-semibold text-gray-800 truncate pr-4">{medName(selected)}</h3>
      <button class="text-gray-400 hover:text-gray-600 text-xl shrink-0" on:click={close}>✕</button>
    </div>
    <div class="p-6 flex flex-col gap-3 text-sm overflow-y-auto">
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Status</span>
        <span class="font-medium capitalize {statusColor(selected.status)} px-2 py-0.5 rounded-full text-xs">{selected.status ?? '—'}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Authored</span>
        <span class="font-medium text-gray-800">{formatDate(selected.authoredOn)}</span>
      </div>
      <div class="flex justify-between py-2 border-b border-gray-50">
        <span class="text-gray-500">Prescriber</span>
        <span class="font-medium text-gray-800">{selected.requester?.display ?? '—'}</span>
      </div>
      <div class="py-2 border-b border-gray-50">
        <p class="text-gray-500 mb-1">Dosage Instructions</p>
        <p class="font-medium text-gray-800">{dosageText(selected)}</p>
      </div>
      {#if (selected.dosageInstruction ?? []).length > 0}
        {@const d = selected.dosageInstruction![0]}
        {#if d.route}
          <div class="flex justify-between py-2 border-b border-gray-50">
            <span class="text-gray-500">Route</span>
            <span class="font-medium text-gray-800">{d.route.text ?? '—'}</span>
          </div>
        {/if}
        {#if d.timing?.repeat}
          <div class="flex justify-between py-2 border-b border-gray-50">
            <span class="text-gray-500">Frequency</span>
            <span class="font-medium text-gray-800">
              {d.timing.repeat.frequency ?? '?'}x / {d.timing.repeat.period ?? '?'} {d.timing.repeat.periodUnit ?? ''}
            </span>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}
