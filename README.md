# Grimoire

A browser roguelike where you write the hero's script in advance, then watch them execute it against monsters whose AI is written in the same language.

## Status

Early scaffolding. Headless engine + minimal UI shell. No DSL parser yet, no renderer yet — both slot in later. See [docs/engine-design.md](docs/engine-design.md).

## Running

```
npm install
npm run dev       # open the UI (Run button fires a hardcoded demo)
npm test          # run the engine test suite
```

Node 20+.
