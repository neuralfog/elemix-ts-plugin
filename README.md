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
- [x] Remove direct props in elemix - bad idea to easy to get property collision
- [x] Auto completion for props
- [x] Symbol information on hover listing component name, import and all props with their types
- [x] Optional props need to be marked with `?` in the hover dialog (there is no hover in vim)
- [x] In `getAllComponents` enrich the structure with optional field `boolean`
- [x] Props completion not working with not self closed component, works in self closing tag (fucking regex)!!
- [x] For shit and giggles try it in vscode (not that I care) 
    - Partially works, all typescript linting seems to work, autocompletion and code actions do not!! Who cares for shit editors :shrug:
- [x] Autocompletion for component names:
    - [x] Detect if component template has slots - most likely search for `<slot` to include named slot
    - [x] Add `slots` key to structure that list all components as boolean
    - [x] Autocomplete component `<CompName />` - no slots, `<CompName></CompName>` - with slots
    - [x] List the slots by names in component info hover, if no named slots just do slots `default`
- [x] Props - 1st Pass
    - [x] Detect missing props and report an error if prop is not optional
- [] Props = 2nd Pass
    - [] Type checking for props
- [] I need to transpile templates now :|
    - [] Ensure imports are not tree shaken
        ```
        import { Test } from './components' <= this will get removed
        void Test; <= referenced to preserve import during the bundling
        ```
    - [] Could I do it with vite plugin ??
    - [] Class name in template need to be replaced by tag `Camel Case` => `Kebab Case`
    - [] Transpile options:
        - Vite plugin
        - Typescript transformers
        - ...
