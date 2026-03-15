import axios from 'axios';
import { FHIR_BASE_URL, ACCESS_TOKEN_KEY } from '../config';
import type { Patient, Observation, MedicationRequest } from './store';

function getAuthHeaders() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return { Authorization: `Bearer ${token}` };
}

function bundleEntries<T>(data: { entry?: { resource: T }[] }): T[] {
  return (data.entry ?? []).map((e) => e.resource);
}

export async function getPatient(patientId: string): Promise<Patient> {
  const { data } = await axios.get<Patient>(`${FHIR_BASE_URL}Patient/${patientId}`, {
    headers: getAuthHeaders(),
  });
  return data;
}

export async function getVitals(patientId: string): Promise<Observation[]> {
  const { data } = await axios.get(`${FHIR_BASE_URL}Observation`, {
    headers: getAuthHeaders(),
    params: {
      patient: patientId,
      category: 'vital-signs',
      _sort: '-date',
      _count: 20,
    },
  });
  return bundleEntries<Observation>(data);
}

export async function getMedications(patientId: string): Promise<MedicationRequest[]> {
  const { data } = await axios.get(`${FHIR_BASE_URL}MedicationRequest`, {
    headers: getAuthHeaders(),
    params: {
      patient: patientId,
      _sort: '-authoredon',
      _count: 20,
    },
  });
  return bundleEntries<MedicationRequest>(data);
}

export async function getLabs(patientId: string): Promise<Observation[]> {
  const { data } = await axios.get(`${FHIR_BASE_URL}Observation`, {
    headers: getAuthHeaders(),
    params: {
      patient: patientId,
      category: 'laboratory',
      _sort: '-date',
      _count: 20,
    },
  });
  return bundleEntries<Observation>(data);
}
