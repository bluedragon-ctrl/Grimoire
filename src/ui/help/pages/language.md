# Language

Grimoire scripts use a small Python-flavored DSL. Whitespace matters; blocks are defined by indentation; there are no semicolons.

# Indentation and blocks

A colon at the end of a header line opens a block. Every line in the block must use the same indent (2 spaces is the convention).

```
while len(enemies()) > 0:
  approach(enemies()[0])
  attack(enemies()[0])
```

Mixing tabs and spaces within the same block is a parse error. Stick to 2 spaces.

# if / elif / else

```
if me.hp < 5:
  flee(enemies()[0])
elif me.adjacent_to(enemies()[0]):
  attack(enemies()[0])
else:
  approach(enemies()[0])
```

# while

Condition checked once per iteration. A `halt` inside does NOT break — it ends the main body entirely. Use a falsy condition to exit naturally.

```
while len(enemies()) > 0:
  approach(enemies()[0])
  attack(enemies()[0])
```

# for

Iterates over an array value. The loop variable is scoped to the block.

```
for f in items_nearby():
  approach(f)
  pickup(f)
```

# Assignment

Bare names in the main body are locals. `=` is assignment, `==` is comparison — don't mix them.

```
e = enemies()[0]
attack(e)
```

# Comparisons and booleans

Operators: `==`, `!=`, `<`, `<=`, `>`, `>=`. Booleans combine with `and`, `or`, `not`.

```
if me.hp < 10 and not me.has_effect("regen"):
  use("health_potion")
```

# Strings and numbers

Strings are double-quoted. Numbers are 64-bit floats; most engine APIs expect integers and floor internally.

```
cast("firebolt", enemies()[0])
x = 3 + 4 * 2
```

# Function definitions

Define helpers at the top of the script. Recursion works.

```
def closest_low_hp():
  e = enemies()[0]
  return e

while len(enemies()) > 0:
  attack(closest_low_hp())
```

# Event handlers

Handlers sit alongside the main body. They fire on engine events for the owner actor. Binding names after `as` expose payloads like the attacker.

```
on hit as attacker:
  flee(attacker)

while len(enemies()) > 0:
  approach(enemies()[0])
  attack(enemies()[0])
halt
```

Handlers continue to fire after `halt` closes the main body — a halted caster can still retaliate via `on hit`.

# Common gotchas

- `queries/commands` with no args still need parentheses: `hp()` not `hp`. The only exceptions are `me` and `halt`.
- Missing colon after an `if` / `while` / `for` header is a parse error.
- Indent level must match the block's first line exactly.
- Strings in double quotes only — single quotes are a parse error.
- The old standalone `distance(...)`, `adjacent(...)`, `has_effect(...)`, `can_cast(...)` are gone — call them on the actor: `me.distance_to(foe)`, `me.adjacent_to(foe)`, `me.has_effect("burn")`, `me.can_cast("bolt", foe)`.
