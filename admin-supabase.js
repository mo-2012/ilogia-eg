// ilogia — Dedicated Supabase client for Admin and Staff
// SECURITY (F-01): Stores sessions exclusively in localStorage under 'ilogia-admin-auth'.
// Does NOT broadcast admin session tokens into .ilogia-eg.com wildcard cookies!

import { createClient } from './vendor/supabase.esm.js';

export const supabase = createClient(
  'https://zugwicbbfbefbbwugfxq.supabase.co',
  'sb_publishable_34jNpaqwtFeYboTVgO-mYw_efc0T-Ew',
  {
    auth: {
      storageKey: 'ilogia-admin-auth',
      storage: window.localStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
