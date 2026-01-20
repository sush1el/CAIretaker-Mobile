# CAIretaker-Mobile
CAIretaker-Mobile: Developer Workflow Guide

Phase 1: First-Time Setup
Do this once before you start coding.

Clone the Repository Open your terminal/command prompt and run:

Bash
git clone https://github.com/YourUsername/CAIretaker-Mobile.git
cd CAIretaker-Mobile
(Replace YourUsername with the actual organization or username where the repo lives).

Install Dependencies Since we are shifting to a React Native environment, ensure you have Node.js installed, then run:

Bash
npm install
Phase 2: Starting a New Task (The Golden Rules)
🛑 RULE 1: NEVER push directly to main or develop. 🛑 RULE 2: Always create a new branch for your specific task.

Switch to the Integration Branch Always start your work from the latest version of the develop branch.

Bash
git checkout develop
git pull origin develop
Create Your Feature Branch Name your branch based on what you are working on (e.g., feature/dashboard-mobile or feature/push-notifications ).

Bash
# Syntax: git checkout -b feature/name-of-task
git checkout -b feature/login-screen
Phase 3: Coding & Directory Structure
Place your files strictly according to our repository structure:

src/pages/: Full screen layouts (e.g., Login, Dashboard).

src/components/: Reusable widgets (e.g., Buttons, Headers, Alert Cards).


backend/: Any API or server-side logic (reused from the web interface).


public/: Static assets like images or icons.

Phase 4: Saving & Uploading Work
Stage and Commit Changes

Bash
git add .
git commit -m "Added login screen layout"
Push to GitHub Push your branch, not the main branch.

Bash
# Syntax: git push origin feature/name-of-task
git push origin feature/login-screen
Phase 5: Making a Pull Request (PR)
This is how your code gets into the official project.

Go to the repository on GitHub.

You will see a yellow banner saying "feature/login-screen had recent pushes." Click Compare & pull request.

IMPORTANT: Change the "base" branch to develop.

Do NOT merge into main yet! main is only for production-ready code.

Title: Describe what you did.

Review: Since we can't enforce rules, assign one team member to review your code (e.g., have Cyril or Jasmine check it).

Once approved, click Merge pull request.
