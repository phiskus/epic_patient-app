<script lang="ts">
  import { patient } from './store';

  function fullName(p: typeof $patient) {
    if (!p?.name?.[0]) return 'Unknown';
    const n = p.name[0];
    return [...(n.given ?? []), n.family].filter(Boolean).join(' ');
  }

  function mrn(p: typeof $patient) {
    return p?.identifier?.find((i) => i.system?.includes('MR'))?.value ?? '—';
  }
</script>

<div class="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
  <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
    <span class="text-2xl">🧑‍⚕️</span>
    <h2 class="font-semibold text-gray-800 text-lg">Patient Info</h2>
  </div>

  <div class="p-5 flex flex-col gap-3 flex-1">
    {#if $patient}
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-center">
          <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-bold text-blue-600">
            {fullName($patient).charAt(0)}
          </div>
        </div>
        <p class="text-center text-xl font-semibold text-gray-800">{fullName($patient)}</p>

        <div class="divide-y divide-gray-50">
          <div class="flex justify-between py-2 text-sm">
            <span class="text-gray-500">Date of Birth</span>
            <span class="font-medium text-gray-800">{$patient.birthDate ?? '—'}</span>
          </div>
          <div class="flex justify-between py-2 text-sm">
            <span class="text-gray-500">Gender</span>
            <span class="font-medium text-gray-800 capitalize">{$patient.gender ?? '—'}</span>
          </div>
          <div class="flex justify-between py-2 text-sm">
            <span class="text-gray-500">MRN</span>
            <span class="font-medium text-gray-800">{mrn($patient)}</span>
          </div>
        </div>
      </div>
    {:else}
      <p class="text-gray-400 text-sm text-center mt-4">No patient data</p>
    {/if}
  </div>
</div>
