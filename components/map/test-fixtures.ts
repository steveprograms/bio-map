// Small, hand-written sample data shared by unit tests.
import type { Measure } from './config';

export const sampleMeasures: Measure[] = [
  {
    id: 'CASTHMA',
    name: 'Current asthma among adults',
    short: 'Current Asthma',
    category: 'Health Outcomes',
    year: 2023,
    unit: '%',
    counties: 2900,
    min: 7.8,
    max: 15.1,
    p05: 8.6,
    p95: 12.4,
  },
  {
    id: 'CSMOKING',
    name: 'Current cigarette smoking among adults',
    short: 'Current Smoking',
    category: 'Health Risk Behaviors',
    year: 2023,
    unit: '%',
    counties: 2900,
    min: 5.1,
    max: 41.2,
    p05: 10.2,
    p95: 26.5,
  },
];
