import { DomainError } from './errors.js';

const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

function isValidCalendarDate(year, month, day) {
  const monthLengths = [
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
  return month >= 1 && month <= 12 && day >= 1 && day <= monthLengths[month - 1];
}

export function parseISODate(value, field, { endOfDay = false } = {}) {
  if (typeof value !== 'string') {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  }
  const match = ISO_DATE_TIME.exec(value);
  if (!match) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidCalendarDate(year, month, day)) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  }

  if (
    hourText !== undefined
    && (Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59)
  ) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  }

  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    throw new DomainError('VALIDATION', `${field} must be a valid ISO date or date-time`);
  }
  const isDateOnly = value.length === 10;
  return endOfDay && isDateOnly ? time + 24 * 60 * 60 * 1000 - 1 : time;
}
