# Publish Reverse to GitHub

1. Create an empty repository named `reverse` under your GitHub account or organization. Do not initialize it with a README, license, or `.gitignore` because this project already contains them.
2. From the project directory, install dependencies and verify the build:

   ```bash
   npm install
   npm test
   ```

3. Initialize and commit:

   ```bash
   git init
   git add .
   git commit -m "Initial Reverse compact analysis core"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/reverse.git
   git push -u origin main
   ```

4. In GitHub, review repository visibility, description, topics (`typescript`, `nodejs`, `mcp`, `benchmarking`, `reverse-engineering`, `performance-analysis`), and security settings.
5. Replace `YOUR-USERNAME` references in README and documentation with the real owner/repository.
6. Add CI (Node.js 20/22/24 matrix), release workflow, issue templates, and CODEOWNERS before tagging a public release.
7. Create a version tag only after tests pass: `git tag v0.1.0 && git push origin v0.1.0`.

Never commit private binaries, benchmark data containing sensitive paths, credentials, `.env` files, or local `.reverse` evidence. Review `git diff --cached` before committing.
