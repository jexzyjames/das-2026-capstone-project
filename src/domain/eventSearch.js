// Pure functions: events in, events out. No store, no side effects.
// That makes them trivial to test and reuse (the API and the UI can share them).

import { mergeSort } from './sorting.js';
import { DomainError } from './errors.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// A summary is what the event list shows: the event plus numbers from its tiers.
export function summarizeEvent(event, tiers) {
  return {
    id: event.id,
    title: event.title,
    city: event.city,
    venue: event.venue,
    startsAt: event.startsAt,
    status: event.status,
    tierCount: tiers.length,
    minPriceCents: tiers.length ? Math.min(...tiers.map((t) => t.priceCents)) : null,
    seatsLeft: tiers.reduce((total, t) => total + (t.capacity - t.sold), 0),
  };
}

function validCalendarDate(year, month, day) {
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}

function parseDate(value, field, { endOfDay = false } = {}) {
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${field} must be an ISO date or date-time`);
  }
  const dateMatch = ISO_DATE.exec(value) ?? ISO_DATE_TIME.exec(value);
  if (!dateMatch || !validCalendarDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]))) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  }
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  // A date-only upper bound includes the entire UTC day.
  const isDateOnly = ISO_DATE.test(value);
  return endOfDay && isDateOnly ? time + 24 * 60 * 60 * 1000 - 1 : time;
}

function requireSummaries(summaries) {
  if (!Array.isArray(summaries)) {
    throw new DomainError('VALIDATION', 'Events must be an array');
  }
}

function requireSummary(event) {
  if (
    event === null
    || typeof event !== 'object'
    || typeof event.id !== 'string'
    || typeof event.title !== 'string'
    || typeof event.city !== 'string'
    || typeof event.venue !== 'string'
  ) {
    throw new DomainError('VALIDATION', 'Each event must have string id, title, city, and venue fields');
  }
}

function requireSearchInput(value, name) {
  if (value !== undefined && typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${name} must be a string`);
  }
  return value?.trim().toLowerCase();
}

export function filterEvents(summaries, criteria = {}) {
  requireSummaries(summaries);
  if (criteria === null || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw new DomainError('VALIDATION', 'Search criteria must be an object');
  }
  const { q, city, from, to, maxPriceCents, onlyAvailable } = criteria;
  const text = requireSearchInput(q, 'q');
  const wantedCity = requireSearchInput(city, 'city');
  const fromTime = from === undefined ? undefined : parseDate(from, 'from');
  const toTime = to === undefined ? undefined : parseDate(to, 'to', { endOfDay: true });

  if (maxPriceCents !== undefined && (!Number.isSafeInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw new DomainError('VALIDATION', 'maxPriceCents must be a whole number of cents');
  }
  if (onlyAvailable !== undefined && typeof onlyAvailable !== 'boolean') {
    throw new DomainError('VALIDATION', 'onlyAvailable must be a boolean');
  }

  return summaries.filter((event) => {
    requireSummary(event);
    if (text && !event.title.toLowerCase().includes(text) && !event.venue.toLowerCase().includes(text)) return false;
    if (wantedCity && event.city.toLowerCase() !== wantedCity) return false;

    const startsAt = parseDate(event.startsAt, 'event startsAt');
    if (fromTime !== undefined && startsAt < fromTime) return false;
    if (toTime !== undefined && startsAt > toTime) return false;

    if (maxPriceCents !== undefined) {
      if (event.minPriceCents !== null && (!Number.isSafeInteger(event.minPriceCents) || event.minPriceCents < 0)) {
        throw new DomainError('VALIDATION', 'Event minPriceCents must be whole cents');
      }
      if (event.minPriceCents === null || event.minPriceCents === undefined || event.minPriceCents > maxPriceCents) {
        return false;
      }
    }
    if (onlyAvailable) {
      if (!Number.isSafeInteger(event.seatsLeft) || event.seatsLeft < 0) {
        throw new DomainError('VALIDATION', 'Event seatsLeft must be a non-negative whole number');
      }
      if (event.seatsLeft === 0) return false;
    }
    return true;
  });
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Tie-breaker so the order is always the same, even when the main keys are equal.
const byTitleThenId = (a, b) =>
  compareText(a.title.toLowerCase(), b.title.toLowerCase()) || compareText(a.id, b.id);

const SORTERS = {
  date: (a, b) => compareText(a.startsAt.slice(0, 10), b.startsAt.slice(0, 10)) || byTitleThenId(a, b),
  // Events with no tiers have no price: put them last.
  price: (a, b) => {
    const priceA = a.minPriceCents ?? Infinity;
    const priceB = b.minPriceCents ?? Infinity;
    return (priceA === priceB ? 0 : priceA < priceB ? -1 : 1) || byTitleThenId(a, b);
  },
  // Most seats left first.
  availability: (a, b) => b.seatsLeft - a.seatsLeft || byTitleThenId(a, b),
};

export const SORT_OPTIONS = Object.keys(SORTERS);

export function sortEvents(summaries, sortBy = 'date') {
  if (!Object.hasOwn(SORTERS, sortBy)) {
    throw new DomainError('VALIDATION', `sort must be one of: ${SORT_OPTIONS.join(', ')}`);
  }
  requireSummaries(summaries);
  for (const event of summaries) {
    requireSummary(event);
    parseDate(event.startsAt, 'event startsAt');
    if (sortBy === 'price' && event.minPriceCents !== null && event.minPriceCents !== undefined
      && (!Number.isSafeInteger(event.minPriceCents) || event.minPriceCents < 0)) {
      throw new DomainError('VALIDATION', 'Event minPriceCents must be whole cents');
    }
    if (sortBy === 'availability' && (!Number.isSafeInteger(event.seatsLeft) || event.seatsLeft < 0)) {
      throw new DomainError('VALIDATION', 'Event seatsLeft must be a non-negative whole number');
    }
  }
  return mergeSort(summaries, SORTERS[sortBy]);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
