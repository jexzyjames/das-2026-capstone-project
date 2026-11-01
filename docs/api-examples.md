# Build 4 API examples

Start the server with `npm start`. The examples use Bash syntax and keep the
event id and booking reference as placeholders; replace them with values from
the preceding responses.

## 1. Create an event

```bash
curl -X POST http://localhost:3000/api/events \
  -H 'content-type: application/json' \
  -H 'x-user-id: organizer-1' \
  -d '{"title":"Lagos Tech Meetup","city":"Lagos","venue":"Yaba Hub","startsAt":"2026-12-05T17:00:00Z"}'
```

## 2. Add a ticket tier

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/tiers \
  -H 'content-type: application/json' \
  -H 'x-user-id: organizer-1' \
  -d '{"name":"General","priceCents":500000,"capacity":100}'
```

## 3. Publish the event

```bash
curl -X POST http://localhost:3000/api/events/EVENT_ID/publish \
  -H 'x-user-id: organizer-1'
```

## 4. Search published events

```bash
curl 'http://localhost:3000/api/events?q=tech&city=lagos&maxPriceCents=500000&sortBy=date'
```

## 5. Book tickets

```bash
curl -X POST http://localhost:3000/api/bookings \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d '{"tierId":"TIER_ID","quantity":2}'
```

## 6. Pay for a booking

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/pay \
  -H 'content-type: application/json' \
  -H 'x-user-id: attendee-1' \
  -d '{}'
```

To simulate a declined payment, send `{"decline":true}` instead. The gateway
receives only that simulation flag, never card details.

## 7. Cancel an unpaid booking

```bash
curl -X POST http://localhost:3000/api/bookings/BOOKING_REFERENCE/cancel \
  -H 'x-user-id: attendee-1'
```
