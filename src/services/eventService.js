import {
  addTier,
  createEvent,
  createStore,
  publishEvent,
} from '../domain/inventory.js';
import { summarizeEvent, searchEvents } from '../domain/eventSearch.js';
import { DomainError } from '../domain/errors.js';

function requireUserId(userId) {
  if (typeof userId !== 'string' || userId.trim() === '') {
    throw new DomainError('UNAUTHORIZED', 'The x-user-id header is required');
  }
  return userId.trim();
}

function requireObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('VALIDATION', `${label} must be an object`);
  }
  return value;
}

async function getOwnedEvent(repository, eventId, userId) {
  const event = await repository.getEvent(eventId);
  if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
  if (event.organizerId !== userId) {
    throw new DomainError('FORBIDDEN', 'Only the event organizer can change this event');
  }
  return event;
}

export function createEventService(repository) {
  if (!repository) throw new TypeError('An event repository is required');

  return {
    async create(input, organizerId) {
      requireObject(input, 'Event');
      const store = createStore();
      const event = createEvent(store, { ...input, organizerId: requireUserId(organizerId) });
      return repository.saveEvent(event);
    },

    async addTier(eventId, input, organizerId) {
      requireObject(input, 'Ticket tier');
      const userId = requireUserId(organizerId);
      const event = await getOwnedEvent(repository, eventId, userId);
      const store = createStore();
      store.events.set(event.id, event);
      const tier = addTier(store, eventId, input);
      await repository.saveEvent(event);
      return repository.saveTier(tier);
    },

    async publish(eventId, organizerId) {
      const userId = requireUserId(organizerId);
      const event = await getOwnedEvent(repository, eventId, userId);
      const store = createStore();
      store.events.set(event.id, event);
      for (const tier of await repository.getTiersForEvent(eventId)) {
        store.tiers.set(tier.id, tier);
      }
      const published = publishEvent(store, eventId);
      return repository.saveEvent(published);
    },

    async list(criteria = {}, sortBy = 'date') {
      const events = (await repository.listEvents()).filter((event) => event.status === 'published');
      const summaries = await Promise.all(
        events.map(async (event) => summarizeEvent(event, await repository.getTiersForEvent(event.id))),
      );
      return searchEvents(summaries, criteria, sortBy);
    },
  };
}
