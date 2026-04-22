// Script library — canonical snippets taught by script tomes.
//
// Each entry is a {name → body} pair. Tomes (item type `tome_<name>`) call
// `learn-script <name>` which copies the body into the player's `scripts`
// map. Players can then `run <name>`, `cat <name>`, or `edit <name>` to
// study and adapt the snippet. See `buildTomeDefs` in items.js.

export const SCRIPT_LIBRARY = {
  kite: `# Attack nearest monster, then step away from it.
$t = monsters | sort-by range | first
if $t; then attack $t; fi
if monsters[range<=1]; then flee; fi`,

  heal_low: `# Drink a health potion when HP drops below 10.
if self.hp < 10; then
  $p = items[type=health_potion] | first
  if $p; then use $p; fi
fi`,

  scan_loot: `# Report nearby items by type and count.
scan items | count
items[range<=5]`,

  snipe: `# Cast frostbolt at the farthest visible monster.
$t = monsters | sort-by range | last
if $t; then cast frostbolt $t; fi`,

  autopick: `# Pick up anything underfoot.
pickup`,

  hunt: `# Walk to the nearest visible monster and attack it.
# Loops while any monster is in sight; closes then strikes.
while monsters; do
  $t = monsters | sort-by range | first
  if $t.range <= 1; then attack $t; else approach $t; fi
done`,

  wall_west: `# March to the western wall.
# A single command; monsters still get their scheduled turns.
walk west`,

  go_left: `# Approach the nearest room to the west of you.
# Uses the "direction=" octant filter against all known rooms.
rooms[direction=west] | sort-by range | first | approach`,

  descend_now: `# Find the downstairs, walk onto them, and descend.
# "at" is free (no turn cost) so the loop only spends turns on approach.
$s = objects[type=stairs_down] | first
if $s; then
  until at $s; do approach $s; done
  descend
fi`,

  sweep: `# Walk the four cardinal directions until each is blocked.
# Useful for scouting a room's footprint in a single script.
for d in north east south west; do walk $d; done`,

  room_scout: `# Report the neighbouring rooms in each compass direction.
# Purely informational — no turn cost. Expand this tome with more directions
# (northeast, southwest, ...) to taste.
echo "-- north --"
rooms[direction=north] | sort-by range
echo "-- south --"
rooms[direction=south] | sort-by range
echo "-- east --"
rooms[direction=east] | sort-by range
echo "-- west --"
rooms[direction=west] | sort-by range`,
};
