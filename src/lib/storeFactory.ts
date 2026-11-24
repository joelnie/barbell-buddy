import type { DataStore } from '../types/models';
import { LocalRealtimeStore } from './localStore';
import { SupabaseRealtimeStore } from './supabaseStore';

export function createDefaultDataStore(): DataStore {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const crewEmail = import.meta.env.VITE_CREW_AUTH_EMAIL?.trim() || 'crew@barbellbuddy.app';

  if (supabaseUrl && supabaseAnonKey) {
    return new SupabaseRealtimeStore(supabaseUrl, supabaseAnonKey, crewEmail);
  }

  return new LocalRealtimeStore();
}
