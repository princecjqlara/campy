import { useState, useEffect } from 'react';
import { initSupabase, getSupabaseClient } from '../services/supabase';

export const useSupabase = () => {
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);

  const init = () => {
    return initSupabase();
  };

  const getSession = async () => {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data: { session } } = await client.auth.getSession();
    if (session) {
      setCurrentUser(session.user);
      await loadUserProfile(session.user.id);
      setIsOnlineMode(true);
    }
    return session;
  };

  const refreshUserProfile = async () => {
    if (currentUser) {
      await loadUserProfile(currentUser.id);
    }
  };

  const loadUserProfile = async (userId) => {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      // First try to load existing profile
      const { data, error } = await client
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle(); // Use maybeSingle instead of single to handle 0 rows gracefully

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "0 rows" which we'll handle by creating the profile
        console.error('Error loading user profile:', error);
      }

      // If profile doesn't exist, create it
      if (!data || error?.code === 'PGRST116') {
        console.log('User profile not found, attempting to create new profile...');
        const { data: { user: authUser } } = await client.auth.getUser();
        
        if (authUser) {
          // Try to create the profile
          const { data: newProfile, error: createError } = await client
            .from('users')
            .insert({
              id: userId,
              email: authUser.email || '',
              name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User',
              role: 'user' // Default role, can be updated to admin later
            })
            .select()
            .single();

          if (createError) {
            console.error('Error creating user profile:', createError);
            // If insert fails due to RLS, the profile might be created by trigger
            // Wait a bit and try loading again
            await new Promise(resolve => setTimeout(resolve, 1000));
            const { data: retryData } = await client
              .from('users')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            
            if (retryData) {
              setCurrentUserProfile(retryData);
              return retryData;
            }
            console.warn('Could not create user profile automatically. Please run the SQL script to create it manually.');
            return null;
          }

          if (newProfile) {
            setCurrentUserProfile(newProfile);
            return newProfile;
          }
        }
        return null;
      }

      // Profile exists, use it
      if (data) {
        setCurrentUserProfile(data);
      }
      return data;
    } catch (err) {
      console.error('Exception loading user profile:', err);
      return null;
    }
  };

  const signIn = async (email, password) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase not initialized');

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    setCurrentUser(data.user);
    await loadUserProfile(data.user.id);
    setIsOnlineMode(true);
    return data;
  };

  const signUp = async (email, password, name) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase not initialized');

    // Create auth user
    const { data: authData, error: authError } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name || email.split('@')[0] // Use name from form or email prefix
        }
      }
    });

    if (authError) throw authError;

    // The trigger should automatically create the user profile
    // But we'll wait a moment and then try to load it
    if (authData.user) {
      setCurrentUser(authData.user);
      // Wait a bit for the trigger to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      await loadUserProfile(authData.user.id);
      setIsOnlineMode(true);
    }

    return authData;
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (client) {
      await client.auth.signOut();
      setCurrentUser(null);
      setCurrentUserProfile(null);
      setIsOnlineMode(false);
    }
  };

  const isAdmin = () => {
    return currentUserProfile?.role === 'admin';
  };

  const getUserName = () => {
    return currentUserProfile?.name || currentUser?.email || 'User';
  };

  const getSetting = async (key) => {
    const client = getSupabaseClient();
    if (!client) return null;

    const { data, error } = await client
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) return null;
    return data?.value;
  };

  const saveSetting = async (key, value) => {
    const client = getSupabaseClient();
    if (!client) return false;

    const { error } = await client
      .from('settings')
      .upsert({
        key,
        value,
        updated_by: currentUser?.id
      });

    return !error;
  };

  const getExpenses = async () => {
    const expenses = await getSetting('package_expenses');
    if (expenses) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_expenses', JSON.stringify(expenses));
      return expenses;
    }
    // Fallback to localStorage
    return JSON.parse(localStorage.getItem('campy_expenses') || '{"basic": 500, "star": 800, "fire": 1000, "crown": 1500, "custom": 0}');
  };

  const saveExpenses = async (expenses) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_expenses', JSON.stringify(expenses));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('package_expenses', expenses);
    }
  };

  const getAIPrompts = async () => {
    const prompts = await getSetting('ai_prompts');
    if (prompts) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_ai_prompts', JSON.stringify(prompts));
      return prompts;
    }
    // Fallback to localStorage
    return JSON.parse(localStorage.getItem('campy_ai_prompts') || '{"adType": "Analyze the business niche \'{niche}\' and target audience \'{audience}\'. Suggest the top 3 most effective Facebook ad formats.", "campaignStructure": "For a local service business in niche \'{niche}\' with a budget of ₱150-300/day, outline a recommended campaign structure."}');
  };

  const saveAIPrompts = async (prompts) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_ai_prompts', JSON.stringify(prompts));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('ai_prompts', prompts);
    }
  };

  const getPackagePrices = async () => {
    const prices = await getSetting('package_prices');
    if (prices) {
      // Also save to localStorage for offline access
      localStorage.setItem('campy_package_prices', JSON.stringify(prices));
      return prices;
    }
    // Fallback to localStorage or default values
    const stored = localStorage.getItem('campy_package_prices');
    if (stored) {
      return JSON.parse(stored);
    }
    // Default package prices
    return { basic: 1799, star: 2999, fire: 3499, crown: 5799, custom: 0 };
  };

  const savePackagePrices = async (prices) => {
    // Save to localStorage immediately
    localStorage.setItem('campy_package_prices', JSON.stringify(prices));
    // Save to Supabase if online
    if (isOnlineMode) {
      await saveSetting('package_prices', prices);
    }
  };

  const getAllUsers = async () => {
    const client = getSupabaseClient();
    if (!client) return [];

    try {
      const { data, error } = await client
        .from('users')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error loading users:', error);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error('Exception loading users:', err);
      return [];
    }
  };

  return {
    isOnlineMode,
    currentUser,
    currentUserProfile,
    initSupabase: init,
    getSession,
    signIn,
    signUp,
    signOut,
    isAdmin,
    getUserName,
    getExpenses,
    saveExpenses,
    getAIPrompts,
    saveAIPrompts,
    getPackagePrices,
    savePackagePrices,
    refreshUserProfile,
    getAllUsers
  };
};

