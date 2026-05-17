# AGENT.md — ReMe (BYOB Encrypted Password Vault)

# Project Overview

ReMe is a privacy-first encrypted password vault built with Expo React Native and Supabase.

The core philosophy:

> Users fully control their backend and their encryption keys.

ReMe is a true BYOB (Bring Your Own Backend) application where users provide their own Supabase project credentials.

IMPORTANT:

- The app must NEVER rely on a developer-controlled backend
- The app must NEVER store sensitive vault data in plain text
- All sensitive vault data must be encrypted locally before upload
- Supabase only stores encrypted ciphertext

---

# Core Security Architecture

## Zero-Knowledge Encryption

This is the MOST IMPORTANT requirement.

Passwords, cards, and documents MUST be encrypted locally on-device before being sent to Supabase.

The backend/database must NEVER see readable vault data.

Supabase stores only encrypted ciphertext.

---

# Master Password System

Users must create a:

```txt
Master Password
```

during onboarding.

This password is NEVER uploaded anywhere.

It is used locally to:

- derive encryption keys
- decrypt vault data
- unlock the vault

Requirements:

- Use AES-256 encryption
- Use PBKDF2 or Argon2 key derivation
- Generate random IV per entry
- Store only encrypted payloads in Supabase
- Never persist raw encryption keys

---

# Encryption Flow

## On Save

1. User enters sensitive data
2. App encrypts locally
3. Ciphertext sent to Supabase

---

## On Read

1. Fetch encrypted data
2. Decrypt locally using master password derived key
3. Render decrypted values in UI

---

# Encryption Rules

Encrypt ALL sensitive fields:

## Password Entries

- login_username
- login_email
- login_phone
- login_password
- notes

---

## Card Entries

- card_name
- card_number
- card_expiry
- card_cvv
- card_pin
- notes

---

## Document Entries

- doc_full_name
- doc_number
- doc_issue_date
- doc_expiry_date
- notes

---

# Non-Encrypted Fields

The following may remain searchable/plaintext:

- title
- entry_type
- created_at
- updated_at
- is_archived
- is_deleted

Reason:

Global search requires searchable metadata.

DO NOT store sensitive values in plaintext.

---

# Privacy Principles

- No analytics
- No telemetry
- No trackers
- No ads
- No external APIs
- No developer-owned backend
- No password logging
- No crash reporting with sensitive data

---

# Tech Stack

# Frontend

- Expo React Native
- Expo Router
- JavaScript (NOT TypeScript)
- React Query
- React Hook Form
- Zod
- Zustand
- FlashList
- React Native Reanimated
- Gesture Handler

---

# Security Packages

Install:

```bash
npx expo install expo-secure-store
npx expo install expo-local-authentication
npx expo install expo-clipboard
npx expo install expo-screen-capture
npm install crypto-js
npm install react-native-get-random-values
```

---

# Backend

- Supabase
- Supabase Auth
- Supabase Database

No custom backend.

---

# Required Security Features

# 1. Biometric Unlock

Support:

- Face ID
- Fingerprint
- Device PIN fallback

Use:

```txt
expo-local-authentication
```

Behavior:

- Require master password once after login
- Afterwards allow biometric unlock
- Biometric unlock only decrypts locally stored encrypted key material

---

# 2. Auto Lock

When app goes background/inactive:

- lock vault immediately
- require biometric or master password to unlock

Use:

```txt
AppState API
```

---

# 3. Screenshot Protection

Prevent:

- screenshots
- app switcher previews
- screen recording leaks

Use:

```txt
expo-screen-capture
```

Requirements:

- block screenshots on sensitive screens
- blur/black app preview in multitasking view

---

# 4. Clipboard Protection

When copying passwords/cards:

- auto-clear clipboard after 45 seconds

Use:

```txt
expo-clipboard
```

Requirements:

- show toast:
  "Clipboard cleared automatically"

---

# 5. Secure Session Storage

DO NOT use AsyncStorage for auth persistence.

Supabase default storage must be replaced.

Use:

```txt
expo-secure-store
```

Create custom Supabase storage adapter.

---

# Navigation States

# 1. Setup State

Condition:

- no Supabase credentials saved

Show:

- Supabase URL field
- Supabase anon key field
- connection validation
- save button

Requirements:

- validate URL
- test Supabase connectivity
- securely store credentials

Store using:

```txt
expo-secure-store
```

---

# 2. Auth State

Condition:

- Supabase configured
- user not authenticated

Show:

- Login
- Signup

Auth:

- Email/password only

Requirements:

- loading states
- friendly errors
- secure auth persistence

---

# 3. Vault Unlock State

Condition:

- authenticated
- vault locked

Show:

- biometric unlock
- master password input

---

# 4. App State

Condition:

- authenticated
- vault unlocked

Main tabs:

1. Home
2. Vault
3. Control

---

# Folder Structure

```txt
app/
  (setup)/
  (auth)/
  (unlock)/
  (tabs)/

components/
services/
hooks/
store/
utils/
theme/
constants/
lib/
encryption/
database/
```

---

# State Management

Use Zustand for:

- auth state
- vault lock state
- Supabase config
- theme
- modal visibility

Avoid unnecessary global state.

---

# Secure Storage Rules

