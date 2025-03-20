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
- [x] Props = 2nd Pass
    - [x] Type checking for props

---

- [] So much refactoring - it has to wait - it works!! :tada:
- [] Add constants with all diagnostic codes enum ftw
- [] Create a factory to create diagnostic complying with an interface, could be a class, or named functions with minimal parameters
- [] Common things that need to be shared with vite plugin:
    - [] Diagnostics only
    - [] Imports, props, possibly check fort multi word class for component
    - [] Skip any autocompletion
- [] Get rid of `isComponentDefinedInFile`
- [] Extract common features in to a separate package
- [] Add auto completion for a component keyword: `component~`
    - [] Trigger when in first line only:
    ```
    const { line } = sourceFile.getLineAndCharacterOfPosition(position);
    if (line === 0) {
    ```
- [] Is it worth checking for template literals node, maybe just work on the whole source text :thinking:
    - [] This would reduce complexity a ton
- [] Remove diagnostics for non existing components, that is daft!!
