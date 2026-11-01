import {
  bookTickets,
  cancelBooking,
  createStore,
} from '../domain/inventory.js';
import { assertTransition } from '../domain/bookingStateMachine.js';
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

async function getOwnedBooking(repository, reference, userId) {
  const booking = await repository.getBookingByReference(reference);
  if (!booking) throw new DomainError('NOT_FOUND', 'Booking not found');
  if (booking.userId !== userId) {
    throw new DomainError('FORBIDDEN', 'Only the attendee who made this booking can change it');
  }
  return booking;
}

export function createBookingService(repository, paymentGateway) {
  if (!repository) throw new TypeError('A booking repository is required');
  if (!paymentGateway || typeof paymentGateway.charge !== 'function') {
    throw new TypeError('A payment gateway with charge() is required');
  }

  return {
    async book(input, userId) {
      const { tierId, quantity } = requireObject(input, 'Booking');
      const attendeeId = requireUserId(userId);
      const tier = await repository.getTier(tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');
      const event = await repository.getEvent(tier.eventId);
      if (!event) throw new DomainError('NOT_FOUND', 'Event not found');
      if (event.status !== 'published') {
        throw new DomainError('INVALID_STATE', 'Tickets can only be booked for published events');
      }

      const store = createStore();
      store.events.set(event.id, event);
      store.tiers.set(tier.id, tier);
      const booking = bookTickets(store, tierId, attendeeId, quantity);
      await repository.saveTier(tier);
      return repository.saveBooking(booking);
    },

    async pay(reference, userId, options = {}) {
      const { decline = false } = requireObject(options, 'Payment');
      if (typeof decline !== 'boolean') {
        throw new DomainError('VALIDATION', 'decline must be a boolean');
      }
      const booking = await getOwnedBooking(repository, reference, requireUserId(userId));
      assertTransition(booking.status, 'paid');
      const result = await paymentGateway.charge({ decline });
      if (!result.success) {
        throw new DomainError('PAYMENT_DECLINED', 'The mock payment was declined');
      }
      booking.status = 'paid';
      return repository.saveBooking(booking);
    },

    async cancel(reference, userId) {
      const booking = await getOwnedBooking(repository, reference, requireUserId(userId));
      if (booking.status !== 'pending') {
        throw new DomainError('INVALID_TRANSITION', `Only pending bookings can be cancelled`);
      }
      assertTransition(booking.status, 'cancelled');
      const tier = await repository.getTier(booking.tierId);
      if (!tier) throw new DomainError('NOT_FOUND', 'Ticket tier not found');

      const store = createStore();
      store.tiers.set(tier.id, tier);
      store.bookings.set(booking.id, booking);
      store.bookingsByReference.set(booking.reference, booking);
      const cancelled = cancelBooking(store, reference);
      await repository.saveTier(tier);
      return repository.saveBooking(cancelled);
    },
  };
}
