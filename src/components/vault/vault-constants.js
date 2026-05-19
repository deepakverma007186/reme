import NetInfo from '@react-native-community/netinfo';
import { z } from 'zod';

export const SQL_SCHEMA = `-- ReMe (BYOB Encrypted Password Vault) SQL Schema Definition
-- Run this in your Supabase SQL Editor to prepare your database.

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create vault_entries table
CREATE TABLE IF NOT EXISTS vault_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('password', 'card', 'document')),
    
    -- Encrypted sensitive data (stored as "iv:ciphertext" strings)
    -- Password entry fields
    login_username TEXT,
    login_email TEXT,
    login_phone TEXT,
    login_password TEXT,
    
    -- Card entry fields
    card_name TEXT,
    card_number TEXT,
    card_expiry TEXT,
    card_cvv TEXT,
    card_pin TEXT,
    
    -- Document entry fields
    doc_full_name TEXT,
    doc_number TEXT,
    doc_issue_date TEXT,
    doc_expiry_date TEXT,
    doc_images TEXT,
    
    -- Common fields
    notes TEXT,
    website TEXT, -- Plaintext website metadata for convenient launching
    
    -- Searchable/Metadata fields
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE vault_entries ENABLE ROW LEVEL SECURITY;

-- Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_id ON vault_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted ON vault_entries(is_deleted);
CREATE INDEX IF NOT EXISTS idx_archived ON vault_entries(is_archived);
CREATE INDEX IF NOT EXISTS idx_updated_at ON vault_entries(updated_at DESC);

-- RLS Policies: Ensure users can ONLY interact with their own rows
CREATE POLICY "Users can only SELECT their own vault entries"
ON vault_entries FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can only INSERT their own vault entries"
ON vault_entries FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only UPDATE their own vault entries"
ON vault_entries FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can only DELETE their own vault entries"
ON vault_entries FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Update Trigger: Auto-update the updated_at timestamp when a row is edited
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_vault_entries_updated_at ON vault_entries;
CREATE TRIGGER trigger_update_vault_entries_updated_at
BEFORE UPDATE ON vault_entries
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ==========================================================
-- STORAGE BUCKETS & RLS POLICIES FOR VAULT IMAGES
-- ==========================================================

-- 1. Create the private storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('vault_files', 'vault_files', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Allow users to SELECT their own encrypted document images
DROP POLICY IF EXISTS "Users can select their own vault images" ON storage.objects;
CREATE POLICY "Users can select their own vault images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'vault_files' AND name LIKE 'vault-images/' || auth.uid()::text || '/%');

-- 4. Policy: Allow users to INSERT their own encrypted document images
DROP POLICY IF EXISTS "Users can insert their own vault images" ON storage.objects;
CREATE POLICY "Users can insert their own vault images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vault_files' AND name LIKE 'vault-images/' || auth.uid()::text || '/%');

-- 5. Policy: Allow users to UPDATE their own encrypted document images
DROP POLICY IF EXISTS "Users can update their own vault images" ON storage.objects;
CREATE POLICY "Users can update their own vault images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vault_files' AND name LIKE 'vault-images/' || auth.uid()::text || '/%');

-- 6. Policy: Allow users to DELETE their own encrypted document images
DROP POLICY IF EXISTS "Users can delete their own vault images" ON storage.objects;
CREATE POLICY "Users can delete their own vault images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vault_files' AND name LIKE 'vault-images/' || auth.uid()::text || '/%');`;

// --- ZOD SCHEMAS FOR VAULT VALIDATION ---
export const passwordSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  login_username: z.string().optional(),
  login_email: z.string().email('Invalid email address').or(z.string().length(0)),
  login_phone: z.string().optional(),
  login_password: z.string().min(1, 'Password is required'),
  website: z.string().url('Invalid website URL').or(z.string().length(0)),
  notes: z.string().optional(),
});

export const cardSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  card_name: z.string().min(1, 'Cardholder name is required'),
  card_number: z.string().min(12, 'Card number must be valid'),
  card_expiry: z.string().regex(/^(0[1-9]|1[0-2])\/?([0-9]{2})$/, 'Expiry must be MM/YY'),
  card_cvv: z.string().min(3, 'CVV must be 3 or 4 digits').max(4),
  card_pin: z.string().optional(),
  notes: z.string().optional(),
});

export const docSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  doc_full_name: z.string().min(1, 'Full name is required'),
  doc_number: z.string().min(1, 'Document number is required'),
  doc_issue_date: z.string().optional(),
  doc_expiry_date: z.string().optional(),
  doc_images: z.union([z.string(), z.array(z.any())]).optional(),
  notes: z.string().optional(),
});

// Formatting Helpers for Credit Card Inputs
export const formatCardNumber = (text) => {
  const digits = text.replace(/\D/g, '');
  const formatted = digits.match(/.{1,4}/g)?.join(' ') || digits;
  return formatted.slice(0, 19); // 16 digits + 3 spaces
};

export const formatCardExpiry = (text) => {
  const digits = text.replace(/\D/g, '');
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`.slice(0, 5);
};

// Check if user has an active internet connection
export const checkOnline = async () => {
  try {
    const state = await NetInfo.fetch();
    return !!(state.isConnected && state.isInternetReachable !== false);
  } catch (e) {
    return false;
  }
};
