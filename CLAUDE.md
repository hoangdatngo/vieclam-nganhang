@AGENTS.md

## Standing rules

- **Every implementation task ends with the `test-task` skill.** When a task, feature, module,
  adapter, migration, or bug fix is finished, invoke `test-task` before reporting it complete or
  marking it done. It writes the tests, runs them, and appends the result to `Testcases.md`.
  A task with no test entry is not finished.
