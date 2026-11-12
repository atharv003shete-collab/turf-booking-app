export interface TurfDetails {
  name: string;
  phone: string;
  mapsUrl: string;
}

export interface TurfLocationGroup {
  location: string;
  turfs: TurfDetails[];
}

export const TURF_LOCATIONS: TurfLocationGroup[] = [
  {
    location: 'East Dombivli',
    turfs: [
      {
        name: 'Athena Turf',
        phone: '+91 90227 21111',
        mapsUrl: 'https://maps.google.com/?q=Athena+Turf+Dombivli+East',
      },
      {
        name: 'Camp Nou Sports Turf',
        phone: '+91 74000 97147',
        mapsUrl: 'https://maps.google.com/?q=Camp+Nou+Sports+Turf+Usarghar+Dombivli+East',
      },
      {
        name: 'Dombivli Sports Arena Turf',
        phone: '+91 98205 12345',
        mapsUrl: 'https://maps.google.com/?q=Dombivli+Sports+Arena+Turf+Milap+Nagar',
      },
      {
        name: 'Headliner Turf',
        phone: '+91 98921 55660',
        mapsUrl: 'https://maps.google.com/?q=Headliner+Turf+Sonar+Pada+Dombivli+East',
      },
      {
        name: 'HippoCampus',
        phone: '+91 88500 52330',
        mapsUrl: 'https://maps.google.com/?q=HippoCampus+Turf+Vico+Naka+Dombivli+East',
      },
      {
        name: 'Legacy Sports',
        phone: '+91 91374 88291',
        mapsUrl: 'https://maps.google.com/?q=Legacy+Sports+Turf+Dombivli+East',
      },
      {
        name: 'Prime Turf & Pickleball Arena',
        phone: '+91 80977 85354',
        mapsUrl: 'https://maps.google.com/?q=Prime+Turf+and+Pickleball+Arena+Desale+Pada+Dombivli',
      },
      {
        name: 'The Legends Arena Turf',
        phone: '+91 98672 67375',
        mapsUrl: 'https://maps.google.com/?q=The+Legends+Arena+Turf+Nandivli+Dombivli',
      },
      {
        name: 'The Midfield Arena',
        phone: '+91 81389 06310',
        mapsUrl: 'https://maps.google.com/?q=The+Midfield+Arena+Badlapur+Pipeline+Road+Dombivli',
      },
      {
        name: 'The Pavilion Sports Arena',
        phone: '+91 93202 49777',
        mapsUrl: 'https://maps.google.com/?q=The+Pavilion+Sports+Arena+Kalyan-Shil+Road+Dombivli',
      },
    ],
  },
  {
    location: 'West Dombivli',
    turfs: [
      {
        name: 'Marvel Turf',
        phone: '+91 98920 11440',
        mapsUrl: 'https://maps.google.com/?q=Marvel+Turf+Sarovar+Nagar+Dombivli+West',
      },
      {
        name: 'Socket Turf',
        phone: '+91 98200 44883',
        mapsUrl: 'https://maps.google.com/?q=Socket+Turf+Reti+Bunder+Road+Mothagaon+Dombivli+West',
      },
      {
        name: 'VTS Real Turf',
        phone: '+91 99672 88123',
        mapsUrl: 'https://maps.google.com/?q=VTS+Real+Turf+Dombivli+West',
      },
    ],
  },
  {
    location: 'Palava',
    turfs: [
      {
        name: 'Football World | Palava',
        phone: '+91 82914 49862',
        mapsUrl: 'https://maps.google.com/?q=Football+World+Palava+City+Dombivli',
      },
      {
        name: 'Thane City FC - Palava',
        phone: '+91 90764 43954',
        mapsUrl: 'https://maps.google.com/?q=Thane+City+FC+Palava+Dombivli',
      },
    ],
  },
];

// Flat lookup helper by turf name
export const getTurfDetails = (name: string): TurfDetails => {
  for (const group of TURF_LOCATIONS) {
    const found = group.turfs.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return {
    name,
    phone: '+91 98200 12345',
    mapsUrl: `https://maps.google.com/?q=${encodeURIComponent(name + ' Dombivli')}`,
  };
};
