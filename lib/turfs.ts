export interface TurfLocationGroup {
  location: string;
  turfs: string[];
}

export const TURF_LOCATIONS: TurfLocationGroup[] = [
  {
    location: 'East Dombivli',
    turfs: [
      'Athena Turf',
      'Camp Nou Sports Turf',
      'Dombivli Sports Arena Turf',
      'Headliner Turf',
      'HippoCampus',
      'Legacy Sports',
      'Prime Turf & Pickleball Arena',
      'The Legends Arena Turf',
      'The Midfield Arena',
      'The Pavilion Sports Arena',
    ],
  },
  {
    location: 'West Dombivli',
    turfs: [
      'Marvel Turf',
      'Socket Turf',
      'VTS Real Turf',
    ],
  },
  {
    location: 'Palava',
    turfs: [
      'Football World | Palava',
      'Thane City FC - Palava',
    ],
  },
];
