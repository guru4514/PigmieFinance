import { DocumentsService } from './documents.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DocumentRelatedTypeEnum } from './dto/document.dto';

const createSignedUploadUrl = jest.fn();
const createSignedUrl = jest.fn();
const info = jest.fn();
const getBucket = jest.fn();
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      getBucket,
      from: () => ({ createSignedUploadUrl, createSignedUrl, info }),
    },
  }),
}));
const entityId = '00000000-0000-4000-8000-000000000001';
const dto = {
  relatedEntityType: DocumentRelatedTypeEnum.customer,
  relatedEntityId: entityId,
  documentType: 'synthetic',
  fileName: 'Synthetic ID.pdf',
};
const path = `org/customer/${entityId}/synthetic-file.pdf`;
function harness() {
  getBucket
    .mockReset()
    .mockResolvedValue({ data: { public: false }, error: null });
  createSignedUploadUrl.mockReset().mockResolvedValue({
    data: {
      signedUrl: 'https://example.test/synthetic',
      token: 'synthetic-placeholder',
    },
    error: null,
  });
  createSignedUrl.mockReset().mockResolvedValue({
    data: { signedUrl: 'https://example.test/synthetic' },
    error: null,
  });
  info.mockReset().mockResolvedValue({
    data: { size: 2048, contentType: 'application/pdf' },
    error: null,
  });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    staff: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ role: 'agent', branchId: 'branch' }),
    },
    customer: { findFirst: jest.fn().mockResolvedValue({ id: entityId }) },
    loan: { findFirst: jest.fn().mockResolvedValue({ id: entityId }) },
    collection: { findFirst: jest.fn().mockResolvedValue({ id: entityId }) },
    document: {
      findFirst: jest
        .fn()
        .mockImplementation((args: Prisma.DocumentFindFirstArgs) =>
          args.where?.filePath
            ? null
            : {
                id: 'doc',
                organizationId: 'org',
                relatedEntityType: 'customer',
                relatedEntityId: entityId,
                filePath: path,
              },
        ),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'doc' }),
      delete: jest.fn().mockResolvedValue({ id: 'doc' }),
    },
  };
  const tenant = {
    run: (
      _org: string,
      callback: (client: Prisma.TransactionClient) => Promise<unknown>,
    ) => callback(tx as unknown as Prisma.TransactionClient),
  };
  return {
    service: new DocumentsService(
      tenant as unknown as TenantPrismaService,
      { get: () => 'synthetic' } as unknown as ConfigService,
    ),
    tx,
  };
}
describe('Document record authorization and paths', () => {
  it.each([
    { size: 2048, contentType: 'text/html' },
    { size: 10 * 1024 * 1024 + 1, contentType: 'application/pdf' },
  ])(
    'does not register unsupported or oversized KYC metadata %j',
    async (metadata) => {
      const { service, tx } = harness();
      info.mockResolvedValue({ data: metadata, error: null });
      await expect(
        service.registerDocument('org', 'agent', { ...dto, filePath: path }),
      ).rejects.toThrow(BadRequestException);
      expect(tx.document.create).not.toHaveBeenCalled();
    },
  );
  it('refuses customer KYC grants when its bucket is public', async () => {
    const { service } = harness();
    getBucket.mockResolvedValue({ data: { public: true }, error: null });
    await expect(service.getUploadUrl('org', 'agent', dto)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(getBucket).toHaveBeenCalledWith('kyc-documents');
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it.each([
    DocumentRelatedTypeEnum.customer,
    DocumentRelatedTypeEnum.loan,
    DocumentRelatedTypeEnum.collection,
  ])('denies upload signing for inaccessible %s records', async (type) => {
    const { service, tx } = harness();
    tx[type].findFirst.mockResolvedValue(null);
    await expect(
      service.getUploadUrl('org', 'agent', { ...dto, relatedEntityType: type }),
    ).rejects.toThrow(NotFoundException);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it('retains agent assignment/collector and current manager branch predicates', async () => {
    const { service, tx } = harness();
    await service.findByEntity('org', 'customer', entityId, 'agent');
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: entityId, organizationId: 'org', assignedAgentId: 'agent' },
      select: { id: true },
    });
    tx.staff.findFirst.mockResolvedValue({
      role: 'branch_manager',
      branchId: 'current',
    });
    await service.getSignedDownloadUrl('org', 'doc', 'manager');
    expect(tx.customer.findFirst).toHaveBeenCalledWith({
      where: { id: entityId, organizationId: 'org', branchId: 'current' },
      select: { id: true },
    });
  });
  it('denies inactive actors and branchless managers before provider access', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue(null);
    await expect(
      service.getSignedDownloadUrl('org', 'doc', 'agent'),
    ).rejects.toThrow(ForbiddenException);
    tx.staff.findFirst.mockResolvedValue({
      role: 'branch_manager',
      branchId: null,
    });
    await expect(
      service.findByEntity('org', 'customer', entityId, 'manager'),
    ).rejects.toThrow(ForbiddenException);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
  it('does not permit accountant uploads or agent deletion', async () => {
    const { service, tx } = harness();
    tx.staff.findFirst.mockResolvedValue({
      role: 'accountant',
      branchId: null,
    });
    await expect(
      service.getUploadUrl('org', 'accountant', dto),
    ).rejects.toThrow(ForbiddenException);
    tx.staff.findFirst.mockResolvedValue({ role: 'agent', branchId: 'branch' });
    await expect(service.delete('org', 'doc', 'agent')).rejects.toThrow(
      ForbiddenException,
    );
    expect(tx.document.delete).not.toHaveBeenCalled();
  });
  it.each(['../escape.pdf', 'nested/file.pdf', 'encoded%2fpath.pdf'])(
    'rejects unsafe filename %s',
    async (fileName) => {
      const { service } = harness();
      await expect(
        service.getUploadUrl('org', 'agent', { ...dto, fileName }),
      ).rejects.toThrow(BadRequestException);
      expect(createSignedUploadUrl).not.toHaveBeenCalled();
    },
  );
  it('preserves ordinary filenames with spaces while issuing unique paths', async () => {
    const { service } = harness();
    const grant = await service.getUploadUrl('org', 'agent', dto);
    expect(grant.path).toMatch(
      new RegExp(`^org/customer/${entityId}/[a-f0-9-]+-Synthetic ID\\.pdf$`),
    );
  });
  it('rejects foreign or traversing storage paths before registration or signing', async () => {
    const { service, tx } = harness();
    await expect(
      service.registerDocument('org', 'agent', {
        ...dto,
        filePath: `foreign/customer/${entityId}/file.pdf`,
      }),
    ).rejects.toThrow(BadRequestException);
    tx.document.findFirst.mockResolvedValue({
      relatedEntityType: 'customer',
      relatedEntityId: entityId,
      filePath: `org/customer/${entityId}/../file.pdf`,
    });
    await expect(
      service.getSignedDownloadUrl('org', 'doc', 'agent'),
    ).rejects.toThrow(BadRequestException);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(tx.document.create).not.toHaveBeenCalled();
  });
  it('requires storage object verification and derives stored metadata from it', async () => {
    const { service, tx } = harness();
    await service.registerDocument('org', 'agent', {
      ...dto,
      filePath: path,
      fileSizeBytes: 1,
      mimeType: 'forged',
    });
    expect(tx.document.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org',
        relatedEntityType: 'customer',
        relatedEntityId: entityId,
        documentType: dto.documentType,
        filePath: path,
        mimeType: 'application/pdf',
        fileSizeBytes: 2048n,
        uploadedById: 'agent',
      },
    });
    tx.document.create.mockClear();
    info.mockResolvedValue({ error: {}, data: null });
    await expect(
      service.registerDocument('org', 'agent', { ...dto, filePath: path }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(tx.document.create).not.toHaveBeenCalled();
  });
  it('rejects public collection buckets before issuing an upload grant', async () => {
    const { service } = harness();
    getBucket.mockResolvedValue({ data: { public: true }, error: null });
    await expect(
      service.getUploadUrl('org', 'agent', {
        ...dto,
        relatedEntityType: DocumentRelatedTypeEnum.collection,
        fileName: 'photo.png',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
  it('makes an owned registration retry idempotent without creating another document', async () => {
    const { service, tx } = harness();
    const existing = {
      id: 'doc',
      organizationId: 'org',
      relatedEntityType: 'customer',
      relatedEntityId: entityId,
      filePath: path,
      uploadedById: 'agent',
      documentType: dto.documentType,
    };
    tx.document.findFirst.mockResolvedValue(existing);
    expect(
      await service.registerDocument('org', 'agent', {
        ...dto,
        filePath: path,
      }),
    ).toBe(existing);
    expect(tx.document.create).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });
  it('rejects unsupported collection evidence using provider metadata', async () => {
    const { service, tx } = harness();
    await expect(
      service.registerDocument('org', 'agent', {
        ...dto,
        relatedEntityType: DocumentRelatedTypeEnum.collection,
        filePath: `org/collection/${entityId}/photo.png`,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.document.create).not.toHaveBeenCalled();
  });
  it('hides provider diagnostics on signing failures', async () => {
    const { service } = harness();
    createSignedUrl.mockRejectedValue(
      new Error('Synthetic private provider diagnostic'),
    );
    await expect(
      service.getSignedDownloadUrl('org', 'doc', 'agent'),
    ).rejects.toThrow('Unable to authorize document download');
  });
  it('rejects unknown entity types and malformed identifiers', async () => {
    const { service } = harness();
    await expect(
      service.findByEntity('org', 'unknown', entityId, 'agent'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.findByEntity('org', 'customer', 'forged', 'agent'),
    ).rejects.toThrow(BadRequestException);
  });
});
