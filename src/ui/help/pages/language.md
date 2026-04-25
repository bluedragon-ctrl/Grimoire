# Language

Grimoire scripts look a lot like Python. There are no semicolons; blocks are grouped by how far in they're indented; everything else should feel familiar.

If something is wrong with your script the game can't run it — it'll show you the line and a short hint instead of failing silently.

# Indentation and blocks

A line that ends with a colon (`:`) opens a block. Every line *inside* that block has to start with the same number of spaces. Two spaces is what the rest of the docs use — pick that and stick to it.

```
while len(enemies()) > 0:
  approach(enemies()[0])
  attack(enemies()[0])
```

Don't mix tabs and spaces in the same block — the game will refuse to read it.

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

Keeps repeating the block as long as the condition is true. The check happens once at the start of each pass. `halt` inside a `while` does NOT just break out — it stops the whole script. Use `break` (below) if you only want to leave the loop.

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

# break / continue / pass

- `break` leaves the loop right away.
- `continue` skips the rest of this pass and jumps back to the top.
- `pass` does nothing on purpose — handy when a block needs at least one line but you've got nothing to put there yet.

```
for f in items_nearby():
  if f.defId == "trap_rune":
    continue
  pickup(f)
  if len(items_here()) == 0:
    break
```

# Assignment

`=` puts a value into a name so you can reuse it later. Don't confuse it with `==`, which *checks* whether two values are equal.

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

Wrap text in double quotes (`"hello"`) — single quotes don't work. Numbers can have decimals, but most game commands round them down to whole numbers when they need to.

```
cast("firebolt", enemies()[0])
x = 3 + 4 * 2
```

# Function definitions

If you find yourself writing the same little chunk of code twice, give it a name with `def`. Put your `def`s near the top of the script. A function can call itself if it needs to.

```
def closest_low_hp():
  e = enemies()[0]
  return e

while len(enemies()) > 0:
  attack(closest_low_hp())
```

# Lambdas

A `lambda` is a tiny throwaway function you write right where you need it — no `def`, no name. They're how you tell list helpers like `filter`, `sorted_by`, `min_by`, and `max_by` *what* to look at.

```
hurt = enemies().filter(lambda e: e.hp < 3)
nearest = enemies().min_by(lambda e: me.distance_to(e))
```

# Builtins

- `len(xs)` — number of items in a list (or characters in a string).
- `min(xs)` / `max(xs)` — smallest / largest item; pass a `lambda` second arg to compare by a key.
- `chance(p)` — true `p` percent of the time (uses the world's seedable RNG).
- `random(n)` — a whole number from 0 up to `n - 1`.

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

- Calls always need parentheses: `enemies()` not `enemies`. The only bare names are `me` and `halt`.
- Don't forget the colon at the end of `if` / `while` / `for` / `def` lines.
- All lines inside the same block need the exact same indent.
- Use double quotes for text — `'foo'` won't work.
- The old standalone `distance(...)`, `adjacent(...)`, `has_effect(...)`, `can_cast(...)` are gone. Call them on the actor instead: `me.distance_to(foe)`, `me.adjacent_to(foe)`, `me.has_effect("burn")`, `me.can_cast("bolt", foe)`.
