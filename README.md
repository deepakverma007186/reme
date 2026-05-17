# ReMe 🔐 • Zero-Knowledge, BYOB Encrypted Password Vault

[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20-blueviolet?style=for-the-badge&logo=react)](https://expo.dev)
[![Architecture](https://img.shields.io/badge/Architecture-Zero--Knowledge-success?style=for-the-badge&logo=security)](https://en.wikipedia.org/wiki/Zero-knowledge_proof)
[![Backend](https://img.shields.io/badge/Backend-Supabase%20%28BYOB%29-emerald?style=for-the-badge&logo=supabase)](https://supabase.com)

**ReMe** (pronounced *"Remember Me"*) is a production-grade, highly secure, **Zero-Knowledge End-to-End Encrypted (E2EE)** password and credential vault. Designed with a **"Bring Your Own Backend" (BYOB)** philosophy, ReMe gives users absolute ownership of their digital secrets. By inputting their own Supabase infrastructure keys, users establish a completely isolated, private database where all sensitive records are encrypted client-side using industry-standard military-grade cryptography before ever reaching the cloud.

---

## 🚀 Key Engineering Achievements & Security Architecture

### 1. Zero-Knowledge Key Derivation (PBKDF2-SHA256)
*   **The Problem:** Storing plain-text master passwords or weak hashes on a server makes them vulnerable to leaks and brute-force attacks.
*   **The Implementation:** ReMe utilizes **PBKDF2** (Password-Based Key Derivation Function 2) with **10,000 iterations** and a **SHA-256** hashing primitive to derive a robust 256-bit symmetric key (`masterKey`) from the user's Master Password.
*   **Unique Salt:** The user's Supabase User UUID (or account email) is utilized as a dynamic, unique salt, neutralizing pre-computed rainbow table attacks.
*   **Zero-Knowledge:** The master password and the derived AES key **never leave the user's device** and are strictly stored in volatile, non-persistent React Native memory during an unlocked session.

### 2. Client-Side AES-256-CBC Encryption
*   **The Protocol:** Sensitive fields (such as card numbers, PINs, passwords, and documents) are encrypted *locally on the device* using **AES-256** in **Cipher Block Chaining (CBC)** mode with **PKCS7 padding**.
*   **Cryptographic Uniqueness:** For every single field encryption request, a cryptographically secure, pseudo-random **128-bit Initialization Vector (IV)** is generated on the fly. This ensures that encrypting the same text twice yields completely different ciphertexts, preventing frequency analysis and pattern recognition attacks.
*   **Payload Format:** The IV and ciphertext are concatenated and stored as a combined hex string (`ivHex:ciphertextHex`) inside the database.

### 3. Custom Keychain Storage Adapter (`expo-secure-store`)
*   **Standard Supabase Clients:** Typically rely on standard unencrypted AsyncStorage or LocalStorage, exposing JWTs and session tokens in plaintext.
*   **Our Solution:** ReMe implements a custom asynchronous storage adapter mapping Supabase's auth state transactions to **Expo SecureStore**, which interfaces directly with the device's hardware-backed secure storage:
    *   **iOS:** Keychain Services
    *   **Android:** AES encryption in SharedPreferences, backed by the hardware Keystore.

### 4. Hardware-Backed Biometric Unlock
*   **Seamless Re-Entry:** To balance extreme security with convenient UX, users can enable Biometric Unlock (Face ID or Touch ID) via `expo-local-authentication`.
*   **Enclave Protection:** When enabled, the securely derived 256-bit in-memory key is packed and saved into the device's secure Keychain. Upon successful biometric authentication, this key is retrieved directly from the device's secure enclave to unlock the database in-memory, bypassing the need to re-type the master password.

### 5. Non-Blocking Key Rotation (Master Password Change)
*   **The Challenge:** Changing a master password in a zero-knowledge system requires decrypting all existing database records with the old key and re-encrypting them with the newly derived key without corrupting data or hitting server rate limits.
*   **The Execution:** Built a custom asynchronous migration pipeline:
    1.  Decrypts all active and soft-deleted records in-memory using the old derived key.
    2.  Derives a new 256-bit key using the new master password.
    3.  Re-encrypts all records with unique, fresh 128-bit IVs.
    4.  Performs a batch write mutation to the Supabase database.
    5.  Encrypts a central metadata verification signature (`ReMe-Verify`) with the new key and pushes it to the Supabase Auth profile (`user_metadata`) to validate future logins.
    6.  Rotates the Biometric Keychain store seamlessly without forcing a logout.

### 6. Dynamic BYOB (Bring-Your-Own-Backend) Architecture
*   **Freedom of Data:** Users supply their own Supabase URL and Anon Key. ReMe securely stores these keys locally in the device Keystore.
*   **Dynamic Client Factory:** The app instantiates the Supabase JS client dynamically on startup. If a user disconnects or swaps database credentials, the old instance is torn down, state is purged, and a new client is dynamically constructed instantly.

### 7. Automated Clipboard Sanitation
*   To protect against clipboard hijacking and sniffing apps, ReMe wraps all copy actions in a memory protection scheduler. When copying a password, card number, or document value, a 45-second background timer is initiated. If the clipboard contents still match the secret when the timer expires, the clipboard is completely sanitized and wiped.

---

## 🛠️ Technical Stack & Libraries

*   **Core Framework:** [React Native](https://reactnative.dev) & [Expo](https://expo.dev) (v55) utilizing strict TypeScript compilation for iOS, Android, and Web platforms.
*   **Routing & Navigation:** [Expo Router](https://docs.expo.dev/router/introduction) (File-based routing with safe area layouts, tab routing, and modal routing).
*   **Cryptographic Primitives:** [CryptoJS](https://www.npmjs.com/package/crypto-js) + [react-native-get-random-values](https://www.npmjs.com/package/react-native-get-random-values) (leveraging native OS-level entropy for secure IV generation).
*   **State Management:** [Zustand](https://github.com/pmndrs/zustand) (In-memory, atomic state management keeping the derived master key locked in memory).
*   **Data Fetching & Sync:** [TanStack React Query](https://tanstack.com/query/latest) (Robust caching, optimistic mutations, manual cache invalidation, and automated query retries).
*   **Performance:** [Shopify FlashList](https://shopify.github.io/flash-list/) (Native-grade 60fps high-performance list rendering optimized for fast scrolling over massive, highly populated vault lists).
*   **Form & Validation:** [React Hook Form](https://react-hook-form.com) & [Zod](https://zod.dev) (Enforces strict data integrity schemas on the client side).

---

## 📊 Database Schema & Row-Level Security (RLS)

ReMe is built with absolute multi-tenant safety. Even if multiple users share the same database, **Row-Level Security (RLS)** in PostgreSQL guarantees that no user can read or write another user's records.

Here is the exact schema definition [schema.sql](file:///Users/robinbansal/Desktop/etc/reme/database/schema.sql) running on the PostgreSQL backend:

```sql
-- ReMe SQL Schema Definition
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS vault_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('password', 'card', 'document')),
    
    -- Encrypted sensitive data (stored as "ivHex:ciphertextHex" strings)
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
    
    -- Common fields
    notes TEXT,
    website TEXT, -- Plaintext metadata for convenient launching
    
    -- Searchable/Metadata fields
    is_archived BOOLEAN NOT NULL DEFAULT false,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE vault_entries ENABLE ROW LEVEL SECURITY;

-- High-Performance Composite Indexes
CREATE INDEX IF NOT EXISTS idx_user_id ON vault_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted ON vault_entries(is_deleted);
CREATE INDEX IF NOT EXISTS idx_archived ON vault_entries(is_archived);
CREATE INDEX IF NOT EXISTS idx_updated_at ON vault_entries(updated_at DESC);

-- RLS Policies: Absolute User Separation
CREATE POLICY "Users can only SELECT their own vault entries"
ON vault_entries FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can only INSERT their own vault entries"
ON vault_entries FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only UPDATE their own vault entries"
ON vault_entries FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can only DELETE their own vault entries"
ON vault_entries FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Auto-update updated_at timestamp Trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_vault_entries_updated_at
BEFORE UPDATE ON vault_entries FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
```

---

## 🛠️ Setup & Installation Guide

Follow these steps to run ReMe locally or compile it for your device:

### 1. Prerequisites
*   Make sure you have [Node.js](https://nodejs.org) (v18+ recommended) installed.
*   Install [Expo CLI](https://docs.expo.dev/get-started/installation/) globally or use `npx`.
*   A [Supabase](https://supabase.com) account (completely free).

### 2. Clone and Install Dependencies
```bash
# Navigate to the workspace
cd reme

# Install NPM dependencies
npm install
```

### 3. Database Preparation (Supabase SQL Editor)
1.  Go to your **Supabase Dashboard** -> Create a new project.
2.  Navigate to the **SQL Editor** tab in the left sidebar.
3.  Click **New Query** -> Copy and paste the entire contents of the `database/schema.sql` file.
4.  Click **Run**. The `vault_entries` table, indexes, triggers, and Row-Level Security policies will be immediately set up.

### 4. Start the Application
```bash
# Start Expo development server
npx expo start
```

In the terminal output, you can choose:
*   `i` to launch the **iOS Simulator** (requires Xcode).
*   `a` to launch the **Android Emulator** (requires Android Studio).
*   `w` to run on the **Web Browser**.
*   Scan the QR code with the **Expo Go** app on your physical iOS/Android device to test native biometrics.

### 5. Bring Your Own Backend Configuration (BYOB)
1.  When you first launch the app, you will be welcomed by the **Supabase Setup** screen.
2.  Retrieve your **Project URL** and **API Anon Key** from your Supabase Dashboard under `Project Settings -> API`.
3.  Paste them into the setup fields in the ReMe app and press **Configure**.
4.  ReMe will verify the connection and securely write the keys to the device's hardware Keyring. You're ready to register and login!

---

## 📂 Project Architecture & Codebase Navigation

```
reme/
├── database/
│   └── schema.sql             # DB schema, composite indexes, and RLS policies
├── src/
│   ├── app/                   # File-based router structure (Expo Router)
│   │   ├── (auth)/            # Supabase session registration and login
│   │   ├── (setup)/           # BYOB credentials configuration panel
│   │   ├── (tabs)/            # Authenticated tabs (Dashboard, Vault, Settings)
│   │   │   ├── control.js     # Control Center (Key Rotation, Biometrics, Lock)
│   │   │   ├── index.js       # Home Screen (Vault Stats, Password Gen)
│   │   │   └── vault.js       # Vault List (FlashList, Search, Swipe-to-Action)
│   │   ├── (unlock)/          # Lock Screen (Unlocks Master Key with Biometrics)
│   │   └── _layout.js         # Core navigator & global state synchronizer
│   ├── components/            # Reusable UI component modules
│   │   ├── themed-text.tsx    # Typography module
│   │   ├── themed-view.tsx    # Theming / Layout container
│   │   └── vault/             # Vault subcomponents (FABs, forms, empty-states)
│   │       ├── crypto.js      # AES-256-CBC, PBKDF2 cryptography layer
│   │       └── vault-constants.js # Zod schemas, validation, formats
│   ├── services/
│   │   └── supabase.js        # Dynamic Supabase initialization & secure storage adapter
│   └── store/
│       └── appStore.js        # Global Zustand store (In-memory derived keys, session)
├── package.json               # Package dependencies and execution scripts
└── tsconfig.json              # TypeScript compilation specifications
```

---

## 👨‍💻 Developed by

**Deepak Verma**
*   **Portfolio:** [portfolio-deepak-verma007186](https://portfolio-deepak-verma007186.vercel.app/)
*   **GitHub:** [@deepakverma007186](https://github.com/deepakverma007186)
*   **LinkedIn:** [in/deepakverma007186](https://www.linkedin.com/in/deepakverma007186/)
*   **Email:** deepak.verma007186@gmail.com

