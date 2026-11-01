import { localDate } from './booking.js';
import { addMonths } from '../components/DatePicker.jsx';

// Vehicle document expiry dates: the fields, and quick picks that suit each document
// (insurance is usually yearly, PUC 6 or 12 months, RC 15 years for a new vehicle).
export const DOC_FIELDS = [['insuranceExpiry', 'Insurance'], ['pucExpiry', 'PUC'], ['rcExpiry', 'RC']];

// Years offered in the calendar's year dropdown for document dates.
export const DOC_YEARS = { minYear: 2000, maxYear: 2100 };

export function docQuick(field) {
  const today = localDate();
  const months = { insuranceExpiry: [6, 12], pucExpiry: [6, 12], rcExpiry: [60, 180] }[field] || [12];
  return months.map((m) => [m % 12 === 0 ? `In ${m / 12} year${m === 12 ? '' : 's'}` : `In ${m} months`, addMonths(today, m)]);
}
