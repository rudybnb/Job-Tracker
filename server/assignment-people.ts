import type { WorkerWithAssignment } from "./worker-service.ts";

export type AssignmentIdentity =
  | { type: "worker"; id: string }
  | { type: "contractor"; id: string };

export interface AssignablePerson {
  identity: AssignmentIdentity;
  firstName: string;
  lastName: string;
  name: string;
  phone: string | null;
  email: string | null;
  trade: string;
}

interface ContractorProfile {
  id: string;
  name: string;
  email: string;
  specialty: string;
  status: string;
}

export function buildAssignablePeople(
  canonicalWorkers: WorkerWithAssignment[],
  persistedActiveWorkerIds: Set<string>,
  contractorProfiles: ContractorProfile[],
): AssignablePerson[] {
  const activeWorkers = canonicalWorkers.filter(
    (worker) => worker.isActive && persistedActiveWorkerIds.has(worker.id),
  );
  const matchedContractorIds = new Set(activeWorkers.flatMap(
    (worker) => worker.contractorId ? [worker.contractorId] : [],
  ));
  const workerEmails = new Set(activeWorkers.flatMap(
    (worker) => worker.email ? [worker.email.trim().toLowerCase()] : [],
  ));
  const people: AssignablePerson[] = activeWorkers.map((worker) => ({
    identity: { type: "worker", id: worker.id },
    firstName: worker.firstName,
    lastName: worker.lastName,
    name: worker.fullName,
    phone: worker.phone,
    email: worker.email,
    trade: worker.workerType,
  }));

  for (const contractor of contractorProfiles) {
    const email = contractor.email.trim().toLowerCase();
    if (
      contractor.status === "unavailable"
      || matchedContractorIds.has(contractor.id)
      || workerEmails.has(email)
    ) {
      continue;
    }

    const [firstName = contractor.name, ...lastNameParts] = contractor.name.trim().split(/\s+/);
    people.push({
      identity: { type: "contractor", id: contractor.id },
      firstName,
      lastName: lastNameParts.join(" "),
      name: contractor.name,
      phone: null,
      email: contractor.email,
      trade: contractor.specialty,
    });
  }

  return people;
}
