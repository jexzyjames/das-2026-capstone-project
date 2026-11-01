import { createStore } from '../domain/inventory.js';

export function createMemoryRepository(store = createStore()) {
  return {
    async getEvent(id) {
      return store.events.get(id);
    },

    async listEvents() {
      return [...store.events.values()];
    },

    async saveEvent(event) {
      store.events.set(event.id, event);
      return event;
    },

    async getTier(id) {
      return store.tiers.get(id);
    },

    async getTiersForEvent(eventId) {
      return [...store.tiers.values()].filter((tier) => tier.eventId === eventId);
    },

    async saveTier(tier) {
      store.tiers.set(tier.id, tier);
      return tier;
    },

    async getBookingByReference(reference) {
      return store.bookingsByReference.get(reference);
    },

    async saveBooking(booking) {
      store.bookings.set(booking.id, booking);
      store.bookingsByReference.set(booking.reference, booking);
      return booking;
    },
  };
}
