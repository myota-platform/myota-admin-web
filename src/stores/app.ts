import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { apiRequest, clearSession, saveSession } from '../lib/api';
import type { Account, Programme } from '../types';

export const useAppStore = defineStore('app', () => {
  const account = ref<Account | null>(null);
  const programmes = ref<Programme[]>([]);
  const currentProgramme = ref('');
  const apiStatus = ref<'pending' | 'connected' | 'unavailable'>('pending');
  const initialized = ref(false);
  const signedIn = computed(() => Boolean(account.value));

  async function bootstrap(): Promise<boolean> {
    try {
      account.value = await apiRequest<Account>('/v1/identity/me', {}, false);
      await loadProgrammes();
      apiStatus.value = 'connected';
      initialized.value = true;
      return true;
    } catch {
      apiStatus.value = 'unavailable';
      initialized.value = true;
      signOut();
      return false;
    }
  }

  async function loadProgrammes(): Promise<void> {
    const data = await apiRequest<{ items: Programme[] }>('/v1/programmes');
    programmes.value = data.items || [];
  }

  async function signIn(email: string, password: string): Promise<void> {
    const data = await apiRequest<{ accessToken: string; refreshToken?: string; account: Account }>(
      '/v1/identity/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    saveSession(data);
    // Login returns the basic account record; /me is the canonical response
    // containing resolved roles and scopes needed by permission-gated controls.
    account.value = await apiRequest<Account>('/v1/identity/me');
    await loadProgrammes();
    apiStatus.value = 'connected';
  }

  function signOut(): void {
    account.value = null;
    clearSession();
  }

  return { account, programmes, currentProgramme, apiStatus, initialized, signedIn, bootstrap, loadProgrammes, signIn, signOut };
});
