# const set = /* array-like */

decent.js has [many](users.md) [dataset](channels.md) [classes](pinned-messages.md). All of them support the following array-like constructs.

---

## for (let item of set) { ... }
`set` implements Symbol.iterator, so you can iterate over it using `for..of`.

## Array.from(set)
Returns `set` as an Array. It will not be mutated by server-sent events, unlike `set`.

---

## set.nth(index: int)
Returns the item at index `index` of the set. eg. `set.nth(0)` returns the first item of the set.

## set.filter(...), set.map(...), set.reduce(...), etc
The following array-like methods are supported by `set`: find, findIndex, filter, map, reduce, reduceRight, forEach, some, every, sort. None of these mutate `set`, and **none** return a new `set` (they return Arrays instead).

---

## set.length
Returns the number of items in the set.
