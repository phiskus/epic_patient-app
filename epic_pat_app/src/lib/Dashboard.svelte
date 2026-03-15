<script lang="ts">
  import { onMount } from 'svelte';
  import { patient, vitals, medications, labs, patientId } from './store';
  import { getPatient, getVitals, getMedications, getLabs } from './fhir';
  import PatientCard from './PatientCard.svelte';
  import VitalsCard from './VitalsCard.svelte';
  import MedicationsCard from './MedicationsCard.svelte';
  import LabsCard from './LabsCard.svelte';
  import { ACCESS_TOKEN_KEY, PATIENT_ID_KEY } from '../config';

  export let onLogout: () => void;

  let loading = true;
  let error = '';

  onMount(async () => {
    const pid = localStorage.getItem(PATIENT_ID_KEY);
    if (!pid) {
      error = 'No patient ID found. Please log in again.';
      loading = false;
      return;
    }
    patientId.set(pid);

    try {
      const [p, v, m, l] = await Promise.all([
        getPatient(pid),
        getVitals(pid),
        getMedications(pid),
        getLabs(pid),
      ]);
      patient.set(p);
      vitals.set(v);
      medications.set(m);
      labs.set(l);
    } catch (e: any) {
      error = e?.response?.data?.issue?.[0]?.diagnostics ?? e?.message ?? 'Failed to load patient data.';
    } finally {
      loading = false;
    }
  });

  function handleLogout() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(PATIENT_ID_KEY);
    patient.set(null);
    vitals.set([]);
    medications.set([]);
    labs.set([]);
    onLogout();
  }

  function patientName(p: typeof $patient) {
    if (!p?.name?.[0]) return 'Patient';
    const n = p.name[0];
    return [...(n.given ?? []), n.family].filter(Boolean).join(' ');
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <header class="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
    <div class="flex items-center gap-3">
      <span class="text-2xl">🏥</span>
      <div>
        <h1 class="font-bold text-gray-900 text-lg">Epic Patient Dashboard</h1>
        {#if $patient}
          <p class="text-sm text-gray-500">{patientName($patient)}</p>
        {/if}
      </div>
    </div>
    <button
      on:click={handleLogout}
      class="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
    >
      Logout
    </button>
  </header>

  <!-- Body -->
  <main class="p-6 max-w-7xl mx-auto">
    {#if loading}
      <div class="flex flex-col items-center justify-center h-64 gap-4">
        <div class="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
        <p class="text-gray-500 text-sm">Loading patient data…</p>
      </div>

    {:else if error}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center">
        <p class="font-semibold mb-1">Something went wrong</p>
        <p class="text-sm">{error}</p>
        <button
          class="mt-4 px-4 py-2 text-sm bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
          on:click={handleLogout}
        >
          Back to Login
        </button>
      </div>

    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PatientCard />
        <VitalsCard />
        <MedicationsCard />
        <LabsCard />
      </div>
    {/if}
  </main>
</div>
