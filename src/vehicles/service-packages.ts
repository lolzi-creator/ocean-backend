// Service-Pakete mit vordefinierten Artikeln
// Später werden diese von einer Store-API kommen

export interface ServiceArticle {
  description: string;
  quantity: number;
  unitPrice: number;
  category: 'parts' | 'supplies' | 'labor';
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string;
  articles: ServiceArticle[];
  estimatedHours: number;
}

export const SERVICE_PACKAGES: Record<string, ServicePackage> = {
  small_service: {
    id: 'small_service',
    name: 'Kleine Wartung',
    description: 'Ölwechsel, Filter, Inspektion',
    estimatedHours: 1.5,
    articles: [
      {
        description: 'Motoröl 5W-30 (5L)',
        quantity: 1,
        unitPrice: 45.00,
        category: 'supplies',
      },
      {
        description: 'Ölfilter',
        quantity: 1,
        unitPrice: 12.50,
        category: 'parts',
      },
      {
        description: 'Luftfilter',
        quantity: 1,
        unitPrice: 18.00,
        category: 'parts',
      },
      {
        description: 'Inspektion',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
    ],
  },
  big_service: {
    id: 'big_service',
    name: 'Grosse Wartung',
    description: 'Vollständige Wartung mit allen Checks',
    estimatedHours: 4.0,
    articles: [
      {
        description: 'Motoröl 5W-30 (5L)',
        quantity: 1,
        unitPrice: 45.00,
        category: 'supplies',
      },
      {
        description: 'Ölfilter',
        quantity: 1,
        unitPrice: 12.50,
        category: 'parts',
      },
      {
        description: 'Luftfilter',
        quantity: 1,
        unitPrice: 18.00,
        category: 'parts',
      },
      {
        description: 'Kraftstofffilter',
        quantity: 1,
        unitPrice: 25.00,
        category: 'parts',
      },
      {
        description: 'Zündkerzen (4 Stk.)',
        quantity: 4,
        unitPrice: 8.50,
        category: 'parts',
      },
      {
        description: 'Kühlmittel',
        quantity: 1,
        unitPrice: 22.00,
        category: 'supplies',
      },
      {
        description: 'Vollständige Inspektion',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
    ],
  },
  tire_change: {
    id: 'tire_change',
    name: 'Reifenwechsel',
    description: 'Reifen wechseln und auswuchten',
    estimatedHours: 1.0,
    articles: [
      {
        description: 'Reifenwechsel (4 Reifen)',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
      {
        description: 'Auswuchten',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
    ],
  },
  brake_service: {
    id: 'brake_service',
    name: 'Bremsenservice',
    description: 'Bremsbeläge und Bremsflüssigkeit',
    estimatedHours: 2.5,
    articles: [
      {
        description: 'Bremsbeläge Vorderachse',
        quantity: 1,
        unitPrice: 85.00,
        category: 'parts',
      },
      {
        description: 'Bremsbeläge Hinterachse',
        quantity: 1,
        unitPrice: 75.00,
        category: 'parts',
      },
      {
        description: 'Bremsflüssigkeit',
        quantity: 1,
        unitPrice: 15.00,
        category: 'supplies',
      },
      {
        description: 'Bremsenservice',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
    ],
  },
  repair: {
    id: 'repair',
    name: 'Reparatur',
    description: 'Defekte beheben',
    estimatedHours: 3.0,
    articles: [
      {
        description: 'Reparatur',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
    ],
  },
  inspection: {
    id: 'inspection',
    name: 'Inspektion',
    description: 'Nur Überprüfung',
    estimatedHours: 1.0,
    articles: [
      {
        description: 'Fahrzeuginspektion',
        quantity: 1,
        unitPrice: 0, // Wird durch Arbeitsstunden berechnet
        category: 'labor',
      },
    ],
  },
};

export function getServicePackage(serviceType: string): ServicePackage | null {
  return SERVICE_PACKAGES[serviceType] || null;
}

