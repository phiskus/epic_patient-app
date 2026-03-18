import { writable } from 'svelte/store';

export interface Bundle<T> {
  resourceType: 'Bundle';
  entry?: { resource: T }[];
}

export interface PatientName {
  use?: string;
  family?: string;
  given?: string[];
}

export interface Patient {
  id: string;
  resourceType: 'Patient';
  name?: PatientName[];
  birthDate?: string;
  gender?: string;
  identifier?: { system?: string; value?: string }[];
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Observation {
  id: string;
  resourceType: 'Observation';
  status?: string;
  code?: { text?: string; coding?: { display?: string; code?: string }[] };
  effectiveDateTime?: string;
  valueQuantity?: Quantity;
  valueString?: string;
  referenceRange?: { low?: Quantity; high?: Quantity; text?: string }[];
  interpretation?: { text?: string; coding?: { display?: string }[] }[];
  component?: {
    code?: { text?: string; coding?: { display?: string }[] };
    valueQuantity?: Quantity;
  }[];
}

export interface Dosage {
  text?: string;
  route?: { text?: string };
  timing?: { repeat?: { frequency?: number; period?: number; periodUnit?: string } };
}

export interface MedicationRequest {
  id: string;
  resourceType: 'MedicationRequest';
  status?: string;
  medicationCodeableConcept?: { text?: string; coding?: { display?: string }[] };
   medicationReference?: { reference?: string; display?: string };  
  dosageInstruction?: Dosage[];
  authoredOn?: string;
  requester?: { display?: string };
}

export const token = writable<string | null>(null);
export const patientId = writable<string | null>(null);
export const patient = writable<Patient | null>(null);
export const vitals = writable<Observation[]>([]);
export const medications = writable<MedicationRequest[]>([]);
export const labs = writable<Observation[]>([]);
export const selectedItem = writable<(Observation | MedicationRequest) | null>(null);
export const isAuthenticated = writable<boolean>(false);
