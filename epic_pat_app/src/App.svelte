<script lang="ts">
  import { onMount } from 'svelte';
  import pkceChallenge from 'pkce-challenge';
  import axios from 'axios';
  import {
    client_ID,
    CODE_VERIFIER_LOCAL_STORAGE_KEY,
    FHIR_BASE_URL,
    REDIRECT_URI,
    SMART_AUTH_URL,
    SMART_TOKEN_URL,
    ACCESS_TOKEN_KEY,
    PATIENT_ID_KEY,
  } from './config';
  import Dashboard from './lib/Dashboard.svelte';
  import { isAuthenticated } from './lib/store';

  let loading = true;

  const generateCodeChallenge = async () => {
    const { code_challenge, code_verifier } = await pkceChallenge();
    localStorage.setItem(CODE_VERIFIER_LOCAL_STORAGE_KEY, code_verifier);
    return code_challenge;
  };

  const initiateAuthRequest = async () => {
    const codeChallenge = await generateCodeChallenge();
    const authorizationUrl = new URL(SMART_AUTH_URL);
    authorizationUrl.searchParams.set('client_id', client_ID);
    authorizationUrl.searchParams.set('scope', 'openid fhirUser launch/patient patient/Patient.read patient/Observation.read patient/MedicationRequest.read');
    authorizationUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('state', 'some_random_state');
    authorizationUrl.searchParams.set('aud', FHIR_BASE_URL);
    authorizationUrl.searchParams.set('code_challenge', codeChallenge);
    authorizationUrl.searchParams.set('code_challenge_method', 'S256');
    window.location.href = authorizationUrl.href;
  };

  const makeTokenRequest = async (code: string, codeVerifier: string) => {
    const tokenRequestForm = new FormData();
    tokenRequestForm.set('grant_type', 'authorization_code');
    tokenRequestForm.set('code', code);
    tokenRequestForm.set('redirect_uri', REDIRECT_URI);
    tokenRequestForm.set('client_id', client_ID);
    tokenRequestForm.set('code_verifier', codeVerifier);

    const response = await axios.postForm(SMART_TOKEN_URL, tokenRequestForm);
    console.log('Token response:', response.data);
    const { access_token, patient, scope } = response.data;
    console.log('Granted scopes:', scope);
    console.log('Patient context:', patient);
    localStorage.setItem(ACCESS_TOKEN_KEY, access_token);
    if (patient) localStorage.setItem(PATIENT_ID_KEY, patient);
    // Clean up URL
    window.history.replaceState({}, '', '/');
    isAuthenticated.set(true);
  };

  onMount(async () => {
    // Already logged in from a previous session
    if (localStorage.getItem(ACCESS_TOKEN_KEY) && localStorage.getItem(PATIENT_ID_KEY)) {
      isAuthenticated.set(true);
      loading = false;
      return;
    }
    // Returning from Epic OAuth redirect
    const code = new URL(window.location.href).searchParams.get('code');
    const codeVerifier = localStorage.getItem(CODE_VERIFIER_LOCAL_STORAGE_KEY);
    if (code && codeVerifier) {
      await makeTokenRequest(code, codeVerifier);
      localStorage.removeItem(CODE_VERIFIER_LOCAL_STORAGE_KEY);
    }
    loading = false;
  });

  function handleLogout() {
    isAuthenticated.set(false);
  }
</script>

{#if loading}
  <div class="min-h-screen bg-gray-50 flex items-center justify-center">
    <div class="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
  </div>

{:else if $isAuthenticated}
  <Dashboard onLogout={handleLogout} />

{:else}
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6">
      <span class="text-5xl">🏥</span>
      <div class="text-center">
        <h1 class="text-2xl font-bold text-gray-800">Epic Sandbox</h1>
        <p class="text-gray-500 text-sm mt-1">Sign in to view your patient data</p>
      </div>
      <button
        on:click={initiateAuthRequest}
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors shadow-sm"
      >
        Login to Epic Sandbox
      </button>
      <p class="text-xs text-gray-400 text-center">
        You'll be redirected to Epic to authenticate securely
      </p>
    </div>
  </div>
{/if}
