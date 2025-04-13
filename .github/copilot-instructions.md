## Project Collaboration Rules

You have access to GitHub tools to help automate and enforce these collaboration rules.

When starting a new task, make sure you are on the main branch and have the latest changes from origin.

### Commit Workflow

- **Before committing any changes, test them with the user to ensure they are working and do not introduce new errors. Only commit after user confirmation.**
- Commit each major step as you go, before proceeding to the next step.
- After each commit, always push to the remote branch to keep the remote in sync.

### Issue-Driven Development Workflow

1. **All Major Tasks Require Issues**
   - Every significant feature, bug fix, or change must have a corresponding GitHub issue.
   - Issues should be descriptive, outlining the problem, goal, or feature clearly.

2. **Work via Pull Requests**
   - All code changes must be made in branches and submitted as pull requests (PRs).
   - Each PR must reference the relevant issue(s) it addresses (e.g., "Closes #issue-number").
   - PR titles and descriptions should clearly state the purpose and link to the issue.

3. **Blockers, Challenges, and Status Updates**
   - Any blockers, questions, or status updates must be posted as comments on the relevant issue or pull request.
   - If you encounter a blocker or get stuck (e.g., persistent errors, unsolved configuration issues), document the issue as a comment on the relevant GitHub issue or PR, including a summary of what was tried and the current state.
   - Use comments to discuss implementation details, request clarification, or provide progress updates.

4. **Review and Merge Process**
   - PRs should be reviewed before merging.
   - Only merge PRs after ensuring they address the issue and pass all checks.

5. **General Guidelines**
   - Keep communication clear and concise.
   - Reference issues and PRs in all discussions for traceability.
   - Update or close issues as work progresses and is completed.

### Automation/Assistant Workflow

- Always follow the commit and push workflow after each major step, without needing user prompting.
- If you encounter a blocker or cannot proceed (e.g., due to unsolved errors or limitations), automatically summarize the issue and post it as a comment on the relevant GitHub issue or pull request.
- Ensure all actions are traceable and documented in the project’s GitHub issues and PRs.