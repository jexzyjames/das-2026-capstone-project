# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:*
We are starting the Event Ticketing capstone in plain JavaScript (ES modules,
Node 22.13 or newer, no outside packages). It runs in the terminal only: no
server, no database. Read README.md and docs/build-1.md before you write
anything.

Create these files, and set "type": "module" in package.json.

1. src/domain/errors.js: a DomainError class that extends Error and carries a
   machine-readable code (for example VALIDATION, NOT_FOUND, SOLD_OUT).

2. src/domain/ids.js: newId() and newReference(). Use node:crypto, never
   Math.random. A reference is a short, readable booking code that is safe to
   read aloud.

3. src/domain/waitlistQueue.js: a first-in-first-out Queue class built as a
   linked list, with private fields. enqueue, dequeue, peek and size must all
   be fast (O(1)). Do not use array.shift().

4. src/domain/inventory.js: createStore(), createEvent, addTier, bookTickets,
   cancelBooking, findBookingByReference and joinWaitlist.
   - A booking is for 1 to 10 tickets from one tier.
   - If there are not enough seats, throw SOLD_OUT and change nothing.
   - Cancelling releases the seats. Cancelling twice is an error.
   - Find a booking by its reference in O(1) with a Map.

5. scripts/demo.js: tells the whole story. An event sells out, a booking is
   refused, two people join the waitlist, a booking is cancelled, and the next
   person in line is named.

6. scripts/benchmark-lookup.js: compares Map.get with Array.find over many
   bookings and prints both timings. Add "demo" and "benchmark" scripts to
   package.json.

Rules: money is whole cents (never decimals); validate every input and throw a
DomainError with a code; a failed booking must not change anything. When you
are done, list every file you created and any rule from this prompt that you
were unsure about.
*
- **What came back:*
Implemented the Build 1 requirements. No new files were needed; the requested files already existed. I updated ids.js, inventory.js, demo.js, benchmark-lookup.js, and inventory.test.js.

package.json already had ES modules and both scripts; errors.js and waitlistQueue.js already met the requested requirements.

Verification: all 45 tests pass; the demo and benchmark run successfully. No prompt rules were unclear.*
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:*
We are building Build 2 of the Event Ticketing capstone, in plain JavaScript
(ES modules, Node 22.13 or newer, no outside packages). Read README.md,
docs/user-stories.md, docs/build-2.md and everything in src/domain/ before you write
anything.

Add the following. Do not change what already works.

1. src/domain/sorting.js: mergeSort(items, compare). Write the merge sort
   yourself. Do NOT call Array.prototype.sort. It must be stable (equal items
   keep their original order), it must return a NEW array, and it must never
   modify the one it was given.

2. In inventory.js: publishEvent(store, eventId) and
   listEventSummaries(store, { publishedOnly = true }). Publishing an event
   with no ticket tiers is an INVALID_STATE error. Drafts are hidden from the
   public list.

3. src/domain/eventSearch.js, pure functions only (events in, new list out):
   - filterEvents(summaries, { q, city, from, to, maxPriceCents, onlyAvailable })
     q matches title or venue, ignoring case. city matches exactly, ignoring
     case. from and to are inclusive, and a date-only 'to' includes that whole
     day. maxPriceCents compares with the cheapest tier. Events with no tiers
     are left out of price filters. A bad date or a price that is not a whole
     number is a VALIDATION error.
   - sortEvents(summaries, sortBy) where sortBy is 'date' (earliest first),
     'price' (cheapest first, no price last) or 'availability' (most seats
     left first). Always break ties by title, then id. Use your mergeSort.
     An unknown sortBy is a VALIDATION error.
   - searchEvents(summaries, criteria, sortBy) = filter, then sort.

4. Tests using node:test and node:assert/strict, in test/. One test for every
   acceptance criterion for S02, S03, S05 and S06 in docs/build-2.md, and
   one for each S04 criterion about publishing that our class wrote.
   Include: the original list is unchanged after sorting and filtering, the
   sort is stable, an empty list, and every error code.

5. Add an "npm test" script to package.json.

Rules: money is whole cents; dates are ISO strings; errors are DomainError with
a code; no mutation of inputs. When you are done, list every file you changed
and any rule from this prompt that you were unsure about. *
- **What came back:*
S04’s class-written criteria were blank in the docs. I added criteria for publishing, unpublishing, and rejecting publication without ticket tiers. No other prompt rules were unclear.*
- **What was wrong (or "nothing"):*A separate uncommitted change appeared in ai-log.md; I left it untouched.


*

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests.
- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.
- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.
