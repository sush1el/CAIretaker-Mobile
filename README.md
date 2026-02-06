# 🛠 Developer Workflow Guide

---

## 📋 Quick Start Checklist

Before you start coding, complete these steps:

- [ ] Clone the repository
- [ ] Install dependencies
- [ ] Pull the latest `develop` branch
- [ ] Create your feature branch
- [ ] Start coding!

---

## 1. Initial Setup & Installation

### First-Time Setup

```bash
# Clone the repository
git clone https://github.com/YourUsername/CAIretaker-Mobile.git
cd CAIretaker-Mobile

# Install dependencies (React Native + Expo environment)
npm install

# Verify installation
npx expo --version
```

### Required Software
- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**
- **Expo CLI** (installed via npx, no global install needed)
- **Git** (for version control)
- **Expo Go App** (on your phone for testing)

---

## 2. Branching Strategy

 **NEVER** push directly to `main` or `develop`.

### Branch Hierarchy

```
main (Production - DO NOT TOUCH)
  └── develop (Integration branch - DO NOT PUSH DIRECTLY)
        ├── feature/dashboard-mobile
        ├── feature/push-notifications
        └── feature/your-feature-name
```

- **`main`**: Production-ready code only. Merge only from `develop` after thorough testing.
- **`develop`**: Integration branch where all features are merged. This is your base branch.
- **`feature/[name]`**: Working branches for specific tasks.

### Active Feature Branches

- `feature/dashboard-mobile` - Dashboard UI improvements
- `feature/push-notifications` - Push notification system

---

## 3. How to Start Coding (Step-by-Step)

### Step 1: Pull the Latest Base Template

The base template has already been committed to `develop`. **Everyone must start here.**

```bash
# Make sure you're in the project directory
cd CAIretaker-Mobile

# Checkout the develop branch
git checkout develop

# Pull the latest base template
git pull origin develop
```

You should now have:
- `App.js` - Main app structure with navigation
- `src/components/Card.js` - Reusable card component
- `src/pages/Dashboard.js` - Dashboard page
- `src/pages/Monitoring.js` - Monitoring page
- `src/pages/Logs.js` - Logs page
- All necessary dependencies in `package.json`

### Step 2: Create Your Feature Branch

**NEVER** code directly on `develop`. Always create a feature branch.

```bash
# Create and switch to your feature branch
git checkout -b feature/your-feature-name

# Example:
git checkout -b feature/video-feed-integration
git checkout -b feature/alert-notifications
git checkout -b feature/backend-api-connection
```

**Branch Naming Convention:**
- Use lowercase
- Separate words with hyphens
- Be descriptive: `feature/video-feed-integration` ✅ NOT `feature/video` ❌

### Step 3: Start the Development Server

```bash
# Start Expo development server
npx expo start

# Or for specific platforms:
npx expo start --android
npx expo start --ios
npx expo start --web
```

Scan the QR code with the **Expo Go** app to see your changes live on your phone.

---

## 4. Making Changes & Committing Code

### Step A: Code Your Feature

Work on your assigned feature in your feature branch. Make sure to:
- Test your changes locally
- Follow the existing code style
- Add comments for complex logic
- Don't break existing functionality

### Step B: Save Your Work Regularly

```bash
# Check what files you've changed
git status

# Add all changed files
git add .

# OR add specific files
git add src/pages/Dashboard.js

# Commit with a descriptive message
git commit -m "Add video feed component to Dashboard"

# Push to YOUR feature branch (NOT develop!)
git push origin feature/your-feature-name
```
### Step C: Keep Your Branch Updated

If other team members have merged changes to `develop`, update your branch:

```bash
# Switch to develop
git checkout develop

# Pull latest changes
git pull origin develop

# Switch back to your feature branch
git checkout feature/your-feature-name

# Merge develop into your branch
git merge develop

# Resolve any conflicts if they appear
# Then push your updated branch
git push origin feature/your-feature-name
```

---

## 5. Submitting Your Code (Pull Request)

When your feature is complete and tested:

### Step 1: Push Your Final Changes

```bash
git add .
git commit -m "Final commit: Complete video feed integration"
git push origin feature/your-feature-name
```

### Step 2: Create a Pull Request on GitHub

1. Go to the [GitHub repository page](https://github.com/YourUsername/CAIretaker-Mobile)
2. Click **"Compare & pull request"** (appears after pushing)
3. **CRITICAL:** Set the **base** branch to **`develop`** (NOT `main`)
4. Fill in the PR template:
   - **Title:** Brief description (e.g., "Add Video Feed Component")
   - **Description:** What you changed and why
   - **Testing:** How you tested it
5. Assign a team member to review your code
6. Click **"Create pull request"**

### Step 3: Code Review & Merge

- Wait for a teammate to review and approve
- Address any requested changes
- Once approved, **merge** into `develop`
- Delete your feature branch after merging (keeps repo clean)

---

## 6. Testing Your Changes

Before creating a pull request:

```bash
# Run the app and test all three tabs
npx expo start

# Test on:
# - Your phone (via Expo Go)
```

## 7. Common Git Commands Reference

```bash
# Check current branch
git branch

# See all branches (including remote)
git branch -a

# Switch to a different branch
git checkout branch-name

# Create and switch to new branch
git checkout -b feature/new-feature

# Pull latest changes from develop
git pull origin develop

# Push your branch to GitHub
git push origin feature/your-feature-name

# See commit history
git log --oneline

# Undo last commit (keeps changes)
git reset --soft HEAD~1

# Discard all local changes (⚠️ DANGEROUS)
git reset --hard
```
---

## 8. File Organization Rules

Keep the repository clean and organized:

```
CAIretaker-Mobile/
├── .github/workflows/      # CI/CD configurations (Don't touch)
├── assets/                 # Icons, images, splash screens
├── backend/                # Python backend (separate from mobile)
├── public/                 # Static web assets
├── src/
│   ├── components/         # Reusable components (Card, Button, etc.)
│   ├── pages/              # Full screens (Dashboard, Monitoring, Logs)
│   ├── services/           # API calls, utilities
│   └── styles/             # Global styles (if needed)
├── .gitignore              # Files to ignore
├── App.js                  # Main app entry point
├── app.json                # Expo configuration
├── package.json            # Dependencies
└── README.md               # This file
```
