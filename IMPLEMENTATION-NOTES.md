# V5 implementation summary

## What changed in V5
- guided `setup`
- interactive menus with arrow keys + Enter for setup/new/approve/fix
- LM Studio setup stores local connection in config by default (no per-terminal export needed)
- command preflight checks before start/new/status/approve with guided remediation
- start aborts by default when setup is broken (`--force` available)
- human-friendly `start`
- guided `new`
- `doctor`, `resume`, and `fix`
- automatic repo discovery
- global config + local overrides
- mandatory explicit human reviewer name in setup (no implicit default)
- stronger stale lock cleanup (age + dead PID)
- safer orphaned working file recovery
- interrupted task requeue recovery
- stricter Dispatcher and Planner prompts
- stricter Dispatcher and Planner schemas
- clearer user-facing messages

## Future-friendly design
The CLI is ready for future iterations:
- more providers
- more real agent stages
- dashboard UI
- better retry policy
- richer task routing
- Linux validation
