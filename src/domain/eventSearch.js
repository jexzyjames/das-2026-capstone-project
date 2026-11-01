// Pure functions: events in, events out. No store, no side effects.
// That makes them trivial to test and reuse (the API and the UI can share them).

import { mergeSort } from './sorting.js';
import { DomainError } from './errors.js';
import { parseISODate } from './dates.js';

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

export function filterEvents(summaries, { q, city, from, to, maxPriceCents, onlyAvailable } = {}) {
  const text = q?.trim().toLowerCase();
  const wantedCity = city?.trim().toLowerCase();
  const fromTime = from ? parseISODate(from, 'from') : undefined;
  const toTime = to ? parseISODate(to, 'to', { endOfDay: true }) : undefined;

  if (maxPriceCents !== undefined && (!Number.isInteger(maxPriceCents) || maxPriceCents < 0)) {
    throw new DomainError('VALIDATION', 'maxPriceCents must be a whole number of cents');
  }

  return summaries.filter((event) => {
    if (text && !`${event.title} ${event.venue}`.toLowerCase().includes(text)) return false;
    if (wantedCity && event.city.toLowerCase() !== wantedCity) return false;

    const startsAt = parseISODate(event.startsAt, 'event startsAt');
    if (fromTime !== undefined && startsAt < fromTime) return false;
    if (toTime !== undefined && startsAt > toTime) return false;

    if (maxPriceCents !== undefined && (event.minPriceCents === null || event.minPriceCents > maxPriceCents)) {
      return false;
    }
    if (onlyAvailable && event.seatsLeft <= 0) return false;
    return true;
  });
}

const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Tie-breaker so the order is always the same, even when the main keys are equal.
const byTitleThenId = (a, b) =>
  compareText(a.title.toLowerCase(), b.title.toLowerCase()) || compareText(a.id, b.id);

const SORTERS = {
  // ISO date strings sort correctly as plain text.
  date: (a, b) => compareText(a.startsAt, b.startsAt) || byTitleThenId(a, b),
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
  return mergeSort(summaries, SORTERS[sortBy]);
}

export function searchEvents(summaries, criteria = {}, sortBy = 'date') {
  return sortEvents(filterEvents(summaries, criteria), sortBy);
}
