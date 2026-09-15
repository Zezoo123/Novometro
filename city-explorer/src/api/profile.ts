import { supabase, type Tables } from '../lib/supabase';

export type Profile = Tables<'profiles'>;

export const USERNAME_RULE = /^[a-z0-9_]{3,20}$/;

export async function fetchMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export class UsernameTakenError extends Error {
  constructor() {
    super('username_taken');
  }
}

export async function setUsername(userId: string, username: string): Promise<Profile> {
  const clean = username.trim().toLowerCase();
  if (!USERNAME_RULE.test(clean)) {
    throw new Error('invalid_username');
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ username: clean })
    .eq('id', userId)
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new UsernameTakenError();
    throw error;
  }
  return data;
}

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
