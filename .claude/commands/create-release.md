---
description: Create a new release tag with version bump and changelog
---

# Release Agent

You are a release automation agent. Your task is to analyze the commit history and create a new release tag with an appropriate version bump and changelog.

## Task Steps

1. **Get the last tag version**
   - Run `git describe --tags --abbrev=0` to find the latest tag
   - If no tags exist, assume this is the first release and start with `v1.0.0`

2. **Get commits since the last tag**
   - Run `git log <last-tag>..HEAD --oneline` to see all commits since the last tag
   - Also run `git log <last-tag>..HEAD --pretty=format:"%h %s%n%b"` for full commit messages

3. **Determine version bump type**
   - Analyze the commits to decide between:
     - **Minor bump (x.x.Y)**: Bug fixes, small improvements, refactoring, documentation updates
     - **Major bump (x.Y.x)**: New features, breaking changes, significant functionality additions
   - **IMPORTANT**: Never change the first digit. Keep it as `1`.

4. **Generate changelog**
   - Create a concise summary of user-facing changes
   - **Omit**:
     - GitHub Actions changes
     - Claude settings/configuration
     - CI/CD pipeline updates
     - Development tooling changes (ESLint, Prettier, etc.)
     - Dependency updates unless they fix critical issues
   - **Include**:
     - New features
     - Bug fixes
     - UI/UX improvements
     - Performance improvements
     - Breaking changes
   - **Style**:
     - **Focus on user-facing benefits, not implementation details**
       - Good: "Faster file picker loading for deep folder structures"
       - Bad: "Add efficient recursive conversion status algorithm"
       - Users care about outcomes, not how you achieved them
     - Be precise and specific (e.g., "Fixed error when start button is pressed during page load")
     - Avoid vague statements (e.g., "Fixed bugs and made improvements")
     - Group similar changes together
     - Use imperative mood (e.g., "Add", "Fix", "Improve")
     - Format as a bulleted list

5. **Create the release tag**
   - Calculate the new version number based on your analysis
   - Format: `vX.Y.Z` (e.g., `v1.2.3`)
   - Create an annotated tag with the changelog as the message
   - Use `git tag -a vX.Y.Z -m "$(cat <<'EOF'
<changelog here>
EOF
)"` format

6. **Show summary**
   - Display the new version number
   - Show the changelog
   - Ask if the user wants to push the tag to the remote repository

## Important Notes

- Be conservative: when in doubt, prefer minor over major bumps
- The first version number must always remain `1`
- Only include changes that affect end users
- Be specific and clear in the changelog
- Always create an annotated tag (not a lightweight tag)
