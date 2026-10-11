import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { RequestUploadUrlDto, RegisterDocumentDto } from './dto/document.dto';
import { Prisma, DocumentRelatedType } from '@prisma/client';
import { isUUID } from 'class-validator';
import { randomUUID } from 'node:crypto';

@Injectable()
export class DocumentsService {
  private supabaseAdmin: ReturnType<typeof createClient>;
  constructor(
    private tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
  ) {
    this.supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
        },
      },
    );
  }
  private bucket(type: DocumentRelatedType) {
    return type === 'customer' ? 'kyc-documents' : 'collection-photos';
  }
  private async requirePrivateCollectionBucket(type: DocumentRelatedType) {
    if (type !== 'collection') return;
    try {
      const { data, error } =
        await this.supabaseAdmin.storage.getBucket('collection-photos');
      if (error || !data || data.public !== false)
        throw new Error('Private storage required');
    } catch {
      throw new ServiceUnavailableException(
        'Private collection storage is unavailable',
      );
    }
  }
  private entityType(type: string): DocumentRelatedType {
    if (type !== 'customer' && type !== 'loan' && type !== 'collection')
      throw new BadRequestException('Invalid document entity type');
    return type;
  }
  private path(
    organizationId: string,
    type: DocumentRelatedType,
    id: string,
    filePath: string,
  ) {
    const prefix = `${organizationId}/${type}/${id}/`;
    if (
      !filePath.startsWith(prefix) ||
      !this.safeName(filePath.slice(prefix.length), 240)
    )
      throw new BadRequestException('Invalid document path');
  }
  private safeName(value: string, limit: number) {
    return (
      value.trim().length > 0 &&
      value.length <= limit &&
      value !== '.' &&
      value !== '..' &&
      !/[\\/%?#]/.test(value) &&
      !Array.from(value).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    );
  }
  private async authorize(
    tx: Prisma.TransactionClient,
    organizationId: string,
    staffId: string,
    type: DocumentRelatedType,
    id: string,
    write = false,
    remove = false,
  ) {
    if (!isUUID(id))
      throw new BadRequestException('Invalid document entity identifier');
    await tx.$executeRaw`SELECT id FROM staff WHERE id = ${staffId}::uuid AND organization_id = ${organizationId}::uuid FOR SHARE`;
    const actor = await tx.staff.findFirst({
      where: { id: staffId, organizationId, isActive: true },
      select: { role: true, branchId: true },
    });
    const roles = remove
      ? ['org_admin', 'branch_manager']
      : write
        ? ['org_admin', 'branch_manager', 'agent']
        : ['org_admin', 'branch_manager', 'agent', 'accountant'];
    if (
      !actor ||
      !roles.includes(actor.role) ||
      (actor.role === 'branch_manager' && !actor.branchId)
    )
      throw new ForbiddenException('Document access is not permitted');
    let record: { id: string } | null;
    if (type === 'customer')
      record = await tx.customer.findFirst({
        where: {
          id,
          organizationId,
          ...(actor.role === 'agent' ? { assignedAgentId: staffId } : {}),
          ...(actor.role === 'branch_manager'
            ? { branchId: actor.branchId }
            : {}),
        },
        select: { id: true },
      });
    else if (type === 'loan')
      record = await tx.loan.findFirst({
        where: {
          id,
          organizationId,
          ...(actor.role === 'agent' ? { assignedAgentId: staffId } : {}),
          ...(actor.role === 'branch_manager'
            ? { customer: { branchId: actor.branchId } }
            : {}),
        },
        select: { id: true },
      });
    else
      record = await tx.collection.findFirst({
        where: {
          id,
          organizationId,
          ...(actor.role === 'agent' ? { collectedById: staffId } : {}),
          ...(actor.role === 'branch_manager'
            ? { customer: { branchId: actor.branchId } }
            : {}),
        },
        select: { id: true },
      });
    if (!record) throw new NotFoundException('Document entity not found');
  }
  async getUploadUrl(
    organizationId: string,
    staffId: string,
    dto: RequestUploadUrlDto,
  ) {
    const type = this.entityType(dto.relatedEntityType);
    if (!this.safeName(dto.fileName, 180))
      throw new BadRequestException('Invalid document filename');
    return this.tenantPrisma.run(
      organizationId,
      async (tx) => {
        await this.authorize(
          tx,
          organizationId,
          staffId,
          type,
          dto.relatedEntityId,
          true,
        );
        const bucket = this.bucket(type);
        await this.requirePrivateCollectionBucket(type);
        const filePath = `${organizationId}/${type}/${dto.relatedEntityId}/${randomUUID()}-${dto.fileName}`;
        try {
          const { data, error } = await this.supabaseAdmin.storage
            .from(bucket)
            .createSignedUploadUrl(filePath);
          if (error || !data) throw new Error('Storage signing failed');
          return {
            signedUrl: data.signedUrl,
            path: filePath,
            token: data.token,
            bucket,
          };
        } catch {
          throw new ServiceUnavailableException(
            'Unable to authorize document upload',
          );
        }
      },
      { timeout: 30000 },
    );
  }
  async registerDocument(
    organizationId: string,
    staffId: string,
    dto: RegisterDocumentDto,
  ) {
    const type = this.entityType(dto.relatedEntityType);
    this.path(organizationId, type, dto.relatedEntityId, dto.filePath);
    return this.tenantPrisma.run(
      organizationId,
      async (tx) => {
        await this.authorize(
          tx,
          organizationId,
          staffId,
          type,
          dto.relatedEntityId,
          true,
        );
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ':' + dto.filePath}, 0))`;
        const existing = await tx.document.findFirst({
          where: {
            organizationId,
            relatedEntityType: type,
            relatedEntityId: dto.relatedEntityId,
            filePath: dto.filePath,
          },
        });
        if (existing) {
          if (
            existing.uploadedById !== staffId ||
            existing.documentType !== dto.documentType
          )
            throw new BadRequestException(
              'Document path is already registered',
            );
          return existing;
        }
        let object: { size: number; mimeType: string };
        await this.requirePrivateCollectionBucket(type);
        try {
          const result = await this.supabaseAdmin.storage
            .from(this.bucket(type))
            .info(dto.filePath);
          if (result.error || !result.data)
            throw new Error('Storage object unavailable');
          const size = result.data.size ?? result.data.metadata?.size;
          const mimeType =
            result.data.contentType ?? result.data.metadata?.mimetype;
          if (typeof size !== 'number' || typeof mimeType !== 'string')
            throw new Error('Storage metadata unavailable');
          object = { size, mimeType };
        } catch {
          throw new ServiceUnavailableException(
            'Unable to verify uploaded document',
          );
        }
        if (!Number.isSafeInteger(object.size) || object.size <= 0)
          throw new BadRequestException('Invalid uploaded document size');
        if (
          type === 'collection' &&
          (!['image/png', 'image/jpeg', 'image/webp'].includes(
            object.mimeType,
          ) ||
            object.size > 10 * 1024 * 1024)
        )
          throw new BadRequestException(
            'Collection evidence must be a supported image up to 10 MB',
          );
        return tx.document.create({
          data: {
            organizationId,
            relatedEntityType: type,
            relatedEntityId: dto.relatedEntityId,
            documentType: dto.documentType,
            filePath: dto.filePath,
            mimeType: object.mimeType,
            fileSizeBytes: BigInt(object.size),
            uploadedById: staffId,
          },
        });
      },
      { timeout: 30000 },
    );
  }
  async getSignedDownloadUrl(
    organizationId: string,
    documentId: string,
    staffId: string,
  ) {
    return this.tenantPrisma.run(
      organizationId,
      async (tx) => {
        const document = await tx.document.findFirst({
          where: { id: documentId, organizationId },
        });
        if (!document) throw new NotFoundException('Document not found');
        const type = this.entityType(document.relatedEntityType);
        await this.authorize(
          tx,
          organizationId,
          staffId,
          type,
          document.relatedEntityId,
        );
        this.path(
          organizationId,
          type,
          document.relatedEntityId,
          document.filePath,
        );
        await this.requirePrivateCollectionBucket(type);
        try {
          const { data, error } = await this.supabaseAdmin.storage
            .from(this.bucket(type))
            .createSignedUrl(document.filePath, 300);
          if (error || !data) throw new Error('Storage signing failed');
          return { signedUrl: data.signedUrl, document };
        } catch {
          throw new ServiceUnavailableException(
            'Unable to authorize document download',
          );
        }
      },
      { timeout: 30000 },
    );
  }
  async findByEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
    staffId: string,
  ) {
    const type = this.entityType(entityType);
    return this.tenantPrisma.run(organizationId, async (tx) => {
      await this.authorize(tx, organizationId, staffId, type, entityId);
      return tx.document.findMany({
        where: {
          organizationId,
          relatedEntityType: type,
          relatedEntityId: entityId,
        },
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { id: true, fullName: true } } },
      });
    });
  }
  async delete(organizationId: string, id: string, staffId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      const doc = await tx.document.findFirst({
        where: { id, organizationId },
      });
      if (!doc) throw new NotFoundException('Document not found');
      await this.authorize(
        tx,
        organizationId,
        staffId,
        this.entityType(doc.relatedEntityType),
        doc.relatedEntityId,
        false,
        true,
      );
      return tx.document.delete({ where: { id, organizationId } });
    });
  }
}
