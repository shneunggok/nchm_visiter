# Admin Tool — Complete Installation Manual

**A beginner-friendly guide to installing the admin system into any website.**

---

## 📦 What You Are Installing

The **Admin Tool** is a self-contained administrator dashboard that:

- Renders a navigation bar with your logo
- Provides a password-protected admin login
- Shows statistics tables (visits, AR reservations, etc.)
- Lets you search, filter, and export data to Excel
- Manages admin session timeout and security

You do **not** need to write any HTML or CSS for the admin panel.  
The framework **renders itself**.

---

## 🗺️ Table of Contents

1. [Before You Start](#1-before-you-start)
2. [Which Folder to Copy](#2-which-folder-to-copy)
3. [Where to Paste It](#3-where-to-paste-it)
4. [Which HTML Code to Add](#4-which-html-code-to-add)
5. [Where to Call AdminTool.init()](#5-where-to-call-admintoolinit)
6. [How to Connect Firebase](#6-how-to-connect-firebase)
7. [How to Change Branding](#7-how-to-change-branding)
8. [How to Upgrade the Framework Later](#8-how-to-upgrade-the-framework-later)
9. [How to Replace the Framework Without Breaking Your Project](#9-how-to-replace-the-framework-without-breaking-your-project)
10. [Troubleshooting](#10-troubleshooting)
11. [Quick Reference Card](#11-quick-reference-card)

---

## 1. Before You Start

### What you need

| Item | Where to get it |
|---|---|
| A Firebase project | Go to https://console.firebase.google.com and create a project |
| Firebase Realtime Database | In Firebase Console → Build → Realtime Database → Create Database |
| Firebase Web API Key | In Firebase Console → Project Settings → General → Web API Key |
| Admin email address | The email that will log into the admin panel |

### Your project folder structure BEFORE

```
my-website/
├── index.html
├── css/
│   └── style.css
└── js/
    └── script.js
```

This is your website. The admin-tool folder will sit **next to** these files.

---

## 2. Which Folder to Copy

Copy **one folder** from the source project into your new project:

```
SOURCE (where admin-tool was developed):
  some-project/
    ├── admin-tool/     ← COPY THIS ENTIRE FOLDER
    ├── index.html
    └── ...
```

The `admin-tool/` folder contains everything the admin system needs:

```
admin-tool/
├── admin.js              ← The main entry point
├── admin.css             ← All admin styles
├── config/               ← Framework configuration
│   ├── settings.js       ← Default values (DO NOT EDIT)
│   ├── firebase.js       ← Firebase initialization
│   └── collections.js    ← Database references
├── components/           ← UI pieces
│   ├── header.js
│   ├── modal.js
│   ├── sidebar.js
│   └── table.js
├── modules/              ← Business logic
│   ├── _utils.js
│   ├── visit.js
│   ├── ar.js
│   ├── statistics.js
│   ├── dashboard.js
│   └── auth.js
└── README.md             ← This guide
```

**Do NOT copy individual files.** Copy the entire folder.

---

## 3. Where to Paste It

Paste the `admin-tool/` folder **inside your project's root folder**:

```
my-website/                    ← Your project root
├── admin-tool/                ← ✓ Paste here (same level as index.html)
├── index.html                 ← Your existing file
├── css/
│   └── style.css
└── js/
    └── script.js
```

The folder structure should look like this:

```
my-website/
│
├── admin-tool/                ← ★ NEW FOLDER ★
│   ├── admin.js
│   ├── admin.css
│   ├── config/
│   ├── components/
│   └── modules/
│
├── index.html                 ← Your file (will add 4 lines)
├── css/
│   └── style.css
└── js/
    └── script.js
```

---

## 4. Which HTML Code to Add

Open your `index.html` file.  
Go to the very bottom, **right before `</body>`**.

Add these 4 blocks of code **in this exact order**:

```html
<!-- ====================================================== -->
<!-- STEP 1: Firebase SDK (load this FIRST)                 -->
<!-- ====================================================== -->
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>

<!-- ====================================================== -->
<!-- STEP 2: Admin Tool Styles                              -->
<!-- ====================================================== -->
<link rel="stylesheet" href="./admin-tool/admin.css">

<!-- ====================================================== -->
<!-- STEP 3: Admin Tool Root Container                      -->
<!--         The framework renders all HTML into this div   -->
<!-- ====================================================== -->
<div id="admin-root"></div>

<!-- ====================================================== -->
<!-- STEP 4: Admin Tool JavaScript                          -->
<!-- ====================================================== -->
<script src="./admin-tool/admin.js"></script>

<!-- ====================================================== -->
<!-- STEP 5: Initialize with YOUR project's configuration   -->
<!--         ★ CHANGE THE VALUES BELOW for your project ★   -->
<!-- ====================================================== -->
<script>
AdminTool.init({
    firebase: {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_PROJECT.firebaseapp.com",
        databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
        projectId: "YOUR_PROJECT",
        storageBucket: "YOUR_PROJECT.firebasestorage.app",
        messagingSenderId: "YOUR_SENDER_ID",
        appId: "YOUR_APP_ID"
    },
    auth: {
        adminEmail: "admin@yourcompany.com"
    },
    branding: {
        logoUrl: "./path/to/your-logo.png",
        logoAlt: "My Company"
    },
    ageGroups: ["Youth(13-17)", "Adult(18-64)", "Senior(65+)"],
    visitPurposes: ["Reading", "Meeting", "Workshop"]
});
</script>
```

### Visual representation of your HTML file structure

```
my-website/index.html
═══════════════════════════════════════════
<html>
  <head>
    <title>My Website</title>
    <!-- your existing CSS -->
  </head>
  <body>
    
    <!-- your existing website content -->
    <h1>Welcome to my website</h1>
    <p>This is my homepage.</p>
    
    <!-- your existing scripts -->
    <script src="./js/script.js"></script>
    
    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    ★ NEW CODE STARTS HERE ★
    ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
    
    <!-- STEP 1: Firebase SDK -->
    <script src="https://www.gstatic.com/...firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/...firebase-database-compat.js"></script>
    <script src="https://www.gstatic.com/...firebase-auth-compat.js"></script>
    
    <!-- STEP 2: Admin CSS -->
    <link rel="stylesheet" href="./admin-tool/admin.css">
    
    <!-- STEP 3: Root container -->
    <div id="admin-root"></div>
    
    <!-- STEP 4: Admin JS -->
    <script src="./admin-tool/admin.js"></script>
    
    <!-- STEP 5: Initialize -->
    <script>
    AdminTool.init({ ... });
    </script>
    
  </body>
</html>
```

---

## 5. Where to Call AdminTool.init()

Call `AdminTool.init()` **immediately after** loading `admin.js`, inside a `<script>` tag.

### ✅ CORRECT placement

```html
<script src="./admin-tool/admin.js"></script>     ← admin.js loads first
<script>
AdminTool.init({ ... });                          ← Then call init()
</script>
```

### ❌ WRONG placement (will NOT work)

```html
<script>
AdminTool.init({ ... });                          ← AdminTool doesn't exist yet!
</script>
<script src="./admin-tool/admin.js"></script>     ← Loaded too late
```

### ❌ Also WRONG

```html
<script src="./admin-tool/admin.js"></script>
<!-- Missing the init() call entirely -->
<!-- The admin panel will not appear -->
```

### What happens when you call init()

```
AdminTool.init({...})
        │
        ▼
  ┌─────────────────┐
  │ Merge defaults   │  ← Combines your config with framework defaults
  │ with your config │
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │ Load module #1  │  ← config/settings.js
  │ Load module #2  │  ← modules/_utils.js
  │ Load module #3  │  ← config/firebase.js
  │ ...             │
  │ Load module #14 │  ← modules/auth.js
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │ Bootstrap UI    │  ← Renders header, tabs, dashboard, modal
  │ into #admin-root│
  └────────┬────────┘
           ▼
  ┌─────────────────┐
  │ Admin panel     │  ← Ready! Gear icon appears in top-right
  │ is now visible  │
  └─────────────────┘
```

---

## 6. How to Connect Firebase

### Step 1: Get your Firebase config

1. Go to https://console.firebase.google.com
2. Click your project
3. Click the **gear icon** (⚙) → **Project settings**
4. Under **General** → **Your apps** → **Web app**
5. Copy the `firebaseConfig` object

It looks like this:

```javascript
{
    apiKey: "AIzaSyBxXxXxXxXxXxXxXxXxXxXxXxXxXxXx",
    authDomain: "my-project-12345.firebaseapp.com",
    databaseURL: "https://my-project-12345-default-rtdb.firebaseio.com",
    projectId: "my-project-12345",
    storageBucket: "my-project-12345.firebasestorage.app",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abc123def456"
}
```

### Step 2: Paste it into AdminTool.init()

```javascript
AdminTool.init({
    firebase: {
        apiKey: "AIzaSyBxXxXxXxXxXxXxXxXxXxXxXxXxXxXx",      // ← Your key
        authDomain: "my-project-12345.firebaseapp.com",         // ← Your domain
        databaseURL: "https://my-project-12345-default-rtdb.firebaseio.com", // ← Your URL
        projectId: "my-project-12345",                          // ← Your project ID
        storageBucket: "my-project-12345.firebasestorage.app",  // ← Your bucket
        messagingSenderId: "123456789012",                      // ← Your sender ID
        appId: "1:123456789012:web:abc123def456"                // ← Your app ID
    },
    // ... rest of config
});
```

### Step 3: Enable Firebase Authentication

1. Firebase Console → **Authentication** → **Sign-in method**
2. Enable **Email/Password** sign-in
3. Create the admin user with your admin email and a password

```
Firebase Console
│
├─ Project Settings    ← Get your API keys here
│
├─ Authentication     ← Enable Email/Password sign-in
│   └─ Users          ← Create admin user account
│
├─ Realtime Database  ← Check your database rules
│   └─ Rules          ← Set to: { "rules": { ".read": true, ".write": true } }
│                      (for development; secure for production)
│
└─ Build
    └─ Realtime Database
```

### Step 4: Set the admin email

```javascript
AdminTool.init({
    // ...
    auth: {
        adminEmail: "admin@yourcompany.com"     ← The exact email of your Firebase user
    },
    // ...
});
```

**Important:** The admin email must match a user created in Firebase Authentication.

---

## 7. How to Change Branding

Change these values inside `AdminTool.init()`:

```javascript
AdminTool.init({
    // ...
    branding: {
        title: "My Admin Panel",           ← Browser tab title
        logoUrl: "./images/my-logo.png",    ← Path to your logo image
        logoAlt: "My Company Name"          ← Alt text for the logo
    },
    // ...
});
```

### Logo requirements

| Property | What to put |
|---|---|
| `logoUrl` | Relative path from your HTML file to the image (e.g., `./images/logo.png`) or a full URL (e.g., `https://example.com/logo.png`) |
| `logoAlt` | Text shown if the image fails to load |
| `title` | Text shown in the admin panel header area |

### Example: Changing the logo

```
my-website/
├── admin-tool/               ← Unchanged
├── images/
│   └── my-company-logo.png   ← Your logo file
├── index.html                ← Change logoUrl here
└── ...
```

In `index.html`:

```javascript
AdminTool.init({
    // ...
    branding: {
        logoUrl: "./images/my-company-logo.png",     ← Path to your logo
        logoAlt: "My Company"
    },
    // ...
});
```

---

## 8. How to Upgrade the Framework Later

When a new version of the admin-tool is released, follow these steps.

### Step 1: Download the new version

Get the new `admin-tool/` folder from the source.

### Step 2: Back up your configuration

Copy your `AdminTool.init()` call from your HTML file and save it somewhere safe.

Your init() call looks like this:

```javascript
AdminTool.init({
    firebase: { ... },
    auth: { adminEmail: "..." },
    branding: { logoUrl: "...", logoAlt: "..." },
    ageGroups: [ ... ],
    visitPurposes: [ ... ]
});
```

**Save this entire block.** It contains all your project settings.

### Step 3: Delete the old admin-tool folder

```bash
rm -rf my-website/admin-tool
```

### Step 4: Copy the new admin-tool folder

```bash
cp -r /path/to/new/admin-tool my-website/admin-tool
```

### Step 5: Restore your configuration

Open your `index.html`.  
Find the `AdminTool.init({...})` call.  
Replace the old init() call with your saved backup.

Your HTML should look like this:

```html
<script src="./admin-tool/admin.js"></script>
<script>
AdminTool.init({
    firebase: {                     ← Your saved config
        apiKey: "YOUR_API_KEY",     ← Your keys (unchanged)
        // ...
    },
    auth: {
        adminEmail: "admin@yourcompany.com"  ← Your admin email
    },
    branding: {
        logoUrl: "./images/logo.png",        ← Your logo
        logoAlt: "My Company"
    },
    ageGroups: [...],                        ← Your groups
    visitPurposes: [...]                     ← Your purposes
});
</script>
```

### Upgrade checklist

```
[ ] 1. Save your AdminTool.init() config (copy to a text file)
[ ] 2. Delete the old admin-tool/ folder
[ ] 3. Copy the new admin-tool/ folder
[ ] 4. Open index.html
[ ] 5. Find the AdminTool.init() call
[ ] 6. Paste your saved config into the init() call
[ ] 7. Save index.html
[ ] 8. Test in browser
```

---

## 9. How to Replace the Framework Without Breaking Your Project

### The Golden Rule

**Your project config and the framework are completely separate.**

```
Your HTML file                     admin-tool/ folder
══════════════════                 ════════════════════
AdminTool.init({                   ├── admin.js         ← Framework code
    firebase: { ... },     ───▶    ├── admin.css
    auth: { ... },                 ├── config/
    branding: { ... },             ├── components/
    ageGroups: [...],              └── modules/
    visitPurposes: [...]
});                     
```

- The **left side** (your HTML) contains your project values.  
- The **right side** (admin-tool folder) contains the framework.  

**They never mix.**

### When you replace the framework

1. The **old** `admin-tool/` folder is deleted entirely
2. The **new** `admin-tool/` folder is copied in
3. Your `AdminTool.init()` call in HTML stays **exactly the same**

Your init() call does NOT change because it was never inside the admin-tool folder.

### Visual: Replacing only the framework

```
BEFORE UPGRADE:
my-website/
├── admin-tool/ (old version v1.0)     ← Will be deleted
├── index.html
│   └── AdminTool.init({               ← Stays unchanged
│         firebase: { ... },
│         auth: { ... }
│       })
└── ...

AFTER UPGRADE:
my-website/
├── admin-tool/ (new version v2.0)     ← Fresh copy
├── index.html
│   └── AdminTool.init({               ← Exactly the same as before
│         firebase: { ... },
│         auth: { ... }
│       })
└── ...
```

### What to NEVER do

```
✗ DO NOT edit files inside admin-tool/
✗ DO NOT put your Firebase keys in admin-tool/config/settings.js
✗ DO NOT put your logo path in admin-tool/components/header.js
✗ DO NOT put your admin email in admin-tool/config/firebase.js

All project settings go ONLY in:
  index.html → AdminTool.init({ ... })
```

---

## 10. Troubleshooting

### "admin-root not found" error

**Problem:** The div is missing or misspelled.

**Fix:** Make sure this exact line is in your HTML:

```html
<div id="admin-root"></div>
```

Check for:
- ✗ `admin_root` (underscore instead of hyphen)
- ✗ `Admin-root` (capital A)
- ✗ `adminroot` (missing hyphen)
- ✅ `admin-root` (correct)

### "Firebase config not found" error

**Problem:** `AdminTool.init()` was not called, or `firebase` object is missing.

**Fix:** Ensure your init() call has the `firebase` property:

```javascript
AdminTool.init({
    firebase: {           ← This must exist
        apiKey: "...",
        // ...
    },
    // ...
});
```

### "adminEmail is required" error

**Problem:** The `auth.adminEmail` is missing or empty.

**Fix:** Add the admin email:

```javascript
AdminTool.init({
    auth: {
        adminEmail: "admin@yourcompany.com"   ← Must be a real email
    },
    // ...
});
```

### Admin panel is invisible

**Problem:** The gear icon (⚙) in the header should appear. If not:

1. Check that `admin.css` is loading (open browser DevTools → Network tab)
2. Check that `admin.js` is loading (open browser DevTools → Console tab)
3. Check for JavaScript errors in the Console tab
4. Make sure `AdminTool.init()` is called AFTER `admin.js` loads

### "Failed to load" errors in console

**Problem:** One of the internal modules failed to load.

**Fix:** 
1. Verify the `admin-tool/` folder is complete (all files exist)
2. Check file paths — if you placed `admin-tool` inside a subfolder, adjust the CSS/JS paths accordingly

```
If your structure is:
  my-website/
    ├── admin/
    │   └── admin-tool/         ← admin-tool is inside "admin" folder
    └── index.html

Then your HTML paths should be:
  <link rel="stylesheet" href="./admin/admin-tool/admin.css">
  <div id="admin-root"></div>
  <script src="./admin/admin-tool/admin.js"></script>
```

---

## 11. Quick Reference Card

```
╔══════════════════════════════════════════════════════════════╗
║              ADMIN TOOL — QUICK REFERENCE CARD               ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │  1. COPY the admin-tool/ folder into your project root  │  ║
║  └────────────────────────────────────────────────────────┘  ║
║                              │                               ║
║                              ▼                               ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │  2. ADD these 4 blocks to index.html (before </body>)   │  ║
║  │                                                          │  ║
║  │  <!-- Firebase SDK -->                                   │  ║
║  │  <script src="...firebase-app-compat.js"></script>       │  ║
║  │  <script src="...firebase-database-compat.js"></script>  │  ║
║  │  <script src="...firebase-auth-compat.js"></script>      │  ║
║  │                                                          │  ║
║  │  <!-- Admin CSS -->                                      │  ║
║  │  <link rel="stylesheet" href="./admin-tool/admin.css">   │  ║
║  │                                                          │  ║
║  │  <!-- Root container -->                                  │  ║
║  │  <div id="admin-root"></div>                             │  ║
║  │                                                          │  ║
║  │  <!-- Admin JS -->                                       │  ║
║  │  <script src="./admin-tool/admin.js"></script>           │  ║
║  │                                                          │  ║
║  │  <!-- Initialize -->                                     │  ║
║  │  <script>                                                │  ║
║  │  AdminTool.init({                                        │  ║
║  │    firebase: { ... },        ← Your Firebase config      │  ║
║  │    auth: { adminEmail: "..." }, ← Your admin email       │  ║
║  │    branding: { logoUrl: "..." },  ← Your logo            │  ║
║  │    ageGroups: [...],          ← Your age groups           │  ║
║  │    visitPurposes: [...]       ← Your purposes             │  ║
║  │  });                                                      │  ║
║  │  </script>                                                │  ║
║  └────────────────────────────────────────────────────────┘  ║
║                              │                               ║
║                              ▼                               ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │  3. OPEN your website. The gear icon (⚙) appears.       │  ║
║  │     Click it → enter admin password → dashboard loads.   │  ║
║  └────────────────────────────────────────────────────────┘  ║
║                                                              ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │  TO UPGRADE:                                            │  ║
║  │  1. Save your AdminTool.init() config                    │  ║
║  │  2. Delete admin-tool/ folder                            │  ║
║  │  3. Copy new admin-tool/ folder                          │  ║
║  │  4. Restore your AdminTool.init() config (unchanged)     │  ║
║  │  5. Done.                                                │  ║
║  └────────────────────────────────────────────────────────┘  ║
║                                                              ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │  NEVER EDIT:                                            │  ║
║  │  Any file inside the admin-tool/ folder.                │  ║
║  │  All project settings go in AdminTool.init() only.      │  ║
║  └────────────────────────────────────────────────────────┘  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Appendix: Full Minimal Example

Here is a complete, minimal `index.html` that includes the admin-tool:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Website</title>
</head>
<body>

    <!-- Your website content -->
    <h1>Welcome to my website</h1>

    <!-- ─── ADMIN TOOL ──────────────────────────────────── -->
    <!-- Firebase SDK -->
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>

    <!-- Admin styles -->
    <link rel="stylesheet" href="./admin-tool/admin.css">

    <!-- Admin root container -->
    <div id="admin-root"></div>

    <!-- Admin framework -->
    <script src="./admin-tool/admin.js"></script>

    <!-- Initialize with YOUR config -->
    <script>
    AdminTool.init({
        firebase: {
            apiKey: "AIzaSyBxXxXxXxXxXxXxXxXxXxXxXxXxXxXx",
            authDomain: "my-project.firebaseapp.com",
            databaseURL: "https://my-project-default-rtdb.firebaseio.com",
            projectId: "my-project",
            storageBucket: "my-project.firebasestorage.app",
            messagingSenderId: "123456789012",
            appId: "1:123456789012:web:abc123"
        },
        auth: {
            adminEmail: "admin@mycompany.com"
        },
        branding: {
            logoUrl: "./images/logo.png",
            logoAlt: "My Company"
        },
        ageGroups: ["Youth(13-17)", "Adult(18-64)", "Senior(65+)"],
        visitPurposes: ["Reading", "Meeting", "Workshop"]
    });
    </script>

</body>
</html>
```

---

*End of installation manual. If you followed all steps correctly, the admin panel should appear in your website. Click the gear icon (⚙) in the top-right corner to log in.*