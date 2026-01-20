## 🛠 Developer Workflow Guide
**⚠️ IMPORTANT:** We are using an "Honor System" for this repository. Please strictly follow these rules to avoid breaking the production code.

### 1. Setup & Installation
```bash
# Clone the repository
git clone [https://github.com/YourUsername/CAIretaker-Mobile.git](https://github.com/YourUsername/CAIretaker-Mobile.git)
cd CAIretaker-Mobile

# Install dependencies (React Native environment)
npm install

```

### 2. Branching Strategy

We adhere to an industry-standard git flow. **NEVER** push directly to `main` or `develop`.

* **`main`**: Production-ready code only.
* **`develop`**: Integration branch (The base for all features).
* **`feature/[name]`**: Working branches for specific tasks.

#### Active Feature Branches:

* `feature/dashboard-mobile`
* `feature/push-notifications`

### 3. How to Contribute (Step-by-Step)

**Step A: Start a Task**
Always pull the latest `develop` branch before starting.

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name

```

**Step B: Save Your Work**

```bash
git add .
git commit -m "Brief description of changes"
git push origin feature/your-feature-name

```

**Step C: Submit Code (Pull Request)**

1. Go to the GitHub repository page.
2. Click **"Compare & pull request"**.
3. **CRITICAL:** Set the **base** branch to **`develop`** (NOT `main`).
4. Assign a group member to review your code.
5. Merge only after approval.

---

## 📂 Repository Structure

Please ensure files are placed in the correct directories:

```text
CAIretaker-Mobile/
├── .github/workflows/   # CI/CD configurations
├── backend/             # Server-side logic & API (from web interface)
├── public/              # Static assets (images, icons)
├── src/
│   ├── components/      # Reusable widgets (Buttons, Headers, etc.)
│   ├── pages/           # Full screen layouts (Login, Dashboard)
└── package.json         # Project dependencies

```
