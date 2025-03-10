## Elemix Typescript plugin

Typescript language server logs:

```bash

tail -f ~/.local/state/nvim/lsp.log
```

Enable LSP debug in nvim:

```bash
:lua vim.lsp.set_log_level("debug")
```

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
JSX like template syntax and Typescript checking

- [x] Report not existing components
- [x] Report components with missing imports
- [x] Add code action to import components from template
- [x] Filter out imports that are referenced in string template literal
- [] I need to transpile templates now :|
    - [] Ensure imports are not tree shaken
        ```
        import { Test } from './components' <= this will get removed
        void Test; <= refrenced to preserve import during the bundling
        ```
    - [] Could I do it with vite plugin ??
    - [] Class name in template need to be replaced by tag
        - [] Tag is optional sop is either class name to kebab case or tag from decorator
- [] Remove direct props in elemix - bad idea to easy to get property collision
- [] Component props need type checking
    - [] Report missing props if not optional
    - [] Report wrong types for props
    - [] Code action 
        - [] add missing required props
        - [] add all props
