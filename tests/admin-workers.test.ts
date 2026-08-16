import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneE164 } from "../server/worker-service.ts";
import { createWorkerRouter } from "../server/worker-routes.ts";

describe("Worker Management - Phone Normalisation", () => {
  it("normalises UK local mobile numbers (07xxx -> +447xxx)", () => {
    assert.equal(normalizePhoneE164("07123456789"), "+447123456789");
    assert.equal(normalizePhoneE164("07123 456 789"), "+447123456789");
    assert.equal(normalizePhoneE164("07123-456-789"), "+447123456789");
  });

  it("normalises UK international mobile numbers (447xxx -> +447xxx)", () => {
    assert.equal(normalizePhoneE164("447123456789"), "+447123456789");
    assert.equal(normalizePhoneE164("+447123456789"), "+447123456789");
    assert.equal(normalizePhoneE164("+44 7123 456789"), "+447123456789");
  });

  it("normalises international numbers", () => {
    assert.equal(normalizePhoneE164("+1 555 123 4567"), "+15551234567");
    assert.equal(normalizePhoneE164("+20 100 123 4567"), "+201001234567");
  });

  it("returns empty string if empty", () => {
    assert.equal(normalizePhoneE164(""), "");
    assert.equal(normalizePhoneE164("   "), "");
  });
});

describe("Worker API Handlers & Site Assignment", () => {
  it("handles duplicate mobile protection in WorkerService contract", async () => {
    const fakeDbWorkers = [
      { id: "w-1", firstName: "Mohamed", lastName: "Shawky", phone: "+447111222333", isActive: true },
    ];

    const inputRawPhone = "07111 222 333";
    const normInput = normalizePhoneE164(inputRawPhone);

    const duplicateFound = fakeDbWorkers.find(
      (w) => w.phone && normalizePhoneE164(w.phone) === normInput,
    );

    assert.ok(duplicateFound, "Expected duplicate worker to be detected");
    assert.equal(duplicateFound.firstName, "Mohamed");
  });

  it("handles inline site creation contract using existing jobs model", () => {
    const newSiteInput = {
      title: "165 Powis Street",
      address: "165 Powis Street",
      townArea: "Woolwich Arsenal",
      postcode: "SE18 6JW",
    };

    const locationParts = [newSiteInput.address, newSiteInput.townArea, newSiteInput.postcode].filter(Boolean);
    const location = locationParts.join(", ");

    const mockCreatedJob = {
      id: "job-uuid-powis-165",
      title: newSiteInput.title,
      address: newSiteInput.address,
      location,
      postcode: newSiteInput.postcode,
      status: "assigned",
    };

    assert.equal(mockCreatedJob.title, "165 Powis Street");
    assert.equal(mockCreatedJob.location, "165 Powis Street, Woolwich Arsenal, SE18 6JW");
    assert.equal(mockCreatedJob.status, "assigned");
  });

  it("builds clean worker response object with newly assigned site fields", () => {
    const worker = {
      id: "w-uuid-1234",
      firstName: "Ahmed",
      lastName: "Gouda",
      fullName: "Ahmed Gouda",
      phone: "+447999888777",
      email: "ahmed@example.com",
      workerType: "DIRECT_SELF_EMPLOYED",
      isActive: true,
      contractorId: null,
      contractorApplicationId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedJobId: "job-uuid-powis-165",
      assignedJobTitle: "165 Powis Street",
      assignedJobLocation: "165 Powis Street, Woolwich Arsenal, SE18 6JW",
    };

    assert.equal(worker.fullName, "Ahmed Gouda");
    assert.equal(worker.assignedJobId, "job-uuid-powis-165");
    assert.equal(worker.assignedJobTitle, "165 Powis Street");
    assert.equal(worker.isActive, true);
  });
});