Store securely:

- Supabase URL
- anon key
- auth session
- encrypted vault key material
- biometric preferences

NEVER store:

- raw master password
- raw encryption key
- decrypted vault data

---

# Supabase Client Requirements

The Supabase client must:

- initialize dynamically
- rebuild on credential changes
- use SecureStore storage adapter

Never hardcode credentials.

---

# Database Table

## Table Name

```sql
vault_entries
```

---

# Database Architecture

Sensitive values are encrypted BEFORE database insertion.

Database stores ciphertext only.

---

# Required Database Indexes

MUST create indexes for performance:

```sql
CREATE INDEX idx_user_id ON vault_entries(user_id);
CREATE INDEX idx_deleted ON vault_entries(is_deleted);
CREATE INDEX idx_archived ON vault_entries(is_archived);
CREATE INDEX idx_updated_at ON vault_entries(updated_at DESC);
```

---

# Required SQL Deliverables

Generate:

- table creation SQL
- indexes
- RLS policies
- update trigger
- helper functions if needed

---

# Required RLS Policies

Users may ONLY access their own rows.

Use:

```sql
auth.uid() = user_id
```

Policies required:

- SELECT
- INSERT
- UPDATE
- DELETE

---

# Entry Types

```txt
password
card
document
```

---

# Main Screens

# Home Screen

Features:

## Global Search

Search only plaintext metadata:

- title
- entry type

DO NOT search decrypted sensitive data remotely.

Local decrypted search allowed after fetch.

---

## Password Generator

Features:

- customizable length
- uppercase toggle
- lowercase toggle
- numbers toggle
- symbols toggle
- copy password
- regenerate button

Defaults:

- 16 chars
- all enabled

Generator must run locally only.

---

# Vault Screen

Main vault listing.

Display:

- passwords
- cards
- documents

Use:

- FlashList
- memoized cards

---

# Swipe Actions

# Right → Left

Archive entry.

Behavior:

- confirmation modal
- set:
  is_archived = true

Archived entries:

- still visible
- faded opacity

---

# Left → Right

Soft delete entry.

Behavior:

- confirmation modal
- set:
  is_deleted = true

Never hard delete automatically.

---

# FAB Button

Bottom-right FAB.

Options:

1. Add Password
2. Add Card
3. Add Document

Use bottom sheet.

---

# Entry Forms

Forms support:

- create
- edit

Use modal screens.

---

# Form Rules

Use:

- React Hook Form
- Zod validation

Requirements:

- smooth keyboard handling
- loading indicators
- validation messages
- secure input fields

---

# Password Form

Fields:

- title
- username
- email
- phone
- password
- website
- notes

Features:

- password visibility toggle
- copy button
- strength indicator

---

# Card Form

Fields:

- title
- cardholder name
- card number
- expiry
- CVV
- PIN
- notes

Requirements:

- numeric keyboard
- secure hidden inputs
- formatting helpers

---

# Document Form

Fields:

- document type
- full name
- document number
- issue date
- expiration date
- notes

---

# Control Screen

Features:

# Supabase Configuration

Allow:

- update URL
- update anon key
- reconnect
- clear credentials

---

# Connection Status

Show:

- connected
- disconnected
- invalid credentials

---

# Security Settings

Allow users to:

- enable biometrics
- disable biometrics
- change master password
- lock vault immediately

---

# Account Section

Show:

- logged-in email
- logout button

---

# Offline Behavior

# Read Behavior

Allow cached vault viewing offline.

Use React Query cache.

---

# Write Behavior

Offline writes must NOT silently fail.

Required behavior:

- queue offline mutations locally
OR
- block writes with clear offline warning

Choose ONE implementation and keep behavior consistent.

---

# Query Rules

Default query:

```sql
is_deleted = false
```

Sort:

```sql
updated_at DESC
```

Archived items remain visible.

---

# Error Handling

Requirements:

- never expose raw Supabase errors
- never expose encryption errors
- user-friendly messaging
- retry support

---

# Performance Rules

- use FlashList
- debounce search
- memoize expensive renders
- avoid unnecessary decryptions
- decrypt only visible items when possible

---

# Accessibility

Requirements:

- accessible labels
- large touch targets
- dark mode contrast
- screen reader support

---

# Code Style Rules

Requirements:

- JavaScript only
- modular architecture
- reusable components
- small focused files
- business logic separated from UI

---

# UI Design Guidance

Design inspiration:

- Apple Passwords
- 1Password
- Proton Pass
- Bitwarden

Avoid:

- excessive animations
- gradients everywhere
- clutter
- gaming aesthetics

---

# Empty States

Design proper states for:

- empty vault
- no internet
- locked vault
- no search results
- missing Supabase config

---

# Deliverables

Final app must include:

- Expo app
- encrypted local vault architecture
- Supabase BYOB support
- biometric unlock
- auto-lock
- secure clipboard
- screenshot protection
- offline handling
- React Query integration
- FlashList
- dark mode
- reusable architecture
- production-grade security practices

---

# Final UX Expectations

The app should feel:

- secure
- private
- lightweight
- polished
- extremely simple

Priority order:

1. Security
2. Privacy
3. Simplicity
4. Reliability
5. Performance
6. UX polish

```