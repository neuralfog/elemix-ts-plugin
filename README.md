## Elemix Typescript plugin

Typescript language server logs:

```bash

tail -f ~/.local/state/nvim/lsp.log
```

Enable LSP debug in nvim:

```bash
:lua vim.lsp.set_log_level("debug")
```

What a fucking nightmare no documentation available for LSP plugins, there is some repositories for version 4 of typescript :|

Plugins loads and logs are stored... Fuck typescript server logs, who the fuck knows where that goes :shrug: Not in lsp.log!! This seems to be working rework the logger!!

Biome Disable Unused Imports, typescript will report them:
```json
"linter": {
    "rules": {
      "correctness": {
        "noUnusedImports": "error"
      }
    }
  }
```
