// Build 1: the domain core, running entirely in memory.
// No server, no database. Just objects, Maps and rules.
// Build 4 replaces this file with services + repositories.

import { newId, newReference } from './ids.js';
import { Queue } from './waitlistQueue.js';
import { DomainError } from './errors.js';
import { summarizeEvent } from './eventSearch.js';

export const MAX_TICKETS_PER_BOOKING = 10;

// Bookings in these states are holding seats. A cancelled one is not.
const HOLDS_SEATS = new Set(['pending', 'paid']);

export function createStore() {
  return {
    events: new Map(), // eventId -> event
    tiers: new Map(), // tierId -> tier
    bookings: new Map(), // bookingId -> booking
    bookingsByReference: new Map(), // reference -> booking  (hash map = O(1) lookup)
    waitlists: new Map(), // tierId -> Queue
  };
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('VALIDATION', `${field} is required`);
  }
  return value.trim();
}

function requireWholeNumber(value, field, min) {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new DomainError('VALIDATION', `${field} must be a whole number of at least ${min}`);
  }
  return value;
}

function requireObject(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${field} must be an object`);
  }
  return value;
}

function requireStore(store) {
  requireObject(store, 'Store');
  for (const name of ['events', 'tiers', 'bookings', 'bookingsByReference', 'waitlists']) {
    if (!(store[name] instanceof Map)) {
      throw new DomainError('VALIDATION', `Store.${name} must be a Map`);
    }
  }
  return store;
}

function validateTier(tier) {
  requireObject(tier, 'Tier');
  requireText(tier.name, 'Tier name');
  requireWholeNumber(tier.priceCents, 'priceCents', 0);
  requireWholeNumber(tier.capacity, 'capacity', 1);
  requireWholeNumber(tier.sold, 'sold', 0);
  if (tier.sold > tier.capacity) {
    throw new DomainError('INVALID_STATE', 'Tier sold count cannot exceed capacity');
  }
  return tier;
}

function getTier(store, tierId) {
  requireStore(store);
  requireText(tierId, 'Tier id');
  const tier = store.tiers.get(tierId);
  if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
  return validateTier(tier);
}

function getEvent(store, eventId) {
  requireStore(store);
  requireText(eventId, 'Event id');
  const event = store.events.get(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  return event;
}

export function createEvent(store, input) {
  requireStore(store);
  requireObject(input, 'Event');
  const { title, city, venue = '', startsAt, organizerId } = input;
  const eventTitle = requireText(title, 'Title');
  const eventCity = requireText(city, 'City');
  const eventOrganizerId = requireText(organizerId, 'Organizer id');
  if (typeof venue !== 'string') {
    throw new DomainError('VALIDATION', 'Venue must be a string');
  }
  const startText = requireText(startsAt, 'startsAt');
  const date = new Date(startText);
  if (Number.isNaN(date.getTime())) {
    throw new DomainError('VALIDATION', 'startsAt must be a valid date');
  }
  const event = {
    id: newId(),
    organizerId: eventOrganizerId,
    title: eventTitle,
    city: eventCity,
    venue: venue.trim(),
    startsAt: date.toISOString(),
    status: 'draft',
    tierIds: [],
  };
  store.events.set(event.id, event);
  return event;
}

export function addTier(store, eventId, input) {
  requireObject(input, 'Tier');
  const event = getEvent(store, eventId);
  const { name, priceCents, capacity } = input;

  const tier = {
    id: newId(),
    eventId,
    name: requireText(name, 'Tier name'),
    // Money is ALWAYS whole cents. 0.1 + 0.2 !== 0.3 in floating point.
    priceCents: requireWholeNumber(priceCents, 'priceCents', 0),
    capacity: requireWholeNumber(capacity, 'capacity', 1),
    sold: 0,
  };
  store.tiers.set(tier.id, tier);
  store.waitlists.set(tier.id, new Queue());
  event.tierIds.push(tier.id);
  return tier;
}

export function publishEvent(store, eventId) {
  const event = getEvent(store, eventId);
  if (event.tierIds.length === 0) {
    throw new DomainError('INVALID_STATE', 'Add at least one ticket tier before publishing');
  }
  event.status = 'published';
  return event;
}

// What the public event list is built from. Drafts are hidden unless asked for.
export function listEventSummaries(store, options = {}) {
  requireStore(store);
  requireObject(options, 'Options');
  const { publishedOnly = true } = options;
  if (typeof publishedOnly !== 'boolean') {
    throw new DomainError('VALIDATION', 'publishedOnly must be a boolean');
  }
  return [...store.events.values()]
    .filter((event) => !publishedOnly || event.status === 'published')
    .map((event) => summarizeEvent(event, event.tierIds.map((id) => store.tiers.get(id))));
}

export function seatsLeft(tier) {
  validateTier(tier);
  return tier.capacity - tier.sold;
}

export function bookTickets(store, tierId, userId, quantity) {
  const tier = getTier(store, tierId);
  const attendeeId = requireText(userId, 'User id');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (!Number.isSafeInteger(tier.priceCents * quantity)) {
    throw new DomainError('VALIDATION', 'Booking amount exceeds the safe whole-cent range');
  }

  const left = seatsLeft(tier);
  if (left < quantity) {
    const message = left === 0 ? `${tier.name} is sold out` : `Only ${left} ticket(s) left in ${tier.name}`;
    throw new DomainError('SOLD_OUT', message, { seatsLeft: left });
  }

  let reference;
  do {
    reference = newReference();
  } while (store.bookingsByReference.has(reference));

  const booking = {
    id: newId(),
    reference,
    userId: attendeeId,
    tierId,
    quantity,
    amountCents: tier.priceCents * quantity,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  tier.sold += quantity;
  store.bookings.set(booking.id, booking);
  store.bookingsByReference.set(reference, booking);
  return booking;
}

export function findBookingByReference(store, reference) {
  requireStore(store);
  requireText(reference, 'Booking reference');
  return store.bookingsByReference.get(reference);
}

export function cancelBooking(store, reference) {
  const booking = findBookingByReference(store, reference);
  if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
  if (!HOLDS_SEATS.has(booking.status)) {
    throw new DomainError('INVALID_STATE', `A ${booking.status} booking cannot be cancelled`);
  }
  getTier(store, booking.tierId).sold -= booking.quantity;
  booking.status = 'cancelled';
  return booking;
}

export function joinWaitlist(store, tierId, userId, quantity) {
  const tier = getTier(store, tierId);
  const attendeeId = requireText(userId, 'User id');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_TICKETS_PER_BOOKING) {
    throw new DomainError('VALIDATION', `quantity must be between 1 and ${MAX_TICKETS_PER_BOOKING}`);
  }
  if (seatsLeft(tier) >= quantity) {
    throw new DomainError('NOT_SOLD_OUT', 'Seats are available, so book them instead');
  }
  const queue = store.waitlists.get(tierId);
  if (!queue || typeof queue.enqueue !== 'function') {
    throw new DomainError('INVALID_STATE', 'Waitlist queue is missing for this ticket tier');
  }
  queue.enqueue({ userId: attendeeId, quantity });
  return { position: queue.size };
}

// Strict first-in-first-out: only the person at the head of the line is considered.
// Discussion question for class: what happens if the head wants 4 seats and only 1 is free?
export function offerNextOnWaitlist(store, tierId) {
  const tier = getTier(store, tierId);
  const queue = store.waitlists.get(tierId);
  if (!queue || typeof queue.peek !== 'function' || typeof queue.dequeue !== 'function') {
    throw new DomainError('INVALID_STATE', 'Waitlist queue is missing for this ticket tier');
  }
  const head = queue.peek();
  if (!head || seatsLeft(tier) < head.quantity) return undefined;
  return queue.dequeue();
}
